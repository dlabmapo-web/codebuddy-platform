import { HttpStatus, Injectable } from "@nestjs/common";
import {
  effectiveAcademyRoles,
  rankEntries,
  resolvePointsPeriod,
  type MemberDetailInput,
  type StaffDetail,
  type StudentDetail,
  type StudentStanding,
} from "@cove/shared";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { holdsRoleWhere } from "../authorization/membership-roles.js";
import { taughtByWhere } from "../classes/assigned-class-access.js";
import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";
import { TeamLeadOverviewRepository } from "../lead/team-lead-overview.repository.js";
import { LeaderboardRepository } from "../points/leaderboard.repository.js";
import { TeacherOverviewRepository } from "../teach/teacher-overview.repository.js";
import { ManagerScopeService } from "./manager-scope.service.js";
import {
  memberAvatarSelect,
  noMemberAvatar,
  resolveMemberAvatars,
} from "../profile/member-avatars.js";
import { ProfileMediaService } from "../profile/profile-media.service.js";

/**
 * One member, read by whoever may look them up.
 *
 * ## Why the two pages share a service
 *
 * A Manager, a Team Lead and a Teacher ask the same question of a student and
 * are entitled to different parts of the answer. Expressing that once, here,
 * is what keeps the three views from drifting into three different ideas of
 * what a student page is. What differs between them is a section, never a
 * field's meaning.
 *
 * ## Absent, never empty
 *
 * A section the reader may not have is omitted from the response and its data
 * is never read. The rule is `studentAcademyProfileSchema`'s — guardian and
 * emergency details belong to the student and to active managers — and this is
 * one of the two places it is enforced.
 */
@Injectable()
export class MemberDetailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopes: ManagerScopeService,
    private readonly media: ProfileMediaService,
    private readonly leaderboard: LeaderboardRepository,
    private readonly lead: TeamLeadOverviewRepository,
    private readonly overview: TeacherOverviewRepository,
  ) {}

  /**
   * Who is asking, and what they may see of a student.
   *
   * Two routes in, deliberately. A Manager or Team Lead is admitted by
   * `requireMemberReader` and sees every class the student sits in. A Teacher
   * is admitted only by teaching them, and is answered about their own classes
   * — a teacher who shares one class of three learns nothing about the other
   * two, because the page they opened is about their student and not about the
   * academy's.
   *
   * A reader who is neither gets the same refusal as a membership that does
   * not exist. Distinguishing them would let a teacher enumerate the academy
   * by watching which ids answer differently.
   */
  private async resolveStudentReader(
    identity: SupabaseIdentity,
    input: MemberDetailInput,
  ): Promise<{ canManageMembers: boolean; classIds: string[] | null }> {
    try {
      const actor = await this.scopes.requireMemberReader(
        identity,
        input.academyId,
      );
      return { canManageMembers: actor.canManageMembers, classIds: null };
    } catch {
      // Not a member reader. The only remaining way in is teaching them.
    }

    const taught = await this.prisma.class.findMany({
      where: {
        academyId: input.academyId,
        status: "ACTIVE",
        // `taughtByWhere`, not the homeroom column, and its own comment says
        // why: who teaches a class is two rows in two tables, and a caller
        // that remembered only `assignedTeacher` refuses assistants. An
        // assistant sees these students on their roster, so a detail page
        // that turned them away would be a row action that leads nowhere.
        //
        // The membership predicate matches `assignedClassWhere`'s, so a
        // teacher who has been suspended or moved off TEACHER loses this page
        // exactly as they lose the roster that links to it.
        ...taughtByWhere({
          academyId: input.academyId,
          status: "ACTIVE",
          ...holdsRoleWhere("TEACHER"),
          user: { authUserId: identity.authUserId, status: "ACTIVE" },
        }),
        enrollments: { some: { membershipId: input.membershipId } },
      },
      select: { id: true },
    });

    if (taught.length === 0) {
      throw new AppException("PROFILE_NOT_FOUND", HttpStatus.NOT_FOUND);
    }
    return {
      canManageMembers: false,
      classIds: taught.map((entry) => entry.id),
    };
  }

  async student(
    identity: SupabaseIdentity,
    input: MemberDetailInput,
  ): Promise<StudentDetail> {
    const reader = await this.resolveStudentReader(identity, input);
    const { canManageMembers } = reader;

    const membership = await this.prisma.academyMembership.findFirst({
      where: {
        id: input.membershipId,
        academyId: input.academyId,
        role: "STUDENT",
      },
      select: {
        id: true,
        userId: true,
        status: true,
        joinedAt: true,
        user: {
          select: {
            id: true,
            displayName: true,
            username: true,
            email: true,
            ...memberAvatarSelect.user.select,
          },
        },
        memberProfile: {
          select: {
            academyDisplayName: true,
            ...memberAvatarSelect.memberProfile.select,
          },
        },
        // The guardian pair is the only thing left on this profile that the
        // page shows, so the whole relation is read for a manager and not read
        // at all for anybody else — an empty `select` is not a narrower query,
        // it is one Prisma refuses.
        ...(canManageMembers
          ? {
              studentProfile: {
                select: {
                  guardianName: true,
                  guardianRelationship: true,
                  guardianPhone: true,
                  emergencyContactName: true,
                  emergencyContactPhone: true,
                },
              },
            }
          : {}),
        classEnrollments: {
          where: {
            class: {
              academyId: input.academyId,
              status: "ACTIVE",
              // A teacher is answered about their own classes only.
              ...(reader.classIds ? { id: { in: reader.classIds } } : {}),
            },
          },
          select: {
            class: {
              select: {
                id: true,
                name: true,
                // The curriculum this seat is actually taught.
                ...classCourseSelect,
                assignedTeacher: {
                  select: {
                    status: true,
                    user: { select: { displayName: true, username: true } },
                    memberProfile: { select: { academyDisplayName: true } },
                  },
                },
              },
            },
          },
          orderBy: { class: { name: "asc" } },
        },
      },
    });

    if (!membership) throw new AppException("PROFILE_NOT_FOUND", HttpStatus.NOT_FOUND);

    const profile =
      (membership as { studentProfile?: StudentProfileRow | null })
        .studentProfile ?? null;

    const classIds = membership.classEnrollments.map((entry) => entry.class.id);
    const [seatCounts, courseSeconds] = await Promise.all([
      this.seatCounts(classIds),
      this.courseSeconds(input.academyId, membership.id),
    ]);

    const classes = membership.classEnrollments.map((entry) => ({
      id: entry.class.id,
      name: entry.class.name,
      teacherName: teacherNameOf(entry.class.assignedTeacher),
      studentCount: seatCounts.get(entry.class.id) ?? 0,
      courses: entry.class.courseAssignments.map(({ course }) => ({
        courseId: course.id,
        title: course.title,
      })),
    }));

    // De-duplicated across classes: two classes teaching Python is one course
    // being studied, and listing it twice would read as two. The class names
    // it is taught in ride along, so the row can say where without the reader
    // cross-referencing the block above.
    const byCourse = new Map<
      string,
      { courseId: string; title: string; classNames: string[] }
    >();
    for (const entry of classes) {
      for (const course of entry.courses) {
        const existing = byCourse.get(course.courseId);
        if (existing) {
          existing.classNames.push(entry.name);
        } else {
          byCourse.set(course.courseId, {
            courseId: course.courseId,
            title: course.title,
            classNames: [entry.name],
          });
        }
      }
    }
    const courses = [...byCourse.values()]
      .map((course) => ({
        ...course,
        activeSeconds: courseSeconds.get(course.courseId) ?? 0,
      }))
      .sort((left, right) => left.title.localeCompare(right.title));

    const now = new Date();
    const [avatars, work, standing] = await Promise.all([
      resolveMemberAvatars(this.media, [
        { ...membership, key: membership.id },
      ]),
      this.work(membership.userId, input.academyId, membership.id, now),
      this.standing(
        input.academyId,
        membership.id,
        classes.map((entry) => ({ classId: entry.id, name: entry.name })),
      ),
    ]);

    return {
      identity: {
        membershipId: membership.id,
        userId: membership.userId,
        displayName:
          membership.memberProfile?.academyDisplayName?.trim() ||
          membership.user.displayName?.trim() ||
          membership.user.username?.trim() ||
          "—",
        username: membership.user.username,
        status: membership.status,
        joinedAt: membership.joinedAt?.toISOString() ?? null,
        avatar: avatars.get(membership.id) ?? noMemberAvatar,
      },
      courses,
      classes,
      ...(standing ? { standing } : {}),
      work,
      ...(canManageMembers
        ? {
            guardian: {
              guardianName: profile?.guardianName ?? null,
              guardianRelationship: profile?.guardianRelationship ?? null,
              guardianPhone: profile?.guardianPhone ?? null,
              emergencyContactName: profile?.emergencyContactName ?? null,
              emergencyContactPhone: profile?.emergencyContactPhone ?? null,
            },
          }
        : {}),
      viewer: { canManageMembers },
    };
  }

  /**
   * How many active students hold a seat in each of these classes.
   *
   * One grouped count rather than a roster read per class: the page needs the
   * size of the room, not who is in it, and a position on the board above
   * means nothing without it.
   */
  private async seatCounts(
    classIds: readonly string[],
  ): Promise<Map<string, number>> {
    if (classIds.length === 0) return new Map();
    const rows = await this.prisma.classEnrollment.groupBy({
      by: ["classId"],
      where: {
        classId: { in: [...classIds] },
        membership: { status: "ACTIVE", role: "STUDENT" },
      },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.classId, row._count._all]));
  }

  /**
   * This student's counted learning time, per course.
   *
   * From the daily projection the accumulator writes, which is already keyed
   * by academy, membership and course — so the whole answer is one grouped
   * sum and it cannot disagree with the total in the learning record above.
   */
  private async courseSeconds(
    academyId: string,
    membershipId: string,
  ): Promise<Map<string, number>> {
    const rows = await this.prisma.studentCourseLearningDay.groupBy({
      by: ["courseId"],
      where: { academyId, membershipId },
      _sum: { activeSeconds: true },
    });
    return new Map(
      rows.map((row) => [row.courseId, row._sum.activeSeconds ?? 0]),
    );
  }

  /**
   * What this student has done in *this academy*, over everything rather than
   * over a period.
   *
   * Measured by `workByStudent`, the unit every teaching surface measures
   * with, at a period with no start. Counting `StudentExerciseProgress` rows
   * directly was cheaper and wrong twice over: that table is keyed on user and
   * material with no academy column at all, so a student enrolled at two
   * academies was reported to each with the other's work in the total; and its
   * count answers a different question from the one the analytics table prints
   * beside the same child's name, so the two disagreed by construction.
   *
   * `activeSeconds` keeps its own projection, which is already academy-scoped
   * and is the only place counted learning time is written.
   */
  private async work(
    userId: string,
    academyId: string,
    membershipId: string,
    now: Date,
  ): Promise<StudentDetail["work"]> {
    // One student's seats, not the academy's. The bound is the same — this
    // academy's active classes and their visible curriculum — and the VALUES
    // list is a handful of rows rather than the whole catalogue.
    const scope = await this.lead.aggregateScope(academyId, { membershipId });

    const [work, activity] = await Promise.all([
      this.overview.workByStudent(scope, { startAt: null, endAt: now }),
      this.prisma.studentCourseLearningDay.aggregate({
        where: { academyId, membershipId },
        _sum: { activeSeconds: true },
        _max: { lastActiveAt: true },
      }),
    ]);

    const mine = work.find((row) => row.userId === userId) ?? null;

    // The later of the two clocks. A student who read for an hour without
    // submitting was active, and a page that reported their last submission
    // instead would call them idle.
    const lastSubmission = mine?.lastSubmissionAt ?? null;
    const lastActive = activity._max.lastActiveAt ?? null;
    const last =
      lastSubmission && lastActive
        ? lastSubmission > lastActive
          ? lastSubmission
          : lastActive
        : (lastSubmission ?? lastActive);

    return {
      solvedProblems: mine?.solvedProblems ?? 0,
      submissions: mine?.submissions ?? 0,
      activeSeconds: activity._sum.activeSeconds ?? 0,
      lastActivityAt: last?.toISOString() ?? null,
    };
  }

  /**
   * Where this student stands, per class, at the all-time period.
   *
   * All-time because "total score" is the only claim a member page can make
   * honestly — a weekly board answers a question nobody asked it. Per class
   * because that is the only cohort the platform ranks within.
   *
   * Absent, rather than an empty array, when the academy does not run points:
   * a page with no standing section is the truthful rendering of an academy
   * that does not keep score.
   */
  private async standing(
    academyId: string,
    membershipId: string,
    classes: readonly { classId: string; name: string }[],
  ): Promise<StudentStanding[] | null> {
    const points = await this.prisma.academyFeatureFlag.findFirst({
      where: { academyId, feature: "STUDENT_POINTS", isEnabled: true },
      select: { academyId: true },
    });
    if (!points) return null;
    if (classes.length === 0) return [];

    const period = resolvePointsPeriod("all", new Date());

    return Promise.all(
      classes.map(async ({ classId, name }) => {
        const members = await this.leaderboard.roster(classId);
        const ids = members.map((member) => member.membershipId);
        const [totals, days] = await Promise.all([
          this.leaderboard.totals(academyId, classId, ids, period),
          this.leaderboard.activeDays(classId, ids, period),
        ]);

        const ranked = rankEntries(
          members.map((member) => ({
            membershipId: member.membershipId,
            points: totals.get(member.membershipId)?.points ?? 0,
            solvedProblems:
              totals.get(member.membershipId)?.solvedProblems ?? 0,
            activeDays: days.get(member.membershipId) ?? 0,
          })),
        );

        const mine = ranked.find((row) => row.membershipId === membershipId);
        // A class where nobody has earned anything is not ranked, so nobody in
        // it has a position — including this student. Their points are still
        // true, and still zero.
        const anyPoints = ranked.some((row) => row.points > 0);

        return {
          classId,
          className: name,
          points: mine?.points ?? 0,
          ...(anyPoints && mine ? { position: mine.position } : {}),
        };
      }),
    );
  }

  async staffMember(
    identity: SupabaseIdentity,
    input: MemberDetailInput,
  ): Promise<StaffDetail> {
    const actor = await this.scopes.requireMemberReader(
      identity,
      input.academyId,
    );
    const { canManageMembers } = actor;

    const membership = await this.prisma.academyMembership.findFirst({
      where: {
        id: input.membershipId,
        academyId: input.academyId,
        role: { not: "STUDENT" },
      },
      select: {
        id: true,
        userId: true,
        role: true,
        extraRoles: { select: { role: true } },
        status: true,
        joinedAt: true,
        user: {
          select: {
            displayName: true,
            username: true,
            email: true,
            ...memberAvatarSelect.user.select,
          },
        },
        memberProfile: {
          select: {
            academyDisplayName: true,
            ...(canManageMembers ? { contactPhone: true } : {}),
            ...memberAvatarSelect.memberProfile.select,
          },
        },
        staffProfile: {
          select: {
            academyTitle: true,
            ...(canManageMembers ? { employeeNumber: true } : {}),
          },
        },
        assignedClasses: {
          where: { academyId: input.academyId, status: "ACTIVE" },
          select: { id: true, name: true, ...classCourseSelect },
          orderBy: [{ name: "asc" }, { id: "asc" }],
        },
        assistedClasses: {
          where: { class: { academyId: input.academyId, status: "ACTIVE" } },
          select: {
            class: { select: { id: true, name: true, ...classCourseSelect } },
          },
          orderBy: { class: { name: "asc" } },
        },
      },
    });

    if (!membership) throw new AppException("PROFILE_NOT_FOUND", HttpStatus.NOT_FOUND);

    const homeroom = membership.assignedClasses;
    const assistant = membership.assistedClasses.map((entry) => entry.class);
    const [avatars, seats] = await Promise.all([
      resolveMemberAvatars(this.media, [{ ...membership, key: membership.id }]),
      this.seatCounts([...homeroom, ...assistant].map((entry) => entry.id)),
    ]);
    const memberProfile = membership.memberProfile as MemberProfileRow | null;
    const staffProfile = membership.staffProfile as StaffProfileRow | null;

    return {
      identity: {
        membershipId: membership.id,
        userId: membership.userId,
        displayName:
          memberProfile?.academyDisplayName?.trim() ||
          membership.user.displayName?.trim() ||
          membership.user.username?.trim() ||
          "—",
        username: membership.user.username,
        status: membership.status,
        joinedAt: membership.joinedAt?.toISOString() ?? null,
        avatar: avatars.get(membership.id) ?? noMemberAvatar,
      },
      roles: [
        ...effectiveAcademyRoles(
          membership.role,
          membership.extraRoles.map((extra) => extra.role),
        ),
      ],
      academyTitle: staffProfile?.academyTitle ?? null,
      classes: {
        homeroom: homeroom.map((entry) => describeClass(entry, seats)),
        assistant: assistant.map((entry) => describeClass(entry, seats)),
      },
      ...(canManageMembers
        ? {
            contact: {
              email: membership.user.email,
              contactPhone: memberProfile?.contactPhone ?? null,
              employeeNumber: staffProfile?.employeeNumber ?? null,
            },
          }
        : {}),
      viewer: { canManageMembers },
    };
  }
}

/**
 * The courses a class teaches, selected the one way both pages read them.
 *
 * Visible only: an unpublished course is not something anybody is teaching or
 * being taught, and a class row that named one would be the single place in
 * the studio that said otherwise.
 */
const classCourseSelect = {
  courseAssignments: {
    where: { course: { isVisible: true } },
    select: { course: { select: { id: true, title: true } } },
  },
} as const;

/** One class row, from the shape above plus the seat count read beside it. */
function describeClass(
  entry: {
    id: string;
    name: string;
    courseAssignments: { course: { id: string; title: string } }[];
  },
  seats: Map<string, number>,
) {
  return {
    id: entry.id,
    name: entry.name,
    studentCount: seats.get(entry.id) ?? 0,
    courses: entry.courseAssignments.map(({ course }) => ({
      courseId: course.id,
      title: course.title,
    })),
  };
}

/** The name a class's teacher is known by, or null when it has no usable one. */
function teacherNameOf(
  teacher: {
    status: string;
    user: { displayName: string | null; username: string | null };
    memberProfile: { academyDisplayName: string | null } | null;
  } | null,
): string | null {
  if (!teacher || teacher.status !== "ACTIVE") return null;
  return (
    teacher.memberProfile?.academyDisplayName?.trim() ||
    teacher.user.displayName?.trim() ||
    teacher.user.username?.trim() ||
    null
  );
}

/** A student profile as this service selected it. The guardian half is
    conditional, so the type says so. */
type StudentProfileRow = {
  guardianName?: string | null;
  guardianRelationship?: string | null;
  guardianPhone?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
};

type MemberProfileRow = {
  academyDisplayName: string | null;
  contactPhone?: string | null;
};

type StaffProfileRow = {
  academyTitle: string | null;
  employeeNumber?: string | null;
};
