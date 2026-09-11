import type { CaseComparator, CaseOutcome } from "@cove/shared";

import type { ComparisonResult, OutputComparator } from "./comparator-pool.js";
import type { ExecutionEngine, ExecutionResult } from "./execution-engine.js";
import { eliceCaseDecisionFor, type GraderFault } from "./grading.js";

/**
 * How long past the remaining total budget an engine call may take to settle.
 * The run itself is capped at the remaining budget; this covers the forced
 * termination and pipe drain after it, not more student time.
 */
const ENGINE_SETTLE_GRACE_MS = 2_500;

/** One case of an enhanced profile, as frozen in a snapshot. */
export type EnhancedCase = {
  input: string;
  expectedOutput: string;
  comparator: CaseComparator;
  softTimeLimitMs: number | null;
  /** The case's own hard limit, already resolved against the exercise's. */
  caseLimitMs: number;
};

export type EnhancedCaseEvaluation =
  | {
      kind: "verdict";
      outcome: CaseOutcome;
      run: ExecutionResult;
      /** Null when the program never produced output worth comparing. */
      comparison: ComparisonResult | null;
      executionMs: number;
      comparisonMs: number;
    }
  /** The absolute deadline ran out; no verdict may be accepted. */
  | {
      kind: "deadline";
      /**
       * Set when the deadline passed with the engine request still in flight.
       *
       * The verdict is already decided — nothing this run produces can be
       * accepted — but the program is still occupying a runner. Resolves when
       * that request finally settles, so a caller holding an execution slot
       * can release it when the work is over rather than when it stopped
       * waiting. Never rejects: the failure, if any, is no longer anyone's.
       */
      pendingExecution?: Promise<void>;
    }
  /** Ours, not the student's: the output could not be judged. */
  | { kind: "grader-fault"; fault: GraderFault; detail?: string };

/**
 * One enhanced case, from execution to verdict.
 *
 * The single place the enhanced per-case rules live, shared by official
 * grading and by public sample checks, so a sample can never be judged by
 * rules that differ from Submit's: the same runner, the same CPython
 * comparator, the same deadline handling and the same soft-limit
 * classification. Aggregation, points and persistence stay with the caller.
 *
 * `deadlineAt` is absolute and covers everything done here — waiting for a
 * runner, running, waiting for a comparator and comparing. Each operation is
 * held to the lesser of its own limit and what is left, and a result that
 * arrives after the deadline is `deadline`, never a verdict. An engine that
 * throws propagates: that is an infrastructure failure the caller records.
 */
export async function evaluateEnhancedCase(
  deps: { engine: ExecutionEngine; comparator: OutputComparator },
  input: {
    code: string;
    memoryLimitMb: number;
    comparatorTimeLimitMs: number;
    deadlineAt: number;
    testCase: EnhancedCase;
  },
): Promise<EnhancedCaseEvaluation> {
  const { testCase, deadlineAt } = input;
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) return { kind: "deadline" };

  // The lesser of the case's own limit and what is left of the run's. A case
  // cut short by the second is the run's deadline, not the student's time
  // limit on that case.
  const limit = Math.min(testCase.caseLimitMs, remaining);
  const executionStartedAt = Date.now();
  const execution = deps.engine.run({
    code: input.code,
    stdin: testCase.input,
    timeLimitMs: limit,
    memoryLimitMb: input.memoryLimitMb,
  });
  const run = await settleWithin(execution, remaining + ENGINE_SETTLE_GRACE_MS);
  const executionMs = Date.now() - executionStartedAt;
  if (run === "expired") {
    // Giving up on the answer is not the same as the program having stopped.
    // The request is handed back so the caller can keep its execution slot
    // until the runner is actually free.
    return { kind: "deadline", pendingExecution: settlementOf(execution) };
  }
  if (run.outcome === "TIME_LIMIT" && limit < testCase.caseLimitMs) {
    return { kind: "deadline" };
  }
  // Waiting for a runner is not bounded by the case's limit, so a run can come
  // back after the budget is gone. Its verdict is too late.
  if (Date.now() > deadlineAt) return { kind: "deadline" };

  let comparison: ComparisonResult | null = null;
  let comparisonMs = 0;
  if (run.outcome === "PASSED") {
    const comparisonStartedAt = Date.now();
    // The deadline, not just a budget: queueing for a comparator is the run's
    // time too, and the pool enforces the lesser of the two.
    comparison = await deps.comparator.compare({
      comparator: testCase.comparator,
      actual: run.stdout,
      expected: testCase.expectedOutput,
      budgetMs: input.comparatorTimeLimitMs,
      deadlineAt,
    });
    comparisonMs = Date.now() - comparisonStartedAt;
    if (Date.now() > deadlineAt) return { kind: "deadline" };
  }

  const decision = eliceCaseDecisionFor({
    engineOutcome: run.outcome,
    runtimeMs: run.runtimeMs,
    softTimeLimitMs: testCase.softTimeLimitMs,
    comparison,
  });
  if (decision.kind !== "verdict") return decision;
  return {
    kind: "verdict",
    outcome: decision.outcome,
    run,
    comparison,
    executionMs,
    comparisonMs,
  };
}

/**
 * When the engine request settles, whichever way it settles.
 *
 * Both outcomes are already accounted for — the verdict was decided without
 * this run — so neither the value nor the failure is passed on. What is left
 * is the one fact the caller still needs: that the runner is free again.
 */
function settlementOf(operation: Promise<unknown>): Promise<void> {
  return operation.then(
    () => undefined,
    () => undefined,
  );
}

/**
 * The engine's answer, or `"expired"` once the budget is gone.
 *
 * Expiring stops the wait, not the program. The engine still bounds that run
 * by its own limit and retires its runner, and `settlementOf` is how a caller
 * finds out when that has happened; a late failure is handled here rather than
 * left unhandled.
 */
function settleWithin<T>(
  operation: Promise<T>,
  ms: number,
): Promise<T | "expired"> {
  return new Promise<T | "expired">((resolve, reject) => {
    const timer = setTimeout(() => resolve("expired"), Math.max(0, ms));
    timer.unref();
    operation.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
