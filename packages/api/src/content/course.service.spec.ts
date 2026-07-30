import { describe, expect, it, vi } from "vitest";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import type { AcademyAccessService } from "../authorization/academy-access.service.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { AuditService } from "../academies/audit.service.js";
import {
  collectPublishIssues,
  CourseService,
  toCourseSummary,
} from "./course.service.js";

const identity: SupabaseIdentity = {
  authUserId: "10000000-0000-4000-8000-000000000001",
  email: "lead@example.com",
  emailVerified: true,
  displayName: "Team Lead",
  avatarUrl: null,
  provider: null,
  requestedAcademyId: null,
};

const academyId = "20000000-0000-4000-8000-000000000001";
const actorUserId = "30000000-0000-4000-8000-000000000001";
const now = new Date("2026-07-24T00:00:00.000Z");

function createCourseRecord() {
  return {
    id: "40000000-0000-4000-8000-000000000001",
    academyId,
    title: "Python Foundations",
    description: "Learn Python",
    status: "ACTIVE" as const,
    createdAt: now,
    updatedAt: now,
    versions: [{
      id: "50000000-0000-4000-8000-000000000001",
      versionNumber: 1,
      status: "DRAFT" as const,
      publishedAt: null,
      updatedAt: now,
    }],
  };
}

function createService(options?: { duplicate?: boolean }) {
  const created = createCourseRecord();
  const transaction = {
    course: {
      create: vi.fn().mockResolvedValue(created),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({ id: "audit-id" }),
    },
  };
  const prisma = {
    course: {
      findFirst: vi.fn().mockResolvedValue(
        options?.duplicate ? { id: "duplicate-course" } : null,
      ),
      findMany: vi.fn().mockResolvedValue([created]),
    },
    $transaction: vi.fn(async (
      callback: (tx: typeof transaction) => Promise<unknown>,
    ) => callback(transaction)),
  } as unknown as PrismaService;
  const access = {
    requirePermission: vi.fn().mockResolvedValue({
      userId: actorUserId,
      academyId,
      role: "TEAM_LEAD",
    }),
  } as unknown as AcademyAccessService;
  const audit = {
    write: vi.fn().mockResolvedValue({ id: "audit-id" }),
  } as unknown as AuditService;

  return {
    access,
    audit,
    prisma,
    service: new CourseService(prisma, access, audit),
    transaction,
  };
}

describe("CourseService", () => {
  it("creates an academy course and its first draft in one transaction", async () => {
    const { access, audit, service, transaction } = createService();

    const result = await service.create(identity, {
      academyId,
      title: "  Python Foundations ",
      description: " Learn Python ",
    });

    expect(access.requirePermission).toHaveBeenCalledWith(
      identity.authUserId,
      academyId,
      "curriculum.manage",
    );
    expect(transaction.course.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          academyId,
          title: "Python Foundations",
          description: "Learn Python",
          createdByUserId: actorUserId,
          versions: {
            create: {
              versionNumber: 1,
              createdByUserId: actorUserId,
            },
          },
        }),
      }),
    );
    expect(audit.write).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        action: "content.course.created",
        academyId,
        actorUserId,
      }),
    );
    expect(result.draftVersion).toMatchObject({
      versionNumber: 1,
      status: "DRAFT",
    });
  });

  it("rejects a case-insensitive active title conflict", async () => {
    const { service, transaction } = createService({ duplicate: true });

    await expect(service.create(identity, {
      academyId,
      title: "python foundations",
      description: "",
    })).rejects.toMatchObject({ code: "COURSE_TITLE_CONFLICT" });
    expect(transaction.course.create).not.toHaveBeenCalled();
  });

  it("scopes course lists to the requested academy", async () => {
    const { access, prisma, service } = createService();

    await service.list(identity, academyId);

    expect(access.requirePermission).toHaveBeenCalledWith(
      identity.authUserId,
      academyId,
      "curriculum.review",
    );
    expect(prisma.course.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { academyId } }),
    );
  });
});

const courseId = "40000000-0000-4000-8000-000000000001";
const versionId = "50000000-0000-4000-8000-000000000001";
const moduleId = "80000000-0000-4000-8000-000000000001";
const lectureId = "90000000-0000-4000-8000-000000000001";
const materialId = "60000000-0000-4000-8000-000000000001";

const exerciseInput = {
  academyId,
  courseId,
  versionId,
  lectureId,
  title: "Sum two numbers",
  difficulty: "EASY" as const,
  description: "<p>Add two integers.</p>",
  inputFormat: "Two integers",
  outputFormat: "Their sum",
  constraints: "",
  starterCode: "",
  aiFeedbackEnabled: false,
  isPublished: true,
  testCases: [{
    input: "1 2",
    expectedOutput: "3",
    visibility: "SAMPLE" as const,
  }],
  hints: [{ content: "Use +", triggerExpression: null }],
};

function createExerciseRecord() {
  return {
    id: materialId,
    lectureId,
    type: "PROGRAMMING_EXERCISE" as const,
    title: exerciseInput.title,
    position: 1,
    isRequired: true,
    isPublished: true,
    createdAt: now,
    updatedAt: now,
    lecture: {
      id: lectureId,
      courseModuleId: moduleId,
      title: "Input",
      description: "",
      position: 1,
      createdAt: now,
      updatedAt: now,
      courseModule: {
        id: moduleId,
        courseVersionId: versionId,
        title: "Basics",
        description: "",
        position: 1,
        createdAt: now,
        updatedAt: now,
        courseVersion: {
          id: versionId,
          courseId,
          versionNumber: 1,
          status: "DRAFT" as const,
          createdByUserId: actorUserId,
          publishedByUserId: null,
          publishedAt: null,
          createdAt: now,
          updatedAt: now,
          course: {
            id: courseId,
            academyId,
            title: "Python Foundations",
            description: "",
            status: "ACTIVE" as const,
            createdByUserId: actorUserId,
            createdAt: now,
            updatedAt: now,
          },
        },
      },
    },
    programmingExercise: {
      materialId,
      courseVersionId: versionId,
      externalKey: "manual-test",
      legacyProblemNo: null,
      difficulty: "EASY" as const,
      description: exerciseInput.description,
      inputFormat: exerciseInput.inputFormat,
      outputFormat: exerciseInput.outputFormat,
      constraints: "",
      starterCode: "",
      language: "PYTHON" as const,
      timeLimitMs: 3000,
      memoryLimitMb: 256,
      aiFeedbackEnabled: false,
      createdAt: now,
      updatedAt: now,
      testCases: [{
        id: "70000000-0000-4000-8000-000000000001",
        exerciseMaterialId: materialId,
        position: 1,
        input: "1 2",
        expectedOutput: "3",
        visibility: "SAMPLE" as const,
        createdAt: now,
        updatedAt: now,
      }],
      hints: [],
    },
  };
}

describe("CourseService exercise authoring", () => {
  it("creates the material, exercise, test cases, and hints atomically", async () => {
    const transaction = {
      material: {
        aggregate: vi.fn().mockResolvedValue({ _max: { position: 2 } }),
        create: vi.fn().mockResolvedValue({ id: materialId, position: 3 }),
      },
      auditLog: { create: vi.fn() },
    };
    const prisma = {
      courseVersion: {
        findFirst: vi.fn().mockResolvedValue({ status: "DRAFT" }),
      },
      lecture: {
        findFirst: vi.fn().mockResolvedValue({ id: lectureId }),
      },
      $transaction: vi.fn(async (
        callback: (tx: typeof transaction) => Promise<unknown>,
      ) => callback(transaction)),
    } as unknown as PrismaService;
    const access = {
      requirePermission: vi.fn().mockResolvedValue({
        userId: actorUserId,
        academyId,
        role: "TEAM_LEAD",
      }),
    } as unknown as AcademyAccessService;
    const audit = {
      write: vi.fn().mockResolvedValue({ id: "audit-id" }),
    } as unknown as AuditService;
    const service = new CourseService(prisma, access, audit);
    vi.spyOn(service, "getExercise").mockResolvedValue({} as never);

    await service.createExercise(identity, exerciseInput);

    expect(access.requirePermission).toHaveBeenCalledWith(
      identity.authUserId,
      academyId,
      "exercises.manage",
    );
    expect(transaction.material.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        lectureId,
        title: exerciseInput.title,
        position: 3,
        programmingExercise: {
          create: expect.objectContaining({
            courseVersionId: versionId,
            timeLimitMs: 3000,
            memoryLimitMb: 256,
            testCases: {
              create: [expect.objectContaining({
                position: 1,
                expectedOutput: "3",
              })],
            },
            hints: {
              create: [expect.objectContaining({
                position: 1,
                content: "Use +",
              })],
            },
          }),
        },
      }),
    });
    expect(audit.write).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        action: "content.programming_exercise.created",
        targetId: materialId,
      }),
    );
  });

  it("rejects a stale update before replacing child collections", async () => {
    const record = createExerciseRecord();
    const transaction = {
      programmingExercise: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      material: { update: vi.fn() },
      exerciseTestCase: { deleteMany: vi.fn(), createMany: vi.fn() },
      exerciseHint: { deleteMany: vi.fn(), createMany: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    const prisma = {
      courseVersion: {
        findFirst: vi.fn().mockResolvedValue({ status: "DRAFT" }),
      },
      material: { findFirst: vi.fn().mockResolvedValue(record) },
      $transaction: vi.fn(async (
        callback: (tx: typeof transaction) => Promise<unknown>,
      ) => callback(transaction)),
    } as unknown as PrismaService;
    const access = {
      requirePermission: vi.fn().mockResolvedValue({
        userId: actorUserId,
        academyId,
        role: "TEAM_LEAD",
      }),
    } as unknown as AcademyAccessService;
    const audit = {
      write: vi.fn().mockResolvedValue({ id: "audit-id" }),
    } as unknown as AuditService;
    const service = new CourseService(prisma, access, audit);

    await expect(service.updateExercise(identity, {
      ...exerciseInput,
      materialId,
      expectedUpdatedAt: now.toISOString(),
    })).rejects.toMatchObject({ code: "CONTENT_EDIT_CONFLICT" });

    expect(transaction.programmingExercise.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          timeLimitMs: 3000,
          memoryLimitMb: 256,
        }),
      }),
    );
    expect(transaction.material.update).not.toHaveBeenCalled();
    expect(transaction.exerciseTestCase.deleteMany).not.toHaveBeenCalled();
    expect(transaction.exerciseHint.deleteMany).not.toHaveBeenCalled();
  });
});

describe("restore", () => {
  function buildService(status: "ACTIVE" | "ARCHIVED") {
    const course = { ...createCourseRecord(), status };
    const transaction = {
      course: {
        update: vi.fn().mockResolvedValue({ ...course, status: "ACTIVE" }),
      },
      auditLog: { create: vi.fn() },
    };
    const prisma = {
      course: {
        findFirst: vi.fn().mockResolvedValue(course),
        findUniqueOrThrow: vi.fn().mockResolvedValue(course),
      },
      $transaction: vi.fn(async (
        callback: (tx: typeof transaction) => Promise<unknown>,
      ) => callback(transaction)),
    } as unknown as PrismaService;
    const access = {
      requirePermission: vi.fn().mockResolvedValue({
        userId: actorUserId,
        academyId,
        role: "TEAM_LEAD",
      }),
    } as unknown as AcademyAccessService;
    const audit = {
      write: vi.fn().mockResolvedValue({ id: "audit-id" }),
    } as unknown as AuditService;
    return {
      service: new CourseService(prisma, access, audit),
      transaction,
      audit,
    };
  }

  it("brings an archived course back to active", async () => {
    const { service, transaction, audit } = buildService("ARCHIVED");

    const summary = await service.restore(identity, { academyId, courseId });

    expect(transaction.course.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "ACTIVE" } }),
    );
    expect(audit.write).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({ action: "content.course.restored" }),
    );
    expect(summary.status).toBe("ACTIVE");
  });

  it("leaves an already active course untouched", async () => {
    const { service, transaction } = buildService("ACTIVE");

    await service.restore(identity, { academyId, courseId });

    expect(transaction.course.update).not.toHaveBeenCalled();
  });
});

describe("toCourseSummary content counts", () => {
  const base = {
    id: courseId,
    academyId,
    title: "Python",
    description: "",
    status: "ACTIVE" as const,
    createdAt: now,
    updatedAt: now,
  };
  const version = (
    status: "DRAFT" | "PUBLISHED",
    versionNumber: number,
    materialCounts: number[][],
  ) => ({
    id: `${versionId}${versionNumber}`.slice(-36),
    versionNumber,
    status,
    publishedAt: null,
    updatedAt: now,
    modules: materialCounts.map((lectures, index) => ({
      id: `module-${index}`,
      lectures: lectures.map((materials, lectureIndex) => ({
        id: `lecture-${index}-${lectureIndex}`,
        _count: { materials },
      })),
    })),
  });

  it("counts modules, lectures, and exercises across the tree", () => {
    const summary = toCourseSummary({
      ...base,
      versions: [version("DRAFT", 2, [[2, 1], [3]])],
    });

    expect(summary.content).toEqual({
      modules: 2,
      lectures: 3,
      exercises: 6,
    });
  });

  it("counts the draft an author would open, not the published version", () => {
    const summary = toCourseSummary({
      ...base,
      versions: [version("DRAFT", 2, [[1]]), version("PUBLISHED", 1, [[9, 9]])],
    });

    expect(summary.content).toEqual({
      modules: 1,
      lectures: 1,
      exercises: 1,
    });
  });

  it("reports zeros when no version carries a tree", () => {
    const summary = toCourseSummary({ ...base, versions: [] });

    expect(summary.content).toEqual({
      modules: 0,
      lectures: 0,
      exercises: 0,
    });
  });
});

type PublishTree = Parameters<typeof collectPublishIssues>[0];

function createTree(modules: PublishTree["modules"]): PublishTree {
  const course = createCourseRecord();
  return {
    course: {
      ...course,
      draftVersion: null,
      publishedVersion: null,
      content: { modules: 0, lectures: 0, exercises: 0 },
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    version: {
      id: course.versions[0]!.id,
      versionNumber: 1,
      status: "DRAFT",
      publishedAt: null,
      updatedAt: now.toISOString(),
    },
    modules,
  };
}

function createExerciseMaterial(
  overrides: Partial<{
    description: string;
    testCases: Array<{
      expectedOutput: string;
      visibility?: "SAMPLE" | "HIDDEN";
    }>;
  }> = {},
) {
  return {
    id: "60000000-0000-4000-8000-000000000001",
    type: "PROGRAMMING_EXERCISE" as const,
    title: "Sum two numbers",
    position: 1,
    isRequired: true,
    isPublished: true,
    programmingExercise: {
      materialId: "60000000-0000-4000-8000-000000000001",
      externalKey: "sum-two",
      legacyProblemNo: null,
      difficulty: "EASY" as const,
      description: overrides.description ?? "Add the two inputs.",
      inputFormat: "",
      outputFormat: "",
      constraints: "",
      starterCode: "",
      language: "PYTHON" as const,
      timeLimitMs: 2000,
      memoryLimitMb: 256,
      aiFeedbackEnabled: false,
      updatedAt: now.toISOString(),
      testCases: (overrides.testCases ?? [{ expectedOutput: "3" }]).map(
        (testCase, index) => ({
          id: `70000000-0000-4000-8000-00000000000${index + 1}`,
          position: index + 1,
          input: "1 2",
          expectedOutput: testCase.expectedOutput,
          visibility: testCase.visibility ?? ("SAMPLE" as const),
        }),
      ),
      hints: [],
    },
  };
}

function createModule(lectures: PublishTree["modules"][number]["lectures"]) {
  return {
    id: "80000000-0000-4000-8000-000000000001",
    title: "Basics",
    description: "",
    position: 1,
    isPublished: true,
    lectures,
  };
}

function createLecture(materials: PublishTree["modules"][number]["lectures"][number]["materials"]) {
  return {
    id: "90000000-0000-4000-8000-000000000001",
    title: "Reading input",
    description: "",
    position: 1,
    isPublished: true,
    materials,
  };
}

describe("collectPublishIssues", () => {
  it("blocks a version with no modules", () => {
    expect(collectPublishIssues(createTree([]))).toMatchObject([
      { code: "MODULE_REQUIRED", moduleId: null },
    ]);
  });

  it("blocks a module that has no lectures", () => {
    const issues = collectPublishIssues(createTree([createModule([])]));

    expect(issues).toMatchObject([
      { code: "LECTURE_REQUIRED", moduleId: "80000000-0000-4000-8000-000000000001" },
    ]);
  });

  it("blocks an exercise without test cases and reports the owning lecture", () => {
    const issues = collectPublishIssues(
      createTree([
        createModule([
          createLecture([createExerciseMaterial({ testCases: [] })]),
        ]),
      ]),
    );

    expect(issues).toMatchObject([
      {
        code: "TEST_CASE_REQUIRED",
        lectureId: "90000000-0000-4000-8000-000000000001",
        materialId: "60000000-0000-4000-8000-000000000001",
      },
    ]);
  });

  it("blocks an exercise when no test case has an expected output", () => {
    const issues = collectPublishIssues(
      createTree([
        createModule([
          createLecture([
            createExerciseMaterial({ testCases: [{ expectedOutput: "  " }] }),
          ]),
        ]),
      ]),
    );

    expect(issues).toMatchObject([{ code: "TEST_CASE_REQUIRED" }]);
  });

  it("blocks an exercise whose cases are all hidden from students", () => {
    const issues = collectPublishIssues(
      createTree([
        createModule([
          createLecture([
            createExerciseMaterial({
              testCases: [
                { expectedOutput: "3", visibility: "HIDDEN" },
                { expectedOutput: "7", visibility: "HIDDEN" },
              ],
            }),
          ]),
        ]),
      ]),
    );

    expect(issues).toMatchObject([
      {
        code: "SAMPLE_TEST_CASE_REQUIRED",
        materialId: "60000000-0000-4000-8000-000000000001",
      },
    ]);
  });

  it("treats empty rich-text markup as an empty description", () => {
    const issues = collectPublishIssues(
      createTree([
        createModule([
          createLecture([
            createExerciseMaterial({ description: "<p>&nbsp;</p>" }),
          ]),
        ]),
      ]),
    );

    expect(issues).toMatchObject([{ code: "EXERCISE_DESCRIPTION_REQUIRED" }]);
  });

  it("allows an optional blank case when another expected output is complete", () => {
    const issues = collectPublishIssues(
      createTree([
        createModule([
          createLecture([
            createExerciseMaterial({
              testCases: [{ expectedOutput: "3" }, { expectedOutput: "" }],
            }),
          ]),
        ]),
      ]),
    );

    expect(issues).toEqual([]);
  });

  it("passes a complete module, lecture, and exercise", () => {
    const issues = collectPublishIssues(
      createTree([createModule([createLecture([createExerciseMaterial()])])]),
    );

    expect(issues).toEqual([]);
  });

  it("allows publishing a lecture that carries no exercises yet", () => {
    const issues = collectPublishIssues(
      createTree([createModule([createLecture([])])]),
    );

    expect(issues).toEqual([]);
  });
});
