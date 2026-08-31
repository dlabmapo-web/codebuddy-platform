import type { LearnCourseOutline } from "@cove/shared";
import { describe, expect, it, vi } from "vitest";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AppException } from "../common/app-exception.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { CurriculumOutlineService } from "../learn/curriculum-outline.service.js";
import type { MonitoringAccessService } from "./monitoring-access.service.js";
import type { MonitoringFeedbackBroadcaster } from "./monitoring-feedback-broadcaster.js";
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
const otherMaterialId = "80000000-0000-4000-8000-000000000002";
const courseId = "90000000-0000-4000-8000-000000000001";
const draftId = "a0000000-0000-4000-8000-000000000001";
const visitId = "b0000000-0000-4000-8000-000000000001";
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
            username: "student01",
            email: "student@example.com",
            status: "ACTIVE",
          },
        },
      },
    ],
  };
}

/** The student's own outline, as the shared builder would return it. */
function courseOutline(): LearnCourseOutline {
  return {
    course: { id: courseId, title: "Python basics", description: "" },
    progress: { total: 2, started: 1, solved: 1 },
    modules: [
      {
        id: "b0000000-0000-4000-8000-000000000001",
        title: "Getting started",
        description: "",
        position: 1,
        lectures: [
          {
            id: "c0000000-0000-4000-8000-000000000001",
            title: "Input and output",
            description: "",
            position: 1,
            exercises: [
              {
                materialId,
                title: "Sum two numbers",
                position: 1,
                difficulty: "EASY",
                status: "SOLVED",
                bestScore: 100,
              },
              {
                materialId: otherMaterialId,
                title: "Print a triangle",
                position: 2,
                difficulty: "MEDIUM",
                status: "NOT_STARTED",
                bestScore: 0,
              },
            ],
          },
        ],
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
      starterCode: "print()",
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

function feedbackRow(index: number, author = teacherMembershipId): {
  id: string;
  classId: string;
  teacherMembershipRef: string;
  studentMembershipRef: string;
  materialId: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  readAt: Date | null;
  /** Null once the membership behind the note is gone. */
  teacherMembership: { user: { displayName: string } } | null;
} {
  return {
    id: `f0000000-0000-4000-8000-00000000000${index}`,
    classId,
    teacherMembershipRef: author,
    studentMembershipRef: studentMembershipId,
    materialId,
    body: `message ${index}`,
    createdAt: new Date(Date.UTC(2026, 7, 4, 9, index)),
    updatedAt: new Date(Date.UTC(2026, 7, 4, 9, index)),
    readAt: null,
    teacherMembership: { user: { displayName: "Kim" } },
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
  readCount?: number;
  studentSelfError?: AppException;
  materialError?: AppException;
  outline?: LearnCourseOutline | null;
  visit?: { id: string; material: { programmingExercise: { solutionCode: string | null } | null } | null } | null;
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
    programmingExercise: {
      findUnique: vi.fn().mockResolvedValue({ solutionCode: "print('answer')\n" }),
    },
    teacherMonitoringVisit: {
      findFirst: vi.fn().mockResolvedValue(
        options?.visit === undefined
          ? {
              id: visitId,
              material: {
                programmingExercise: { solutionCode: "print('answer')\n" },
              },
            }
          : options.visit,
      ),
    },
    teacherFeedback: {
      findMany: vi.fn().mockResolvedValue(options?.feedback ?? []),
      updateMany: vi
        .fn()
        .mockResolvedValue({ count: options?.readCount ?? 0 }),
    },
    $transaction: vi.fn(async (callback: (tx: object) => Promise<unknown>) =>
      callback({}),
    ),
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
    requireMonitorableMaterial: vi.fn().mockImplementation(() =>
      options?.materialError
        ? Promise.reject(options.materialError)
        : Promise.resolve({
            ...actor,
            classId,
            grantedAt: Date.now(),
            studentMembershipId,
            studentUserId,
            materialId,
            courseId,
          })
    ),
    assignedClassScope: vi.fn().mockReturnValue(classScope),
    monitoredMaterialScope: vi.fn().mockReturnValue({ AND: [] }),
    requireStudentSelf: vi.fn().mockImplementation(() =>
      options?.studentSelfError
        ? Promise.reject(options.studentSelfError)
        : Promise.resolve({
            academyId,
            membershipId: studentMembershipId,
            userId: studentUserId,
          })
    ),
  } as unknown as MonitoringAccessService;

  // Attached to nothing, so a read receipt is a no-op here. The broadcast is
  // best-effort by design and is covered in the broadcaster's own tests.
  const broadcaster = {
    feedbackRead: vi.fn().mockResolvedValue(undefined),
  } as unknown as MonitoringFeedbackBroadcaster;

  // The outline builder is the student's own, read through a teacher's claim.
  // Stubbed here so these tests are about the authorization around it.
  const curriculum = {
    outlineForCourse: vi.fn().mockResolvedValue(
      options?.outline === undefined ? courseOutline() : options.outline,
    ),
  } as unknown as CurriculumOutlineService;
  const audit = { write: vi.fn().mockResolvedValue(undefined) };

  return {
    service: new MonitoringService(
      prisma,
      access,
      broadcaster,
      curriculum,
      audit as never,
    ),
    curriculum: curriculum as unknown as Record<
      string,
      ReturnType<typeof vi.fn>
    >,
    broadcaster: broadcaster as unknown as Record<
      string,
      ReturnType<typeof vi.fn>
    >,
    prisma: prisma as unknown as {
      class: {
        findMany: ReturnType<typeof vi.fn>;
        findFirstOrThrow: ReturnType<typeof vi.fn>;
      };
      material: { findFirst: ReturnType<typeof vi.fn> };
      exerciseDraft: { findUnique: ReturnType<typeof vi.fn> };
      teacherMonitoringVisit: { findFirst: ReturnType<typeof vi.fn> };
      teacherFeedback: {
        findMany: ReturnType<typeof vi.fn>;
        updateMany: ReturnType<typeof vi.fn>;
      };
    },
    access: access as unknown as Record<string, ReturnType<typeof vi.fn>>,
    audit,
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
        username: "student01",
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
    expect(context.exercise?.hasSolution).toBe(true);
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

describe("getExerciseSolution", () => {
  const input = {
    academyId,
    classId,
    membershipId: studentMembershipId,
    materialId,
    visitId,
  };

  it("returns the answer only through the exact active visit and audits metadata", async () => {
    const { service, prisma, audit } = createService();

    await expect(service.getExerciseSolution(identity, input)).resolves.toEqual({
      materialId,
      solutionCode: "print('answer')\n",
    });
    expect(prisma.teacherMonitoringVisit.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: visitId,
          teacherMembershipRef: teacherMembershipId,
          studentMembershipRef: studentMembershipId,
          materialId,
          endedAt: null,
        }),
      }),
    );
    expect(audit.write).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "monitoring.exercise_solution.viewed",
        targetId: materialId,
      }),
    );
  });

  it("refuses an ended, mismatched, or missing visit without returning code", async () => {
    const { service } = createService({ visit: null });
    await expect(
      service.getExerciseSolution(identity, input),
    ).rejects.toMatchObject({ code: "MONITORING_STUDENT_UNAVAILABLE" });
  });

  it("refuses a legacy problem with no answer", async () => {
    const { service } = createService({
      visit: {
        id: visitId,
        material: { programmingExercise: { solutionCode: null } },
      },
    });
    await expect(
      service.getExerciseSolution(identity, input),
    ).rejects.toMatchObject({ code: "MONITORING_STUDENT_UNAVAILABLE" });
  });
});

describe("listFeedback", () => {
  it("returns stored notes with their author named", async () => {
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
      updatedAt: feedbackRow(1).updatedAt.toISOString(),
      readAt: null,
      teacherName: "Kim",
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

  /**
   * Rows written before notes became singular are still on disk. The read
   * collapses them rather than deleting them, so a student is shown the
   * teacher's current advice and not every wording it has ever had.
   */
  it("returns only the newest note per author", async () => {
    const { service } = createService({
      // Newest first, as the query orders them.
      feedback: [feedbackRow(3), feedbackRow(2), feedbackRow(1)],
    });
    const result = await service.listFeedback(identity, {
      academyId,
      classId,
      membershipId: studentMembershipId,
      limit: 50,
    });
    expect(result.feedback).toHaveLength(1);
    expect(result.feedback[0]!.body).toBe("message 3");
  });

  it("keeps one note for each teacher who wrote one", async () => {
    const otherTeacher = "40000000-0000-4000-8000-000000000002";
    const { service } = createService({
      feedback: [
        feedbackRow(3),
        feedbackRow(2, otherTeacher),
        feedbackRow(1),
      ],
    });
    const result = await service.listFeedback(identity, {
      academyId,
      classId,
      membershipId: studentMembershipId,
      limit: 50,
    });
    expect(result.feedback.map((note) => note.body)).toEqual([
      "message 3",
      "message 2",
    ]);
  });

  it("never pages: the result is bounded by authors, not by volume", async () => {
    const { service } = createService({
      feedback: [feedbackRow(3), feedbackRow(2), feedbackRow(1)],
    });
    const result = await service.listFeedback(identity, {
      academyId,
      classId,
      membershipId: studentMembershipId,
      limit: 1,
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

describe("listMyFeedback", () => {
  it("selects on the caller's own membership, resolved from their identity", async () => {
    const { service, prisma, access } = createService({
      feedback: [feedbackRow(1)],
    });
    await service.listMyFeedback(identity, { academyId, limit: 50 });

    expect(access.requireStudentSelf).toHaveBeenCalledWith(identity, academyId);
    expect(prisma.teacherFeedback.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          studentMembershipRef: studentMembershipId,
          academyId,
        }),
      }),
    );
  });

  /**
   * The authorization property this endpoint exists to hold: a student cannot
   * name a thread. There is no membership parameter, so an extra field in the
   * request cannot become one.
   */
  it("ignores a membership smuggled into the input", async () => {
    const { service, prisma } = createService();
    // Held in a variable rather than written inline: the extra field is not
    // part of the input type, and the point of the test is that a forged
    // client can send it anyway. The query must be built without it.
    const forged = {
      academyId,
      limit: 50,
      membershipId: teacherMembershipId,
    };
    await service.listMyFeedback(identity, forged);

    const where = prisma.teacherFeedback.findMany.mock.calls[0]![0].where;
    expect(where.studentMembershipRef).toBe(studentMembershipId);
    expect(where).not.toHaveProperty("membershipId");
  });

  it("names the author, so the student knows who advised them", async () => {
    const { service } = createService({ feedback: [feedbackRow(1)] });
    const result = await service.listMyFeedback(identity, {
      academyId,
      limit: 50,
    });
    expect(result.feedback[0]!.teacherName).toBe("Kim");
  });

  it("reports a null name when the author's membership is gone", async () => {
    const orphan = { ...feedbackRow(1), teacherMembership: null };
    const { service } = createService({ feedback: [orphan] });
    const result = await service.listMyFeedback(identity, {
      academyId,
      limit: 50,
    });
    // The advice outlives the row behind its author; the name does not.
    expect(result.feedback[0]!.teacherName).toBeNull();
  });

  it("refuses a caller who is not an active student of the academy", async () => {
    const { service } = createService({
      studentSelfError: new AppException("MONITORING_ACCESS_DENIED", 403),
    });
    await expect(
      service.listMyFeedback(identity, { academyId, limit: 50 }),
    ).rejects.toMatchObject({ code: "MONITORING_ACCESS_DENIED" });
  });

  it("refuses while the academy is outside the rollout", async () => {
    const { service } = createService({ featureEnabled: false });
    await expect(
      service.listMyFeedback(identity, { academyId, limit: 50 }),
    ).rejects.toMatchObject({ code: "MONITORING_DISABLED" });
  });
});

describe("markMyFeedbackRead", () => {
  it("stamps only the caller's own unread rows for that exercise", async () => {
    const { service, prisma } = createService({ readCount: 2 });
    const result = await service.markMyFeedbackRead(identity, {
      academyId,
      materialId,
    });

    expect(prisma.teacherFeedback.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          academyId,
          studentMembershipRef: studentMembershipId,
          materialId,
          readAt: null,
        }),
      }),
    );
    expect(result.readCount).toBe(2);
  });

  it("is idempotent: a second call stamps nothing", async () => {
    const { service } = createService({ readCount: 0 });
    const result = await service.markMyFeedbackRead(identity, {
      academyId,
      materialId,
    });
    expect(result.readCount).toBe(0);
  });

  it("announces the read to a watching teacher", async () => {
    const { service, broadcaster } = createService({ readCount: 1 });
    await service.markMyFeedbackRead(identity, { academyId, materialId });
    expect(broadcaster.feedbackRead).toHaveBeenCalledWith({
      academyId,
      studentUserId,
      materialId,
      readCount: 1,
    });
  });

  /**
   * The panel must open whether or not anybody is listening. A receipt that
   * could fail the student's own read would make the socket a dependency of
   * an HTTP write that has already committed.
   */
  it("succeeds when the broadcast fails", async () => {
    const { service, broadcaster } = createService({ readCount: 1 });
    broadcaster.feedbackRead.mockRejectedValue(new Error("no server"));
    await expect(
      service.markMyFeedbackRead(identity, { academyId, materialId }),
    ).resolves.toEqual({ readCount: 1 });
  });

  it("refuses a caller who is not an active student of the academy", async () => {
    const { service } = createService({
      studentSelfError: new AppException("MONITORING_ACCESS_DENIED", 403),
    });
    await expect(
      service.markMyFeedbackRead(identity, { academyId, materialId }),
    ).rejects.toMatchObject({ code: "MONITORING_ACCESS_DENIED" });
  });
});

describe("getStudentCurriculum", () => {
  const input = { academyId, classId, membershipId: studentMembershipId, materialId };

  it("returns the monitored student's own progress for that course", async () => {
    const { service, curriculum } = createService();

    const context = await service.getStudentCurriculum(identity, input);

    expect(context.course.progress).toEqual({ total: 2, started: 1, solved: 1 });
    expect(context.course.modules[0]?.lectures[0]?.exercises).toEqual([
      expect.objectContaining({ materialId, status: "SOLVED", bestScore: 100 }),
      expect.objectContaining({
        materialId: otherMaterialId,
        status: "NOT_STARTED",
        // Never 0 for untouched work: an unearned score is absent, not failing.
        bestScore: null,
      }),
    ]);
    // The subject is the student the claim resolved, never an id from input.
    expect(curriculum.outlineForCourse).toHaveBeenCalledWith(
      courseId,
      academyId,
      studentUserId,
    );
  });

  it("positions the path at the requested exercise", async () => {
    const { service } = createService();
    const context = await service.getStudentCurriculum(identity, input);
    expect(context.path.exercise).toEqual({
      materialId,
      title: "Sum two numbers",
    });
  });

  it("refuses a material this class is not taught", async () => {
    const { service } = createService({
      materialError: new AppException("MONITORING_STUDENT_UNAVAILABLE", 404),
    });
    await expect(
      service.getStudentCurriculum(identity, input),
    ).rejects.toMatchObject({ code: "MONITORING_STUDENT_UNAVAILABLE" });
  });

  it("refuses a teacher who is not assigned to the class", async () => {
    const { service } = createService({
      teacherError: new AppException("PERMISSION_DENIED", 403),
    });
    await expect(
      service.getStudentCurriculum(identity, input),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  /** A hidden course and one outside the claim answer the same way. */
  it("reports the same unavailable shape when the course cannot be read", async () => {
    const { service } = createService({ outline: null });
    await expect(
      service.getStudentCurriculum(identity, input),
    ).rejects.toMatchObject({ code: "MONITORING_STUDENT_UNAVAILABLE" });
  });
});

describe("getExercisePreview", () => {
  const input = { academyId, classId, membershipId: studentMembershipId, materialId };

  it("returns the public statement, samples, and hints", async () => {
    const { service } = createService();

    const preview = await service.getExercisePreview(identity, input);

    expect(preview.exercise.starterCode).toBe("print()");
    expect(preview.exercise.sampleTestCases).toEqual([
      { position: 1, input: "1 2", expectedOutput: "3" },
    ]);
    expect(preview.exercise.hints).toEqual([
      { position: 1, content: "Use input()." },
    ]);
    expect(preview.breadcrumb.course.title).toBe("Python Basics");
  });

  /**
   * The structural guarantee, asserted rather than assumed: a preview carries
   * no hidden expectation and nothing that could address a live document.
   */
  it("carries no hidden cases, no draft id, and no student work", async () => {
    const { service, prisma } = createService();

    const preview = await service.getExercisePreview(identity, input);

    expect(preview.exercise.hiddenTestCaseCount).toBe(1);
    expect(JSON.stringify(preview)).not.toContain("999 1");
    expect(preview).not.toHaveProperty("draftId");
    expect(prisma.exerciseDraft.findUnique).not.toHaveBeenCalled();
  });

  it("refuses an exercise outside the class's assigned courses", async () => {
    const { service } = createService({
      materialError: new AppException("MONITORING_STUDENT_UNAVAILABLE", 404),
    });
    await expect(
      service.getExercisePreview(identity, input),
    ).rejects.toMatchObject({ code: "MONITORING_STUDENT_UNAVAILABLE" });
  });

  it("refuses a hidden material without disclosing that it exists", async () => {
    const { service } = createService({ material: null });
    await expect(
      service.getExercisePreview(identity, input),
    ).rejects.toMatchObject({ code: "MONITORING_STUDENT_UNAVAILABLE" });
  });
});
