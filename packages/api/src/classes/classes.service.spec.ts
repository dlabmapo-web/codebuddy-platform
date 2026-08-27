import { describe, expect, it, vi } from "vitest";

import type { AuditService } from "../academies/audit.service.js";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import type { AcademyAccessService } from "../authorization/academy-access.service.js";
import { AppException } from "../common/app-exception.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { MonitoringRevocationService } from "../monitoring/monitoring-revocation.service.js";
import type { ProfileMediaService } from "../profile/profile-media.service.js";
import { ClassesService } from "./classes.service.js";

const identity: SupabaseIdentity = {
  authUserId: "10000000-0000-4000-8000-000000000001",
  email: "lead@example.com",
  emailVerified: true,
  username: null,
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
const teacherA = "70000000-0000-4000-8000-00000000000a";
const teacherB = "70000000-0000-4000-8000-00000000000b";
const updatedAt = new Date("2026-08-03T09:00:00.000Z");
/*
 * What a revision claim looks like in a `where` clause. Not an equality: the
 * stored `timestamptz` keeps microseconds that never reach the caller, so the
 * claim names the millisecond it was handed. See `common/optimistic-lock.ts`.
 */
const claiming = {
  gte: updatedAt,
  lt: new Date(updatedAt.getTime() + 1),
};

function teacherMembership(
  id: string,
  overrides: Partial<{ status: string; role: string; userStatus: string }> = {},
) {
  return {
    id,
    role: overrides.role ?? "TEACHER",
    status: overrides.status ?? "ACTIVE",
    user: {
      id: `user-${id}`,
      displayName: "Teacher",
      email: "teacher@example.com",
      status: overrides.userStatus ?? "ACTIVE",
    },
  };
}

function classRecord(
  overrides: Partial<{
    status: "ACTIVE" | "ARCHIVED";
    courseIds: string[];
    membershipIds: string[];
    updatedAt: Date;
    /** The stored assignment, valid or not. */
    teacher: ReturnType<typeof teacherMembership> | null;
    /** When the class meets. Empty is the ordinary case. */
    schedule: {
      id: string;
      weekday: number;
      startMinute: number;
      endMinute: number;
    }[];
  }> = {},
) {
  const teacher = overrides.teacher ?? null;
  return {
    id: classId,
    academyId,
    name: "Level 1 Evening",
    description: "",
    status: overrides.status ?? "ACTIVE",
    createdByUserId: actorUserId,
    teacherMembershipId: teacher?.id ?? null,
    assignedTeacher: teacher,
    archivedAt: null,
    createdAt: updatedAt,
    updatedAt: overrides.updatedAt ?? updatedAt,
    // A class with no windows is the ordinary case: it simply never pays
    // attendance points. §8.1 of the student points design.
    scheduleSlots: overrides.schedule ?? [],
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
  /** Memberships that satisfy every teacher eligibility condition. */
  eligibleTeacherIds?: string[];
  /** Forces the conditional update to lose, as a concurrent write would. */
  claimFails?: boolean;
}) {
  const record = options?.record === undefined ? classRecord() : options.record;
  const enrollmentIds = new Set(
    record?.enrollments.map((enrollment) => enrollment.membershipId) ?? [],
  );
  const transaction = {
    // Enrolment changes bump the academy's people revision in the same
    // transaction — §8.1 of the manager control tower design — so the double
    // has to answer for the academy row as well as the class.
    academy: {
      update: vi.fn().mockResolvedValue({ peopleRevision: 1 }),
    },
    class: {
      create: vi.fn().mockResolvedValue(record),
      update: vi.fn().mockResolvedValue(record),
      updateMany: vi.fn().mockImplementation(({ where }: {
        where: { status?: string; updatedAt?: { gte: Date; lt: Date } };
      }) => Promise.resolve({
        count: !options?.claimFails
          && record
          && (!where.status || where.status === record.status)
          // A revision claim is a millisecond window, not an equality: the
          // stored column keeps microseconds the caller never receives. The
          // double honours the window so it cannot accept a query the database
          // would refuse.
          && (!where.updatedAt
            || (record.updatedAt >= where.updatedAt.gte
              && record.updatedAt < where.updatedAt.lt))
          ? 1
          : 0,
      })),
      findFirst: vi.fn().mockResolvedValue(record),
    },
    classCourse: {
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    classScheduleSlot: {
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
      // Answers only for a membership that meets every condition the service
      // asked for, which is how a cross-academy or suspended id gets rejected.
      findFirst: vi.fn().mockImplementation(({ where }: {
        where: { id: string };
      }) => {
        const eligible = options?.eligibleTeacherIds ?? [teacherA, teacherB];
        return Promise.resolve(
          eligible.includes(where.id) ? { id: where.id } : null,
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
  const revocation = {
    revokeClass: vi.fn().mockResolvedValue(undefined),
    revokeTeacher: vi.fn().mockResolvedValue(undefined),
    revokeStudent: vi.fn().mockResolvedValue(undefined),
    revokeScope: vi.fn().mockResolvedValue(undefined),
  } as unknown as MonitoringRevocationService;
  return {
    prisma,
    access,
    audit,
    revocation: revocation as unknown as Record<string, ReturnType<typeof vi.fn>>,
    transaction,
    service: new ClassesService(
      prisma,
      access,
      audit,
      revocation,
      // Rosters and pickers carry faces now. Signing nothing is the honest
      // double: these tests are about authorization and audit, and an avatar
      // that fails to sign degrades to the placeholder rather than to an error.
      { signMany: vi.fn().mockResolvedValue([]) } as unknown as ProfileMediaService,
    ),
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
          updatedAt: claiming,
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
        updatedAt: claiming,
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

describe("ClassesService schedule", () => {
  const monday = { weekday: 1, startMinute: 16 * 60, endMinute: 18 * 60 };
  const wednesday = { weekday: 3, startMinute: 16 * 60, endMinute: 18 * 60 };

  it("replaces the whole timetable rather than diffing it", async () => {
    const { service, transaction } = createService({
      record: classRecord({
        schedule: [{ id: "slot-1", ...wednesday }],
      }),
    });

    await service.setSchedule(identity, {
      academyId,
      classId,
      slots: [monday],
      expectedUpdatedAt: updatedAt.toISOString(),
    });

    expect(transaction.classScheduleSlot.deleteMany).toHaveBeenCalledWith({
      where: { classId },
    });
    expect(transaction.classScheduleSlot.createMany).toHaveBeenCalledWith({
      data: [{ classId, ...monday }],
    });
  });

  it("orders the week and drops a repeated window", async () => {
    const { service, transaction } = createService();

    await service.setSchedule(identity, {
      academyId,
      classId,
      // Out of order, and Monday twice. A duplicate could never pay twice —
      // the award is keyed per class per day — so storing it would only give a
      // manager a timetable that disagrees with itself.
      slots: [wednesday, monday, monday],
      expectedUpdatedAt: updatedAt.toISOString(),
    });

    expect(transaction.classScheduleSlot.createMany).toHaveBeenCalledWith({
      data: [
        { classId, ...monday },
        { classId, ...wednesday },
      ],
    });
  });

  it("writes no rows for an emptied timetable, and does not fail", async () => {
    const { service, transaction } = createService({
      record: classRecord({ schedule: [{ id: "slot-1", ...monday }] }),
    });

    await service.setSchedule(identity, {
      academyId,
      classId,
      slots: [],
      expectedUpdatedAt: updatedAt.toISOString(),
    });

    // A class with no windows simply never pays attendance points. §8.1.
    expect(transaction.classScheduleSlot.deleteMany).toHaveBeenCalled();
    expect(transaction.classScheduleSlot.createMany).not.toHaveBeenCalled();
  });

  it("refuses a stale revision rather than overwriting a colleague", async () => {
    const { service, transaction } = createService({ claimFails: true });

    await expect(
      service.setSchedule(identity, {
        academyId,
        classId,
        slots: [monday],
        expectedUpdatedAt: updatedAt.toISOString(),
      }),
    ).rejects.toMatchObject({ code: "CLASS_EDIT_CONFLICT" });
    expect(transaction.classScheduleSlot.deleteMany).not.toHaveBeenCalled();
  });

  it("writes an audit entry naming the timetable before and after", async () => {
    const { service, audit } = createService({
      record: classRecord({ schedule: [{ id: "slot-1", ...wednesday }] }),
    });

    await service.setSchedule(identity, {
      academyId,
      classId,
      slots: [monday],
      expectedUpdatedAt: updatedAt.toISOString(),
    });

    expect(audit.write).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "class.schedule.updated",
        before: { slots: [wednesday] },
        after: { slots: [monday] },
      }),
    );
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

describe("ClassesService teacher assignment", () => {
  const revision = updatedAt.toISOString();

  it("gates every teacher operation on class-teachers.manage", async () => {
    const list = createService();
    await list.service.listEligibleTeachers(identity, { academyId, classId });
    expect(list.access.requirePermission).toHaveBeenCalledWith(
      identity.authUserId,
      academyId,
      "class-teachers.manage",
    );

    const set = createService();
    await set.service.setTeacher(identity, {
      academyId,
      classId,
      teacherMembershipId: teacherA,
      expectedUpdatedAt: revision,
    });
    expect(set.access.requirePermission).toHaveBeenCalledWith(
      identity.authUserId,
      academyId,
      "class-teachers.manage",
    );
  });

  it("never gates assignment on the teacher's own reserved permission", async () => {
    const { service, access } = createService();

    await service.setTeacher(identity, {
      academyId,
      classId,
      teacherMembershipId: teacherA,
      expectedUpdatedAt: revision,
    });

    expect(access.requirePermission).not.toHaveBeenCalledWith(
      identity.authUserId,
      academyId,
      "classes.assigned.manage",
    );
  });

  it("offers only active same-academy teachers with an active user", async () => {
    const { service, prisma } = createService();

    await service.listEligibleTeachers(identity, { academyId, classId });

    expect(prisma.academyMembership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          academyId,
          role: "TEACHER",
          status: "ACTIVE",
          user: { status: "ACTIVE" },
        },
        orderBy: [{ user: { displayName: "asc" } }, { id: "asc" }],
      }),
    );
  });

  it("lists candidates for an archived class but refuses to write to it", async () => {
    const { service } = createService({
      record: classRecord({ status: "ARCHIVED" }),
    });

    await expect(
      service.listEligibleTeachers(identity, { academyId, classId }),
    ).resolves.toMatchObject({ teachers: [] });
    await expect(
      service.setTeacher(identity, {
        academyId,
        classId,
        teacherMembershipId: teacherA,
        expectedUpdatedAt: revision,
      }),
    ).rejects.toMatchObject({ code: "CLASS_ARCHIVED" });
  });

  it("refuses an idempotent teacher request while the class is archived", async () => {
    const { service, transaction, audit } = createService({
      record: classRecord({
        status: "ARCHIVED",
        teacher: teacherMembership(teacherA),
      }),
    });

    await expect(
      service.setTeacher(identity, {
        academyId,
        classId,
        teacherMembershipId: teacherA,
        expectedUpdatedAt: revision,
      }),
    ).rejects.toMatchObject({ code: "CLASS_ARCHIVED" });
    expect(transaction.class.updateMany).not.toHaveBeenCalled();
    expect(audit.write).not.toHaveBeenCalled();
  });

  it("assigns a teacher in the same write that claims the revision", async () => {
    const { service, transaction } = createService();

    await service.setTeacher(identity, {
      academyId,
      classId,
      teacherMembershipId: teacherA,
      expectedUpdatedAt: revision,
    });

    expect(transaction.class.updateMany).toHaveBeenCalledWith({
      where: { id: classId, academyId, status: "ACTIVE", updatedAt: claiming },
      data: { teacherMembershipId: teacherA },
    });
  });

  it("replaces the stored teacher without touching the roster", async () => {
    const { service, transaction } = createService({
      record: classRecord({ teacher: teacherMembership(teacherA) }),
    });

    await service.setTeacher(identity, {
      academyId,
      classId,
      teacherMembershipId: teacherB,
      expectedUpdatedAt: revision,
    });

    expect(transaction.class.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { teacherMembershipId: teacherB } }),
    );
    expect(transaction.classEnrollment.deleteMany).not.toHaveBeenCalled();
  });

  it("removes an assignment and leaves the class active", async () => {
    const { service, transaction } = createService({
      record: classRecord({ teacher: teacherMembership(teacherA) }),
    });

    const detail = await service.setTeacher(identity, {
      academyId,
      classId,
      teacherMembershipId: null,
      expectedUpdatedAt: revision,
    });

    expect(transaction.class.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { teacherMembershipId: null } }),
    );
    expect(detail.status).toBe("ACTIVE");
  });

  it("validates eligibility inside the transaction, before any write", async () => {
    const { service, transaction } = createService({
      eligibleTeacherIds: [],
    });

    await expect(
      service.setTeacher(identity, {
        academyId,
        classId,
        teacherMembershipId: teacherA,
        expectedUpdatedAt: revision,
      }),
    ).rejects.toMatchObject({ code: "CLASS_TEACHER_INELIGIBLE" });
    expect(transaction.academyMembership.findFirst).toHaveBeenCalled();
    expect(transaction.class.updateMany).not.toHaveBeenCalled();
  });

  it("checks the academy, role, status, and user in one membership query", async () => {
    const { service, transaction } = createService();

    await service.setTeacher(identity, {
      academyId,
      classId,
      teacherMembershipId: teacherA,
      expectedUpdatedAt: revision,
    });

    expect(transaction.academyMembership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: teacherA,
          academyId,
          role: "TEACHER",
          status: "ACTIVE",
          user: { status: "ACTIVE" },
        },
      }),
    );
  });

  it("gives a cross-academy id the same answer as an ineligible one", async () => {
    const crossAcademy = createService({ eligibleTeacherIds: [] });
    const suspended = createService({ eligibleTeacherIds: [] });

    const first = await crossAcademy.service
      .setTeacher(identity, {
        academyId,
        classId,
        teacherMembershipId: teacherA,
        expectedUpdatedAt: revision,
      })
      .catch((error: AppException) => error.code);
    const second = await suspended.service
      .setTeacher(identity, {
        academyId,
        classId,
        teacherMembershipId: teacherB,
        expectedUpdatedAt: revision,
      })
      .catch((error: AppException) => error.code);

    expect(first).toBe("CLASS_TEACHER_INELIGIBLE");
    expect(second).toBe(first);
  });

  it("does not touch or audit a repeat of the current assignment", async () => {
    const { service, transaction, audit } = createService({
      record: classRecord({ teacher: teacherMembership(teacherA) }),
    });

    await service.setTeacher(identity, {
      academyId,
      classId,
      teacherMembershipId: teacherA,
      expectedUpdatedAt: revision,
    });

    expect(transaction.class.updateMany).not.toHaveBeenCalled();
    expect(transaction.academyMembership.findFirst).not.toHaveBeenCalled();
    expect(audit.write).not.toHaveBeenCalled();
  });

  it("does not touch or audit removal from an already empty class", async () => {
    const { service, transaction, audit } = createService();

    await service.setTeacher(identity, {
      academyId,
      classId,
      teacherMembershipId: null,
      expectedUpdatedAt: revision,
    });

    expect(transaction.class.updateMany).not.toHaveBeenCalled();
    expect(audit.write).not.toHaveBeenCalled();
  });

  it("rejects a stale revision instead of overwriting the other decision", async () => {
    const { service } = createService({
      record: classRecord({ teacher: teacherMembership(teacherA) }),
    });

    await expect(
      service.setTeacher(identity, {
        academyId,
        classId,
        teacherMembershipId: teacherB,
        expectedUpdatedAt: "2026-08-03T08:00:00.000Z",
      }),
    ).rejects.toMatchObject({ code: "CLASS_EDIT_CONFLICT" });
  });

  it("reports a conflict when a concurrent write wins the same revision", async () => {
    // The read saw the expected revision, so the loss can only mean another
    // transaction committed between the read and the conditional update.
    const { service, audit } = createService({ claimFails: true });

    await expect(
      service.setTeacher(identity, {
        academyId,
        classId,
        teacherMembershipId: teacherA,
        expectedUpdatedAt: revision,
      }),
    ).rejects.toMatchObject({ code: "CLASS_EDIT_CONFLICT" });
    expect(audit.write).not.toHaveBeenCalled();
  });

  it("audits each transition with its own action and both membership ids", async () => {
    const assign = createService();
    await assign.service.setTeacher(identity, {
      academyId,
      classId,
      teacherMembershipId: teacherA,
      expectedUpdatedAt: revision,
    });
    expect(vi.mocked(assign.audit.write).mock.calls[0]?.[1]).toMatchObject({
      action: "class.teacher.assigned",
      academyId,
      actorUserId,
      targetId: classId,
      before: { teacherMembershipId: null },
      after: { teacherMembershipId: teacherA },
    });

    const replace = createService({
      record: classRecord({ teacher: teacherMembership(teacherA) }),
    });
    await replace.service.setTeacher(identity, {
      academyId,
      classId,
      teacherMembershipId: teacherB,
      expectedUpdatedAt: revision,
    });
    expect(vi.mocked(replace.audit.write).mock.calls[0]?.[1]).toMatchObject({
      action: "class.teacher.replaced",
      before: { teacherMembershipId: teacherA },
      after: { teacherMembershipId: teacherB },
    });

    const remove = createService({
      record: classRecord({ teacher: teacherMembership(teacherA) }),
    });
    await remove.service.setTeacher(identity, {
      academyId,
      classId,
      teacherMembershipId: null,
      expectedUpdatedAt: revision,
    });
    expect(vi.mocked(remove.audit.write).mock.calls[0]?.[1]).toMatchObject({
      action: "class.teacher.removed",
      before: { teacherMembershipId: teacherA },
      after: { teacherMembershipId: null },
    });
  });

  it("keeps names and emails out of the audit payload", async () => {
    const { service, audit } = createService();

    await service.setTeacher(identity, {
      academyId,
      classId,
      teacherMembershipId: teacherA,
      expectedUpdatedAt: revision,
    });

    const payload = JSON.stringify(vi.mocked(audit.write).mock.calls[0]?.[1]);
    expect(payload).not.toContain("teacher@example.com");
    expect(payload).not.toContain("Teacher");
  });

  it("reports a stored assignment that no longer grants access", async () => {
    // Suspension deletes nothing, so a Manager still sees who was in charge
    // and can decide whether to replace or clear them.
    const { service } = createService({
      record: classRecord({
        teacher: teacherMembership(teacherA, { status: "SUSPENDED" }),
      }),
    });

    const detail = await service.get(identity, { academyId, classId });

    expect(detail.assignedTeacher).toMatchObject({
      membershipId: teacherA,
      membershipStatus: "SUSPENDED",
      role: "TEACHER",
    });
  });

  it("reports the assigned user's current account status", async () => {
    const { service } = createService({
      record: classRecord({
        teacher: teacherMembership(teacherA, { userStatus: "SUSPENDED" }),
      }),
    });

    const detail = await service.get(identity, { academyId, classId });

    expect(detail.assignedTeacher).toMatchObject({
      membershipId: teacherA,
      userStatus: "SUSPENDED",
    });
  });

  it("reports an unassigned class as having no teacher", async () => {
    const { service } = createService();

    expect(
      (await service.get(identity, { academyId, classId })).assignedTeacher,
    ).toBeNull();
  });

  it("keeps the list's teacher include free of roster and email", async () => {
    const { service, prisma } = createService();

    await service.list(identity, { academyId });

    const include = vi.mocked(prisma.class.findMany).mock.calls[0]?.[0]?.include;
    expect(include).toHaveProperty("assignedTeacher");
    expect(
      // @ts-expect-error narrowing the generated include type is not the point
      include?.assignedTeacher?.select?.user?.select,
    ).toEqual({ id: true, displayName: true, status: true });
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
