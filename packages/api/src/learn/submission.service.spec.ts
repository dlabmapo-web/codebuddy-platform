import { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import type { AcademyAccessService } from "../authorization/academy-access.service.js";
import type { ApiEnvironment } from "../config/env.schema.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { JudgeQueue } from "../judge/judge.queue.js";
import { SubmissionService } from "./submission.service.js";

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
const materialId = "40000000-0000-4000-8000-000000000001";
const submissionId = "50000000-0000-4000-8000-000000000001";
const SECRET = "HIDDEN_EXPECTATION_SENTINEL";

function createService(options?: {
  allowed?: boolean;
  material?: unknown;
  createError?: unknown;
}) {
  const material = (options?.material ?? {
    id: materialId,
    programmingExercise: {
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
    lecture: { courseModule: { courseVersionId: "60000000-0000-4000-8000-000000000001" } },
  }) as {
    id: string;
    programmingExercise: {
      testCases: Array<{
        position: number;
        visibility: string;
        input: string;
        expectedOutput: string;
      }>;
    };
    lecture: { courseModule: { courseVersionId: string } };
  };
  const submission = {
    id: submissionId,
    materialId,
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
    material: { programmingExercise: material.programmingExercise },
  };
  const prisma = {
    material: { findFirst: vi.fn().mockResolvedValue(material) },
    submission: {
      create: options?.createError
        ? vi.fn().mockRejectedValue(options.createError)
        : vi.fn().mockResolvedValue({ id: submissionId }),
      findFirst: vi.fn().mockResolvedValue(submission),
      findMany: vi.fn().mockResolvedValue([]),
    },
    studentExerciseProgress: {
      findUnique: vi.fn().mockResolvedValue({ attemptCount: 1 }),
    },
  } as unknown as PrismaService;
  const access = {
    requirePermission: vi.fn().mockResolvedValue({ userId, academyId }),
  } as unknown as AcademyAccessService;
  const queue = {
    consumeSubmissionToken: vi.fn().mockResolvedValue(options?.allowed ?? true),
    enqueue: vi.fn().mockResolvedValue(undefined),
  } as unknown as JudgeQueue;
  const config = new ConfigService({
    SUBMISSION_RATE_LIMIT: 10,
    PYODIDE_VERSION: "0.27.5",
  }) as ConfigService<ApiEnvironment, true>;
  return {
    prisma,
    access,
    queue,
    service: new SubmissionService(prisma, access, config, queue),
  };
}

describe("SubmissionService.submit", () => {
  it("uses the shared Redis limiter before creating the durable row", async () => {
    const { service, queue, prisma } = createService({ allowed: false });

    await expect(
      service.submit(identity, { academyId, materialId, code: "print(1)" }),
    ).rejects.toMatchObject({ code: "SUBMISSION_RATE_LIMITED" });
    expect(queue.consumeSubmissionToken).toHaveBeenCalledWith(userId, 10, 60_000);
    expect(prisma.submission.create).not.toHaveBeenCalled();
  });

  it("maps the partial unique index violation to SUBMISSION_IN_FLIGHT", async () => {
    const { service } = createService({
      createError: { code: "P2002", meta: { target: "active_submission" } },
    });

    await expect(
      service.submit(identity, { academyId, materialId, code: "print(1)" }),
    ).rejects.toMatchObject({ code: "SUBMISSION_IN_FLIGHT" });
  });

  it("writes before enqueue and uses the submission id as the job identity", async () => {
    const { service, prisma, queue } = createService();
    await expect(
      service.submit(identity, { academyId, materialId, code: "print(1)" }),
    ).resolves.toEqual({ submissionId, totalCount: 2 });

    expect(prisma.submission.create).toHaveBeenCalled();
    expect(queue.enqueue).toHaveBeenCalledWith(submissionId);
    expect(
      vi.mocked(prisma.submission.create).mock.invocationCallOrder[0],
    ).toBeLessThan(vi.mocked(queue.enqueue).mock.invocationCallOrder[0]!);
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
