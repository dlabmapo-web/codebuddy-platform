import { describe, expect, it, vi } from "vitest";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import type { AcademyAccessService } from "../authorization/academy-access.service.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { AuditService } from "../academies/audit.service.js";
import { CourseService, toCourseSummary } from "./course.service.js";

const identity: SupabaseIdentity = {
  authUserId: "10000000-0000-4000-8000-000000000001",
  email: "lead@example.com",
  emailVerified: true,
  username: null,
  displayName: "Team Lead",
  avatarUrl: null,
  provider: null,
  requestedAcademyId: null,
};

const academyId = "20000000-0000-4000-8000-000000000001";
const actorUserId = "30000000-0000-4000-8000-000000000001";
const now = new Date("2026-08-03T00:00:00.000Z");

function courseRecord() {
  return {
    id: "40000000-0000-4000-8000-000000000001",
    academyId,
    title: "Python Foundations",
    description: "Learn Python",
    isVisible: false,
    createdAt: now,
    updatedAt: now,
    modules: [
      {
        id: "50000000-0000-4000-8000-000000000001",
        lectures: [
          {
            id: "60000000-0000-4000-8000-000000000001",
            _count: { materials: 2 },
          },
        ],
      },
    ],
  };
}

function createService(options?: { duplicate?: boolean }) {
  const created = courseRecord();
  const transaction = {
    course: {
      create: vi.fn().mockResolvedValue(created),
    },
  };
  const prisma = {
    course: {
      findFirst: vi.fn().mockResolvedValue(
        options?.duplicate ? { id: "duplicate-course" } : null,
      ),
      findMany: vi.fn().mockResolvedValue([created]),
    },
    $transaction: vi.fn(
      async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
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
    service: new CourseService(
      prisma,
      access,
      audit,
      { revokeClass: vi.fn().mockResolvedValue(undefined) } as never,
    ),
    transaction,
  };
}

describe("CourseService", () => {
  it("creates a hidden live course that can be edited immediately", async () => {
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
          isVisible: false,
          createdByUserId: actorUserId,
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
    expect(result).toMatchObject({ isVisible: false });
  });

  it("rejects a case-insensitive title conflict", async () => {
    const { service, transaction } = createService({ duplicate: true });

    await expect(
      service.create(identity, {
        academyId,
        title: "python foundations",
        description: "",
      }),
    ).rejects.toMatchObject({ code: "COURSE_TITLE_CONFLICT" });
    expect(transaction.course.create).not.toHaveBeenCalled();
  });

  it("scopes course lists to the requested academy", async () => {
    const { access, prisma, service } = createService();

    const result = await service.list(identity, academyId);

    expect(access.requirePermission).toHaveBeenCalledWith(
      identity.authUserId,
      academyId,
      "curriculum.review",
    );
    expect(prisma.course.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { academyId } }),
    );
    expect(result.courses[0]).toEqual(toCourseSummary(courseRecord()));
  });

  it("summarizes the one live curriculum tree", () => {
    expect(toCourseSummary(courseRecord())).toMatchObject({
      isVisible: false,
      content: { modules: 1, lectures: 1, exercises: 2 },
    });
  });
});

const courseId = "40000000-0000-4000-8000-000000000001";
const moduleId = "50000000-0000-4000-8000-000000000001";
const lectureId = "60000000-0000-4000-8000-000000000001";
const materialId = "70000000-0000-4000-8000-000000000001";

function createHierarchyService() {
  const module = {
    id: moduleId,
    courseId,
    externalKey: "MODULE-1",
    title: "Basics",
    description: "",
    position: 1,
    isVisible: false,
  };
  const lecture = {
    id: lectureId,
    courseModuleId: moduleId,
    externalKey: "LECTURE-1",
    title: "Variables",
    description: "",
    position: 1,
    isVisible: false,
  };
  const transaction = {
    courseModule: { update: vi.fn().mockResolvedValue(module) },
    lecture: { update: vi.fn().mockResolvedValue(lecture) },
    course: {
      update: vi.fn().mockResolvedValue({ contentRevision: 2 }),
    },
  };
  const prisma = {
    courseModule: { findFirst: vi.fn().mockResolvedValue(module) },
    lecture: { findFirst: vi.fn().mockResolvedValue(lecture) },
    $transaction: vi.fn(
      async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
  } as unknown as PrismaService;
  const service = new CourseService(
    prisma,
    {
      requirePermission: vi.fn().mockResolvedValue({
        userId: actorUserId,
        academyId,
        role: "TEAM_LEAD",
      }),
    } as unknown as AcademyAccessService,
    { write: vi.fn().mockResolvedValue({ id: "audit-id" }) } as unknown as AuditService,
    { revokeClass: vi.fn().mockResolvedValue(undefined) } as never,
  );
  Object.defineProperty(service, "currentTree", {
    value: vi.fn().mockResolvedValue({}),
  });
  return { service, transaction };
}

describe("CourseService hierarchy revisions", () => {
  it("bumps the course revision when a module changes", async () => {
    const { service, transaction } = createHierarchyService();

    await service.updateModule(identity, {
      academyId,
      courseId,
      moduleId,
      title: "Updated basics",
    });

    expect(transaction.course.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: courseId },
        data: { contentRevision: { increment: 1 } },
      }),
    );
  });

  it("bumps the course revision when a lecture changes", async () => {
    const { service, transaction } = createHierarchyService();

    await service.updateLecture(identity, {
      academyId,
      courseId,
      lectureId,
      title: "Updated variables",
    });

    expect(transaction.course.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: courseId },
        data: { contentRevision: { increment: 1 } },
      }),
    );
  });
});

function exerciseRecord() {
  return {
    id: materialId,
    lectureId,
    type: "PROGRAMMING_EXERCISE",
    title: "Sum two numbers",
    position: 1,
    isRequired: true,
    isVisible: true,
    createdAt: now,
    updatedAt: now,
    lecture: {
      id: lectureId,
      title: "Addition",
      courseModule: {
        id: moduleId,
        title: "Basics",
        course: { id: courseId, title: "Python Foundations" },
      },
    },
    programmingExercise: {
      materialId,
      externalKey: "sum-two",
      legacyProblemNo: null,
      difficulty: "EASY",
      description: "<p>Add the values.</p>",
      inputFormat: "Two integers",
      outputFormat: "One integer",
      constraints: "",
      starterCode: "",
      language: "PYTHON",
      timeLimitMs: 3_000,
      memoryLimitMb: 256,
      aiFeedbackEnabled: false,
      gradingRevision: 1,
      createdAt: now,
      updatedAt: now,
      testCases: [
        {
          id: "80000000-0000-4000-8000-000000000001",
          exerciseMaterialId: materialId,
          position: 1,
          input: "1 2",
          expectedOutput: "3",
          visibility: "SAMPLE",
          createdAt: now,
          updatedAt: now,
        },
      ],
      hints: [],
    },
  };
}

const exerciseInput = {
  academyId,
  courseId,
  lectureId,
  materialId,
  expectedUpdatedAt: now.toISOString(),
  title: "Sum two numbers",
  difficulty: "EASY" as const,
  description: "<p>Add the values.</p>",
  inputFormat: "Two integers",
  outputFormat: "One integer",
  constraints: "",
  starterCode: "",
  aiFeedbackEnabled: false,
  isVisible: true,
  testCases: [
    {
      input: "1 2",
      expectedOutput: "3",
      visibility: "SAMPLE" as const,
    },
  ],
  hints: [],
};

function createExerciseService() {
  const current = exerciseRecord();
  const updated = exerciseRecord();
  const transaction = {
    programmingExercise: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    material: {
      update: vi.fn().mockResolvedValue({}),
      findUniqueOrThrow: vi.fn().mockResolvedValue(updated),
    },
    exerciseTestCase: {
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    exerciseHint: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    studentExerciseProgress: {
      updateMany: vi.fn().mockResolvedValue({ count: 4 }),
    },
    // §9.2 — every content mutation bumps the course's content revision in the
    // same transaction, so an import preview taken beforehand is refused.
    course: {
      update: vi.fn().mockResolvedValue({ contentRevision: 2 }),
    },
  };
  const prisma = {
    material: { findFirst: vi.fn().mockResolvedValue(current) },
    submission: { count: vi.fn().mockResolvedValue(0) },
    $transaction: vi.fn(
      async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
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
    service: new CourseService(
      prisma,
      access,
      audit,
      { revokeClass: vi.fn().mockResolvedValue(undefined) } as never,
    ),
    prisma,
    audit,
    transaction,
  };
}

describe("CourseService direct problem editing", () => {
  it("bumps the course content revision so an open import preview goes stale", async () => {
    const { service, transaction } = createExerciseService();

    await service.updateExercise(identity, { ...exerciseInput });

    // §9.2 — `updatedAt` on the course row does not move when a test case four
    // levels down changes, which is exactly the edit an import preview must not
    // survive. The counter is bumped inside the same transaction as the write.
    expect(transaction.course.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { contentRevision: { increment: 1 } },
      }),
    );
  });

  it("increments the grading revision and resets current progress", async () => {
    const { service, transaction, audit } = createExerciseService();

    await service.updateExercise(identity, {
      ...exerciseInput,
      testCases: [
        {
          input: "2 2",
          expectedOutput: "4",
          visibility: "SAMPLE",
        },
      ],
    });

    expect(transaction.programmingExercise.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ gradingRevision: 2 }),
      }),
    );
    expect(transaction.studentExerciseProgress.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { materialId },
        data: expect.objectContaining({
          status: "NOT_STARTED",
          gradingRevision: 2,
          bestScore: 0,
          attemptCount: 0,
        }),
      }),
    );
    expect(audit.write).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        after: expect.objectContaining({
          gradingChanged: true,
          progressResetCount: 4,
        }),
      }),
    );
  });

  it("does not reset progress for presentation-only changes", async () => {
    const { service, transaction } = createExerciseService();

    await service.updateExercise(identity, {
      ...exerciseInput,
      title: "A clearer title",
      description: "<p>A clearer explanation.</p>",
    });

    expect(transaction.programmingExercise.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ gradingRevision: 2 }),
      }),
    );
    expect(transaction.studentExerciseProgress.updateMany).not.toHaveBeenCalled();
  });

  it("blocks deleting a lecture that has descendant submissions", async () => {
    const prisma = {
      lecture: {
        findFirst: vi.fn().mockResolvedValue({ id: lectureId, courseModuleId: moduleId }),
      },
      submission: { count: vi.fn().mockResolvedValue(1) },
      $transaction: vi.fn(),
    } as unknown as PrismaService;
    const access = {
      requirePermission: vi.fn().mockResolvedValue({ userId: actorUserId }),
    } as unknown as AcademyAccessService;
    const audit = { write: vi.fn() } as unknown as AuditService;
    const service = new CourseService(
      prisma,
      access,
      audit,
      { revokeClass: vi.fn().mockResolvedValue(undefined) } as never,
    );

    await expect(
      service.deleteLecture(identity, { academyId, courseId, lectureId }),
    ).rejects.toMatchObject({ code: "CONTENT_HAS_SUBMISSIONS" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
