import { describe, expect, it, vi } from "vitest";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import type { AcademyAccessService } from "../authorization/academy-access.service.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { AuditService } from "../academies/audit.service.js";
import { collectPublishIssues, CourseService } from "./course.service.js";

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
      "curriculum.read",
    );
    expect(prisma.course.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { academyId } }),
    );
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
    testCases: Array<{ expectedOutput: string }>;
  }> = {},
) {
  return {
    id: "60000000-0000-4000-8000-000000000001",
    type: "PROGRAMMING_EXERCISE" as const,
    title: "Sum two numbers",
    position: 1,
    isRequired: true,
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
      testCases: (overrides.testCases ?? [{ expectedOutput: "3" }]).map(
        (testCase, index) => ({
          id: `70000000-0000-4000-8000-00000000000${index + 1}`,
          position: index + 1,
          input: "1 2",
          expectedOutput: testCase.expectedOutput,
          visibility: "SAMPLE" as const,
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
    lectures,
  };
}

function createLecture(materials: PublishTree["modules"][number]["lectures"][number]["materials"]) {
  return {
    id: "90000000-0000-4000-8000-000000000001",
    title: "Reading input",
    description: "",
    position: 1,
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

  it("blocks a test case with a blank expected output", () => {
    const issues = collectPublishIssues(
      createTree([
        createModule([
          createLecture([
            createExerciseMaterial({ testCases: [{ expectedOutput: "  " }] }),
          ]),
        ]),
      ]),
    );

    expect(issues).toMatchObject([{ code: "TEST_CASE_OUTPUT_REQUIRED" }]);
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
