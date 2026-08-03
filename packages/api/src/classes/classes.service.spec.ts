import { describe, expect, it, vi } from "vitest";

import type { AuditService } from "../academies/audit.service.js";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import type { AcademyAccessService } from "../authorization/academy-access.service.js";
import { AppException } from "../common/app-exception.js";
import type { PrismaService } from "../database/prisma.service.js";
import { ClassesService } from "./classes.service.js";

const identity: SupabaseIdentity = {
  authUserId: "10000000-0000-4000-8000-000000000001",
  email: "lead@example.com",
  emailVerified: true,
  displayName: "Lead",
  avatarUrl: null,
  provider: null,
  requestedAcademyId: null,
};
const academyId = "20000000-0000-4000-8000-000000000001";
const actorUserId = "30000000-0000-4000-8000-000000000001";
const classId = "40000000-0000-4000-8000-000000000001";
const courseA = "50000000-0000-4000-8000-00000000000a";
const courseB = "50000000-0000-4000-8000-00000000000b";
const courseC = "50000000-0000-4000-8000-00000000000c";
const membershipId = "60000000-0000-4000-8000-000000000001";
const otherMembershipId = "60000000-0000-4000-8000-000000000002";
const updatedAt = new Date("2026-08-03T09:00:00.000Z");

function classRecord(
  overrides: Partial<{
    status: "ACTIVE" | "ARCHIVED";
    courseIds: string[];
    membershipIds: string[];
    updatedAt: Date;
  }> = {},
) {
  return {
    id: classId,
    academyId,
    name: "Level 1 Evening",
    description: "",
    status: overrides.status ?? "ACTIVE",
    createdByUserId: actorUserId,
    archivedAt: null,
    createdAt: updatedAt,
    updatedAt: overrides.updatedAt ?? updatedAt,
    courseAssignments: (overrides.courseIds ?? [courseA]).map((courseId) => ({
      classId,
      courseId,
      assignedByUserId: actorUserId,
      assignedAt: updatedAt,
      course: { id: courseId, title: `Course ${courseId.slice(-1)}`, isVisible: true },
    })),
    enrollments: (overrides.membershipIds ?? []).map((id) => ({
      classId,
      membershipId: id,
      enrolledByUserId: actorUserId,
      enrolledAt: updatedAt,
      membership: {
        id,
        role: "STUDENT",
        status: "ACTIVE",
        user: { id: `user-${id}`, displayName: "Student", email: "s@example.com" },
      },
    })),
  };
}

function createService(options?: {
  record?: ReturnType<typeof classRecord> | null;
  permissionError?: AppException;
  /** Courses the academy actually owns, for cross-academy rejection. */
  academyCourseIds?: string[];
  eligibleMembershipIds?: string[];
}) {
  const record = options?.record === undefined ? classRecord() : options.record;
  const enrollmentIds = new Set(
    record?.enrollments.map((enrollment) => enrollment.membershipId) ?? [],
  );
  const transaction = {
    class: {
      create: vi.fn().mockResolvedValue(record),
      update: vi.fn().mockResolvedValue(record),
      updateMany: vi.fn().mockImplementation(({ where }: {
        where: { status?: string; updatedAt?: Date };
      }) => Promise.resolve({
        count: record
          && (!where.status || where.status === record.status)
          && (!where.updatedAt
            || where.updatedAt.toISOString() === record.updatedAt.toISOString())
          ? 1
          : 0,
      })),
      findFirst: vi.fn().mockResolvedValue(record),
    },
    classCourse: {
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    classEnrollment: {
      findMany: vi.fn().mockImplementation(({ where }: {
        where: { membershipId: { in: string[] } };
      }) => Promise.resolve(
        where.membershipId.in
          .filter((id) => enrollmentIds.has(id))
          .map((id) => ({ membershipId: id })),
      )),
      findFirst: vi.fn().mockImplementation(({ where }: {
        where: { membershipId: string };
      }) => Promise.resolve(
        enrollmentIds.has(where.membershipId)
          ? { membershipId: where.membershipId }
          : null,
      )),
      createMany: vi.fn().mockImplementation(({ data }: {
        data: { membershipId: string }[];
      }) => {
        data.forEach(({ membershipId: id }) => enrollmentIds.add(id));
        return Promise.resolve({ count: data.length });
      }),
      deleteMany: vi.fn().mockImplementation(({ where }: {
        where: { membershipId: string };
      }) => {
        const deleted = enrollmentIds.delete(where.membershipId);
        return Promise.resolve({ count: deleted ? 1 : 0 });
      }),
    },
    course: {
      findMany: vi.fn().mockImplementation(({ where }: {
        where: { id: { in: string[] } };
      }) => {
        const owned = options?.academyCourseIds ?? [courseA, courseB, courseC];
        return Promise.resolve(
          where.id.in
            .filter((id) => owned.includes(id))
            .map((id) => ({ id })),
        );
      }),
    },
    academyMembership: {
      findMany: vi.fn().mockImplementation(({ where }: {
        where: { id: { in: string[] } };
      }) => {
        const eligible = options?.eligibleMembershipIds ?? [
          membershipId,
          otherMembershipId,
        ];
        return Promise.resolve(
          where.id.in
            .filter((id) => eligible.includes(id))
            .map((id) => ({ id })),
        );
      }),
    },
  };
  const prisma = {
    class: {
      findMany: vi.fn().mockResolvedValue(record ? [{
        ...record,
        _count: { enrollments: record.enrollments.length },
      }] : []),
      findFirst: vi.fn().mockResolvedValue(record),
    },
    academyMembership: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(
      async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
  } as unknown as PrismaService;
  const access = {
    requirePermission: vi.fn().mockImplementation(() => {
      if (options?.permissionError) return Promise.reject(options.permissionError);
      return Promise.resolve({ userId: actorUserId, academyId, role: "MANAGER" });
    }),
  } as unknown as AcademyAccessService;
  const audit = { write: vi.fn().mockResolvedValue(undefined) } as unknown as
    AuditService;
  return {
    prisma,
    access,
    audit,
    transaction,
    service: new ClassesService(prisma, access, audit),
  };
}

describe("ClassesService authorization", () => {
  it("gates class structure on classes.manage", async () => {
    const { service, access } = createService();

    await service.list(identity, { academyId });

    expect(access.requirePermission).toHaveBeenCalledWith(
      identity.authUserId,
      academyId,
      "classes.manage",
    );
  });

  it("lists roster counts without loading enrollment PII", async () => {
    const { service, prisma } = createService();

    await service.list(identity, { academyId });

    expect(prisma.class.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          _count: { select: { enrollments: true } },
        }),
      }),
    );
    const include = vi.mocked(prisma.class.findMany).mock.calls[0]?.[0]?.include;
    expect(include).not.toHaveProperty("enrollments");
  });

  it("gates enrollment on the separate class-enrollments.manage", async () => {
    const { service, access } = createService();

    await service.addStudents(identity, {
      academyId,
      classId,
      membershipIds: [membershipId],
    });

    expect(access.requirePermission).toHaveBeenCalledWith(
      identity.authUserId,
      academyId,
      "class-enrollments.manage",
    );
  });

  it("rejects a class from another academy as not found", async () => {
    const { service } = createService({ record: null });

    await expect(
      service.get(identity, { academyId, classId }),
    ).rejects.toMatchObject({ code: "CLASS_NOT_FOUND" });
  });
});

describe("ClassesService course assignment", () => {
  it("derives additions and removals from the submitted set", async () => {
    const { service, transaction } = createService({
      record: classRecord({ courseIds: [courseA, courseB] }),
    });

    await service.setCourses(identity, {
      academyId,
      classId,
      courseIds: [courseB, courseC],
      expectedUpdatedAt: updatedAt.toISOString(),
    });

    expect(transaction.classCourse.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          { classId, courseId: courseC, assignedByUserId: actorUserId },
        ],
      }),
    );
    expect(transaction.classCourse.deleteMany).toHaveBeenCalledWith({
      where: { classId, courseId: { in: [courseA] } },
    });
  });

  it("writes nothing when one submitted course belongs to another academy", async () => {
    const { service, transaction } = createService({
      academyCourseIds: [courseA],
    });

    await expect(
      service.setCourses(identity, {
        academyId,
        classId,
        courseIds: [courseA, courseB],
        expectedUpdatedAt: updatedAt.toISOString(),
      }),
    ).rejects.toMatchObject({ code: "COURSE_NOT_FOUND" });
    expect(transaction.classCourse.createMany).not.toHaveBeenCalled();
    expect(transaction.classCourse.deleteMany).not.toHaveBeenCalled();
  });

  it("moves the class revision so the list reports the change", async () => {
    const { service, transaction } = createService();

    await service.setCourses(identity, {
      academyId,
      classId,
      courseIds: [],
      expectedUpdatedAt: updatedAt.toISOString(),
    });

    expect(transaction.class.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { updatedAt: expect.any(Date) },
        where: expect.objectContaining({
          academyId,
          id: classId,
          status: "ACTIVE",
          updatedAt,
        }),
      }),
    );
  });

  it("rejects a stale revision instead of overwriting a colleague", async () => {
    const { service } = createService();

    await expect(
      service.setCourses(identity, {
        academyId,
        classId,
        courseIds: [courseB],
        expectedUpdatedAt: "2026-08-03T08:00:00.000Z",
      }),
    ).rejects.toMatchObject({ code: "CLASS_EDIT_CONFLICT" });
  });

  it("accepts a matching revision", async () => {
    const { service } = createService();

    await expect(
      service.setCourses(identity, {
        academyId,
        classId,
        courseIds: [courseB],
        expectedUpdatedAt: updatedAt.toISOString(),
      }),
    ).resolves.toMatchObject({ id: classId });
  });

  it("claims the expected revision in the same write that updates metadata", async () => {
    const { service, transaction } = createService();

    await service.update(identity, {
      academyId,
      classId,
      name: "Level 2",
      description: "Updated",
      expectedUpdatedAt: updatedAt.toISOString(),
    });

    expect(transaction.class.updateMany).toHaveBeenCalledWith({
      where: {
        academyId,
        id: classId,
        status: "ACTIVE",
        updatedAt,
      },
      data: { name: "Level 2", description: "Updated" },
    });
  });

  it("refuses to change an archived class", async () => {
    const { service } = createService({
      record: classRecord({ status: "ARCHIVED" }),
    });

    await expect(
      service.setCourses(identity, {
        academyId,
        classId,
        courseIds: [],
        expectedUpdatedAt: updatedAt.toISOString(),
      }),
    ).rejects.toMatchObject({ code: "CLASS_ARCHIVED" });
  });
});

describe("ClassesService enrollment", () => {
  it("is idempotent for a student already on the roster", async () => {
    const { service, transaction } = createService({
      record: classRecord({ membershipIds: [membershipId] }),
    });

    await expect(
      service.addStudents(identity, {
        academyId,
        classId,
        membershipIds: [membershipId],
      }),
    ).resolves.toMatchObject({ id: classId });
    expect(transaction.classEnrollment.createMany).not.toHaveBeenCalled();
    expect(transaction.class.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a membership that is not an active student of this academy", async () => {
    const { service, transaction } = createService({
      eligibleMembershipIds: [membershipId],
    });

    await expect(
      service.addStudents(identity, {
        academyId,
        classId,
        membershipIds: [membershipId, otherMembershipId],
      }),
    ).rejects.toMatchObject({ code: "CLASS_MEMBERSHIP_INELIGIBLE" });
    expect(transaction.classEnrollment.createMany).not.toHaveBeenCalled();
  });

  it("removes only the enrollment row, never the student's work", async () => {
    const { service, transaction } = createService({
      record: classRecord({ membershipIds: [membershipId] }),
    });

    await service.removeStudent(identity, { academyId, classId, membershipId });

    expect(transaction.classEnrollment.deleteMany).toHaveBeenCalledWith({
      where: { classId, membershipId },
    });
    expect(Object.keys(transaction)).not.toContain("exerciseDraft");
    expect(Object.keys(transaction)).not.toContain("submission");
  });

  it("does not touch or audit a missing enrollment", async () => {
    const { service, transaction, audit } = createService();

    await service.removeStudent(identity, { academyId, classId, membershipId });

    expect(transaction.classEnrollment.deleteMany).not.toHaveBeenCalled();
    expect(transaction.class.updateMany).not.toHaveBeenCalled();
    expect(audit.write).not.toHaveBeenCalled();
  });

  it("excludes already enrolled students from the eligible list", async () => {
    const { service, prisma } = createService();

    await service.listEligibleStudents(identity, { academyId, classId });

    expect(prisma.academyMembership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          academyId,
          role: "STUDENT",
          status: "ACTIVE",
          classEnrollments: { none: { classId } },
        },
      }),
    );
  });
});

describe("ClassesService archive and audit", () => {
  it("stamps archivedAt and clears it on restore", async () => {
    const archive = createService();

    await archive.service.setStatus(identity, {
      academyId,
      classId,
      status: "ARCHIVED",
    });
    expect(archive.transaction.class.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "ARCHIVED", archivedAt: expect.any(Date) },
      }),
    );

    const restore = createService({
      record: classRecord({ status: "ARCHIVED" }),
    });
    await restore.service.setStatus(identity, {
      academyId,
      classId,
      status: "ACTIVE",
    });
    expect(restore.transaction.class.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "ACTIVE", archivedAt: null },
      }),
    );
  });

  it("does not touch or audit a same-status request", async () => {
    const { service, transaction, audit } = createService();

    await service.setStatus(identity, { academyId, classId, status: "ACTIVE" });

    expect(transaction.class.updateMany).not.toHaveBeenCalled();
    expect(audit.write).not.toHaveBeenCalled();
  });

  it("audits every management mutation with the academy and actor", async () => {
    const { service, audit } = createService();

    await service.create(identity, { academyId, name: "Level 2", description: "" });
    await service.update(identity, {
      academyId,
      classId,
      name: "Level 2",
      description: "",
      expectedUpdatedAt: updatedAt.toISOString(),
    });
    await service.setCourses(identity, {
      academyId,
      classId,
      courseIds: [courseB],
      expectedUpdatedAt: updatedAt.toISOString(),
    });
    await service.setStatus(identity, { academyId, classId, status: "ARCHIVED" });
    await service.addStudents(identity, {
      academyId,
      classId,
      membershipIds: [membershipId],
    });
    await service.removeStudent(identity, { academyId, classId, membershipId });

    expect(
      vi.mocked(audit.write).mock.calls.map(([, input]) => input.action),
    ).toEqual([
      "class.created",
      "class.updated",
      "class.courses.updated",
      "class.archived",
      "class.students.enrolled",
      "class.student.removed",
    ]);
    for (const [, input] of vi.mocked(audit.write).mock.calls) {
      expect(input).toMatchObject({ academyId, actorUserId });
    }
  });

  it("records which courses an update added and removed", async () => {
    const { service, audit } = createService({
      record: classRecord({ courseIds: [courseA] }),
    });

    await service.setCourses(identity, {
      academyId,
      classId,
      courseIds: [courseB],
      expectedUpdatedAt: updatedAt.toISOString(),
    });

    expect(vi.mocked(audit.write).mock.calls[0]?.[1]).toMatchObject({
      action: "class.courses.updated",
      after: { added: [courseB], removed: [courseA] },
    });
  });

  it("never exposes a permanent delete", () => {
    expect(
      Object.getOwnPropertyNames(ClassesService.prototype).filter((name) =>
        name.toLowerCase().includes("delete")
      ),
    ).toEqual([]);
  });
});
