import { Injectable, Logger } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service.js";
import type { ExecutionEngine } from "./execution-engine.js";
import {
  caseOutcomeFor,
  nextProgress,
  shouldStopAfter,
  summarizeRun,
} from "./grading.js";
import type { GradingProgress } from "./judge.queue.js";

/**
 * Grades one submission.
 *
 * Runs only inside the judge process (see `judge.main.ts`): it is the one place
 * that loads untrusted student code, and it must never share a process with
 * request serving.
 */
@Injectable()
export class GradingService {
  private readonly logger = new Logger(GradingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: ExecutionEngine,
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

    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        material: {
          include: {
            programmingExercise: {
              include: {
                testCases: { orderBy: [{ position: "asc" }, { id: "asc" }] },
              },
            },
          },
        },
      },
    });

    const exercise = submission?.material.programmingExercise;
    if (!submission || !exercise || exercise.testCases.length === 0) {
      await this.fail(submissionId, "EXERCISE_UNAVAILABLE");
      return;
    }

    const results: Array<{
      position: number;
      isSample: boolean;
      outcome: ReturnType<typeof caseOutcomeFor>;
      runtimeMs: number;
      actualOutput: string | null;
    }> = [];

    try {
      let stopped = false;
      for (const [index, testCase] of exercise.testCases.entries()) {
        const position = index + 1;
        const isSample = testCase.visibility === "SAMPLE";

        if (stopped) {
          results.push({
            position,
            isSample,
            outcome: "SKIPPED",
            runtimeMs: 0,
            actualOutput: null,
          });
          continue;
        }

        const run = await this.engine.run({
          code: submission.code,
          stdin: testCase.input,
          timeLimitMs: exercise.timeLimitMs,
          memoryLimitMb: exercise.memoryLimitMb,
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
        });

        await report({
          submissionId,
          position,
          of: exercise.testCases.length,
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
      exercise.testCases.length,
    );

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
          gradedAt: new Date(),
        },
      });
      if (updated.count === 0) return;

      await tx.submissionCase.createMany({
        data: results.map((item) => ({
          submissionId,
          position: item.position,
          isSample: item.isSample,
          outcome: item.outcome,
          runtimeMs: item.runtimeMs,
          actualOutput: item.actualOutput,
        })),
      });

      const previous = await tx.studentExerciseProgress.findUnique({
        where: {
          userId_materialId: {
            userId: submission.userId,
            materialId: submission.materialId,
          },
        },
      });
      const progress = nextProgress({
        previous,
        status: summary.status,
        passedCount: summary.passedCount,
        score: summary.score,
      });

      await tx.studentExerciseProgress.upsert({
        where: {
          userId_materialId: {
            userId: submission.userId,
            materialId: submission.materialId,
          },
        },
        create: {
          userId: submission.userId,
          materialId: submission.materialId,
          status: progress.status,
          attemptCount: progress.attemptCount,
          bestPassed: progress.bestPassed,
          bestScore: progress.bestScore,
          firstSolvedAt: progress.solvedNow ? new Date() : null,
          lastAttemptAt: new Date(),
        },
        update: {
          status: progress.status,
          attemptCount: progress.attemptCount,
          bestPassed: progress.bestPassed,
          bestScore: progress.bestScore,
          ...(progress.solvedNow ? { firstSolvedAt: new Date() } : {}),
          lastAttemptAt: new Date(),
        },
      });
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
