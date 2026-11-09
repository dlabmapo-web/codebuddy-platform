import { Logger } from "@nestjs/common";
import {
  looksSpreadsheetCut,
  solutionCheckResultSchema,
  type SolutionCheckCase,
  type SolutionCheckError,
  type SolutionCheckResult,
  type SolutionCheckSolution,
  type SolutionCheckStatus,
} from "@cove/shared";

import type { PrismaService } from "../database/prisma.service.js";
import { Prisma } from "../generated/prisma/client.js";
import type { CaseRow, GradingService } from "./grading.service.js";
import { gradingSnapshotFor, resolveGradingProfile } from "./grading-profile.js";
import type { SolutionCheckJob } from "./judge.queue.js";
import { frozenNativeDescriptor } from "./native-admission.js";
import { solutionCheckExerciseSelect, solutionsDigest, summarizePythonError } from "./solution-check.js";

const passing = new Set(["PASSED", "PASSED_WITH_WARNING"]);

type Settled = { status: SolutionCheckStatus; result: SolutionCheckResult | null };
const unable = (failureReason: string): Settled => ({
  status: "ERRORED", result: { version: 1, solutions: [], failureReason },
});

/**
 * Runs a problem's official solutions through exactly the grading a student's
 * submission gets, and records how each case went.
 *
 * The sink writes nothing for any person: no submission, attempt, progress or
 * points. The only write is this problem's check row, and every write names the
 * `checkId` it was queued for, so a check superseded by a later save settles
 * nothing.
 */
export class SolutionCheckRunner {
  private readonly logger = new Logger(SolutionCheckRunner.name);

  constructor(private readonly prisma: PrismaService, private readonly grading: GradingService) {}

  async run(job: SolutionCheckJob): Promise<void> {
    const claimed = await this.prisma.exerciseSolutionCheck.updateMany({
      where: { materialId: job.materialId, checkId: job.checkId, status: "QUEUED" },
      data: { status: "RUNNING", startedAt: new Date() },
    });
    if (!claimed.count) return;
    let settled: Settled;
    try {
      settled = await this.check(job);
    } catch (error) {
      this.logger.error(`solution check ${job.checkId} threw: ${String(error)}`);
      settled = unable("CHECK_FAILED");
    }
    await this.settle(job, settled);
  }

  private async check(job: SolutionCheckJob): Promise<Settled> {
    const exercise = await this.prisma.programmingExercise.findUnique({
      where: { materialId: job.materialId },
      select: {
        ...solutionCheckExerciseSelect,
        solutionCheck: { select: { engineVersion: true, executionRuntimeSnapshot: true, gradingRevision: true, solutionsDigest: true } },
      },
    });
    const queued = exercise?.solutionCheck;
    if (!exercise || !queued) return unable("EXERCISE_UNAVAILABLE");
    // Every save that moves either one queues a new check under a new id; a
    // mismatch here means this job's definition is already gone.
    if (queued.gradingRevision !== exercise.gradingRevision ||
        queued.solutionsDigest !== solutionsDigest(exercise.solutions.map(solution => solution.code))) {
      return unable("SUPERSEDED");
    }
    if (exercise.quiz != null || !exercise.testCases.length ||
        resolveGradingProfile(exercise, exercise.testCases).kind === "unsupported") {
      return { status: "NOT_CHECKABLE", result: null };
    }
    if (!exercise.solutions.length) return { status: "NO_SOLUTION", result: null };

    const grading = gradingSnapshotFor(exercise, {
      engineVersion: queued.engineVersion,
      descriptor: frozenNativeDescriptor(queued.executionRuntimeSnapshot),
    });
    const solutions: SolutionCheckSolution[] = [];
    for (const [index, solution] of exercise.solutions.entries()) {
      const errors = new Map<number, SolutionCheckError | null>();
      let rows: CaseRow[] = [];
      let stoppedBy: string | null = null;
      await this.grading.execute({
        ...grading.submission,
        id: job.checkId,
        // A sink-bound run writes no record of a person or a course.
        userId: "",
        courseId: "",
        materialId: job.materialId,
        code: solution.code,
        gradingRevision: exercise.gradingRevision,
        timeLimitMs: exercise.timeLimitMs,
        memoryLimitMb: exercise.memoryLimitMb,
        gradingCases: grading.cases,
        quizSnapshot: null,
      }, async () => undefined, Date.now(), {
        complete: async (_summary, cases) => { rows = cases; },
        fail: async (reason, cases = []) => { rows = cases; stoppedBy = reason.slice(0, 80); },
        observe: (position, run) => { errors.set(position, run.stderr ? summarizePythonError(run.stderr) : null); },
      });
      const cases = rows.map((row): SolutionCheckCase => {
        const source = grading.cases[row.position - 1]!;
        return {
          position: row.position,
          isSample: row.isSample,
          outcome: row.outcome,
          runtimeMs: row.executionState === "EXECUTED" ? Math.max(0, Math.round(row.runtimeMs)) : null,
          limitMs: source.effectiveTimeLimitMs ?? exercise.timeLimitMs,
          error: row.outcome === "RUNTIME_ERROR" ? errors.get(row.position) ?? null : null,
          cutSuspected: looksSpreadsheetCut(source.input) || looksSpreadsheetCut(source.expectedOutput),
        };
      });
      solutions.push({
        index,
        title: solution.title,
        passed: stoppedBy === null && cases.length === grading.cases.length && cases.every(item => passing.has(item.outcome)),
        stoppedBy,
        cases,
      });
    }

    const result: SolutionCheckResult = { version: 1, solutions, failureReason: null };
    // A program that is wrong or too slow is the problem's fault and is what
    // this check exists to show; a grader that could not run it is not.
    const failed = solutions.some(solution => solution.stoppedBy === "TOTAL_DEADLINE" ||
      solution.cases.some(item => item.outcome !== "SKIPPED" && !passing.has(item.outcome)));
    if (failed) return { status: "FAILED", result };
    if (solutions.some(solution => !solution.passed)) return { status: "ERRORED", result };
    return { status: "PASSED", result };
  }

  private async settle(job: SolutionCheckJob, settled: Settled): Promise<void> {
    await this.prisma.exerciseSolutionCheck.updateMany({
      where: { materialId: job.materialId, checkId: job.checkId, status: "RUNNING" },
      data: {
        status: settled.status,
        result: settled.result ? solutionCheckResultSchema.parse(settled.result) : Prisma.DbNull,
        finishedAt: new Date(),
      },
    });
  }
}
