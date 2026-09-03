import { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import type { AcademyAccessService } from "../authorization/academy-access.service.js";
import type { ApiEnvironment } from "../config/env.schema.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { JudgeQueue } from "../judge/judge.queue.js";
import type { LearningClassContextService } from "./learning-class-context.service.js";
import { SubmissionService } from "./submission.service.js";

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
const materialId = "40000000-0000-4000-8000-000000000001";
const submissionId = "50000000-0000-4000-8000-000000000001";
const solveSessionId = "70000000-0000-4000-8000-000000000001";
const classId = "80000000-0000-4000-8000-000000000001";
const SECRET = "HIDDEN_EXPECTATION_SENTINEL";

function createService(options?: {
  allowed?: boolean;
  material?: unknown;
  createError?: unknown;
  solveSession?: { id: string; startedAt: Date } | null;
  now?: string;
}) {
  const material = (options?.material ?? {
    id: materialId,
    title: "Sum two numbers",
    position: 3,
    programmingExercise: {
      gradingRevision: 3,
      language: "PYTHON",
      timeLimitMs: 1_000,
      memoryLimitMb: 256,
      testCases: [
        { position: 1, visibility: "SAMPLE", input: "1", expectedOutput: "1" },
        {
          position: 2,
          visibility: "HIDDEN",
          input: `${SECRET}_INPUT`,
          expectedOutput: `${SECRET}_OUTPUT`,
        },
      ],
    },
    lecture: {
      title: "Addition",
      position: 2,
      courseModule: {
        courseId: "60000000-0000-4000-8000-000000000001",
        title: "Basics",
        position: 1,
        course: { title: "Python Foundations" },
      },
    },
  }) as never;
  const submission = {
    id: submissionId,
    materialId,
    sourceMaterialId: materialId,
    code: "print(1)",
    gradingRevision: 3,
    status: "FAILED",
    passedCount: 1,
    totalCount: 2,
    score: 50,
    runtimeMs: 12,
    failureReason: null,
    createdAt: new Date("2026-07-31T00:00:00Z"),
    gradedAt: new Date("2026-07-31T00:00:01Z"),
    cases: [
      {
        position: 1,
        isSample: true,
        outcome: "PASSED",
        runtimeMs: 10,
        actualOutput: "1",
      },
      {
        position: 2,
        isSample: false,
        outcome: "WRONG_OUTPUT",
        runtimeMs: 12,
        actualOutput: null,
      },
    ],
    gradingCases: [
      { position: 1, isSample: true, input: "1", expectedOutput: "1" },
      {
        position: 2,
        isSample: false,
        input: `${SECRET}_INPUT`,
        expectedOutput: `${SECRET}_OUTPUT`,
      },
    ],
  };
  const submissionCreate = options?.createError
    ? vi.fn().mockRejectedValue(options.createError)
    : vi.fn().mockResolvedValue({ id: submissionId });
  const solveSession =
    options?.solveSession === undefined
      ? { id: solveSessionId, startedAt: new Date("2026-07-31T00:00:00Z") }
      : options.solveSession;
  const transaction = {
    material: { findFirst: vi.fn().mockResolvedValue(material) },
    submission: { create: submissionCreate },
    exerciseSolveSession: {
      findFirst: vi.fn().mockResolvedValue(solveSession),
    },
  };
  const prisma = {
    material: { findFirst: vi.fn().mockResolvedValue(material) },
    submission: {
      create: submissionCreate,
      findFirst: vi.fn().mockResolvedValue(submission),
      findMany: vi.fn().mockResolvedValue([]),
    },
    studentExerciseProgress: {
      findUnique: vi.fn().mockResolvedValue({
        attemptCount: 1,
        gradingRevision: 3,
      }),
    },
    $transaction: vi.fn(
      async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
  } as unknown as PrismaService;
  const access = {
    requirePermission: vi.fn().mockResolvedValue({
      userId,
      academyId,
      role: "STUDENT",
    }),
  } as unknown as AcademyAccessService;
  const queue = {
    consumeSubmissionToken: vi.fn().mockResolvedValue(options?.allowed ?? true),
    enqueue: vi.fn().mockResolvedValue(undefined),
  } as unknown as JudgeQueue;
  const config = new ConfigService({
    SUBMISSION_RATE_LIMIT: 10,
    PYODIDE_VERSION: "0.27.5",
  }) as ConfigService<ApiEnvironment, true>;
  const classContext = {
    resolveWith: vi.fn().mockResolvedValue({
      membershipId: userId,
      classId,
      classes: [{ classId, name: "Class A" }],
    }),
  } as unknown as LearningClassContextService;
  return {
    prisma,
    access,
    queue,
    transaction,
    service: new SubmissionService(prisma, access, config, classContext, queue),
  };
}

describe("SubmissionService.submit", () => {
  it("uses the shared Redis limiter before creating the durable row", async () => {
    const { service, queue, prisma } = createService({ allowed: false });

    await expect(
      service.submit(identity, { academyId, classId, materialId, code: "print(1)" }),
    ).rejects.toMatchObject({ code: "SUBMISSION_RATE_LIMITED" });
    expect(queue.consumeSubmissionToken).toHaveBeenCalledWith(userId, 10, 60_000);
    expect(prisma.submission.create).not.toHaveBeenCalled();
  });

  it("maps the partial unique index violation to SUBMISSION_IN_FLIGHT", async () => {
    const { service } = createService({
      createError: { code: "P2002", meta: { target: "active_submission" } },
    });

    await expect(
      service.submit(identity, { academyId, classId, materialId, code: "print(1)" }),
    ).rejects.toMatchObject({ code: "SUBMISSION_IN_FLIGHT" });
  });

  it("writes before enqueue and uses the submission id as the job identity", async () => {
    const { service, prisma, queue } = createService();
    await expect(
      service.submit(identity, { academyId, classId, materialId, code: "print(1)" }),
    ).resolves.toEqual({ submissionId, totalCount: 2 });

    expect(prisma.submission.create).toHaveBeenCalled();
    expect(prisma.submission.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceMaterialId: materialId,
          gradingRevision: 3,
          language: "PYTHON",
          timeLimitMs: 1_000,
          memoryLimitMb: 256,
          gradingCases: {
            create: [
              expect.objectContaining({ position: 1, isSample: true }),
              expect.objectContaining({ position: 2, isSample: false }),
            ],
          },
        }),
      }),
    );
    expect(queue.enqueue).toHaveBeenCalledWith(submissionId);
    expect(
      vi.mocked(prisma.submission.create).mock.invocationCallOrder[0],
    ).toBeLessThan(vi.mocked(queue.enqueue).mock.invocationCallOrder[0]!);
  });

  it("checks the complete visibility chain inside the snapshot transaction", async () => {
    const { service, prisma, transaction } = createService();

    await service.submit(identity, { academyId, classId, materialId, code: "print(1)" });

    expect(transaction.material.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: materialId,
          AND: expect.arrayContaining([
            expect.objectContaining({
              isVisible: true,
              lecture: expect.objectContaining({ isVisible: true }),
            }),
          ]),
        }),
      }),
    );
    expect(prisma.material.findFirst).not.toHaveBeenCalled();
  });

  it("also requires an active class assignment before grading", async () => {
    const { service, transaction } = createService();

    await service.submit(identity, { academyId, classId, materialId, code: "print(1)" });

    expect(transaction.material.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              lecture: {
                courseModule: {
                  course: expect.objectContaining({
                    classAssignments: expect.anything(),
                  }),
                },
              },
            },
          ]),
        }),
      }),
    );
  });
});

describe("SubmissionService result disclosure and ownership", () => {
  it("returns the persisted score", async () => {
    const { service } = createService();
    const result = await service.get(identity, { academyId, submissionId });

    expect(result.score).toBe(50);
  });

  it("never returns hidden input, expectation, or actual output", async () => {
    const { service } = createService();
    const result = await service.get(identity, { academyId, submissionId });

    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(result.cases[1]).toMatchObject({
      isSample: false,
      input: null,
      expectedOutput: null,
      actualOutput: null,
    });
  });

  it("scopes fetches to the authenticated internal user", async () => {
    const { service, prisma } = createService();
    await service.get(identity, { academyId, submissionId });

    expect(prisma.submission.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: submissionId, userId }),
      }),
    );
  });
});

/**
 * Solve time is a fact about the student, so it is measured from a server
 * origin the browser cannot choose and can only be attributed to a sitting the
 * student actually owns.
 */
describe("SubmissionService solve sessions", () => {
  it("computes elapsed seconds from the session's server-side origin", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T00:01:35Z"));
    try {
      const { service, prisma } = createService();

      await service.submit(identity, {
        academyId,
        classId,
        materialId,
        code: "print(1)",
        solveSessionId,
      });

      expect(prisma.submission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            solveSessionId,
            solveElapsedSec: 95,
          }),
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("accepts only a session owned by the actor for this same problem", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T00:00:30Z"));
    try {
      const { service, transaction } = createService();

      await service.submit(identity, {
        academyId,
        classId,
        materialId,
        code: "print(1)",
        solveSessionId,
      });

      expect(transaction.exerciseSolveSession.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: solveSessionId, userId, materialId, classId },
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * Repeated submissions in one sitting share the origin, so the reported
   * solve time grows rather than restarting at zero.
   */
  it("shares one origin across repeated submissions", async () => {
    vi.useFakeTimers();
    try {
      const { service, prisma } = createService();
      vi.setSystemTime(new Date("2026-07-31T00:00:30Z"));
      await service.submit(identity, {
        academyId,
        classId,
        materialId,
        code: "print(1)",
        solveSessionId,
      });
      vi.setSystemTime(new Date("2026-07-31T00:02:00Z"));
      await service.submit(identity, {
        academyId,
        classId,
        materialId,
        code: "print(2)",
        solveSessionId,
      });

      const elapsed = vi
        .mocked(prisma.submission.create)
        .mock.calls.map((call) => (call[0] as { data: { solveElapsedSec: number } }).data.solveElapsedSec);
      expect(elapsed).toEqual([30, 120]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a session that does not belong to the actor", async () => {
    const { service } = createService({ solveSession: null });

    await expect(
      service.submit(identity, {
        academyId,
        classId,
        materialId,
        code: "print(1)",
        solveSessionId,
      }),
    ).rejects.toMatchObject({ code: "SOLVE_SESSION_INVALID" });
  });

  it("rejects a session older than the 24-hour bound", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-02T00:00:00Z"));
    try {
      const { service } = createService();

      await expect(
        service.submit(identity, {
          academyId,
          classId,
          materialId,
          code: "print(1)",
          solveSessionId,
        }),
      ).rejects.toMatchObject({ code: "SOLVE_SESSION_INVALID" });
    } finally {
      vi.useRealTimers();
    }
  });

  /** A row without a session is valid: it simply records no solve time. */
  it("records no solve time when the client names no session", async () => {
    const { service, prisma, transaction } = createService();

    await service.submit(identity, { academyId, classId, materialId, code: "print(1)" });

    expect(transaction.exerciseSolveSession.findFirst).not.toHaveBeenCalled();
    expect(prisma.submission.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          solveSessionId: null,
          solveElapsedSec: null,
        }),
      }),
    );
  });
});

describe("SubmissionService record labels", () => {
  it("freezes the printed labels in the grading snapshot transaction", async () => {
    const { service, prisma } = createService();

    await service.submit(identity, { academyId, classId, materialId, code: "print(1)" });

    expect(prisma.submission.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          problemTitle: "Sum two numbers",
          courseTitle: "Python Foundations",
          moduleTitle: "Basics",
          lectureTitle: "Addition",
          modulePosition: 1,
          lecturePosition: 2,
          problemPosition: 3,
        }),
      }),
    );
  });
});

describe("SubmissionService.findSelected", () => {
  const actor = {
    userId,
    academyId,
    scope: { course: { academyId }, material: {} },
  };

  it("returns the submitted code with its student-safe verdict", async () => {
    const { service } = createService();

    const selected = await service.findSelected(actor, {
      materialId,
      submissionId,
    });

    expect(selected?.code).toBe("print(1)");
    expect(selected?.result.score).toBe(50);
    expect(JSON.stringify(selected)).not.toContain(SECRET);
  });

  it("pins the read to the actor, the academy, and the route's problem", async () => {
    const { service, prisma } = createService();

    await service.findSelected(actor, { materialId, submissionId });

    expect(prisma.submission.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: submissionId,
          userId,
          sourceMaterialId: materialId,
          course: { academyId },
        }),
      }),
    );
  });

  /** Somebody else's id must be indistinguishable from one that never was. */
  it("answers with nothing rather than a distinguishable refusal", async () => {
    const { service, prisma } = createService();
    vi.mocked(prisma.submission.findFirst).mockResolvedValue(null);

    await expect(
      service.findSelected(actor, { materialId, submissionId }),
    ).resolves.toBeNull();
  });
});
