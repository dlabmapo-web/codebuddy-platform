import { Injectable, Logger } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service.js";
import { PointAwardService } from "../points/point-award.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { OutputComparator } from "./comparator-pool.js";
import type { ExecutionEngine, ExecutionResult } from "./execution-engine.js";
import { evaluateEnhancedCase } from "./case-evaluator.js";
import {
  awardedWeightFor,
  caseOutcomeFor,
  nextProgress,
  shouldStopAfter,
  summarizeRun,
  summarizeWeightedRun,
  type GradeSummary,
} from "./grading.js";
import {
  resolveGradingProfile,
  runtimeMismatch,
  type ResolvedGradingProfile,
} from "./grading-profile.js";
import type { GradingProgress } from "./judge.queue.js";

const gradingInclude = {
  gradingCases: { orderBy: { position: "asc" } },
  material: {
    include: { programmingExercise: true },
  },
} as const satisfies Prisma.SubmissionInclude;

type GradingSubmission = Prisma.SubmissionGetPayload<{
  include: typeof gradingInclude;
}>;
type EliceProfile = Extract<ResolvedGradingProfile, { kind: "elice" }>;

type CaseRow = {
  position: number;
  isSample: boolean;
  outcome: ExecutionResult["outcome"];
  runtimeMs: number;
  actualOutput: string | null;
  awardedWeight: number | null;
  executionState: "EXECUTED" | "NOT_RUN";
};

type AbortReason = "TOTAL_DEADLINE" | "INFRASTRUCTURE_FAILURE";

/** Ends an enhanced run early without it becoming a grade. */
class GradingAbort extends Error {
  constructor(
    readonly reason: AbortReason,
    readonly failureReason: string,
    /**
     * An engine request still running when the run was abandoned. The verdict
     * does not wait for it, but the job does: its slot is counted until the
     * program has actually stopped.
     */
    readonly pendingExecution?: Promise<void>,
  ) {
    super(failureReason);
  }
}

/**
 * Grades one submission.
 *
 * Runs only inside the judge process (see `judge.main.ts`): it is the one place
 * that loads untrusted student code, and it must never share a process with
 * request serving.
 *
 * Dispatch is on the profile frozen with the submission, never the exercise's
 * current settings. Legacy submissions take exactly the path they always did;
 * enhanced ones are judged case by case with their own comparator, weight and
 * limits inside one total budget. Anything unrecognised is refused as a judge
 * fault rather than graded by guesswork.
 */
@Injectable()
export class GradingService {
  private readonly logger = new Logger(GradingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: ExecutionEngine,
    /**
     * Points are written inside the same transaction as the progress row, so a
     * solve and what it earned are never observable apart. The service is
     * inert for an academy without the flag, so the judge pays one indexed
     * lookup per accepted first solve and nothing else.
     */
    private readonly points: PointAwardService,
    /**
     * The five comparison modes, in an interpreter that never sees submitted
     * code. Only enhanced profiles use it; legacy comparison stays the pure
     * function it always was.
     */
    private readonly comparator: OutputComparator,
  ) {}

  async grade(
    submissionId: string,
    report: (progress: GradingProgress) => Promise<void>,
  ): Promise<void> {
    // Claiming is a conditional update, so a duplicate delivery finds nothing
    // to claim and exits rather than grading the same submission twice.
    const claimed = await this.prisma.submission.updateMany({
      where: { id: submissionId, status: "QUEUED" },
      data: { status: "RUNNING", startedAt: new Date() },
    });
    if (claimed.count === 0) {
      this.logger.debug(`submission ${submissionId} was already claimed`);
      return;
    }
    // The total budget starts at the claim: runner startup, every case and
    // every comparison spend it. Queue wait is not the student's time.
    const claimedAt = Date.now();

    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: gradingInclude,
    });

    if (!submission || submission.gradingCases.length === 0) {
      await this.fail(submissionId, "EXERCISE_UNAVAILABLE");
      return;
    }

    const profile = resolveGradingProfile(
      submission,
      submission.gradingCases,
      submission.gradingMode === "LEGACY_STDIO"
        ? undefined
        : submission.gradingPolicySnapshot,
    );
    if (profile.kind === "unsupported") {
      this.logger.error(
        `submission ${submissionId} has an unsupported grading profile: ${profile.reason}`,
      );
      await this.fail(submissionId, "UNSUPPORTED_GRADING_PROFILE");
      return;
    }
    if (profile.kind === "legacy") {
      await this.gradeLegacy(submission, report);
      return;
    }
    // Graded only on the runtimes it was recorded against. Checked before a
    // single case runs, so a mismatch costs nothing but a judge error.
    const mismatch = profile.policy
      ? runtimeMismatch(profile.policy, {
          engine: this.engine.version,
          comparator: this.comparator.version,
        })
      : "no policy snapshot";
    if (mismatch) {
      this.logger.error(`submission ${submissionId} runtime mismatch: ${mismatch}`);
      await this.fail(submissionId, "RUNTIME_VERSION_MISMATCH");
      return;
    }
    await this.gradeElice(submission, profile, claimedAt, report);
  }

  /** The original path, unchanged in behaviour: equal cases, legacy rules. */
  private async gradeLegacy(
    submission: GradingSubmission,
    report: (progress: GradingProgress) => Promise<void>,
  ): Promise<void> {
    const submissionId = submission.id;
    const results: CaseRow[] = [];

    try {
      let stopped = false;
      for (const testCase of submission.gradingCases) {
        const position = testCase.position;
        const isSample = testCase.isSample;

        if (stopped) {
          results.push(skipped(position, isSample));
          continue;
        }

        const run = await this.engine.run({
          code: submission.code,
          stdin: testCase.input,
          timeLimitMs: submission.timeLimitMs,
          memoryLimitMb: submission.memoryLimitMb,
        });
        const outcome = caseOutcomeFor({
          engineOutcome: run.outcome,
          stdout: run.stdout,
          expectedOutput: testCase.expectedOutput,
        });

        results.push({
          position,
          isSample,
          outcome,
          runtimeMs: run.runtimeMs,
          // Only a sample may disclose what the code produced. A hidden case
          // records its outcome and nothing else, or a student could
          // reconstruct hidden expectations by submitting probes.
          actualOutput: isSample ? run.stdout.slice(0, 10_000) : null,
          awardedWeight: null,
          executionState: "EXECUTED",
        });

        await report({
          submissionId,
          position,
          of: submission.gradingCases.length,
          outcome,
          isSample,
        });

        if (shouldStopAfter(outcome)) stopped = true;
      }
    } catch (error) {
      this.logger.error(`grading ${submissionId} threw: ${String(error)}`);
      await this.fail(submissionId, "ENGINE_FAILURE");
      return;
    }

    const summary = summarizeRun(
      results.filter((item) => item.outcome !== "SKIPPED"),
      submission.gradingCases.length,
    );
    await this.finalize(submission, summary, results, {});
  }

  /**
   * Weighted grading with the five comparators.
   *
   * Continues past a wrong answer, a crash and an individual timeout, each
   * case in its own fresh runner, while the total budget lasts. What ends it
   * early is never the student's verdict: the total deadline, or a fault of
   * ours — the runner, or a comparator that could not judge the output. Such a
   * run is recorded as aborted, keeps its partial weights as diagnostics, and
   * touches no best score, completion or reward.
   */
  private async gradeElice(
    submission: GradingSubmission,
    profile: EliceProfile,
    claimedAt: number,
    report: (progress: GradingProgress) => Promise<void>,
  ): Promise<void> {
    const submissionId = submission.id;
    const deadline = claimedAt + profile.totalTimeLimitMs;
    const results: CaseRow[] = [];
    const cases = submission.gradingCases;

    try {
      let stopped = false;
      for (const testCase of cases) {
        const { position, isSample } = testCase;
        if (stopped) {
          results.push({ ...skipped(position, isSample), awardedWeight: 0 });
          continue;
        }

        const evaluation = await evaluateEnhancedCase(
          { engine: this.engine, comparator: this.comparator },
          {
            code: submission.code,
            memoryLimitMb: submission.memoryLimitMb,
            comparatorTimeLimitMs: profile.comparatorTimeLimitMs,
            deadlineAt: deadline,
            testCase: {
              input: testCase.input,
              expectedOutput: testCase.expectedOutput,
              comparator: testCase.comparator,
              softTimeLimitMs: testCase.softTimeLimitMs,
              caseLimitMs: testCase.effectiveTimeLimitMs ?? submission.timeLimitMs,
            },
          },
        );
        if (evaluation.kind === "deadline") {
          throw new GradingAbort(
            "TOTAL_DEADLINE",
            "TOTAL_DEADLINE",
            evaluation.pendingExecution,
          );
        }
        if (evaluation.kind === "grader-fault") {
          // Never a wrong answer: the output was not judged at all.
          this.logger.error(
            `grading ${submissionId} case ${position}: ${evaluation.fault}${
              evaluation.detail ? ` (${evaluation.detail})` : ""
            }`,
          );
          throw new GradingAbort("INFRASTRUCTURE_FAILURE", evaluation.fault);
        }
        const run = evaluation.run;
        const outcome = evaluation.outcome;
        results.push({
          position,
          isSample,
          outcome,
          runtimeMs: run.runtimeMs,
          actualOutput: isSample ? run.stdout.slice(0, 10_000) : null,
          awardedWeight: awardedWeightFor({
            outcome,
            weight: testCase.weight,
            softPenalty: testCase.softPenalty,
          }),
          executionState: "EXECUTED",
        });

        await report({
          submissionId,
          position,
          of: cases.length,
          outcome,
          isSample,
        });

        if (
          profile.continuationPolicy === "LEGACY_STOP_ON_RESOURCE" &&
          shouldStopAfter(outcome)
        ) {
          stopped = true;
        }
      }
      // Once more before anything is final: reporting progress also takes
      // time, and a grade must never be recorded after its run's deadline.
      assertWithin(deadline);
    } catch (error) {
      const abort =
        error instanceof GradingAbort
          ? error
          : new GradingAbort("INFRASTRUCTURE_FAILURE", "ENGINE_FAILURE");
      if (!(error instanceof GradingAbort)) {
        this.logger.error(`grading ${submissionId} threw: ${String(error)}`);
      }
      try {
        await this.abort(submission, abort, results);
      } finally {
        // In `finally` because recording the abort is itself fallible: a
        // database that refuses the write does not make the program the judge
        // stopped waiting for stop running. The slot is counted until it does.
        await abort.pendingExecution;
      }
      return;
    }

    const summary = summarizeWeightedRun({
      cases: results.map((item) => ({
        outcome: item.outcome,
        runtimeMs: item.runtimeMs,
        awardedWeight: item.awardedWeight ?? 0,
      })),
      caseWeights: cases.map((testCase) => testCase.weight),
      materialMaximumHundredths: profile.materialMaximumHundredths,
      materialScorePolicy: profile.materialScorePolicy,
    });
    await this.finalize(submission, summary, results, {
      earnedWeight: summary.earnedWeight,
      possibleWeight: summary.possibleWeight,
      appliedScoreHundredths: summary.appliedScoreHundredths,
    });
  }

  /**
   * An enhanced run that ended without a verdict.
   *
   * Recorded as a judge fault — no attempt, no best score, no completion, no
   * points — with the cases that did run kept as evidence and the rest marked
   * as never executed, so none of them reads as a wrong answer.
   */
  private async abort(
    submission: GradingSubmission,
    abort: GradingAbort,
    executed: CaseRow[],
  ): Promise<void> {
    const ran = new Set(executed.map((item) => item.position));
    const rows = [
      ...executed,
      ...submission.gradingCases
        .filter((testCase) => !ran.has(testCase.position))
        .map((testCase) => ({
          ...skipped(testCase.position, testCase.isSample),
          awardedWeight: 0,
        })),
    ].sort((left, right) => left.position - right.position);
    const earnedWeight = executed.reduce(
      (total, item) => total + (item.awardedWeight ?? 0),
      0,
    );
    const possibleWeight = submission.gradingCases.reduce(
      (total, testCase) => total + testCase.weight,
      0,
    );

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.submission.updateMany({
        where: { id: submission.id, status: "RUNNING" },
        data: {
          status: "ERRORED",
          failureReason: abort.failureReason,
          gradingAborted: true,
          gradingAbortReason: abort.reason,
          earnedWeight,
          possibleWeight,
          gradedAt: new Date(),
        },
      });
      if (updated.count === 0) return;
      await tx.submissionCase.createMany({
        data: rows.map((item) => ({ submissionId: submission.id, ...item })),
      });
    });
  }

  /** Persists a completed verdict and the progress it implies, atomically. */
  private async finalize(
    submission: GradingSubmission,
    summary: GradeSummary,
    results: CaseRow[],
    weighted: {
      earnedWeight?: number;
      possibleWeight?: number;
      appliedScoreHundredths?: number | null;
    },
  ): Promise<void> {
    const submissionId = submission.id;
    // One transaction: a verdict and the progress it implies must never be
    // observable apart.
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.submission.updateMany({
        where: { id: submissionId, status: "RUNNING" },
        data: {
          status: summary.status,
          passedCount: summary.passedCount,
          score: summary.score,
          runtimeMs: summary.runtimeMs,
          ...weighted,
          gradedAt: new Date(),
        },
      });
      if (updated.count === 0) return;

      await tx.submissionCase.createMany({
        data: results.map((item) => ({ submissionId, ...item })),
      });

      const materialId = submission.materialId;
      const currentRevision = submission.material?.programmingExercise
        ?.gradingRevision;
      if (
        !materialId ||
        currentRevision === undefined ||
        currentRevision !== submission.gradingRevision
      ) {
        return;
      }

      const previous = await tx.studentExerciseProgress.findUnique({
        where: {
          userId_materialId: {
            userId: submission.userId,
            materialId,
          },
        },
      });
      const progress = nextProgress({
        previous,
        status: summary.status,
        passedCount: summary.passedCount,
        score: summary.score,
        // Read off the row rather than passed in by the caller, so no dispatch
        // path can forget it. See §5.4 of the console operations design.
        isRepair: submission.regradeRunId !== null,
      });

      await tx.studentExerciseProgress.upsert({
        where: {
          userId_materialId: {
            userId: submission.userId,
            materialId,
          },
        },
        create: {
          userId: submission.userId,
          materialId,
          status: progress.status,
          attemptCount: progress.attemptCount,
          bestPassed: progress.bestPassed,
          bestScore: progress.bestScore,
          gradingRevision: submission.gradingRevision,
          firstSolvedAt: progress.solvedNow ? new Date() : null,
          lastAttemptAt: new Date(),
        },
        update: {
          status: progress.status,
          attemptCount: progress.attemptCount,
          bestPassed: progress.bestPassed,
          bestScore: progress.bestScore,
          gradingRevision: submission.gradingRevision,
          ...(progress.solvedNow ? { firstSolvedAt: new Date() } : {}),
          lastAttemptAt: new Date(),
        },
      });

      // `solvedNow` is the only branch that can earn anything: a repeat solve
      // pays nothing, and only a first solve can complete a lecture. Awarding
      // here rather than after the transaction is what makes a retried job
      // safe — the dedupe key absorbs the repeat, and a rolled-back verdict
      // takes its points with it.
      if (progress.solvedNow && submission.classId) {
        await this.points.awardSolve(tx, {
          userId: submission.userId,
          materialId,
          courseId: submission.courseId,
          classId: submission.classId,
          now: new Date(),
        });
      }
    });
  }

  /** A judge fault. Never counted against the student's attempts. */
  private async fail(submissionId: string, reason: string): Promise<void> {
    await this.prisma.submission.updateMany({
      where: { id: submissionId, status: { in: ["QUEUED", "RUNNING"] } },
      data: { status: "ERRORED", failureReason: reason, gradedAt: new Date() },
    });
  }

  /**
   * Re-enqueues work orphaned by a crash. A submission left RUNNING past the
   * threshold had its process die mid-job; without this the student waits on a
   * verdict that will never arrive.
   */
  async sweepStale(input: {
    queuedOlderThanMs: number;
    runningOlderThanMs: number;
  }): Promise<{ requeue: string[]; errored: number }> {
    const queuedCutoff = new Date(Date.now() - input.queuedOlderThanMs);
    const runningCutoff = new Date(Date.now() - input.runningOlderThanMs);
    const [queued, errored] = await this.prisma.$transaction([
      this.prisma.submission.findMany({
        where: { status: "QUEUED", createdAt: { lt: queuedCutoff } },
        select: { id: true },
        take: 100,
      }),
      this.prisma.submission.updateMany({
        where: { status: "RUNNING", startedAt: { lt: runningCutoff } },
        data: {
          status: "ERRORED",
          failureReason: "WORKER_LOST",
          gradedAt: new Date(),
        },
      }),
    ]);
    if (errored.count > 0) {
      this.logger.warn(`swept ${errored.count} stale running submissions`);
    }
    return { requeue: queued.map((item) => item.id), errored: errored.count };
  }
}

/** Aborts the run once its total budget is spent. */
function assertWithin(deadline: number): void {
  if (Date.now() > deadline) {
    throw new GradingAbort("TOTAL_DEADLINE", "TOTAL_DEADLINE");
  }
}

/** A case that never ran. Never readable as an executed wrong answer. */
function skipped(position: number, isSample: boolean): CaseRow {
  return {
    position,
    isSample,
    outcome: "SKIPPED",
    runtimeMs: 0,
    actualOutput: null,
    awardedWeight: null,
    executionState: "NOT_RUN",
  };
}
