import { describe, expect, it, vi } from "vitest";

import type { PrismaService } from "../database/prisma.service.js";
import type { CaseRow, GradeSink, GradingService } from "./grading.service.js";
import { solutionsDigest } from "./solution-check.js";
import { SolutionCheckRunner } from "./solution-check.runner.js";

const job = { materialId: "11111111-1111-4111-8111-111111111111", checkId: "22222222-2222-4222-8222-222222222222", memoryLimitMb: 256 };

function exercise(overrides: Record<string, unknown> = {}, solutions: Array<{ title: string | null; code: string }> = [{ title: null, code: "print(input())" }]) {
  return {
    quiz: null, timeLimitMs: 3000, memoryLimitMb: 256, gradingRevision: 3,
    inputPromptPolicy: "INCLUDE", gradingMode: "LEGACY_STDIO", gradingSemanticVersion: "legacy-v1",
    totalTimeLimitMs: null, comparatorTimeLimitMs: null, continuationPolicy: "LEGACY_STOP_ON_RESOURCE",
    exitStatusPolicy: "FAIL_ON_RUNTIME_ERROR", materialMaximumHundredths: null, materialScorePolicy: null,
    testCases: [
      { input: "1\n", expectedOutput: "1\n", visibility: "SAMPLE", label: null, comparator: "STDOUT", weight: 1, timeLimitMsOverride: null, softTimeLimitMs: null, softPenalty: null },
      { input: "2\n", expectedOutput: "2\n", visibility: "HIDDEN", label: null, comparator: "STDOUT", weight: 1, timeLimitMsOverride: null, softTimeLimitMs: null, softPenalty: null },
    ],
    solutions,
    solutionCheck: { engineVersion: "0.27.5", executionRuntimeSnapshot: null, gradingRevision: 3, solutionsDigest: solutionsDigest(solutions.map(s => s.code)) },
    ...overrides,
  };
}

const row = (position: number, outcome: CaseRow["outcome"], runtimeMs = 12.4): CaseRow => ({
  position, isSample: position === 1, outcome, runtimeMs, actualOutput: null, awardedWeight: null, executionState: "EXECUTED",
});

type Execute = (work: { code: string }, sink: GradeSink) => Promise<void>;
function harness(found: unknown, execute: Execute, claimed = 1) {
  const updateMany = vi.fn().mockResolvedValueOnce({ count: claimed }).mockResolvedValue({ count: 1 });
  const prisma = {
    exerciseSolutionCheck: { updateMany },
    programmingExercise: { findUnique: vi.fn().mockResolvedValue(found) },
  } as unknown as PrismaService;
  const grading = { execute: vi.fn((work: { code: string }, _report: unknown, _at: number, sink: GradeSink) => execute(work, sink)) };
  const runner = new SolutionCheckRunner(prisma, grading as unknown as GradingService);
  const settled = () => updateMany.mock.calls.at(-1)![0] as { where: Record<string, unknown>; data: { status: string; result: unknown } };
  return { runner, grading, updateMany, settled };
}

const passAll: Execute = async (_work, sink) => sink.complete({ status: "PASSED", passedCount: 2, score: 100, runtimeMs: 20 }, [row(1, "PASSED"), row(2, "PASSED")], {});

describe("SolutionCheckRunner", () => {
  it("records a pass for every case, with whole-millisecond runtimes and each case's limit", async () => {
    const { runner, grading, settled } = harness(exercise(), passAll);
    await runner.run(job);
    expect(grading.execute).toHaveBeenCalledTimes(1);
    const work = grading.execute.mock.calls[0]![0] as unknown as Record<string, unknown>;
    expect(work).toMatchObject({ code: "print(input())", materialId: job.materialId, userId: "", courseId: "", quizSnapshot: null });
    expect((work.gradingCases as unknown[]).length).toBe(2);
    expect(settled().where).toEqual({ materialId: job.materialId, checkId: job.checkId, status: "RUNNING" });
    expect(settled().data).toMatchObject({ status: "PASSED", result: { version: 1, failureReason: null, solutions: [{
      index: 0, passed: true, stoppedBy: null,
      cases: [
        { position: 1, isSample: true, outcome: "PASSED", runtimeMs: 12, limitMs: 3000, error: null, cutSuspected: false },
        { position: 2, isSample: false, outcome: "PASSED", runtimeMs: 12, limitMs: 3000, error: null, cutSuspected: false },
      ],
    }] } });
  });

  it("reports the error line of a runtime error and suspects spreadsheet-cut input", async () => {
    const cut = exercise();
    cut.testCases[1]!.input = `10000\n${"7 ".repeat(25_000)}`.slice(0, 50_000);
    const { runner, settled } = harness(cut, async (_work, sink) => {
      sink.observe?.(2, { stderr: 'Traceback (most recent call last):\n  File "main.py", line 11, in <module>\nIndexError: list index out of range\n' });
      await sink.complete({ status: "FAILED", passedCount: 1, score: 50, runtimeMs: 20 }, [row(1, "PASSED"), row(2, "RUNTIME_ERROR")], {});
    });
    await runner.run(job);
    expect(settled().data.status).toBe("FAILED");
    expect(settled().data.result).toMatchObject({ solutions: [{ passed: false, cases: [
      { position: 1, error: null, cutSuspected: false },
      { position: 2, outcome: "RUNTIME_ERROR", error: { type: "IndexError", message: "list index out of range", line: 11 }, cutSuspected: true },
    ] }] });
  });

  it("does nothing when another worker or a newer save owns the check", async () => {
    const { runner, grading, updateMany } = harness(exercise(), passAll, 0);
    await runner.run(job);
    expect(grading.execute).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledTimes(1);
  });

  it("settles as superseded when the saved solutions moved after queueing", async () => {
    const moved = exercise();
    moved.solutionCheck.solutionsDigest = solutionsDigest(["print('old')"]);
    const { runner, grading, settled } = harness(moved, passAll);
    await runner.run(job);
    expect(grading.execute).not.toHaveBeenCalled();
    expect(settled().data).toMatchObject({ status: "ERRORED", result: { failureReason: "SUPERSEDED", solutions: [] } });
  });

  it("cannot check a problem without a solution, or a quiz", async () => {
    const none = harness(exercise({}, []), passAll);
    await none.runner.run(job);
    expect(none.settled().data.status).toBe("NO_SOLUTION");
    const quiz = harness(exercise({ quiz: { choices: [] } }), passAll);
    await quiz.runner.run(job);
    expect(quiz.settled().data.status).toBe("NOT_CHECKABLE");
    expect(quiz.grading.execute).not.toHaveBeenCalled();
  });

  it("treats a solution over the whole-job budget as the problem's failure", async () => {
    const { runner, settled } = harness(exercise(), async (_work, sink) => sink.fail("TOTAL_DEADLINE", [row(1, "PASSED"), { ...row(2, "SKIPPED"), executionState: "NOT_RUN" }]));
    await runner.run(job);
    expect(settled().data).toMatchObject({ status: "FAILED", result: { solutions: [{ passed: false, stoppedBy: "TOTAL_DEADLINE", cases: [{ outcome: "PASSED" }, { outcome: "SKIPPED", runtimeMs: null }] }] } });
  });

  it("treats a grader that could not run the program as the check's error, not the problem's", async () => {
    const { runner, settled } = harness(exercise(), async (_work, sink) => sink.fail("ENGINE_FAILURE", [row(1, "PASSED")]));
    await runner.run(job);
    expect(settled().data).toMatchObject({ status: "ERRORED", result: { solutions: [{ passed: false, stoppedBy: "ENGINE_FAILURE" }] } });
  });

  it("checks every saved solution and fails when any one fails", async () => {
    const solutions = [{ title: "Stack", code: "print(1)" }, { title: "Brute force", code: "print(2)" }];
    const { runner, grading, settled } = harness(exercise({}, solutions), async (work, sink) => work.code === "print(1)"
      ? passAll(work, sink)
      : sink.complete({ status: "FAILED", passedCount: 1, score: 50, runtimeMs: 20 }, [row(1, "PASSED"), row(2, "TIME_LIMIT", 3001)], {}));
    await runner.run(job);
    expect(grading.execute).toHaveBeenCalledTimes(2);
    expect(settled().data).toMatchObject({ status: "FAILED", result: { solutions: [
      { index: 0, title: "Stack", passed: true },
      { index: 1, title: "Brute force", passed: false, cases: [{ outcome: "PASSED" }, { outcome: "TIME_LIMIT", runtimeMs: 3001 }] },
    ] } });
  });

  it("settles as errored when grading throws", async () => {
    const { runner, settled } = harness(exercise(), async () => { throw new Error("socket closed"); });
    await runner.run(job);
    expect(settled().data).toMatchObject({ status: "ERRORED", result: { failureReason: "CHECK_FAILED" } });
  });
});
