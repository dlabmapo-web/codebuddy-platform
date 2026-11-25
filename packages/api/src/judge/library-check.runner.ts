import { fingerprintOf } from "../ai-assistant/fingerprint.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { GradingService } from "./grading.service.js";
import { practiceSnapshotSchema } from "./practice-snapshot.js";

/** Nobody's id: a check belongs to a problem, and its sink writes no one's work. */
const NO_USER = "00000000-0000-0000-0000-000000000000";
const OUTPUT_MAX = 1_000;

/**
 * Runs one program of an AI library with the exercise's real tests.
 *
 * The same evaluator as Submit, through a sink with no student writes: no
 * submission, attempt, points or progress. Kept: a verdict, what public
 * cases printed, and the pass or fail of every case in order (its
 * fingerprint), which names no hidden input or output.
 */
export class LibraryCheckRunner {
  constructor(private readonly prisma: PrismaService, private readonly grading: GradingService) {}

  async run(id: string): Promise<void> {
    const claimed = await this.prisma.aiLibraryCheck.updateMany({
      where: { id, status: "QUEUED" }, data: { status: "RUNNING", startedAt: new Date() },
    });
    if (!claimed.count) return;
    const row = await this.prisma.aiLibraryCheck.findUnique({ where: { id }, select: { materialId: true, code: true, snapshot: true } });
    // The exercise went while the program waited: there is nothing to record.
    if (!row) return;
    const parsed = practiceSnapshotSchema.safeParse(row.snapshot);
    if (!parsed.success || !parsed.data.courseId) return this.finish(id, "ERRORED");
    const snapshot = parsed.data;
    await this.grading.execute({
      ...snapshot, id, materialId: row.materialId, userId: NO_USER, courseId: parsed.data.courseId, code: row.code,
    }, async () => undefined, Date.now(), {
      complete: async (summary, cases) => this.finish(id, summary.status === "PASSED" ? "PASSED" : "FAILED", fingerprintOf(cases),
        Object.fromEntries(cases
          .filter((item) => item.isSample && item.actualOutput !== null && (item.outcome === "WRONG_OUTPUT" || item.outcome === "PASSED" || item.outcome === "PASSED_WITH_WARNING"))
          .map((item) => [String(item.position), item.actualOutput!.replaceAll("\u0000", "").replace(/\r\n?/g, "\n").replace(/\s+$/u, "").slice(0, OUTPUT_MAX)]))),
      fail: async () => this.finish(id, "ERRORED"),
    });
  }

  private async finish(id: string, status: "PASSED" | "FAILED" | "ERRORED", fingerprint?: string, publicOutputs?: Prisma.InputJsonObject): Promise<void> {
    await this.prisma.aiLibraryCheck.updateMany({
      where: { id, status: "RUNNING" },
      data: { status, finishedAt: new Date(), ...(fingerprint ? { fingerprint } : {}), ...(publicOutputs ? { publicOutputs } : {}) },
    });
  }
}
