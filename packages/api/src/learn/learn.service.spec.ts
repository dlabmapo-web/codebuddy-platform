import { describe, expect, it, vi } from "vitest";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import type { AcademyAccessService } from "../authorization/academy-access.service.js";
import type { PrismaService } from "../database/prisma.service.js";
import { LearnService } from "./learn.service.js";

const identity: SupabaseIdentity = {
  authUserId: "10000000-0000-4000-8000-000000000001",
  email: "student@example.com",
  emailVerified: true,
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
  } as unknown as PrismaService;
  const access = {
    requirePermission: vi.fn().mockResolvedValue({ userId, academyId }),
  } as unknown as AcademyAccessService;
  return { prisma, access, service: new LearnService(prisma, access) };
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
      expect.objectContaining({ where: { academyId, isVisible: true } }),
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

    await service.getExerciseWorkspace(identity, { academyId, materialId });

    expect(prisma.material.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: materialId,
          isVisible: true,
          lecture: expect.objectContaining({
            isVisible: true,
            courseModule: expect.objectContaining({
              isVisible: true,
              course: { academyId, isVisible: true },
            }),
          }),
        }),
      }),
    );
  });

  it("returns sample cases but only counts hidden grading cases", async () => {
    const { service } = createService();

    const result = await service.getExerciseWorkspace(identity, {
      academyId,
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
