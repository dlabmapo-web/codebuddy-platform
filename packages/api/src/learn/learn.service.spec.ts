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
const versionId = "50000000-0000-4000-8000-000000000001";
const materialId = "60000000-0000-4000-8000-000000000001";
const now = new Date("2026-07-31T00:00:00.000Z");

/** The string that must never reach a student. */
const SECRET = "HIDDEN_EXPECTATION_SENTINEL";

function createExerciseRecord() {
  return {
    materialId,
    difficulty: "EASY" as const,
    language: "PYTHON" as const,
    description: "<p>Sum two numbers</p>",
    inputFormat: "Two integers",
    outputFormat: "One integer",
    constraints: "0 <= n <= 100",
    starterCode: "# write here",
    timeLimitMs: 3000,
    memoryLimitMb: 256,
    testCases: [
      {
        position: 1,
        input: "1 2",
        expectedOutput: "3",
        visibility: "SAMPLE" as const,
      },
      {
        position: 2,
        input: `${SECRET}_IN`,
        expectedOutput: `${SECRET}_OUT`,
        visibility: "HIDDEN" as const,
      },
      {
        position: 3,
        input: `${SECRET}_IN_2`,
        expectedOutput: `${SECRET}_OUT_2`,
        visibility: "HIDDEN" as const,
      },
    ],
    hints: [{ position: 1, content: "Use input()" }],
  };
}

function createMaterialRecord() {
  return {
    id: materialId,
    title: "Sum two numbers",
    position: 1,
    programmingExercise: createExerciseRecord(),
    lecture: {
      id: "70000000-0000-4000-8000-000000000001",
      title: "Lecture 1",
      courseModule: {
        id: "80000000-0000-4000-8000-000000000001",
        title: "Module 1",
        courseVersion: {
          id: versionId,
          versionNumber: 1,
          publishedAt: now,
          course: { id: courseId, title: "Python", description: "" },
          modules: [
            {
              id: "80000000-0000-4000-8000-000000000001",
              position: 1,
              lectures: [
                {
                  id: "70000000-0000-4000-8000-000000000001",
                  position: 1,
                  materials: [
                    {
                      id: materialId,
                      title: "Sum two numbers",
                      position: 1,
                      programmingExercise: { difficulty: "EASY" },
                    },
                    {
                      id: "60000000-0000-4000-8000-000000000002",
                      title: "Next problem",
                      position: 2,
                      programmingExercise: { difficulty: "MEDIUM" },
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    },
  };
}

function createService(overrides?: {
  material?: unknown;
  draft?: unknown;
  drafts?: unknown[];
  courses?: unknown[];
  course?: unknown;
}) {
  const prisma = {
    course: {
      findMany: vi.fn().mockResolvedValue(overrides?.courses ?? []),
      findFirst: vi.fn().mockResolvedValue(overrides?.course ?? null),
    },
    material: {
      findFirst: vi.fn().mockResolvedValue(
        overrides?.material === undefined
          ? createMaterialRecord()
          : overrides.material,
      ),
    },
    exerciseDraft: {
      findUnique: vi.fn().mockResolvedValue(overrides?.draft ?? null),
      findMany: vi.fn().mockResolvedValue(overrides?.drafts ?? []),
      upsert: vi.fn().mockResolvedValue({ updatedAt: now }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  } as unknown as PrismaService;

  const access = {
    requirePermission: vi.fn().mockResolvedValue({
      userId,
      academyId,
      role: "STUDENT",
    }),
  } as unknown as AcademyAccessService;

  return { prisma, access, service: new LearnService(prisma, access) };
}

describe("LearnService authorization", () => {
  it("requires curriculum.read on the academy for every read", async () => {
    const { service, access } = createService();
    await service.getExerciseWorkspace(identity, { academyId, materialId });

    expect(access.requirePermission).toHaveBeenCalledWith(
      identity.authUserId,
      academyId,
      "curriculum.read",
    );
  });

  it("propagates a permission failure rather than returning content", async () => {
    const { service, access } = createService();
    vi.mocked(access.requirePermission).mockRejectedValueOnce(
      new Error("PERMISSION_DENIED"),
    );

    await expect(
      service.listCourses(identity, academyId),
    ).rejects.toThrow("PERMISSION_DENIED");
  });
});

describe("LearnService.getExerciseWorkspace", () => {
  it("never returns a hidden test case", async () => {
    const { service } = createService();
    const workspace = await service.getExerciseWorkspace(identity, {
      academyId,
      materialId,
    });

    // The invariant from §7.3 of the design, asserted against the whole
    // serialised payload rather than a field list, so a future field that
    // accidentally carries hidden data fails here too.
    expect(JSON.stringify(workspace)).not.toContain(SECRET);
  });

  it("exposes hidden cases only as a count", async () => {
    const { service } = createService();
    const workspace = await service.getExerciseWorkspace(identity, {
      academyId,
      materialId,
    });

    expect(workspace.exercise.hiddenTestCaseCount).toBe(2);
    expect(workspace.exercise.sampleTestCases).toEqual([
      { position: 1, input: "1 2", expectedOutput: "3" },
    ]);
  });

  it("scopes the material query to published ancestors in this academy", async () => {
    const { service, prisma } = createService();
    await service.getExerciseWorkspace(identity, { academyId, materialId });

    const where = vi.mocked(prisma.material.findFirst).mock.calls[0]![0]!.where;
    expect(where).toMatchObject({
      id: materialId,
      isPublished: true,
      lecture: {
        isPublished: true,
        courseModule: {
          isPublished: true,
          courseVersion: {
            status: "PUBLISHED",
            course: { academyId, status: "ACTIVE" },
          },
        },
      },
    });
  });

  it("rejects a material that is not visible", async () => {
    const { service } = createService({ material: null });

    await expect(
      service.getExerciseWorkspace(identity, { academyId, materialId }),
    ).rejects.toMatchObject({ code: "EXERCISE_NOT_AVAILABLE" });
  });

  it("resolves the next exercise in outline order", async () => {
    const { service } = createService();
    const workspace = await service.getExerciseWorkspace(identity, {
      academyId,
      materialId,
    });

    expect(workspace.neighbors.previous).toBeNull();
    expect(workspace.neighbors.next?.materialId).toBe(
      "60000000-0000-4000-8000-000000000002",
    );
  });

  it("reports IN_PROGRESS and returns the draft when one exists", async () => {
    const { service } = createService({
      draft: { code: "print(1)", updatedAt: now },
    });
    const workspace = await service.getExerciseWorkspace(identity, {
      academyId,
      materialId,
    });

    expect(workspace.status).toBe("IN_PROGRESS");
    expect(workspace.draft).toEqual({
      code: "print(1)",
      updatedAt: now.toISOString(),
    });
  });

  it("reports NOT_STARTED with no draft", async () => {
    const { service } = createService();
    const workspace = await service.getExerciseWorkspace(identity, {
      academyId,
      materialId,
    });

    expect(workspace.status).toBe("NOT_STARTED");
    expect(workspace.draft).toBeNull();
  });

  it("looks the draft up by the requesting user, not by material alone", async () => {
    const { service, prisma } = createService();
    await service.getExerciseWorkspace(identity, { academyId, materialId });

    expect(prisma.exerciseDraft.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_materialId: { userId, materialId } },
      }),
    );
  });
});

describe("LearnService.getCourseOutline", () => {
  it("reports COURSE_NOT_FOUND for a course outside the academy", async () => {
    const { service } = createService({ course: null });

    await expect(
      service.getCourseOutline(identity, { academyId, courseId }),
    ).rejects.toMatchObject({ code: "COURSE_NOT_FOUND" });
  });

  it("reports COURSE_NOT_PUBLISHED when the course has only a draft", async () => {
    const { service } = createService({
      course: { id: courseId, title: "Python", description: "", versions: [] },
    });

    await expect(
      service.getCourseOutline(identity, { academyId, courseId }),
    ).rejects.toMatchObject({ code: "COURSE_NOT_PUBLISHED" });
  });
});

describe("LearnService.listCourses", () => {
  it("asks only for active courses holding a published version", async () => {
    const { service, prisma } = createService();
    await service.listCourses(identity, academyId);

    expect(vi.mocked(prisma.course.findMany).mock.calls[0]![0]!.where)
      .toMatchObject({
        academyId,
        status: "ACTIVE",
        versions: { some: { status: "PUBLISHED" } },
      });
  });

  it("returns nothing when the academy has no published course", async () => {
    const { service } = createService({ courses: [] });
    await expect(service.listCourses(identity, academyId)).resolves.toEqual({
      courses: [],
    });
  });

  it("does not query drafts when there are no exercises to check", async () => {
    const { service, prisma } = createService({ courses: [] });
    await service.listCourses(identity, academyId);

    expect(prisma.exerciseDraft.findMany).not.toHaveBeenCalled();
  });
});

describe("LearnService draft mutations", () => {
  it("upserts a draft for the requesting user", async () => {
    const { service, prisma } = createService();
    const result = await service.saveDraft(identity, {
      academyId,
      materialId,
      code: "print(1)",
    });

    expect(prisma.exerciseDraft.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_materialId: { userId, materialId } },
        update: { code: "print(1)" },
      }),
    );
    expect(result).toEqual({ updatedAt: now.toISOString() });
  });

  it("refuses to save against a material that is not visible", async () => {
    const { service } = createService({ material: null });

    await expect(
      service.saveDraft(identity, { academyId, materialId, code: "x" }),
    ).rejects.toMatchObject({ code: "EXERCISE_NOT_AVAILABLE" });
  });

  it("scopes discard by user so another student's draft is unreachable", async () => {
    const { service, prisma } = createService();
    await service.discardDraft(identity, { academyId, materialId });

    expect(prisma.exerciseDraft.deleteMany).toHaveBeenCalledWith({
      where: { userId, materialId },
    });
  });

  it("reports discarded false when nothing was deleted", async () => {
    const { service, prisma } = createService();
    vi.mocked(prisma.exerciseDraft.deleteMany).mockResolvedValueOnce({
      count: 0,
    });

    await expect(
      service.discardDraft(identity, { academyId, materialId }),
    ).resolves.toEqual({ discarded: false });
  });
});
