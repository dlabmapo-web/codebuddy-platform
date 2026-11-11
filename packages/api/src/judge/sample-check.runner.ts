import { frozenNativeDescriptor } from "./native-admission.js";
import { nativeRuntimeVersion } from "@cove/grading-runtime";
import { Logger } from "@nestjs/common";
import { sampleCheckDisplayLimit, type SampleCheckStatus } from "@cove/shared";

import { evaluateEnhancedCase, GRADING_OVERHEAD_MS } from "./case-evaluator.js";
import type { OutputComparator } from "./comparator-pool.js";
import type { ExecutionCapacity } from "./execution-capacity.js";
import type { ExecutionEngine, ExecutionResult } from "./execution-engine.js";
import { caseExit } from "./grading.service.js";
import { caseOutcomeFor } from "./grading.js";
import { sampleInputPromptPolicy } from "./sample-check-snapshot.js";
import { runtimeMismatch } from "./grading-profile.js";
import { timeScaleOf } from "./time-scaled-engine.js";
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
 * 3. Student execution is capped by the profile budget. Infrastructure gets
 *    a bounded overhead allowance; later results are `TIMED_OUT`.
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
        // Acceptance and dispatch may be on different hosts. A small clock
        // difference must not make an otherwise valid result fail the public
        // contract's nonnegative duration check.
        timings: { ...record.timings, queueMs: Math.max(0, dispatchedAt - record.acceptedAt) },
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
    const inputPromptPolicy = sampleInputPromptPolicy(snapshot);
    if (inputPromptPolicy === null) {
      await this.end(record, ["RUNNING"], "UNAVAILABLE", { failure: "UNSUPPORTED_POLICY" });
      return;
    }
    let descriptor;
    try { descriptor = frozenNativeDescriptor(snapshot.executionRuntimeSnapshot); }
    catch { await this.end(record, ["RUNNING"], "UNAVAILABLE", { failure: "RUNTIME_VERSION_MISMATCH" }); return; }
    // C/C++ run only compiled, on the GCC runtime they were admitted to.
    const compiled = snapshot.language !== undefined;
    if ((descriptor && nativeRuntimeVersion(descriptor) !== this.engine.version) || (!descriptor && this.engine.version.startsWith("native-")) ||
        compiled !== (descriptor?.engine === "native-gcc") || (compiled && !this.engine.compile)) {
      await this.end(record, ["RUNNING"], "UNAVAILABLE", { failure: "RUNTIME_VERSION_MISMATCH" }); return;
    }
    const legacy = snapshot.gradingMode === "LEGACY_STDIO";
    const mismatch = legacy
      ? snapshot.engineVersion !== this.engine.version
      : runtimeMismatch(snapshot.policy, {
          engine: this.engine.version,
          comparator: this.comparator.version,
        });
    // Legacy Submit uses this exact normalizer, not the enhanced CPython rule.
    const comparator: OutputComparator = legacy ? {
      version: this.engine.version,
      compare: async ({ actual, expected }) => ({
        kind: caseOutcomeFor({ engineOutcome: "PASSED", stdout: actual, expectedOutput: expected }) === "PASSED"
          ? "match" : "no-match",
      }),
    } : this.comparator;
    if (mismatch) {
      // No student code runs on a runtime the check was not recorded against.
      this.logger.error(`sample check ${record.checkId} runtime mismatch: ${mismatch}`);
      await this.end(record, ["RUNNING"], "UNAVAILABLE", {
        failure: "RUNTIME_VERSION_MISMATCH",
      });
      return;
    }

    // The same wall-clock budget Submit gives this case on a scaled engine.
    const deadlineAt = dispatchedAt + Math.ceil(snapshot.totalTimeLimitMs * timeScaleOf(this.engine)) + GRADING_OVERHEAD_MS;
    // C/C++: compiled once, exactly as Submit compiles, before the case runs.
    let build: { artifact: string; lease: string } | undefined;
    let warnings: string | null = null;
    if (compiled) {
      let built;
      try {
        built = await this.engine.compile!({
          language: snapshot.language!,
          code: snapshot.run ? `${snapshot.code}${terminalStreams}` : snapshot.code,
          leaseMs: Math.min(30 * 60_000, Math.max(1000, deadlineAt - Date.now() + GRADING_OVERHEAD_MS)),
        });
      } catch (error) {
        this.logger.error(`sample check ${record.checkId} compile failure: ${String(error)}`);
        await this.end(record, ["RUNNING"], "UNAVAILABLE", { failure: "ENGINE_FAILURE" });
        return;
      }
      if (Date.now() > deadlineAt) {
        if (built.status === "COMPILED") await this.engine.release?.(built.lease).catch(() => undefined);
        await this.end(record, ["RUNNING"], "TIMED_OUT", { failure: "DEADLINE" });
        return;
      }
      if (built.status === "COMPILE_ERROR") {
        await this.end(record, ["RUNNING"], "COMPLETED", {
          result: {
            outcome: "COMPILE_ERROR", outputMatched: null, softLimitExceeded: false,
            stdout: "", stdoutTruncated: false, stderr: "", stderrTruncated: false,
            exitCode: null, exitSignal: null, compileDiagnostics: built.diagnostics,
          },
          timings: { queueMs: record.timings.queueMs, executionMs: null, comparisonMs: null },
        });
        return;
      }
      build = { artifact: built.artifact, lease: built.lease };
      warnings = built.diagnostics;
    }
    // A Run compares nothing: whatever the program printed is its result.
    const judge: OutputComparator = snapshot.run
      ? { version: comparator.version, compare: async () => ({ kind: "match" }) }
      : comparator;
    let evaluation;
    try {
      evaluation = await evaluateEnhancedCase(
        { engine: this.engine, comparator: judge },
        {
          inputPromptPolicy,
          code: snapshot.code,
          memoryLimitMb: snapshot.memoryLimitMb,
          // Omit the override for legacy, just as Submit does.
          ...(!legacy ? { outputLimitBytes: snapshot.policy.ceilings.outputBytes } : {}),
          comparatorTimeLimitMs: snapshot.comparatorTimeLimitMs,
          deadlineAt,
          executionBudgetMs: snapshot.totalTimeLimitMs,
          testCase: snapshot.testCase,
          ...(build ? { build } : {}),
          // A Run keeps its input open: the terminal asks for more when the
          // program waits, as Python's does.
          ...(snapshot.run && build && !snapshot.endOfInput ? { holdStdin: true } : {}),
        },
      );
    } catch (error) {
      this.logger.error(`sample check ${record.checkId} engine failure: ${String(error)}`);
      if (build) await this.engine.release?.(build.lease).catch(() => undefined);
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
        outputMatched: snapshot.run || comparison === null ? null : comparison.kind === "match",
        softLimitExceeded: outcome === "PASSED_WITH_WARNING",
        stdout: stdout.text,
        stdoutTruncated: stdout.truncated,
        stderr: stderr.text,
        stderrTruncated: stderr.truncated,
        // Public or student-typed input only, so the ending may be shown.
        ...caseExit(outcome as ExecutionResult["outcome"], run.termination),
        compileDiagnostics: warnings,
        ...(run.awaitingInput ? { awaitingInput: true } : {}),
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
      // Only once nothing runs from it may the program be evicted.
      if (build) await this.engine.release?.(build.lease).catch(() => undefined);
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

/**
 * Appended to a Run's source: stdin and stdout line-buffered, as a terminal
 * makes them. Through a pipe both are fully buffered, so C's
 * `printf("Enter a: "); scanf(...)` kept its prompt until the program ended;
 * line-buffered, glibc flushes stdout before each read, and the prompt is on
 * screen when the terminal asks for input. Python's `input()` and C++'s
 * `cin` (tied to `cout`) already behave so. Only when the program has
 * `<stdio.h>` (glibc defines `stdout` as a macro), and after the student's
 * last line so GCC's line numbers are theirs. A Run only: Test and Submit
 * compile exactly what was written.
 */
export const terminalStreams =
  "\n#ifdef stdout\n__attribute__((constructor)) static void __cove_terminal_streams(void) " +
  "{ setvbuf(stdin, 0, _IOLBF, 0); setvbuf(stdout, 0, _IOLBF, 0); }\n#endif\n";

/** A display cap; comparison already used the whole output. */
function cap(value: string): { text: string; truncated: boolean } {
  return value.length > sampleCheckDisplayLimit
    ? { text: value.slice(0, sampleCheckDisplayLimit), truncated: true }
    : { text: value, truncated: false };
}
