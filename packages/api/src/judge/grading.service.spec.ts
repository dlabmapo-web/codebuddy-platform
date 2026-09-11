import { describe, expect, it, vi } from "vitest";

import type { PrismaService } from "../database/prisma.service.js";
import type { ComparisonResult, OutputComparator } from "./comparator-pool.js";
import type { ExecutionEngine, ExecutionResult } from "./execution-engine.js";
import type { PointAwardService } from "../points/point-award.service.js";
import { GradingService } from "./grading.service.js";

const submissionId = "50000000-0000-4000-8000-000000000001";

const legacyCase = {
  comparator: "STDOUT",
  weight: 1,
  timeLimitMsOverride: null,
  softTimeLimitMs: null,
  softPenalty: null,
  label: null,
  effectiveTimeLimitMs: null,
};

const legacyProfile = {
  gradingMode: "LEGACY_STDIO",
  gradingSemanticVersion: "legacy-v1",
  totalTimeLimitMs: null,
  comparatorTimeLimitMs: null,
  continuationPolicy: "LEGACY_STOP_ON_RESOURCE",
  exitStatusPolicy: "FAIL_ON_RUNTIME_ERROR",
  materialMaximumHundredths: null,
  materialScorePolicy: null,
  gradingPolicySnapshot: null,
  regradeRunId: null,
  classId: null,
};

const eliceProfile = {
  ...legacyProfile,
  gradingMode: "ELICE_STDIO",
  gradingSemanticVersion: "elice-v1",
  totalTimeLimitMs: 60_000,
  comparatorTimeLimitMs: 100,
  continuationPolicy: "CONTINUE_WITHIN_BUDGET",
  materialMaximumHundredths: 10_000,
  materialScorePolicy: "PROPORTIONAL",
  gradingPolicySnapshot: {
    version: 1,
    semanticVersion: "elice-v1",
    runtime: { engine: "pyodide", engineVersion: "0.27.5" },
    comparator: { runtime: "pyodide-cpython", engineVersion: "0.27.5", budgetMs: 100 },
    ceilings: {
      totalTimeLimitMs: 60_000,
      caseTimeLimitMs: 1_000,
      memoryLimitMb: 256,
      outputBytes: 262_144,
    },
  },
};

/** The E2 calculator shape from the research spec: three cases, 30/30/40. */
function weightedCases(overrides: Array<Record<string, unknown>> = []) {
  return [30, 30, 40].map((weight, index) => ({
    position: index + 1,
    isSample: index === 0,
    input: `case-${index + 1}`,
    expectedOutput: `answer-${index + 1}`,
    ...legacyCase,
    weight,
    effectiveTimeLimitMs: 1_000,
    ...(overrides[index] ?? {}),
  }));
}

function createService(options?: {
  claimed?: number;
  currentRevision?: number;
  profile?: Record<string, unknown>;
  cases?: Array<Record<string, unknown>>;
  run?: (stdin: string, timeLimitMs: number) => Promise<ExecutionResult>;
  compare?: (request: { actual: string; expected: string }) => ComparisonResult;
  engineVersion?: string;
  comparatorVersion?: string | null;
}) {
  const submission = {
    id: submissionId,
    userId: "10000000-0000-4000-8000-000000000001",
    materialId: "20000000-0000-4000-8000-000000000001",
    courseId: "30000000-0000-4000-8000-000000000001",
    gradingRevision: 1,
    timeLimitMs: 1_000,
    memoryLimitMb: 256,
    code: "print(input())",
    ...legacyProfile,
    ...(options?.profile ?? {}),
    gradingCases: options?.cases ?? [
      {
        position: 1,
        isSample: true,
        input: "one",
        expectedOutput: "wrong",
        ...legacyCase,
      },
      {
        position: 2,
        isSample: false,
        input: "secret",
        expectedOutput: "secret",
        ...legacyCase,
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
    version: options?.engineVersion ?? "pyodide-0.27.5",
    run: options?.run
      ? vi.fn((request: { stdin: string; timeLimitMs: number }) =>
          options.run!(request.stdin, request.timeLimitMs),
        )
      : vi.fn().mockResolvedValue({
          stdout: "one",
          stderr: "",
          outcome: "PASSED",
          runtimeMs: 10,
        }),
    dispose: vi.fn(),
  } as unknown as ExecutionEngine;
  const comparator = {
    version:
      options?.comparatorVersion === undefined ? "pyodide-0.27.5" : options.comparatorVersion,
    compare: vi.fn(async (request: { actual: string; expected: string }) =>
      options?.compare
        ? options.compare(request)
        : request.actual.trimEnd() === request.expected
          ? { kind: "match" as const }
          : { kind: "no-match" as const },
    ),
  } satisfies OutputComparator;
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
    comparator,
    points,
    service: new GradingService(prisma, engine, points, comparator),
  };
}

/** A program that prints the right answer for the cases in `correct`. */
function answers(correct: number[], runtimeMs = 10) {
  return async (stdin: string): Promise<ExecutionResult> => {
    const index = Number(stdin.split("-")[1]);
    return {
      stdout: correct.includes(index) ? `answer-${index}\n` : "nope",
      stderr: "",
      outcome: "PASSED",
      runtimeMs,
    };
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

  it("marks a skipped case as never executed", async () => {
    // A skip must not read as an executed wrong answer to anything that
    // trusts the execution state.
    const { service, tx, engine } = createService();
    (engine.run as ReturnType<typeof vi.fn>).mockResolvedValue({
      stdout: "",
      stderr: "",
      outcome: "TIME_LIMIT",
      runtimeMs: 1_000,
    });

    await service.grade(submissionId, vi.fn().mockResolvedValue(undefined));

    expect(tx.submissionCase.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ outcome: "TIME_LIMIT", executionState: "EXECUTED" }),
        expect.objectContaining({ outcome: "SKIPPED", executionState: "NOT_RUN" }),
      ],
    });
  });
});

describe("GradingService.grade — weighted profiles", () => {
  const grade = async (correct: number[]) => {
    const created = createService({
      profile: eliceProfile,
      cases: weightedCases(),
      run: answers(correct),
    });
    await created.service.grade(submissionId, vi.fn().mockResolvedValue(undefined));
    return created;
  };

  it.each([
    [[3], 40, 40, "FAILED"],
    [[1, 2], 60, 60, "FAILED"],
    [[1, 2, 3], 100, 100, "PASSED"],
  ])(
    "30/30/40: passing %j scores %i, not the equal-case figure",
    async (correct, score, earned, status) => {
      // The research spec's E2 fixture. Equal weighting would record 33 and
      // 67 for the first two; weighted grading is what makes them 40 and 60.
      const { tx } = await grade(correct);

      expect(tx.submission.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status,
            score,
            earnedWeight: earned,
            possibleWeight: 100,
            appliedScoreHundredths: earned * 100,
          }),
        }),
      );
      expect(tx.studentExerciseProgress.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ bestScore: score }),
        }),
      );
    },
  );

  it("records what every case earned", async () => {
    const { tx } = await grade([2, 3]);

    expect(tx.submissionCase.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ position: 1, outcome: "WRONG_OUTPUT", awardedWeight: 0 }),
        expect.objectContaining({ position: 2, outcome: "PASSED", awardedWeight: 30 }),
        expect.objectContaining({ position: 3, outcome: "PASSED", awardedWeight: 40 }),
      ],
    });
  });

  it("judges each case with its own comparator and the profile's budget", async () => {
    const { comparator } = await (async () => {
      const created = createService({
        profile: eliceProfile,
        cases: weightedCases([{ comparator: "STDOUT_REGEX" }, {}, { comparator: "STDOUT_NOMATCH" }]),
        run: answers([1, 2, 3]),
      });
      await created.service.grade(submissionId, vi.fn().mockResolvedValue(undefined));
      return created;
    })();

    expect(comparator.compare.mock.calls.map(([request]) => request)).toEqual([
      expect.objectContaining({ comparator: "STDOUT_REGEX", budgetMs: 100 }),
      expect.objectContaining({ comparator: "STDOUT", budgetMs: 100 }),
      expect.objectContaining({ comparator: "STDOUT_NOMATCH", budgetMs: 100 }),
    ]);
  });

  it("continues past a timeout, which legacy grading would stop at", async () => {
    const { service, tx, engine } = createService({
      profile: eliceProfile,
      cases: weightedCases(),
      run: async (stdin) =>
        stdin === "case-1"
          ? { stdout: "", stderr: "", outcome: "TIME_LIMIT", runtimeMs: 1_000 }
          : answers([2, 3])(stdin),
    });

    await service.grade(submissionId, vi.fn().mockResolvedValue(undefined));

    expect(engine.run).toHaveBeenCalledTimes(3);
    expect(tx.submission.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED", score: 70, earnedWeight: 70 }),
      }),
    );
  });

  it("applies each case's own time limit", async () => {
    const { service, engine } = createService({
      profile: eliceProfile,
      cases: weightedCases([{ effectiveTimeLimitMs: 2_500 }]),
      run: answers([1, 2, 3]),
    });

    await service.grade(submissionId, vi.fn().mockResolvedValue(undefined));

    expect((engine.run as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toEqual(
      expect.objectContaining({ timeLimitMs: 2_500 }),
    );
  });

  it("pays a slow correct answer its weight less the penalty, and still passes it", async () => {
    const { service, tx } = createService({
      profile: eliceProfile,
      cases: weightedCases([{}, {}, { softTimeLimitMs: 50, softPenalty: 10 }]),
      run: async (stdin) => answers([1, 2, 3], stdin === "case-3" ? 51 : 50)(stdin),
    });

    await service.grade(submissionId, vi.fn().mockResolvedValue(undefined));

    expect(tx.submissionCase.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ outcome: "PASSED", awardedWeight: 30 }),
        expect.objectContaining({ outcome: "PASSED", awardedWeight: 30 }),
        expect.objectContaining({ outcome: "PASSED_WITH_WARNING", awardedWeight: 30 }),
      ],
    });
    // Fully correct, so the run passes; the points are where it shows.
    expect(tx.submission.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PASSED", score: 90, earnedWeight: 90 }),
      }),
    );
  });

  it("does not penalize a run that lands exactly on the soft threshold", async () => {
    const { service, tx } = createService({
      profile: eliceProfile,
      cases: weightedCases([{}, {}, { softTimeLimitMs: 50, softPenalty: 10 }]),
      run: answers([1, 2, 3], 50),
    });

    await service.grade(submissionId, vi.fn().mockResolvedValue(undefined));

    expect(tx.submission.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ score: 100 }) }),
    );
  });

  it.each([
    [{ kind: "invalid-pattern", detail: "unterminated" }, "COMPARATOR_INVALID_PATTERN"],
    [{ kind: "timeout" }, "COMPARATOR_TIMEOUT"],
    [{ kind: "error", detail: "gone" }, "COMPARATOR_FAILURE"],
  ] as const)(
    "reports %j as a judge fault, never a wrong answer",
    async (result, reason) => {
      const { service, tx, prisma } = createService({
        profile: eliceProfile,
        cases: weightedCases(),
        run: answers([1, 2, 3]),
        compare: () => result,
      });

      await service.grade(submissionId, vi.fn().mockResolvedValue(undefined));

      expect(tx.submission.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "ERRORED",
            failureReason: reason,
            gradingAborted: true,
            gradingAbortReason: "INFRASTRUCTURE_FAILURE",
          }),
        }),
      );
      // An aborted run is not a grade: no progress, no attempt, no points.
      expect(tx.studentExerciseProgress.upsert).not.toHaveBeenCalled();
      expect(tx.submissionCase.createMany).toHaveBeenCalledWith({
        data: [1, 2, 3].map((position) =>
          expect.objectContaining({
            position,
            outcome: "SKIPPED",
            executionState: "NOT_RUN",
          }),
        ),
      });
      void prisma;
    },
  );

  it("aborts at the total deadline and marks what never ran", async () => {
    const { service, tx, engine } = createService({
      profile: { ...eliceProfile, totalTimeLimitMs: 1_000 },
      cases: weightedCases(),
      run: async (stdin, timeLimitMs) => {
        if (stdin === "case-1") {
          await new Promise((resolve) => setTimeout(resolve, 600));
          return answers([1])(stdin);
        }
        // Case 2 is given only what is left of the run, and uses all of it.
        await new Promise((resolve) => setTimeout(resolve, timeLimitMs));
        return { stdout: "", stderr: "", outcome: "TIME_LIMIT", runtimeMs: timeLimitMs };
      },
    });

    await service.grade(submissionId, vi.fn().mockResolvedValue(undefined));

    expect((engine.run as ReturnType<typeof vi.fn>).mock.calls[1]![0].timeLimitMs)
      .toBeLessThan(1_000);
    expect(tx.submission.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "ERRORED",
          failureReason: "TOTAL_DEADLINE",
          gradingAborted: true,
          gradingAbortReason: "TOTAL_DEADLINE",
          earnedWeight: 30,
          possibleWeight: 100,
        }),
      }),
    );
    expect(tx.submissionCase.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ position: 1, outcome: "PASSED", executionState: "EXECUTED" }),
        expect.objectContaining({ position: 2, executionState: "NOT_RUN" }),
        expect.objectContaining({ position: 3, executionState: "NOT_RUN" }),
      ],
    });
    expect(tx.studentExerciseProgress.upsert).not.toHaveBeenCalled();
  });

  it("aborts on an engine fault rather than blaming the student", async () => {
    const { service, tx } = createService({
      profile: eliceProfile,
      cases: weightedCases(),
      run: async () => {
        throw new Error("sandbox did not answer in time");
      },
    });

    await service.grade(submissionId, vi.fn().mockResolvedValue(undefined));

    expect(tx.submission.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "ERRORED",
          failureReason: "ENGINE_FAILURE",
          gradingAbortReason: "INFRASTRUCTURE_FAILURE",
        }),
      }),
    );
  });

  it.each([
    ["an unknown semantic version", { ...eliceProfile, gradingSemanticVersion: "elice-v9" }, undefined],
    ["a missing policy snapshot", { ...eliceProfile, gradingPolicySnapshot: null }, undefined],
    ["a weighted profile worth nothing", eliceProfile, weightedCases([{ weight: 0 }, { weight: 0 }, { weight: 0 }])],
    ["a legacy snapshot carrying a weight", legacyProfile, weightedCases()],
  ])("refuses %s instead of guessing", async (_name, profile, cases) => {
    const { service, prisma, engine } = createService({
      profile,
      cases: cases ?? weightedCases(),
      run: answers([1, 2, 3]),
    });

    await service.grade(submissionId, vi.fn().mockResolvedValue(undefined));

    expect(engine.run).not.toHaveBeenCalled();
    expect(prisma.submission.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "ERRORED",
          failureReason: "UNSUPPORTED_GRADING_PROFILE",
        }),
      }),
    );
  });

});

describe("GradingService.grade — the total deadline covers every wait", () => {
  const aborted = expect.objectContaining({
    data: expect.objectContaining({
      status: "ERRORED",
      failureReason: "TOTAL_DEADLINE",
      gradingAborted: true,
      gradingAbortReason: "TOTAL_DEADLINE",
    }),
  });

  it("hands the comparator the run's deadline, not just a budget", async () => {
    const before = Date.now();
    const { service, comparator } = createService({
      profile: eliceProfile,
      cases: weightedCases(),
      run: answers([1, 2, 3]),
    });

    await service.grade(submissionId, vi.fn().mockResolvedValue(undefined));

    const request = comparator.compare.mock.calls[0]![0] as unknown as { deadlineAt: number };
    // Claimed just after `before`, and the budget is the profile's 60 s.
    expect(request.deadlineAt).toBeGreaterThanOrEqual(before + 60_000);
    expect(request.deadlineAt).toBeLessThanOrEqual(Date.now() + 60_000);
  });

  it("aborts when the deadline passes while a comparison is queued", async () => {
    // The finding: time spent waiting for a comparator was not the run's, so
    // the last case could be judged — and the grade finalized — after the
    // submission's deadline.
    const { service, tx } = createService({
      profile: eliceProfile,
      cases: weightedCases(),
      run: answers([1, 2, 3]),
      compare: () => ({ kind: "deadline" }),
    });

    await service.grade(submissionId, vi.fn().mockResolvedValue(undefined));

    expect(tx.submission.updateMany).toHaveBeenCalledWith(aborted);
    expect(tx.studentExerciseProgress.upsert).not.toHaveBeenCalled();
  });

  it("does not accept a case that comes back after the deadline", async () => {
    // A run is capped at what is left, but waiting for a runner is not, so a
    // result can arrive late. It is not a grade.
    const { service, tx } = createService({
      // The shortest total a profile may have. Each case "waits for a runner"
      // 550 ms, so the second comes back past the deadline.
      profile: { ...eliceProfile, totalTimeLimitMs: 1_000 },
      cases: weightedCases(),
      run: async (stdin) => {
        await new Promise((resolve) => setTimeout(resolve, 550));
        return answers([1, 2, 3])(stdin);
      },
    });

    await service.grade(submissionId, vi.fn().mockResolvedValue(undefined));

    expect(tx.submission.updateMany).toHaveBeenCalledWith(aborted);
    expect(tx.studentExerciseProgress.upsert).not.toHaveBeenCalled();
  });

  it("checks the deadline once more before finalizing", async () => {
    // Every case judged in time, but the run overran afterwards — here while
    // reporting the last case's progress. Finalizing now would record a grade
    // after the deadline it was meant to respect.
    const { service, tx } = createService({
      profile: { ...eliceProfile, totalTimeLimitMs: 1_000 },
      cases: weightedCases(),
      run: answers([1, 2, 3]),
    });
    const report = vi.fn(async (progress: { position: number }) => {
      if (progress.position === 3) await new Promise((resolve) => setTimeout(resolve, 1_100));
    });

    await service.grade(submissionId, report);

    expect(tx.submission.updateMany).toHaveBeenCalledWith(aborted);
    expect(tx.studentExerciseProgress.upsert).not.toHaveBeenCalled();
  });
});

describe("GradingService.grade — recorded runtimes", () => {
  const refused = expect.objectContaining({
    data: expect.objectContaining({
      status: "ERRORED",
      failureReason: "RUNTIME_VERSION_MISMATCH",
    }),
  });

  it("refuses to grade on a runner other than the one recorded", async () => {
    // The finding: an upgraded runtime would have re-judged queued work by
    // different Python, silently.
    const { service, prisma, engine } = createService({
      profile: eliceProfile,
      cases: weightedCases(),
      run: answers([1, 2, 3]),
      engineVersion: "pyodide-0.28.0",
    });

    await service.grade(submissionId, vi.fn().mockResolvedValue(undefined));

    expect(engine.run).not.toHaveBeenCalled();
    expect(prisma.submission.updateMany).toHaveBeenLastCalledWith(refused);
  });

  it("refuses to grade with a comparator other than the one recorded", async () => {
    const { service, prisma, engine } = createService({
      profile: eliceProfile,
      cases: weightedCases(),
      run: answers([1, 2, 3]),
      comparatorVersion: "pyodide-0.28.0",
    });

    await service.grade(submissionId, vi.fn().mockResolvedValue(undefined));

    expect(engine.run).not.toHaveBeenCalled();
    expect(prisma.submission.updateMany).toHaveBeenLastCalledWith(refused);
  });

  it("refuses when the comparator cannot say what it is", async () => {
    const { service, prisma } = createService({
      profile: eliceProfile,
      cases: weightedCases(),
      run: answers([1, 2, 3]),
      comparatorVersion: null,
    });

    await service.grade(submissionId, vi.fn().mockResolvedValue(undefined));

    expect(prisma.submission.updateMany).toHaveBeenLastCalledWith(refused);
  });

  it("grades when the recorded runtimes are the ones running", async () => {
    const { service, tx } = createService({
      profile: eliceProfile,
      cases: weightedCases(),
      run: answers([1, 2, 3]),
    });

    await service.grade(submissionId, vi.fn().mockResolvedValue(undefined));

    expect(tx.submission.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PASSED", score: 100 }) }),
    );
  });
});

