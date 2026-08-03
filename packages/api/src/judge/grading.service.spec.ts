import { describe, expect, it, vi } from "vitest";

import type { PrismaService } from "../database/prisma.service.js";
import type { ExecutionEngine } from "./execution-engine.js";
import { GradingService } from "./grading.service.js";

const submissionId = "50000000-0000-4000-8000-000000000001";

function createService(options?: { claimed?: number }) {
  const submission = {
    id: submissionId,
    userId: "10000000-0000-4000-8000-000000000001",
    materialId: "20000000-0000-4000-8000-000000000001",
    code: "print(input())",
    material: {
      programmingExercise: {
        timeLimitMs: 1_000,
        memoryLimitMb: 256,
        testCases: [
          {
            position: 1,
            visibility: "SAMPLE",
            input: "one",
            expectedOutput: "wrong",
          },
          {
            position: 2,
            visibility: "HIDDEN",
            input: "secret",
            expectedOutput: "secret",
          },
        ],
      },
    },
  };
  const tx = {
    submission: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    submissionCase: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
    studentExerciseProgress: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    submission: {
      updateMany: vi.fn().mockResolvedValue({ count: options?.claimed ?? 1 }),
      findUnique: vi.fn().mockResolvedValue(submission),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn(async (input: unknown) => {
      if (typeof input === "function") return input(tx);
      return [{}, { count: 0 }];
    }),
  } as unknown as PrismaService;
  const engine = {
    version: "test",
    run: vi.fn().mockResolvedValue({
      stdout: "one",
      stderr: "",
      outcome: "PASSED",
      runtimeMs: 10,
    }),
    dispose: vi.fn(),
  } as unknown as ExecutionEngine;
  return {
    prisma,
    tx,
    engine,
    service: new GradingService(prisma, engine),
  };
}

describe("GradingService.grade", () => {
  it("records every remaining case as SKIPPED after the first failure", async () => {
    const { service, tx, engine } = createService();
    const report = vi.fn().mockResolvedValue(undefined);

    await service.grade(submissionId, report);

    expect(engine.run).toHaveBeenCalledTimes(1);
    expect(tx.submissionCase.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          position: 1,
          isSample: true,
          outcome: "WRONG_OUTPUT",
          actualOutput: "one",
        }),
        expect.objectContaining({
          position: 2,
          isSample: false,
          outcome: "SKIPPED",
          actualOutput: null,
        }),
      ],
    });
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ position: 1, isSample: true }),
    );
    expect(tx.submission.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ passedCount: 0, score: 0 }),
      }),
    );
    expect(tx.studentExerciseProgress.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ bestScore: 0 }),
        update: expect.objectContaining({ bestScore: 0 }),
      }),
    );
  });

  it("does nothing on duplicate delivery after the conditional claim loses", async () => {
    const { service, prisma, engine } = createService({ claimed: 0 });

    await service.grade(submissionId, vi.fn());

    expect(prisma.submission.findUnique).not.toHaveBeenCalled();
    expect(engine.run).not.toHaveBeenCalled();
  });
});
