import { Logger } from "@nestjs/common";

import type { PrismaService } from "../database/prisma.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import { fingerprintOf } from "../ai-assistant/fingerprint.js";
import type { ExecutionCapacity } from "./execution-capacity.js";
import type { GradingService } from "./grading.service.js";
import { practiceSnapshotSchema } from "./practice-snapshot.js";

/** Nobody's id: a check writes no one's work. */
const NO_USER = "00000000-0000-0000-0000-000000000000";
const OUTPUT_MAX = 1_000;
const MESSAGE_MAX = 500;
/**
 * How long a check may wait for a background slot. The API waits a little
 * longer for the result, then answers "busy" (the campus courses design, §6).
 */
export const AI_HELP_CHECK_WAIT_MS = 10_000;

/** One example's result, as the AI help service reads it. */
export type AiHelpCheckCase = {
  position: number;
  outcome: string;
  /** What the code printed, trimmed; null when it never ran. */
  actualOutput: string | null;
  outputDifference: string | null;
  errorType: string | null;
  errorMessage: string | null;
  errorLine: number | null;
};

/**
 * Runs the code in a student's editor on the problem's examples, for AI help
 * after Run or Test run.
 *
 * The same evaluator as Submit, through a sink with no student writes: no
 * submission, attempt, points or progress. The snapshot holds the examples
 * only, so no hidden test ever runs. It waits in the interactive line, ahead of
 * AI learning checks and regrades, and gives up after `AI_HELP_CHECK_WAIT_MS`.
 */
export class AiHelpCheckRunner {
  private readonly logger = new Logger(AiHelpCheckRunner.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly grading: GradingService,
    private readonly capacity: ExecutionCapacity,
  ) {}

  async run(id: string): Promise<void> {
    const row = await this.prisma.aiHelpCheck.findUnique({
      where: { id }, select: { status: true, code: true, snapshot: true, materialId: true, createdAt: true },
    });
    if (!row || row.status !== "QUEUED") return;
    const release = await this.capacity.tryBackground(row.createdAt.getTime() + AI_HELP_CHECK_WAIT_MS);
    // Waited too long: the student was told the grader is busy.
    if (!release) return this.finish(id, ["QUEUED"], "ERRORED");
    try {
      const claimed = await this.prisma.aiHelpCheck.updateMany({ where: { id, status: "QUEUED" }, data: { status: "RUNNING", startedAt: new Date() } });
      if (!claimed.count) return;
      const parsed = practiceSnapshotSchema.safeParse(row.snapshot);
      if (!parsed.success || !parsed.data.courseId) return await this.finish(id, ["RUNNING"], "ERRORED");
      const snapshot = parsed.data;
      await this.grading.execute({
        ...snapshot, id, materialId: row.materialId, userId: NO_USER, courseId: snapshot.courseId!, code: row.code,
      }, async () => undefined, Date.now(), {
        complete: async (summary, cases) => {
          const results: AiHelpCheckCase[] = cases.map((item) => ({
            position: item.position,
            outcome: item.outcome,
            actualOutput: item.actualOutput === null ? null : clean(item.actualOutput).replace(/\r\n?/g, "\n").replace(/\s+$/u, "").slice(0, OUTPUT_MAX),
            outputDifference: item.outputDifference,
            errorType: item.pythonErrorType,
            errorMessage: item.pythonErrorMessage === null ? null : clean(item.pythonErrorMessage).slice(0, MESSAGE_MAX),
            errorLine: item.pythonErrorLine,
          }));
          await this.finish(id, ["RUNNING"], summary.status === "PASSED" ? "PASSED" : "FAILED", results, fingerprintOf(cases));
        },
        fail: async () => this.finish(id, ["RUNNING"], "ERRORED"),
      });
    } catch (error) {
      this.logger.warn(`AI help check ${id} failed: ${error instanceof Error ? error.message.slice(0, 200) : "unknown"}`);
      await this.finish(id, ["RUNNING"], "ERRORED");
    } finally {
      release();
    }
  }

  /** Ends a check the worker gave up on, so the API stops waiting for it. */
  async markFailed(id: string): Promise<void> {
    await this.finish(id, ["QUEUED", "RUNNING"], "ERRORED").catch(() => undefined);
  }

  private async finish(
    id: string, from: ("QUEUED" | "RUNNING")[], status: "PASSED" | "FAILED" | "ERRORED", results?: AiHelpCheckCase[], fingerprint?: string,
  ): Promise<void> {
    await this.prisma.aiHelpCheck.updateMany({
      where: { id, status: { in: from } },
      data: {
        status, finishedAt: new Date(),
        ...(results ? { results: results as unknown as Prisma.InputJsonArray } : {}),
        ...(fingerprint ? { fingerprint } : {}),
      },
    });
  }
}

/** PostgreSQL text cannot hold a NUL. */
const clean = (value: string) => value.replaceAll("\u0000", "");
