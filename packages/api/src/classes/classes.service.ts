import { HttpStatus, Injectable } from "@nestjs/common";
import type {
  ClassDetail,
  ClassStatus,
  ClassSummary,
  EligibleStudentSummary,
} from "@cove/shared";

import { AuditService } from "../academies/audit.service.js";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";
import type { Prisma } from "../generated/prisma/client.js";

type ClassRequestContext = { requestId?: string };

/** The list intentionally avoids loading roster PII just to calculate a count. */
const classListInclude = {
  courseAssignments: {
    include: { course: { select: { id: true, title: true, isVisible: true } } },
    orderBy: [{ course: { title: "asc" } }, { courseId: "asc" }],
  },
  _count: { select: { enrollments: true } },
} as const satisfies Prisma.ClassInclude;

const classDetailInclude = {
  courseAssignments: {
    include: { course: { select: { id: true, title: true, isVisible: true } } },
    orderBy: [{ course: { title: "asc" } }, { courseId: "asc" }],
  },
  enrollments: {
    include: {
      membership: {
        select: {
          id: true,
          role: true,
          status: true,
          user: { select: { id: true, displayName: true, email: true } },
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
    return toClassDetail(await this.requireClass(input.academyId, input.classId));
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
    return toClassDetail(created);
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
          updatedAt: new Date(input.expectedUpdatedAt),
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
    return toClassDetail(updated);
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
          updatedAt: current.updatedAt,
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
    return toClassDetail(updated);
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

    const updated = await this.prisma.$transaction(async (tx) => {
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
          updatedAt: new Date(input.expectedUpdatedAt),
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
      return record;
    });
    return toClassDetail(updated);
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
        user: { select: { id: true, displayName: true, email: true } },
      },
      orderBy: [{ user: { displayName: "asc" } }, { id: "asc" }],
    });
    return {
      students: memberships.map((membership) => ({
        membershipId: membership.id,
        userId: membership.user.id,
        displayName: membership.user.displayName,
        email: membership.user.email,
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
          updatedAt: current.updatedAt,
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
      return record;
    });
    return toClassDetail(updated);
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
          updatedAt: current.updatedAt,
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
      return record;
    });
    return toClassDetail(updated);
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

function toClassDetail(record: ClassRecord): ClassDetail {
  return {
    ...toClassSummary(record),
    students: record.enrollments.map((enrollment) => ({
      membershipId: enrollment.membershipId,
      userId: enrollment.membership.user.id,
      displayName: enrollment.membership.user.displayName,
      email: enrollment.membership.user.email,
      membershipStatus: enrollment.membership.status,
      role: enrollment.membership.role,
      enrolledAt: enrollment.enrolledAt.toISOString(),
    })),
  };
}
