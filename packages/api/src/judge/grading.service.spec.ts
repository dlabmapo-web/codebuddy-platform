import { describe, expect, it, vi } from "vitest";

import type { PrismaService } from "../database/prisma.service.js";
import type { ExecutionEngine } from "./execution-engine.js";
import type { PointAwardService } from "../points/point-award.service.js";
import { GradingService } from "./grading.service.js";

const submissionId = "50000000-0000-4000-8000-000000000001";

function createService(options?: { claimed?: number; currentRevision?: number }) {
  const submission = {
    id: submissionId,
    userId: "10000000-0000-4000-8000-000000000001",
    materialId: "20000000-0000-4000-8000-000000000001",
    gradingRevision: 1,
    timeLimitMs: 1_000,
    memoryLimitMb: 256,
    code: "print(input())",
    gradingCases: [
      {
        position: 1,
        isSample: true,
        input: "one",
        expectedOutput: "wrong",
      },
      {
        position: 2,
        isSample: false,
        input: "secret",
        expectedOutput: "secret",
      },
    ],
    material: {
      programmingExercise: {
        gradingRevision: options?.currentRevision ?? 1,
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
  // The award service is stubbed rather than exercised here: what this suite
  // owns is the verdict, and what it must prove about points is only that the
  // solve branch is the one that calls them.
  const points = {
    awardSolve: vi.fn().mockResolvedValue(undefined),
  } as unknown as PointAwardService;
  return {
    prisma,
    tx,
    engine,
    points,
    service: new GradingService(prisma, engine, points),
  };
}

describe("GradingService.grade", () => {
  it("runs every case after a wrong answer, so each one is reported", async () => {
    // A wrong answer on one case says nothing about the others. Stopping here
    // used to score a student for cases nobody ran — the whole reason the
    // student who fails only case 3 was recorded at 40 instead of 80.
    const { service, tx, engine } = createService();
    const report = vi.fn().mockResolvedValue(undefined);

    await service.grade(submissionId, report);

    expect(engine.run).toHaveBeenCalledTimes(2);
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
          outcome: "WRONG_OUTPUT",
          // Still null: a hidden case reports its outcome and never what the
          // code produced, whether or not grading continued past it.
          actualOutput: null,
        }),
      ],
    });
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ position: 1, isSample: true }),
    );
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ position: 2, isSample: false }),
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

  it("stops after a timeout, and skips what is left", async () => {
    // Every remaining case would burn the full time limit and fail the same
    // way, so continuing costs a judge slot and tells nobody anything.
    const { service, tx, engine } = createService();
    (engine.run as ReturnType<typeof vi.fn>).mockResolvedValue({
      stdout: "",
      stderr: "",
      outcome: "TIME_LIMIT",
      runtimeMs: 1_000,
    });

    await service.grade(submissionId, vi.fn().mockResolvedValue(undefined));

    expect(engine.run).toHaveBeenCalledTimes(1);
    expect(tx.submissionCase.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ position: 1, outcome: "TIME_LIMIT" }),
        expect.objectContaining({ position: 2, outcome: "SKIPPED" }),
      ],
    });
  });

  it("does nothing on duplicate delivery after the conditional claim loses", async () => {
    const { service, prisma, engine } = createService({ claimed: 0 });

    await service.grade(submissionId, vi.fn());

    expect(prisma.submission.findUnique).not.toHaveBeenCalled();
    expect(engine.run).not.toHaveBeenCalled();
  });

  it("completes a stale revision without overwriting current progress", async () => {
    const { service, tx } = createService({ currentRevision: 2 });

    await service.grade(submissionId, vi.fn().mockResolvedValue(undefined));

    expect(tx.submission.updateMany).toHaveBeenCalled();
    expect(tx.submissionCase.createMany).toHaveBeenCalled();
    expect(tx.studentExerciseProgress.findUnique).not.toHaveBeenCalled();
    expect(tx.studentExerciseProgress.upsert).not.toHaveBeenCalled();
  });
});
