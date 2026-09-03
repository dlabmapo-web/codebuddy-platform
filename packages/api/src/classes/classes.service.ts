import { HttpStatus, Injectable } from "@nestjs/common";
import { displayableEmail, effectiveAcademyRoles } from "@cove/shared";

import { holdsRoleWhere } from "../authorization/membership-roles.js";
import type {
  AcademyAuditAction,
  AcademyRole,
  AssignedTeacherSummary,
  ClassDetail,
  ClassStatus,
  ClassSummary,
  ClassTeacherSummary,
  EligibleStudentSummary,
  EligibleTeacherSummary,
  MembershipStatus,
  SetClassScheduleInput,
  UserStatus,
} from "@cove/shared";

import { AuditService } from "../academies/audit.service.js";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { AppException } from "../common/app-exception.js";
import { atRevision } from "../common/optimistic-lock.js";
import { bumpPeopleRevision } from "../manage/people-revision.js";
import {
  memberAvatarSelect,
  noMemberAvatar,
  resolveMemberAvatars,
} from "../profile/member-avatars.js";
import { ProfileMediaService } from "../profile/profile-media.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { MonitoringRevocationService } from "../monitoring/monitoring-revocation.service.js";
import type { Prisma } from "../generated/prisma/client.js";

type ClassRequestContext = { requestId?: string };

/**
 * The teacher the class stores, whether or not it still grants anything. The
 * status and role come back so the caller can say "unavailable" instead of
 * silently showing a suspended member as the responsible teacher.
 */
const assignedTeacherSelect = {
  select: {
    id: true,
    role: true,
    // The assignment is effective while the member *holds* TEACHER, which for
    // somebody who also manages is an extra role rather than their primary.
    extraRoles: { select: { role: true } },
    status: true,
    user: { select: { id: true, displayName: true, status: true } },
  },
} as const;

/** The detail page names the person exactly; the list gets by on a name. */
const assignedTeacherDetailSelect = {
  select: {
    id: true,
    role: true,
    extraRoles: { select: { role: true } },
    status: true,
    user: {
      select: {
        id: true,
        displayName: true,
        email: true,
        status: true,
        ...memberAvatarSelect.user.select,
      },
    },
    memberProfile: memberAvatarSelect.memberProfile,
  },
} as const;

/**
 * The assistants, ordered the way the panel lists them: by name, so the set
 * reads the same on every load rather than in insertion order.
 */
const assistantTeachersSelect = {
  select: { teacher: assignedTeacherSelect },
  orderBy: [
    { teacher: { user: { displayName: "asc" } } },
    { membershipId: "asc" },
  ],
} satisfies Prisma.Class$assistantTeachersArgs;

const assistantTeachersDetailSelect = {
  select: { teacher: assignedTeacherDetailSelect },
  orderBy: [
    { teacher: { user: { displayName: "asc" } } },
    { membershipId: "asc" },
  ],
} satisfies Prisma.Class$assistantTeachersArgs;

/** The list intentionally avoids loading roster PII just to calculate a count. */
const classListInclude = {
  courseAssignments: {
    include: { course: { select: { id: true, title: true, isVisible: true } } },
    orderBy: [{ course: { title: "asc" } }, { courseId: "asc" }],
  },
  assignedTeacher: assignedTeacherSelect,
  assistantTeachers: assistantTeachersSelect,
  _count: { select: { enrollments: true } },
} as const satisfies Prisma.ClassInclude;

const classDetailInclude = {
  courseAssignments: {
    include: { course: { select: { id: true, title: true, isVisible: true } } },
    orderBy: [{ course: { title: "asc" } }, { courseId: "asc" }],
  },
  assignedTeacher: assignedTeacherDetailSelect,
  assistantTeachers: assistantTeachersDetailSelect,
  scheduleSlots: {
    // The timetable reads down the week and across the day, which is the order
    // a manager types it in and the order they check it back.
    orderBy: [{ weekday: "asc" }, { startMinute: "asc" }, { id: "asc" }],
  },
  enrollments: {
    include: {
      membership: {
        select: {
          id: true,
          role: true,
          status: true,
          user: {
            select: {
              id: true,
              displayName: true,
              email: true,
              ...memberAvatarSelect.user.select,
            },
          },
          memberProfile: memberAvatarSelect.memberProfile,
        },
      },
    },
    orderBy: [{ enrolledAt: "asc" }, { membershipId: "asc" }],
  },
} as const satisfies Prisma.ClassInclude;

type ClassListRecord = Prisma.ClassGetPayload<{ include: typeof classListInclude }>;
type ClassRecord = Prisma.ClassGetPayload<{ include: typeof classDetailInclude }>;

@Injectable()
export class ClassesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademyAccessService,
    private readonly audit: AuditService,
    /**
     * Access changes are published after the transaction commits, never
     * inside it: a rolled-back archive must not end a teacher's session, and
     * a committed one must end it immediately rather than at the next
     * revalidation.
     */
    private readonly revocation: MonitoringRevocationService,
    /** Rosters and pickers show people, and a person has a face. */
    private readonly profileMedia: ProfileMediaService,
  ) {}

  async list(
    identity: SupabaseIdentity,
    input: { academyId: string; status?: ClassStatus },
  ): Promise<{ classes: ClassSummary[] }> {
    await this.requireClassManager(identity, input.academyId);
    const classes = await this.prisma.class.findMany({
      where: {
        academyId: input.academyId,
        ...(input.status ? { status: input.status } : {}),
      },
      include: classListInclude,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    });
    return { classes: classes.map(toClassListSummary) };
  }

  async get(
    identity: SupabaseIdentity,
    input: { academyId: string; classId: string },
  ): Promise<ClassDetail> {
    await this.requireClassManager(identity, input.academyId);
    return this.presentDetail(await this.requireClass(input.academyId, input.classId));
  }

  async create(
    identity: SupabaseIdentity,
    input: { academyId: string; name: string; description: string },
    context: ClassRequestContext = {},
  ): Promise<ClassDetail> {
    const actor = await this.requireClassManager(identity, input.academyId);
    const name = input.name.trim();
    const description = input.description.trim();

    const created = await this.prisma.$transaction(async (tx) => {
      const record = await tx.class.create({
        data: {
          academyId: input.academyId,
          name,
          description,
          createdByUserId: actor.userId,
        },
        include: classDetailInclude,
      });
      await this.audit.write(tx, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: "class.created",
        targetType: "Class",
        targetId: record.id,
        requestId: context.requestId,
        after: { name: record.name, description: record.description },
      });
      return record;
    });
    return this.presentDetail(created);
  }

  async update(
    identity: SupabaseIdentity,
    input: {
      academyId: string;
      classId: string;
      name: string;
      description: string;
      expectedUpdatedAt: string;
    },
    context: ClassRequestContext = {},
  ): Promise<ClassDetail> {
    const actor = await this.requireClassManager(identity, input.academyId);
    const name = input.name.trim();
    const description = input.description.trim();

    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await requireClass(tx, input.academyId, input.classId);
      const claimed = await tx.class.updateMany({
        where: {
          id: input.classId,
          academyId: input.academyId,
          status: "ACTIVE",
          updatedAt: atRevision(new Date(input.expectedUpdatedAt)),
        },
        data: { name, description },
      });
      if (claimed.count !== 1) {
        throwClassWriteConflict(current, input.expectedUpdatedAt);
      }
      const record = await requireClass(tx, input.academyId, input.classId);
      await this.audit.write(tx, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: "class.updated",
        targetType: "Class",
        targetId: input.classId,
        requestId: context.requestId,
        before: { name: current.name, description: current.description },
        after: { name: record.name, description: record.description },
      });
      return record;
    });
    return this.presentDetail(updated);
  }

  async setStatus(
    identity: SupabaseIdentity,
    input: { academyId: string; classId: string; status: ClassStatus },
    context: ClassRequestContext = {},
  ): Promise<ClassDetail> {
    const actor = await this.requireClassManager(identity, input.academyId);
    const archiving = input.status === "ARCHIVED";

    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await requireClass(tx, input.academyId, input.classId);
      if (current.status === input.status) return current;

      const claimed = await tx.class.updateMany({
        where: {
          id: current.id,
          academyId: input.academyId,
          status: current.status,
          updatedAt: atRevision(current.updatedAt),
        },
        data: {
          status: input.status,
          archivedAt: archiving ? new Date() : null,
        },
      });
      if (claimed.count !== 1) {
        throw new AppException("CLASS_EDIT_CONFLICT", HttpStatus.CONFLICT);
      }
      const record = await requireClass(tx, input.academyId, input.classId);
      await this.audit.write(tx, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: archiving ? "class.archived" : "class.restored",
        targetType: "Class",
        targetId: current.id,
        requestId: context.requestId,
        before: { status: current.status },
        after: {
          status: record.status,
          // What the transition switched off or back on, for the audit reader.
          courseAssignments: record.courseAssignments.length,
          enrollments: record.enrollments.length,
        },
      });
      return record;
    });
    if (archiving && updated.status === "ARCHIVED") {
      await this.revocation.revokeClass(input.classId, "CLASS_ARCHIVED");
    }
    return this.presentDetail(updated);
  }

  /**
   * Replaces the complete course set. Additions and removals are derived here
   * rather than sent by the client, so two staff members editing the same
   * class cannot combine into a set neither of them chose.
   */
  async setCourses(
    identity: SupabaseIdentity,
    input: {
      academyId: string;
      classId: string;
      courseIds: string[];
      expectedUpdatedAt: string;
    },
    context: ClassRequestContext = {},
  ): Promise<ClassDetail> {
    const actor = await this.requireClassManager(identity, input.academyId);
    const desired = [...new Set(input.courseIds)];

    const { record: updated, removed } = await this.prisma.$transaction(async (tx) => {
      const current = await requireClass(tx, input.academyId, input.classId);
      const assigned = current.courseAssignments.map(
        (assignment) => assignment.courseId,
      );
      const added = desired.filter((courseId) => !assigned.includes(courseId));
      const removed = assigned.filter((courseId) => !desired.includes(courseId));

      const claimed = await tx.class.updateMany({
        where: {
          id: current.id,
          academyId: input.academyId,
          status: "ACTIVE",
          updatedAt: atRevision(new Date(input.expectedUpdatedAt)),
        },
        data: { updatedAt: new Date() },
      });
      if (claimed.count !== 1) {
        throwClassWriteConflict(current, input.expectedUpdatedAt);
      }

      if (added.length > 0) {
        // Every submitted course is validated before anything is written: a
        // cross-academy id must fail the whole call, not half of it.
        const courses = await tx.course.findMany({
          where: { id: { in: added }, academyId: input.academyId },
          select: { id: true },
        });
        if (courses.length !== added.length) {
          throw new AppException("COURSE_NOT_FOUND", HttpStatus.NOT_FOUND);
        }
        await tx.classCourse.createMany({
          data: added.map((courseId) => ({
            classId: current.id,
            courseId,
            assignedByUserId: actor.userId,
          })),
          skipDuplicates: true,
        });
      }
      if (removed.length > 0) {
        await tx.classCourse.deleteMany({
          where: { classId: current.id, courseId: { in: removed } },
        });
      }

      const record = await requireClass(tx, input.academyId, input.classId);
      await this.audit.write(tx, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: "class.courses.updated",
        targetType: "Class",
        targetId: current.id,
        requestId: context.requestId,
        before: { courseIds: assigned },
        after: { courseIds: desired, added, removed },
      });
      return { record, removed };
    });
    if (removed.length > 0) {
      await this.revocation.revokeClass(input.classId, "MATERIAL_UNAVAILABLE");
    }
    return this.presentDetail(updated);
  }

  /**
   * Replaces the complete timetable.
   *
   * A set rather than add/edit/remove, matching `setCourses` — three
   * operations would need the concurrency check, the authorization, and the
   * audit entry written three times for three shapes of one decision.
   *
   * Rows are deleted and rewritten rather than diffed. `ClassScheduleSlot`
   * carries no history a student's ledger depends on: an award froze the class
   * name onto its own row when it was paid, so last month's attendance stays
   * explicable even after the window it was earned in is gone. §8.1.
   *
   * `MANAGER` only. §5.1 — a schedule edit changes who is paid for turning up,
   * which is a setting rather than a piece of curriculum.
   */
  async setSchedule(
    identity: SupabaseIdentity,
    input: SetClassScheduleInput,
    context: ClassRequestContext = {},
  ): Promise<ClassDetail> {
    const actor = await this.requireScheduleManager(identity, input.academyId);
    const desired = normalizeSchedule(input.slots);

    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await requireClass(tx, input.academyId, input.classId);
      const before = current.scheduleSlots.map((slot) => ({
        weekday: slot.weekday,
        startMinute: slot.startMinute,
        endMinute: slot.endMinute,
      }));

      const claimed = await tx.class.updateMany({
        where: {
          id: current.id,
          academyId: input.academyId,
          status: "ACTIVE",
          updatedAt: atRevision(new Date(input.expectedUpdatedAt)),
        },
        data: { updatedAt: new Date() },
      });
      if (claimed.count !== 1) {
        throwClassWriteConflict(current, input.expectedUpdatedAt);
      }

      await tx.classScheduleSlot.deleteMany({ where: { classId: current.id } });
      if (desired.length > 0) {
        await tx.classScheduleSlot.createMany({
          data: desired.map((slot) => ({ classId: current.id, ...slot })),
        });
      }

      const record = await requireClass(tx, input.academyId, input.classId);
      await this.audit.write(tx, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: "class.schedule.updated",
        targetType: "Class",
        targetId: current.id,
        requestId: context.requestId,
        before: { slots: before },
        after: { slots: desired },
      });
      return record;
    });
    return this.presentDetail(updated);
  }

  /**
   * A class detail, with its roster's faces.
   *
   * Every public method returns through here rather than calling the mapper
   * directly, because signing is async and the mapper is not — and a second
   * presenter that forgot the avatars is exactly how one endpoint would quietly
   * return a faceless roster while the rest showed photos.
   */
  private async presentDetail(record: ClassRecord): Promise<ClassDetail> {
    // Everybody on the page in one signing round trip — the roster and the
    // teachers together, rather than a batch each.
    const avatars = await resolveMemberAvatars(this.profileMedia, [
      ...record.enrollments.map((enrollment) => ({
        ...enrollment.membership,
        key: enrollment.membershipId,
      })),
      ...teacherMemberships(record).map((membership) => ({
        ...membership,
        key: membership.id,
      })),
    ]);
    return toClassDetail(record, avatars);
  }

  /**
   * Active same-academy student memberships that are not already on this
   * roster. Readable by anyone who can enroll.
   */
  async listEligibleStudents(
    identity: SupabaseIdentity,
    input: { academyId: string; classId: string },
  ): Promise<{ students: EligibleStudentSummary[] }> {
    await this.requireEnrollmentManager(identity, input.academyId);
    const record = await this.requireClass(input.academyId, input.classId);
    const memberships = await this.prisma.academyMembership.findMany({
      where: {
        academyId: input.academyId,
        role: "STUDENT",
        status: "ACTIVE",
        classEnrollments: { none: { classId: record.id } },
      },
      select: {
        id: true,
        user: {
          select: {
            id: true,
            displayName: true,
            email: true,
            ...memberAvatarSelect.user.select,
          },
        },
        memberProfile: memberAvatarSelect.memberProfile,
      },
      orderBy: [{ user: { displayName: "asc" } }, { id: "asc" }],
    });
    const avatars = await resolveMemberAvatars(
      this.profileMedia,
      memberships.map((membership) => ({ ...membership, key: membership.id })),
    );
    return {
      students: memberships.map((membership) => ({
        membershipId: membership.id,
        userId: membership.user.id,
        displayName: membership.user.displayName,
        email: displayableEmail(membership.user.email),
        ...(avatars.get(membership.id) ?? noMemberAvatar),
      })),
    };
  }

  async addStudents(
    identity: SupabaseIdentity,
    input: { academyId: string; classId: string; membershipIds: string[] },
    context: ClassRequestContext = {},
  ): Promise<ClassDetail> {
    const actor = await this.requireEnrollmentManager(identity, input.academyId);
    const requested = [...new Set(input.membershipIds)];

    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await requireClass(tx, input.academyId, input.classId);
      assertActive(current);
      const eligible = await tx.academyMembership.findMany({
        where: {
          id: { in: requested },
          academyId: input.academyId,
          role: "STUDENT",
          status: "ACTIVE",
        },
        select: { id: true },
      });
      if (eligible.length !== requested.length) {
        throw new AppException(
          "CLASS_MEMBERSHIP_INELIGIBLE",
          HttpStatus.BAD_REQUEST,
        );
      }
      const existing = await tx.classEnrollment.findMany({
        where: { classId: current.id, membershipId: { in: requested } },
        select: { membershipId: true },
      });
      const existingIds = new Set(existing.map((row) => row.membershipId));
      const added = requested.filter((id) => !existingIds.has(id));
      // Re-adding a fully enrolled batch is a true no-op: no revision or audit.
      if (added.length === 0) return current;

      const claimed = await tx.class.updateMany({
        where: {
          id: current.id,
          academyId: input.academyId,
          status: "ACTIVE",
          updatedAt: atRevision(current.updatedAt),
        },
        data: { updatedAt: new Date() },
      });
      if (claimed.count !== 1) {
        throw new AppException("CLASS_EDIT_CONFLICT", HttpStatus.CONFLICT);
      }
      await tx.classEnrollment.createMany({
        data: added.map((membershipId) => ({
          classId: current.id,
          membershipId,
          enrolledByUserId: actor.userId,
        })),
        skipDuplicates: true,
      });

      const record = await requireClass(tx, input.academyId, input.classId);
      await this.audit.write(tx, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: "class.students.enrolled",
        targetType: "Class",
        targetId: current.id,
        requestId: context.requestId,
        after: { membershipIds: added },
      });
      // §8.1 — enrolment changes who is in this academy's classes, which is
      // what a bulk enrolment selection was resolved against.
      await bumpPeopleRevision(tx, input.academyId);
      return record;
    });
    return this.presentDetail(updated);
  }

  /**
   * Revokes one path to the class's courses. Drafts, submissions, scores, and
   * progress are never touched — re-enrolling restores the same saved work.
   */
  async removeStudent(
    identity: SupabaseIdentity,
    input: { academyId: string; classId: string; membershipId: string },
    context: ClassRequestContext = {},
  ): Promise<ClassDetail> {
    const actor = await this.requireEnrollmentManager(identity, input.academyId);
    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await requireClass(tx, input.academyId, input.classId);
      assertActive(current);
      const enrollment = await tx.classEnrollment.findFirst({
        where: { classId: current.id, membershipId: input.membershipId },
        select: { membershipId: true },
      });
      if (!enrollment) return current;

      const claimed = await tx.class.updateMany({
        where: {
          id: current.id,
          academyId: input.academyId,
          status: "ACTIVE",
          updatedAt: atRevision(current.updatedAt),
        },
        data: { updatedAt: new Date() },
      });
      if (claimed.count !== 1) {
        throw new AppException("CLASS_EDIT_CONFLICT", HttpStatus.CONFLICT);
      }
      await tx.classEnrollment.deleteMany({
        where: { classId: current.id, membershipId: input.membershipId },
      });
      const record = await requireClass(tx, input.academyId, input.classId);
      await this.audit.write(tx, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: "class.student.removed",
        targetType: "Class",
        targetId: current.id,
        requestId: context.requestId,
        before: { membershipId: input.membershipId },
      });
      await bumpPeopleRevision(tx, input.academyId);
      return record;
    });
    await this.revocation.revokeScope(
      { classId: input.classId, studentMembershipRef: input.membershipId },
      "ENROLLMENT_REMOVED",
    );
    return this.presentDetail(updated);
  }

  /**
   * The academy's active teachers, whoever is on this class already. The
   * current teacher stays in the list so the dialog can show them selected
   * rather than presenting an empty control for an assigned class.
   *
   * Readable for an archived class too: staff planning a restore can see the
   * candidates, while `setTeacher` still refuses to write until it is active.
   */
  async listEligibleTeachers(
    identity: SupabaseIdentity,
    input: { academyId: string; classId: string },
  ): Promise<{ teachers: EligibleTeacherSummary[] }> {
    await this.requireTeacherManager(identity, input.academyId);
    await this.requireClass(input.academyId, input.classId);
    const memberships = await this.prisma.academyMembership.findMany({
      where: eligibleTeacherWhere(input.academyId),
      select: {
        id: true,
        user: {
          select: {
            id: true,
            displayName: true,
            email: true,
            ...memberAvatarSelect.user.select,
          },
        },
        memberProfile: memberAvatarSelect.memberProfile,
      },
      orderBy: [{ user: { displayName: "asc" } }, { id: "asc" }],
    });
    const avatars = await resolveMemberAvatars(
      this.profileMedia,
      memberships.map((membership) => ({ ...membership, key: membership.id })),
    );
    return {
      teachers: memberships.map((membership) => ({
        membershipId: membership.id,
        userId: membership.user.id,
        displayName: membership.user.displayName,
        email: displayableEmail(membership.user.email),
        ...(avatars.get(membership.id) ?? noMemberAvatar),
      })),
    };
  }

  /**
   * Assigns, replaces, or removes the class's one teacher.
   *
   * Eligibility is resolved inside the transaction and the revision is claimed
   * by the same conditional update that writes the assignment — a read then an
   * unconditional write would let two staff members each replace the teacher
   * and silently lose one of the two decisions.
   */
  async setTeacher(
    identity: SupabaseIdentity,
    input: {
      academyId: string;
      classId: string;
      teacherMembershipId: string | null;
      expectedUpdatedAt: string;
    },
    context: ClassRequestContext = {},
  ): Promise<ClassDetail> {
    const actor = await this.requireTeacherManager(identity, input.academyId);
    const requested = input.teacherMembershipId;

    const { record: updated, replaced } = await this.prisma.$transaction(
      async (tx) => {
      const current = await requireClass(tx, input.academyId, input.classId);
      assertActive(current);
      const previous = current.teacherMembershipId;
      // Reassigning the same teacher, or clearing an already empty class, is
      // not a decision. It must not move the revision or invent audit history.
      if (previous === requested) return { record: current, replaced: null };

      if (requested !== null) {
        const eligible = await tx.academyMembership.findFirst({
          where: { id: requested, ...eligibleTeacherWhere(input.academyId) },
          select: { id: true },
        });
        // One code for every failure — cross-academy, suspended, inactive
        // user, wrong role — so a caller cannot probe memberships they
        // cannot otherwise see.
        if (!eligible) {
          throw new AppException(
            "CLASS_TEACHER_INELIGIBLE",
            HttpStatus.BAD_REQUEST,
          );
        }
      }

      const claimed = await tx.class.updateMany({
        where: {
          id: current.id,
          academyId: input.academyId,
          status: "ACTIVE",
          updatedAt: atRevision(new Date(input.expectedUpdatedAt)),
        },
        data: { teacherMembershipId: requested },
      });
      if (claimed.count !== 1) {
        throwClassWriteConflict(current, input.expectedUpdatedAt);
      }

      const record = await requireClass(tx, input.academyId, input.classId);
      await this.audit.write(tx, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: teacherAuditAction(previous, requested),
        targetType: "Class",
        targetId: current.id,
        requestId: context.requestId,
        // Membership ids only: the audit trail answers who was responsible,
        // and needs no name, email, or student work to do it.
        before: { teacherMembershipId: previous },
        after: { teacherMembershipId: requested },
      });
      return { record, replaced: previous };
      },
    );
    // The teacher who just lost the class stops monitoring it now, not when
    // their claim next expires.
    if (replaced !== null) {
      await this.revocation.revokeScope(
        { classId: input.classId, teacherMembershipRef: replaced },
        "ASSIGNMENT_CHANGED",
      );
    }
    return this.presentDetail(updated);
  }

  /**
   * Replaces the class's assistant teachers with the submitted set.
   *
   * A set, not add and remove: the concurrency claim, the eligibility check,
   * and the audit entry would otherwise be written twice for two shapes of one
   * decision — who else teaches this class.
   *
   * The homeroom teacher is deliberately not settable here. Naming who is
   * answerable for a class is `setTeacher`'s decision, and folding the two
   * together would let a single call quietly demote somebody with no audit
   * entry saying so.
   */
  async setAssistantTeachers(
    identity: SupabaseIdentity,
    input: {
      academyId: string;
      classId: string;
      teacherMembershipIds: string[];
      expectedUpdatedAt: string;
    },
    context: ClassRequestContext = {},
  ): Promise<ClassDetail> {
    const actor = await this.requireTeacherManager(identity, input.academyId);
    const desired = [...new Set(input.teacherMembershipIds)];

    const { record: updated, removed } = await this.prisma.$transaction(
      async (tx) => {
        const current = await requireClass(tx, input.academyId, input.classId);
        assertActive(current);
        const assigned = current.assistantTeachers.map(
          (assistant) => assistant.teacher.id,
        );
        const added = desired.filter(
          (membershipId) => !assigned.includes(membershipId),
        );
        const removed = assigned.filter(
          (membershipId) => !desired.includes(membershipId),
        );
        // Nothing to decide, so nothing to move the revision or to audit.
        if (added.length === 0 && removed.length === 0) {
          return { record: current, removed };
        }

        // One person cannot hold both places on one class. Refused rather than
        // silently ignored, because the manager who submitted it believes they
        // just added a teacher.
        if (
          current.teacherMembershipId !== null &&
          desired.includes(current.teacherMembershipId)
        ) {
          throw new AppException(
            "CLASS_TEACHER_ALREADY_ASSIGNED",
            HttpStatus.BAD_REQUEST,
          );
        }

        if (added.length > 0) {
          // Every submitted membership is validated before anything is
          // written: one cross-academy id must fail the whole call, not half
          // of it. One code for every failure — cross-academy, suspended,
          // inactive user, wrong role — so a caller cannot probe memberships
          // they cannot otherwise see.
          const eligible = await tx.academyMembership.findMany({
            where: { id: { in: added }, ...eligibleTeacherWhere(input.academyId) },
            select: { id: true },
          });
          if (eligible.length !== added.length) {
            throw new AppException(
              "CLASS_TEACHER_INELIGIBLE",
              HttpStatus.BAD_REQUEST,
            );
          }
        }

        const claimed = await tx.class.updateMany({
          where: {
            id: current.id,
            academyId: input.academyId,
            status: "ACTIVE",
            updatedAt: atRevision(new Date(input.expectedUpdatedAt)),
          },
          data: { updatedAt: new Date() },
        });
        if (claimed.count !== 1) {
          throwClassWriteConflict(current, input.expectedUpdatedAt);
        }

        if (removed.length > 0) {
          await tx.classAssistantTeacher.deleteMany({
            where: { classId: current.id, membershipId: { in: removed } },
          });
        }
        if (added.length > 0) {
          await tx.classAssistantTeacher.createMany({
            data: added.map((membershipId) => ({
              classId: current.id,
              membershipId,
            })),
            skipDuplicates: true,
          });
        }

        const record = await requireClass(tx, input.academyId, input.classId);
        await this.audit.write(tx, {
          actorUserId: actor.userId,
          academyId: input.academyId,
          action: "class.assistants.updated",
          targetType: "Class",
          targetId: current.id,
          requestId: context.requestId,
          // Membership ids only: the audit trail answers who was responsible,
          // and needs no name, email, or student work to do it.
          before: { assistantMembershipIds: assigned },
          after: {
            assistantMembershipIds: record.assistantTeachers.map(
              (assistant) => assistant.teacher.id,
            ),
          },
        });
        return { record, removed };
      },
    );
    // An assistant who just lost the class stops monitoring it now, not when
    // their claim next expires — the same rule the homeroom teacher gets.
    for (const membershipId of removed) {
      await this.revocation.revokeScope(
        { classId: input.classId, teacherMembershipRef: membershipId },
        "ASSIGNMENT_CHANGED",
      );
    }
    return this.presentDetail(updated);
  }

  private requireClassManager(identity: SupabaseIdentity, academyId: string) {
    return this.access.requirePermission(
      identity.authUserId,
      academyId,
      "classes.manage",
    );
  }

  private requireEnrollmentManager(
    identity: SupabaseIdentity,
    academyId: string,
  ) {
    return this.access.requirePermission(
      identity.authUserId,
      academyId,
      "class-enrollments.manage",
    );
  }

  private requireScheduleManager(
    identity: SupabaseIdentity,
    academyId: string,
  ) {
    return this.access.requirePermission(
      identity.authUserId,
      academyId,
      "class-schedule.manage",
    );
  }

  /**
   * Never `classes.assigned.manage`: a Teacher holds that one, and holding it
   * must not let them put themselves or a colleague in charge of a class.
   */
  private requireTeacherManager(identity: SupabaseIdentity, academyId: string) {
    return this.access.requirePermission(
      identity.authUserId,
      academyId,
      "class-teachers.manage",
    );
  }

  private async requireClass(
    academyId: string,
    classId: string,
  ): Promise<ClassRecord> {
    const record = await this.prisma.class.findFirst({
      where: { id: classId, academyId },
      include: classDetailInclude,
    });
    if (!record) {
      throw new AppException("CLASS_NOT_FOUND", HttpStatus.NOT_FOUND);
    }
    return record;
  }
}

/**
 * The membership half of the effective-assignment predicate, used both to
 * offer candidates and to validate a submitted one. Writing it once keeps the
 * dialog from ever offering a choice the mutation would reject.
 *
 * The academy is a parameter rather than a fixed field so no caller can
 * accidentally leave it out and match a membership in another tenant.
 */
function eligibleTeacherWhere(
  academyId: string,
): Prisma.AcademyMembershipWhereInput {
  return {
    academyId,
    // Anybody holding TEACHER, not only those whose highest role it is. A
    // manager who also teaches is a legitimate choice to run a class, and
    // matching on the primary role alone kept them out of this list while the
    // teaching pages were being handed to them elsewhere.
    ...holdsRoleWhere("TEACHER"),
    status: "ACTIVE",
    user: { status: "ACTIVE" },
  };
}

/**
 * Three transitions, three events. A single `class.teacher.changed` would make
 * an auditor read the payload to learn whether a class gained or lost its
 * teacher, which is the first question they ask.
 */
function teacherAuditAction(
  previous: string | null,
  next: string | null,
): Extract<AcademyAuditAction, `class.teacher.${string}`> {
  if (next === null) return "class.teacher.removed";
  return previous === null ? "class.teacher.assigned" : "class.teacher.replaced";
}

/** Archived classes grant nothing, so they also accept nothing but a restore. */
function assertActive(record: ClassRecord): void {
  if (record.status === "ARCHIVED") {
    throw new AppException("CLASS_ARCHIVED", HttpStatus.CONFLICT);
  }
}

function throwClassWriteConflict(
  record: ClassRecord,
  expectedUpdatedAt: string,
): never {
  assertActive(record);
  if (record.updatedAt.toISOString() !== new Date(expectedUpdatedAt).toISOString()) {
    throw new AppException("CLASS_EDIT_CONFLICT", HttpStatus.CONFLICT);
  }
  // The revision matched our read but the conditional update still lost,
  // which means another transaction committed between the two operations.
  throw new AppException("CLASS_EDIT_CONFLICT", HttpStatus.CONFLICT);
}

async function requireClass(
  tx: Prisma.TransactionClient,
  academyId: string,
  classId: string,
): Promise<ClassRecord> {
  const record = await tx.class.findFirst({
    where: { id: classId, academyId },
    include: classDetailInclude,
  });
  if (!record) {
    throw new AppException("CLASS_NOT_FOUND", HttpStatus.NOT_FOUND);
  }
  return record;
}

/**
 * The submitted timetable, ordered and de-duplicated.
 *
 * Two identical windows on one weekday are one window: the attendance award
 * pays per class per day, so a duplicate row could never pay twice, and
 * storing it would only give a manager a timetable that disagrees with itself.
 *
 * Overlaps that are not identical are left alone. A class that meets 16:00
 * to 17:00 and again 16:30 to 18:00 is a typo, but it is a harmless one — the
 * award still pays once, and refusing it would mean rejecting a legitimate
 * split session that happens to touch.
 */
function normalizeSchedule(
  slots: SetClassScheduleInput["slots"],
): { weekday: number; startMinute: number; endMinute: number }[] {
  const seen = new Set<string>();
  const unique: {
    weekday: number;
    startMinute: number;
    endMinute: number;
  }[] = [];
  for (const slot of slots) {
    const key = `${slot.weekday}:${slot.startMinute}:${slot.endMinute}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({
      weekday: slot.weekday,
      startMinute: slot.startMinute,
      endMinute: slot.endMinute,
    });
  }
  return unique.sort(
    (left, right) =>
      left.weekday - right.weekday || left.startMinute - right.startMinute,
  );
}

/**
 * One teacher membership, reported as it stands now rather than as it stood
 * when the assignment was made: a suspended teacher must read as unavailable,
 * not as in charge.
 *
 * `roles` carries the whole set, not just the primary, because that is what
 * decides whether the assignment still grants anything — a director who also
 * teaches stores `role = MANAGER` and would otherwise read as no teacher at
 * all.
 */
function toTeacherSummary(membership: {
  id: string;
  role: AcademyRole;
  status: MembershipStatus;
  extraRoles: { role: AcademyRole }[];
  user: { id: string; displayName: string | null; status: UserStatus };
}): AssignedTeacherSummary {
  return {
    membershipId: membership.id,
    userId: membership.user.id,
    displayName: membership.user.displayName,
    userStatus: membership.user.status,
    membershipStatus: membership.status,
    role: membership.role,
    roles: [
      ...effectiveAcademyRoles(
        membership.role,
        membership.extraRoles.map((extra) => extra.role),
      ),
    ],
  };
}

/**
 * Everyone who teaches this class: the homeroom teacher first, then the
 * assistants the query already ordered by name.
 *
 * One list rather than two fields to read, so a surface showing "who teaches
 * here" cannot show one group and quietly drop the other.
 */
function classTeachers(
  record: Pick<ClassListRecord | ClassRecord, "assignedTeacher"> & {
    assistantTeachers: { teacher: Parameters<typeof toTeacherSummary>[0] }[];
  },
): ClassTeacherSummary[] {
  return [
    ...(record.assignedTeacher
      ? [{ ...toTeacherSummary(record.assignedTeacher), isHomeroom: true }]
      : []),
    ...record.assistantTeachers.map((assistant) => ({
      ...toTeacherSummary(assistant.teacher),
      isHomeroom: false,
    })),
  ];
}

/** The membership rows behind `classTeachers`, homeroom first. */
function teacherMemberships<T>(record: {
  assignedTeacher: T | null;
  assistantTeachers: { teacher: T }[];
}): T[] {
  return [
    ...(record.assignedTeacher ? [record.assignedTeacher] : []),
    ...record.assistantTeachers.map((assistant) => assistant.teacher),
  ];
}

function classSummaryFields(
  record: ClassListRecord | ClassRecord,
  studentCount: number,
): ClassSummary {
  return {
    id: record.id,
    academyId: record.academyId,
    name: record.name,
    description: record.description,
    status: record.status,
    courses: record.courseAssignments.map((assignment) => ({
      id: assignment.course.id,
      title: assignment.course.title,
      isVisible: assignment.course.isVisible,
    })),
    studentCount,
    assignedTeacher: record.assignedTeacher
      ? toTeacherSummary(record.assignedTeacher)
      : null,
    teachers: classTeachers(record),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    archivedAt: record.archivedAt?.toISOString() ?? null,
  };
}

function toClassListSummary(record: ClassListRecord): ClassSummary {
  return classSummaryFields(record, record._count.enrollments);
}

function toClassSummary(record: ClassRecord): ClassSummary {
  return classSummaryFields(record, record.enrollments.length);
}

function toClassDetail(
  record: ClassRecord,
  avatars: Map<string, typeof noMemberAvatar>,
): ClassDetail {
  const summary = toClassSummary(record);
  // The detail page names each teacher exactly; the list gets by on a name.
  const emails = new Map<string, string | null>(
    teacherMemberships(record).map((membership) => [
      membership.id,
      membership.user.email,
    ]),
  );
  return {
    ...summary,
    assignedTeacher:
      summary.assignedTeacher && record.assignedTeacher
        ? {
            ...summary.assignedTeacher,
            email: displayableEmail(record.assignedTeacher.user.email),
          }
        : null,
    teachers: summary.teachers.map((teacher) => ({
      ...teacher,
      email: displayableEmail(emails.get(teacher.membershipId) ?? null),
      ...(avatars.get(teacher.membershipId) ?? noMemberAvatar),
    })),
    schedule: record.scheduleSlots.map((slot) => ({
      id: slot.id,
      weekday: slot.weekday,
      startMinute: slot.startMinute,
      endMinute: slot.endMinute,
    })),
    students: record.enrollments.map((enrollment) => ({
      membershipId: enrollment.membershipId,
      userId: enrollment.membership.user.id,
      displayName: enrollment.membership.user.displayName,
      email: displayableEmail(enrollment.membership.user.email),
      membershipStatus: enrollment.membership.status,
      role: enrollment.membership.role,
      enrolledAt: enrollment.enrolledAt.toISOString(),
      ...(avatars.get(enrollment.membershipId) ?? noMemberAvatar),
    })),
  };
}
