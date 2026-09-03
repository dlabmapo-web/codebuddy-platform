import type { AcademyRole, LearnSelectedSubmission } from "@cove/shared";
import { describe, expect, it, vi } from "vitest";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import type { AcademyAccessService } from "../authorization/academy-access.service.js";
import type { PrismaService } from "../database/prisma.service.js";
import { CurriculumOutlineService } from "./curriculum-outline.service.js";
import { LearnService } from "./learn.service.js";
import type { LearningClassContextService } from "./learning-class-context.service.js";
import type { SubmissionService } from "./submission.service.js";

const identity: SupabaseIdentity = {
  authUserId: "10000000-0000-4000-8000-000000000001",
  email: "student@example.com",
  emailIsPlaceholder: false,
  emailVerified: true,
  username: null,
  displayName: "Student",
  avatarUrl: null,
  provider: null,
  requestedAcademyId: null,
};
const academyId = "20000000-0000-4000-8000-000000000001";
const userId = "30000000-0000-4000-8000-000000000001";
const courseId = "40000000-0000-4000-8000-000000000001";
const moduleId = "50000000-0000-4000-8000-000000000001";
const lectureId = "60000000-0000-4000-8000-000000000001";
const materialId = "70000000-0000-4000-8000-000000000001";
const nextMaterialId = "70000000-0000-4000-8000-000000000002";
const submissionId = "a0000000-0000-4000-8000-000000000001";
const solveSessionId = "b0000000-0000-4000-8000-000000000001";
const classId = "c0000000-0000-4000-8000-000000000001";

function programmingExercise() {
  return {
    materialId,
    externalKey: "sum-two",
    legacyProblemNo: null,
    difficulty: "EASY",
    description: "<p>Add two numbers.</p>",
    inputFormat: "Two integers",
    outputFormat: "One integer",
    constraints: "",
    starterCode: "",
    language: "PYTHON",
    timeLimitMs: 1_000,
    memoryLimitMb: 256,
    aiFeedbackEnabled: false,
    gradingRevision: 2,
    updatedAt: new Date("2026-08-03T00:00:00Z"),
    testCases: [
      {
        id: "80000000-0000-4000-8000-000000000001",
        position: 1,
        input: "1 2",
        expectedOutput: "3",
        visibility: "SAMPLE",
      },
      {
        id: "80000000-0000-4000-8000-000000000002",
        position: 2,
        input: "secret input",
        expectedOutput: "secret output",
        visibility: "HIDDEN",
      },
    ],
    hints: [
      {
        id: "90000000-0000-4000-8000-000000000001",
        position: 1,
        content: "Use addition.",
        triggerExpression: null,
      },
    ],
  };
}

function visibleCourse() {
  return {
    id: courseId,
    academyId,
    title: "Python Foundations",
    description: "Learn Python",
    isVisible: true,
    createdByUserId: userId,
    createdAt: new Date("2026-08-03T00:00:00Z"),
    updatedAt: new Date("2026-08-03T00:00:00Z"),
    modules: [
      {
        id: moduleId,
        courseId,
        title: "Basics",
        description: "",
        position: 1,
        isVisible: true,
        createdAt: new Date("2026-08-03T00:00:00Z"),
        updatedAt: new Date("2026-08-03T00:00:00Z"),
        lectures: [
          {
            id: lectureId,
            courseModuleId: moduleId,
            title: "Addition",
            description: "",
            position: 1,
            isVisible: true,
            createdAt: new Date("2026-08-03T00:00:00Z"),
            updatedAt: new Date("2026-08-03T00:00:00Z"),
            materials: [
              {
                id: materialId,
                lectureId,
                type: "PROGRAMMING_EXERCISE",
                title: "Sum two numbers",
                position: 1,
                isRequired: true,
                isVisible: true,
                createdAt: new Date("2026-08-03T00:00:00Z"),
                updatedAt: new Date("2026-08-03T00:00:00Z"),
                programmingExercise: programmingExercise(),
              },
              {
                id: nextMaterialId,
                lectureId,
                type: "PROGRAMMING_EXERCISE",
                title: "Next problem",
                position: 2,
                isRequired: true,
                isVisible: true,
                createdAt: new Date("2026-08-03T00:00:00Z"),
                updatedAt: new Date("2026-08-03T00:00:00Z"),
                programmingExercise: {
                  ...programmingExercise(),
                  materialId: nextMaterialId,
                  externalKey: "next",
                },
              },
            ],
          },
        ],
      },
    ],
  };
}

function workspaceMaterial() {
  const course = visibleCourse();
  const courseModule = course.modules[0]!;
  const lecture = courseModule.lectures[0]!;
  return {
    ...lecture.materials[0]!,
    programmingExercise: programmingExercise(),
    lecture: {
      ...lecture,
      courseModule: { ...courseModule, course },
    },
  };
}

function createService(options?: {
  course?: ReturnType<typeof visibleCourse> | null;
  material?: ReturnType<typeof workspaceMaterial> | null;
  draft?: { code: string; updatedAt: Date } | null;
  progress?: { status: "NOT_STARTED" | "IN_PROGRESS" | "SOLVED"; gradingRevision: number } | null;
  role?: AcademyRole;
  selectedSubmission?: LearnSelectedSubmission | null;
  solveSessionStartedAt?: Date;
}) {
  const course = options?.course === undefined ? visibleCourse() : options.course;
  const material =
    options?.material === undefined ? workspaceMaterial() : options.material;
  const prisma = {
    course: {
      findMany: vi.fn().mockResolvedValue(course ? [course] : []),
      findFirst: vi.fn().mockResolvedValue(course),
    },
    material: { findFirst: vi.fn().mockResolvedValue(material) },
    exerciseDraft: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(options?.draft ?? null),
      upsert: vi.fn().mockResolvedValue({
        updatedAt: new Date("2026-08-03T01:00:00Z"),
      }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    studentExerciseProgress: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(options?.progress ?? null),
    },
    exerciseSolveSession: {
      create: vi.fn().mockResolvedValue({
        id: solveSessionId,
        startedAt: options?.solveSessionStartedAt ?? new Date("2026-08-12T09:00:00Z"),
      }),
    },
  } as unknown as PrismaService;
  const access = {
    requirePermission: vi.fn().mockResolvedValue({
      userId,
      academyId,
      role: options?.role ?? "STUDENT",
    }),
  } as unknown as AcademyAccessService;
  const curriculum = new CurriculumOutlineService(prisma);
  const submissions = {
    findSelected: vi
      .fn()
      .mockResolvedValue(options?.selectedSubmission ?? null),
  } as unknown as SubmissionService;
  const classContext = {
    resolve: vi.fn().mockResolvedValue({
      membershipId: "d0000000-0000-4000-8000-000000000001",
      classId,
      classes: [{ classId, name: "Class A" }],
    }),
  } as unknown as LearningClassContextService;
  return {
    prisma,
    access,
    submissions,
    service: new LearnService(
      prisma,
      access,
      curriculum,
      submissions,
      classContext,
    ),
  };
}

describe("LearnService visible curriculum", () => {
  it("lists only visible courses and visible descendants", async () => {
    const { service, prisma } = createService();

    const result = await service.listCourses(identity, academyId);

    expect(result.courses[0]).toMatchObject({
      courseId,
      counts: { modules: 1, lectures: 1, exercises: 2 },
    });
    expect(prisma.course.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ academyId, isVisible: true }),
      }),
    );
  });

  it("does not expose a hidden course outline", async () => {
    const { service } = createService({ course: null });

    await expect(
      service.getCourseOutline(identity, { academyId, courseId }),
    ).rejects.toMatchObject({ code: "COURSE_NOT_FOUND" });
  });

  it("requires all ancestors and the problem itself to be visible", async () => {
    const { service, prisma } = createService();

    await service.getExerciseWorkspace(identity, { academyId, classId, materialId });

    expect(prisma.material.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: materialId,
          AND: expect.arrayContaining([
            expect.objectContaining({
              isVisible: true,
              lecture: expect.objectContaining({
                isVisible: true,
                courseModule: expect.objectContaining({
                  isVisible: true,
                  course: { academyId, isVisible: true },
                }),
              }),
            }),
          ]),
        }),
      }),
    );
  });

  it("returns sample cases but only counts hidden grading cases", async () => {
    const { service } = createService();

    const result = await service.getExerciseWorkspace(identity, {
      academyId,
      classId,
      materialId,
    });

    expect(result.exercise.sampleTestCases).toEqual([
      { position: 1, input: "1 2", expectedOutput: "3" },
    ]);
    expect(result.exercise.hiddenTestCaseCount).toBe(1);
    expect(JSON.stringify(result)).not.toContain("secret input");
    expect(result.neighbors.next?.materialId).toBe(nextMaterialId);
  });

  it("ignores progress recorded for an older grading revision", async () => {
    const { service } = createService({
      progress: { status: "SOLVED", gradingRevision: 1 },
    });

    const result = await service.getExerciseWorkspace(identity, {
      academyId,
      classId,
      materialId,
    });

    expect(result.status).toBe("NOT_STARTED");
  });

  it("uses a retained draft after a grading revision reset", async () => {
    const updatedAt = new Date("2026-08-03T02:00:00Z");
    const { service } = createService({
      draft: { code: "print(3)", updatedAt },
      progress: { status: "SOLVED", gradingRevision: 1 },
    });

    const result = await service.getExerciseWorkspace(identity, {
      academyId,
      classId,
      materialId,
    });

    expect(result.status).toBe("IN_PROGRESS");
    expect(result.draft).toEqual({
      code: "print(3)",
      updatedAt: updatedAt.toISOString(),
    });
  });

  it("stores draft identity that survives future content cleanup", async () => {
    const { service, prisma } = createService();

    await service.saveDraft(identity, {
      academyId,
      materialId,
      code: "print(3)",
    });

    expect(prisma.exerciseDraft.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          userId,
          materialId,
          sourceMaterialId: materialId,
          courseId,
        }),
      }),
    );
  });
});

/**
 * Filtering the catalog alone would leave every direct URL open, so these
 * assert the class predicate reaches each entry point rather than only the
 * list a student is shown.
 */
describe("LearnService class-assigned access", () => {
  const activeAssignment = {
    classAssignments: {
      some: {
        class: expect.objectContaining({
          academyId,
          status: "ACTIVE",
          enrollments: {
            some: {
              membership: { academyId, userId, status: "ACTIVE", role: "STUDENT" },
            },
          },
        }),
      },
    },
  };

  it("limits a student's catalog to courses their active classes assign", async () => {
    const { service, prisma } = createService();

    await service.listCourses(identity, academyId);

    expect(prisma.course.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining(activeAssignment),
      }),
    );
  });

  it("gates a course outline read on the same assignment", async () => {
    const { service, prisma } = createService();

    await service.getCourseOutline(identity, { academyId, courseId });

    expect(prisma.course.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining(activeAssignment),
      }),
    );
  });

  it("reports an unassigned course as not found, revealing no title", async () => {
    const { service } = createService({ course: null });

    await expect(
      service.getCourseOutline(identity, { academyId, courseId }),
    ).rejects.toMatchObject({ code: "COURSE_NOT_FOUND" });
  });

  it("gates the workspace, draft save, and draft discard by direct URL", async () => {
    const { service, prisma } = createService();

    await service.getExerciseWorkspace(identity, { academyId, classId, materialId });
    await service.saveDraft(identity, { academyId, materialId, code: "x" });
    await service.discardDraft(identity, { academyId, materialId });

    const scoped = {
      lecture: { courseModule: { course: expect.objectContaining(activeAssignment) } },
    };
    for (const call of vi.mocked(prisma.material.findFirst).mock.calls) {
      expect(call[0]).toEqual(
        expect.objectContaining({
          where: expect.objectContaining({ AND: expect.arrayContaining([scoped]) }),
        }),
      );
    }
    expect(prisma.material.findFirst).toHaveBeenCalledTimes(3);
  });

  it("does not make staff enroll in a class to preview their own curriculum", async () => {
    const { service, prisma } = createService({ role: "TEAM_LEAD" });

    await service.listCourses(identity, academyId);

    expect(prisma.course.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { academyId, isVisible: true } }),
    );
  });
});

describe("getExerciseBootstrap", () => {
  it("returns the workspace and its whole course from one entry", async () => {
    const { service } = createService();

    const { workspace, navigator } = await service.getExerciseBootstrap(
      identity,
      { academyId, materialId },
    );

    expect(workspace.exercise.materialId).toBe(materialId);
    expect(navigator.course.id).toBe(courseId);
    expect(
      navigator.course.modules[0]?.lectures[0]?.exercises.map(
        (exercise) => exercise.materialId,
      ),
    ).toEqual([materialId, nextMaterialId]);
  });

  it("positions the path at the exercise the workspace opened", async () => {
    const { service } = createService();

    const { navigator } = await service.getExerciseBootstrap(identity, {
      academyId,
      materialId,
    });

    expect(navigator.path).toEqual({
      course: { id: courseId, title: "Python Foundations" },
      module: { id: moduleId, title: "Basics" },
      lecture: { id: lectureId, title: "Addition" },
      exercise: { materialId, title: "Sum two numbers" },
    });
  });

  /** The navigator is a student surface: it may not carry a hidden case. */
  it("carries no hidden test data into the navigator", async () => {
    const { service } = createService();

    const { navigator } = await service.getExerciseBootstrap(identity, {
      academyId,
      materialId,
    });

    expect(JSON.stringify(navigator)).not.toContain("secret");
  });

  it("refuses a material the student cannot reach", async () => {
    const { service } = createService({ material: null });

    await expect(
      service.getExerciseBootstrap(identity, { academyId, materialId }),
    ).rejects.toMatchObject({ code: "EXERCISE_NOT_AVAILABLE" });
  });
});

/**
 * Entering the workspace on a historical attempt is the ordinary authorized
 * read plus one owned submission. Nothing about it may widen what a student
 * can reach, and a submission that does not resolve may not cost them the
 * workspace they asked for.
 */
describe("getExerciseBootstrap with a selected submission", () => {
  const selected: LearnSelectedSubmission = {
    submissionId,
    code: "print(3)",
    createdAt: "2026-08-12T09:00:00.000Z",
    result: {
      submissionId,
      materialId,
      status: "FAILED",
      passedCount: 1,
      totalCount: 2,
      score: 50,
      runtimeMs: 12,
      failureReason: null,
      elapsedSec: 3,
      attemptCount: 2,
      createdAt: "2026-08-12T09:00:00.000Z",
      gradedAt: "2026-08-12T09:00:03.000Z",
      cases: [],
    },
  };

  it("returns the submitted code and its verdict beside the workspace", async () => {
    const { service, submissions } = createService({ selectedSubmission: selected });

    const bootstrap = await service.getExerciseBootstrap(identity, {
      academyId,
      materialId,
      submissionId,
    });

    expect(bootstrap.selectedSubmission?.code).toBe("print(3)");
    expect(bootstrap.selectedSubmission?.result.score).toBe(50);
    expect(submissions.findSelected).toHaveBeenCalledWith(
      expect.objectContaining({ userId, academyId }),
      { materialId, submissionId },
    );
  });

  it("does not read a submission when the route did not name one", async () => {
    const { service, submissions } = createService();

    const bootstrap = await service.getExerciseBootstrap(identity, {
      academyId,
      materialId,
    });

    expect(bootstrap.selectedSubmission).toBeNull();
    expect(submissions.findSelected).not.toHaveBeenCalled();
  });

  /**
   * Another student's id, another problem's submission, and a deleted one all
   * arrive here as `null`. The workspace still opens — with its own draft
   * untouched — rather than failing the page.
   */
  it("renders the ordinary workspace when the submission does not resolve", async () => {
    const { service } = createService({
      draft: { code: "my own draft", updatedAt: new Date("2026-08-12T08:00:00Z") },
      selectedSubmission: null,
    });

    const bootstrap = await service.getExerciseBootstrap(identity, {
      academyId,
      materialId,
      submissionId,
    });

    expect(bootstrap.selectedSubmission).toBeNull();
    expect(bootstrap.workspace.draft?.code).toBe("my own draft");
  });

  it("refuses the whole read when the problem itself is unreachable", async () => {
    const { service } = createService({ material: null });

    await expect(
      service.getExerciseBootstrap(identity, {
        academyId,
        materialId,
        submissionId,
      }),
    ).rejects.toMatchObject({ code: "EXERCISE_NOT_AVAILABLE" });
  });
});

describe("startSolveSession", () => {
  it("opens a session behind the same learning gate as the workspace", async () => {
    const { service, prisma, access } = createService();

    const session = await service.startSolveSession(identity, {
      academyId,
      classId,
      materialId,
    });

    expect(access.requirePermission).toHaveBeenCalledWith(
      identity.authUserId,
      academyId,
      "curriculum.read",
    );
    expect(prisma.material.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: materialId }),
      }),
    );
    expect(prisma.exerciseSolveSession.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { userId, materialId, classId } }),
    );
    expect(session.solveSessionId).toBe(solveSessionId);
  });

  it("refuses a problem the student cannot reach", async () => {
    const { service } = createService({ material: null });

    await expect(
      service.startSolveSession(identity, { academyId, classId, materialId }),
    ).rejects.toMatchObject({ code: "EXERCISE_NOT_AVAILABLE" });
  });

  /** The timer stops at the cap rather than counting an abandoned tab. */
  it("expires a session 24 hours after the server issued it", async () => {
    const startedAt = new Date("2026-08-12T09:00:00Z");
    const { service } = createService({ solveSessionStartedAt: startedAt });

    const session = await service.startSolveSession(identity, {
      academyId,
      classId,
      materialId,
    });

    expect(Date.parse(session.expiresAt) - Date.parse(session.startedAt)).toBe(
      24 * 60 * 60 * 1_000,
    );
  });
});
