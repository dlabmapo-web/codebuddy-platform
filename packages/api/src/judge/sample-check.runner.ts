import { Logger } from "@nestjs/common";
import { sampleCheckDisplayLimit, type SampleCheckStatus } from "@cove/shared";

import { evaluateEnhancedCase } from "./case-evaluator.js";
import type { OutputComparator } from "./comparator-pool.js";
import type { ExecutionCapacity } from "./execution-capacity.js";
import type { ExecutionEngine } from "./execution-engine.js";
import { runtimeMismatch } from "./grading-profile.js";
import type {
  SampleCheckRecord,
  SampleCheckStore,
  StoredSampleResult,
} from "./sample-check.store.js";

/** How long a check may wait for the judge. Matches the API's admission. */
export const SAMPLE_QUEUE_WAIT_MS = 10_000;

/**
 * Runs one public sample check, in the judge.
 *
 * The same evaluator, runner and comparator as official grading, on a
 * snapshot of the one public case taken when the check was accepted. The
 * result goes back to the check's own short-lived record and nowhere else: no
 * submission, no attempt, no progress, no points.
 *
 * Order of events, each fail-closed:
 * 1. Waiting — for the queue and then for a background execution slot — may
 *    take at most `SAMPLE_QUEUE_WAIT_MS` from acceptance, else `TIMED_OUT`.
 * 2. The recorded runtimes must be the ones running, before any student code
 *    runs, else `UNAVAILABLE`.
 * 3. The case runs against the profile's total budget from dispatch; a result
 *    after that deadline is `TIMED_OUT`, never a verdict.
 * 4. A cancel that arrived while running makes the ending `CANCELLED` — the
 *    result is discarded, and the slot was held until the run was over.
 */
export class SampleCheckRunner {
  private readonly logger = new Logger(SampleCheckRunner.name);

  constructor(
    private readonly store: SampleCheckStore,
    private readonly engine: ExecutionEngine,
    private readonly comparator: OutputComparator,
    private readonly capacity: ExecutionCapacity,
  ) {}

  async run(checkId: string): Promise<void> {
    const record = await this.store.get(checkId);
    // Cancelled, expired, or already handled: nothing to do.
    if (!record || record.status !== "QUEUED") return;

    const waitUntil = record.acceptedAt + SAMPLE_QUEUE_WAIT_MS;
    if (Date.now() > waitUntil) {
      await this.end(record, ["QUEUED"], "TIMED_OUT", { failure: "QUEUE_WAIT" });
      return;
    }
    const release = await this.capacity.tryBackground(waitUntil);
    if (!release) {
      await this.end(record, ["QUEUED"], "TIMED_OUT", { failure: "QUEUE_WAIT" });
      return;
    }

    try {
      const dispatchedAt = Date.now();
      const running = await this.store.transition(record, ["QUEUED"], {
        status: "RUNNING",
        dispatchedAt,
        timings: { ...record.timings, queueMs: dispatchedAt - record.acceptedAt },
      });
      // Cancelled between the queue and the slot.
      if (!running) return;
      await this.execute(running, dispatchedAt);
    } finally {
      release();
    }
  }

  /** A job that died in the worker, recorded as ours rather than lost. */
  async markFailed(checkId: string): Promise<void> {
    const record = await this.store.get(checkId).catch(() => null);
    if (!record) return;
    await this.end(record, ["QUEUED", "RUNNING"], "UNAVAILABLE", {
      failure: "WORKER_FAILED",
    }).catch(() => undefined);
  }

  private async execute(record: SampleCheckRecord, dispatchedAt: number): Promise<void> {
    const { snapshot } = record;
    const mismatch = runtimeMismatch(snapshot.policy, {
      engine: this.engine.version,
      comparator: this.comparator.version,
    });
    if (mismatch) {
      // No student code runs on a runtime the check was not recorded against.
      this.logger.error(`sample check ${record.checkId} runtime mismatch: ${mismatch}`);
      await this.end(record, ["RUNNING"], "UNAVAILABLE", {
        failure: "RUNTIME_VERSION_MISMATCH",
      });
      return;
    }

    const deadlineAt = dispatchedAt + snapshot.totalTimeLimitMs;
    let evaluation;
    try {
      evaluation = await evaluateEnhancedCase(
        { engine: this.engine, comparator: this.comparator },
        {
          code: snapshot.code,
          memoryLimitMb: snapshot.memoryLimitMb,
          comparatorTimeLimitMs: snapshot.comparatorTimeLimitMs,
          deadlineAt,
          testCase: snapshot.testCase,
        },
      );
    } catch (error) {
      this.logger.error(`sample check ${record.checkId} engine failure: ${String(error)}`);
      await this.end(record, ["RUNNING"], "UNAVAILABLE", {
        failure: "ENGINE_FAILURE",
      });
      return;
    }

    // Set when the judge stopped waiting for a program that is still running.
    const pendingExecution =
      evaluation.kind === "deadline" ? evaluation.pendingExecution : undefined;
    try {
      if (evaluation.kind === "deadline" || Date.now() > deadlineAt) {
        await this.end(record, ["RUNNING"], "TIMED_OUT", { failure: "DEADLINE" });
        return;
      }
      if (evaluation.kind === "grader-fault") {
        // An invalid pattern or a comparator fault: never the student's failure.
        await this.end(record, ["RUNNING"], "UNAVAILABLE", {
          failure: evaluation.fault,
        });
        return;
      }

      const { run, comparison, outcome } = evaluation;
      const stdout = cap(run.stdout);
      const stderr = cap(run.stderr);
      const result: StoredSampleResult = {
        // Skipped never happens to a single case run on its own.
        outcome: outcome as StoredSampleResult["outcome"],
        outputMatched: comparison === null ? null : comparison.kind === "match",
        softLimitExceeded: outcome === "PASSED_WITH_WARNING",
        stdout: stdout.text,
        stdoutTruncated: stdout.truncated,
        stderr: stderr.text,
        stderrTruncated: stderr.truncated,
      };
      await this.end(record, ["RUNNING"], "COMPLETED", {
        result,
        timings: {
          queueMs: record.timings.queueMs,
          executionMs: evaluation.executionMs,
          comparisonMs: evaluation.comparisonMs,
        },
      });
    } finally {
      // In `finally` because recording the ending is itself fallible: if Redis
      // is down, the student's answer is lost, but the program the judge gave
      // up waiting for is still holding a runner. Releasing the slot on that
      // path is what lets abandoned practice work accumulate behind the
      // reservation that protects submissions.
      await pendingExecution;
    }
  }

  /**
   * The one way a check ends, and one store call to end it.
   *
   * A check whose owner asked it to stop ends `CANCELLED` whatever it
   * concluded, and its result is not kept. The store decides that against the
   * status as it stands, so a cancel arriving just as the worker finishes
   * either wins outright or finds the check already terminal — it can no
   * longer land between two writes and leave the check `STOPPING` with nobody
   * to finish it.
   */
  private async end(
    record: SampleCheckRecord,
    from: SampleCheckStatus[],
    status: SampleCheckStatus,
    patch: Partial<SampleCheckRecord>,
  ): Promise<void> {
    await this.store.finish(record, from, {
      ...patch,
      status,
      finishedAt: Date.now(),
    });
  }
}

/** A display cap; comparison already used the whole output. */
function cap(value: string): { text: string; truncated: boolean } {
  return value.length > sampleCheckDisplayLimit
    ? { text: value.slice(0, sampleCheckDisplayLimit), truncated: true }
    : { text: value, truncated: false };
}
