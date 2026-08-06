import { describe, expect, it, vi } from "vitest";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AppException } from "../common/app-exception.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { MonitoringAccessService } from "./monitoring-access.service.js";
import { MonitoringService } from "./monitoring.service.js";

const identity: SupabaseIdentity = {
  authUserId: "10000000-0000-4000-8000-000000000001",
  email: "teacher@example.com",
  emailVerified: true,
  username: null,
  displayName: "Teacher",
  avatarUrl: null,
  provider: null,
  requestedAcademyId: null,
};
const academyId = "20000000-0000-4000-8000-000000000001";
const teacherUserId = "30000000-0000-4000-8000-000000000001";
const teacherMembershipId = "40000000-0000-4000-8000-000000000001";
const classId = "50000000-0000-4000-8000-000000000001";
const studentMembershipId = "60000000-0000-4000-8000-000000000001";
const studentUserId = "70000000-0000-4000-8000-000000000001";
const materialId = "80000000-0000-4000-8000-000000000001";
const draftId = "a0000000-0000-4000-8000-000000000001";
const updatedAt = new Date("2026-08-04T09:00:00.000Z");

const actor = { userId: teacherUserId, academyId, membershipId: teacherMembershipId };
const classScope = { academyId, status: "ACTIVE" as const };

function classRecord(overrides?: {
  enrollmentCount?: number;
  enrollments?: unknown[];
}) {
  return {
    id: classId,
    academyId,
    name: "Level 1 Evening",
    description: "",
    status: "ACTIVE" as const,
    updatedAt,
    _count: {
      courseAssignments: 2,
      enrollments: overrides?.enrollmentCount ?? 1,
    },
    courseAssignments: [
      { course: { id: "c1", title: "Python Basics", isVisible: true } },
    ],
    enrollments: overrides?.enrollments ?? [
      {
        enrolledAt: updatedAt,
        lastLearningSeenAt: updatedAt,
        membership: {
          id: studentMembershipId,
          role: "STUDENT",
          status: "ACTIVE",
          user: {
            id: studentUserId,
            displayName: "Student",
            email: "student@example.com",
            status: "ACTIVE",
          },
        },
      },
    ],
  };
}

function materialRecord() {
  return {
    id: materialId,
    title: "Sum two numbers",
    lecture: {
      id: "lecture-1",
      title: "Input and output",
      courseModule: {
        id: "module-1",
        title: "Getting started",
        course: { id: "course-1", title: "Python Basics" },
      },
    },
    programmingExercise: {
      difficulty: "EASY",
      language: "PYTHON",
      description: "Add them.",
      inputFormat: "",
      outputFormat: "",
      constraints: "",
      starterCode: "",
      timeLimitMs: 3_000,
      memoryLimitMb: 256,
      testCases: [
        {
          position: 1,
          visibility: "SAMPLE",
          input: "1 2",
          expectedOutput: "3",
        },
        {
          position: 2,
          visibility: "HIDDEN",
          input: "999 1",
          expectedOutput: "1000",
        },
      ],
      hints: [{ position: 1, content: "Use input()." }],
    },
  };
}

function feedbackRow(index: number) {
  return {
    id: `f0000000-0000-4000-8000-00000000000${index}`,
    classId,
    teacherMembershipRef: teacherMembershipId,
    studentMembershipRef: studentMembershipId,
    materialId,
    body: `message ${index}`,
    createdAt: new Date(Date.UTC(2026, 7, 4, 9, index)),
  };
}

function createService(options?: {
  featureEnabled?: boolean;
  teacherError?: AppException;
  classes?: ReturnType<typeof classRecord>[];
  record?: ReturnType<typeof classRecord>;
  material?: ReturnType<typeof materialRecord> | null;
  draft?: { id: string } | null;
  feedback?: ReturnType<typeof feedbackRow>[];
}) {
  const prisma = {
    class: {
      findMany: vi.fn().mockResolvedValue(options?.classes ?? [classRecord()]),
      findFirstOrThrow: vi.fn().mockResolvedValue(options?.record ?? classRecord()),
    },
    user: {
      findFirstOrThrow: vi.fn().mockResolvedValue({
        id: studentUserId,
        displayName: "Student",
        email: "student@example.com",
      }),
    },
    material: {
      findFirst: vi.fn().mockResolvedValue(
        options?.material === undefined ? materialRecord() : options.material,
      ),
    },
    exerciseDraft: {
      findUnique: vi.fn().mockResolvedValue(
        options?.draft === undefined ? { id: draftId } : options.draft,
      ),
    },
    teacherFeedback: {
      findMany: vi.fn().mockResolvedValue(options?.feedback ?? []),
    },
  } as unknown as PrismaService;

  const access = {
    requireTeacher: vi.fn().mockImplementation(() =>
      options?.teacherError
        ? Promise.reject(options.teacherError)
        : Promise.resolve(actor)
    ),
    isFeatureEnabled: vi.fn().mockResolvedValue(options?.featureEnabled ?? true),
    requireFeature: vi.fn().mockImplementation(() =>
      (options?.featureEnabled ?? true)
        ? Promise.resolve()
        : Promise.reject(new AppException("MONITORING_DISABLED", 403))
    ),
    requireAssignedClass: vi.fn().mockResolvedValue({
      ...actor,
      classId,
      grantedAt: Date.now(),
    }),
    requireMonitorableStudent: vi.fn().mockResolvedValue({
      ...actor,
      classId,
      grantedAt: Date.now(),
      studentMembershipId,
      studentUserId,
    }),
    assignedClassScope: vi.fn().mockReturnValue(classScope),
    monitoredMaterialScope: vi.fn().mockReturnValue({ AND: [] }),
  } as unknown as MonitoringAccessService;

  return {
    service: new MonitoringService(prisma, access),
    prisma: prisma as unknown as {
      class: {
        findMany: ReturnType<typeof vi.fn>;
        findFirstOrThrow: ReturnType<typeof vi.fn>;
      };
      material: { findFirst: ReturnType<typeof vi.fn> };
      teacherFeedback: { findMany: ReturnType<typeof vi.fn> };
    },
    access: access as unknown as Record<string, ReturnType<typeof vi.fn>>,
  };
}

describe("listAssignedClasses", () => {
  it("returns the teacher's own classes with their counts", async () => {
    const { service } = createService();
    const result = await service.listAssignedClasses(identity, { academyId });
    expect(result.featureEnabled).toBe(true);
    expect(result.classes).toEqual([
      {
        classId,
        academyId,
        name: "Level 1 Evening",
        description: "",
        status: "ACTIVE",
        courseCount: 2,
        studentCount: 1,
        updatedAt: updatedAt.toISOString(),
      },
    ]);
  });

  it("scopes the query to the effective assignment", async () => {
    const { service, prisma, access } = createService();
    await service.listAssignedClasses(identity, { academyId });
    expect(access.assignedClassScope).toHaveBeenCalledWith(actor);
    expect(prisma.class.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: classScope }),
    );
  });

  it("reports the flag instead of failing, so the page can explain itself", async () => {
    const { service, prisma } = createService({ featureEnabled: false });
    await expect(service.listAssignedClasses(identity, { academyId })).resolves
      .toEqual({ featureEnabled: false, classes: [] });
    expect(prisma.class.findMany).not.toHaveBeenCalled();
  });

  it("authorizes before reading the flag, so it cannot be probed", async () => {
    const { service, access } = createService({
      featureEnabled: false,
      teacherError: new AppException("PERMISSION_DENIED", 403),
    });
    await expect(service.listAssignedClasses(identity, { academyId })).rejects
      .toMatchObject({ code: "PERMISSION_DENIED" });
    expect(access.isFeatureEnabled).not.toHaveBeenCalled();
  });

  it("returns an empty list for a teacher with no assignment", async () => {
    const { service } = createService({ classes: [] });
    await expect(service.listAssignedClasses(identity, { academyId })).resolves
      .toEqual({ featureEnabled: true, classes: [] });
  });
});

describe("getClassRoster", () => {
  it("returns durable enrollment data and no live state", async () => {
    const { service } = createService();
    const roster = await service.getClassRoster(identity, { academyId, classId });
    expect(roster.students).toEqual([
      {
        membershipId: studentMembershipId,
        userId: studentUserId,
        displayName: "Student",
        email: "student@example.com",
        membershipStatus: "ACTIVE",
        userStatus: "ACTIVE",
        enrolledAt: updatedAt.toISOString(),
        lastLearningSeenAt: updatedAt.toISOString(),
      },
    ]);
    expect(roster.students[0]).not.toHaveProperty("state");
  });

  it("requires the feature and the assignment before reading", async () => {
    const { service, access } = createService();
    await service.getClassRoster(identity, { academyId, classId });
    expect(access.requireFeature).toHaveBeenCalledWith(academyId);
    expect(access.requireAssignedClass).toHaveBeenCalledWith(actor, classId);
  });

  it("refuses when the academy is outside the rollout", async () => {
    const { service } = createService({ featureEnabled: false });
    await expect(service.getClassRoster(identity, { academyId, classId })).rejects
      .toMatchObject({ code: "MONITORING_DISABLED" });
  });

  it("bounds the roster and says so rather than trimming silently", async () => {
    const { service, prisma } = createService({
      record: classRecord({ enrollmentCount: 240 }),
    });
    const roster = await service.getClassRoster(identity, { academyId, classId });
    expect(roster.truncated).toBe(true);
    expect(prisma.class.findFirstOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          enrollments: expect.objectContaining({ take: 200 }),
        }),
      }),
    );
  });

  it("is not truncated for an ordinary class", async () => {
    const { service } = createService();
    const roster = await service.getClassRoster(identity, { academyId, classId });
    expect(roster.truncated).toBe(false);
  });
});

describe("getStudentContext", () => {
  it("returns trusted identity without an exercise until one is named", async () => {
    const { service, prisma } = createService();
    const context = await service.getStudentContext(identity, {
      academyId,
      classId,
      membershipId: studentMembershipId,
    });
    expect(context.student.membershipId).toBe(studentMembershipId);
    expect(context.exercise).toBeNull();
    expect(prisma.material.findFirst).not.toHaveBeenCalled();
  });

  it("re-authorizes the named exercise through the class scope", async () => {
    const { service, access } = createService();
    await service.getStudentContext(identity, {
      academyId,
      classId,
      membershipId: studentMembershipId,
      materialId,
    });
    expect(access.monitoredMaterialScope).toHaveBeenCalled();
  });

  it("carries sample cases and only a count of the hidden ones", async () => {
    const { service } = createService();
    const context = await service.getStudentContext(identity, {
      academyId,
      classId,
      membershipId: studentMembershipId,
      materialId,
    });
    expect(context.exercise?.exercise.sampleTestCases).toEqual([
      { position: 1, input: "1 2", expectedOutput: "3" },
    ]);
    expect(context.exercise?.exercise.hiddenTestCaseCount).toBe(1);
    expect(JSON.stringify(context)).not.toContain("999 1");
  });

  it("names the draft room only once the student has a draft", async () => {
    const { service } = createService({ draft: null });
    const context = await service.getStudentContext(identity, {
      academyId,
      classId,
      membershipId: studentMembershipId,
      materialId,
    });
    expect(context.exercise?.draftId).toBeNull();
  });

  it("returns no exercise for a material this class cannot reach", async () => {
    const { service } = createService({ material: null });
    const context = await service.getStudentContext(identity, {
      academyId,
      classId,
      membershipId: studentMembershipId,
      materialId,
    });
    expect(context.exercise).toBeNull();
  });

  it("refuses a student who is no longer monitorable", async () => {
    const { service, access } = createService();
    access.requireMonitorableStudent.mockRejectedValueOnce(
      new AppException("MONITORING_STUDENT_UNAVAILABLE", 404),
    );
    await expect(
      service.getStudentContext(identity, {
        academyId,
        classId,
        membershipId: studentMembershipId,
      }),
    ).rejects.toMatchObject({ code: "MONITORING_STUDENT_UNAVAILABLE" });
  });
});

describe("listFeedback", () => {
  it("returns stored messages without naming their author", async () => {
    const { service } = createService({ feedback: [feedbackRow(1)] });
    const result = await service.listFeedback(identity, {
      academyId,
      classId,
      membershipId: studentMembershipId,
      limit: 50,
    });
    expect(result.feedback[0]).toEqual({
      id: feedbackRow(1).id,
      classId,
      teacherMembershipRef: teacherMembershipId,
      studentMembershipRef: studentMembershipId,
      materialId,
      body: "message 1",
      createdAt: feedbackRow(1).createdAt.toISOString(),
    });
    expect(result.feedback[0]).not.toHaveProperty("displayName");
  });

  it("matches on the immutable membership reference", async () => {
    const { service, prisma } = createService();
    await service.listFeedback(identity, {
      academyId,
      classId,
      membershipId: studentMembershipId,
      limit: 50,
    });
    expect(prisma.teacherFeedback.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          academyId,
          classId,
          studentMembershipRef: studentMembershipId,
        }),
      }),
    );
  });

  it("reads one row past the page to decide whether more exist", async () => {
    const { service, prisma } = createService({
      feedback: [feedbackRow(1), feedbackRow(2), feedbackRow(3)],
    });
    const result = await service.listFeedback(identity, {
      academyId,
      classId,
      membershipId: studentMembershipId,
      limit: 2,
    });
    expect(prisma.teacherFeedback.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 3 }),
    );
    expect(result.feedback).toHaveLength(2);
    expect(result.nextBefore).toBe(feedbackRow(2).createdAt.toISOString());
  });

  it("ends the history rather than paging forever", async () => {
    const { service } = createService({ feedback: [feedbackRow(1)] });
    const result = await service.listFeedback(identity, {
      academyId,
      classId,
      membershipId: studentMembershipId,
      limit: 2,
    });
    expect(result.nextBefore).toBeNull();
  });

  it("filters to one exercise when asked", async () => {
    const { service, prisma } = createService();
    await service.listFeedback(identity, {
      academyId,
      classId,
      membershipId: studentMembershipId,
      materialId,
      limit: 50,
    });
    expect(prisma.teacherFeedback.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ materialId }),
      }),
    );
  });

  it("refuses while the academy is outside the rollout", async () => {
    const { service } = createService({ featureEnabled: false });
    await expect(
      service.listFeedback(identity, {
        academyId,
        classId,
        membershipId: studentMembershipId,
        limit: 50,
      }),
    ).rejects.toMatchObject({ code: "MONITORING_DISABLED" });
  });
});
