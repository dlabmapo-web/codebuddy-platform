import { Logger } from "@nestjs/common";

import { AuditService } from "../academies/audit.service.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { GradingService } from "./grading.service.js";
import type { RegradeJob } from "./judge.queue.js";

/**
 * One repair, graded and then counted against its run.
 *
 * Lives in the judge because that is where the work happens, and stays a thin
 * wrapper because the grading itself is `GradingService.grade` unchanged — a
 * repair is an ordinary submission that happens to carry `regradeRunId`, and
 * the judge deliberately does not know it is special. Everything that differs
 * is decided by that column downstream: `nextProgress` leaves the attempt count
 * alone, and every history a person reads filters it out.
 *
 * What this class adds is the run's accounting. A queue knows a job finished;
 * it does not know that forty-six others belong to the same operator's button
 * press, or that the press is now done.
 */
export class RegradeRunner {
  private readonly logger = new Logger(RegradeRunner.name);
  private readonly audit = new AuditService();

  constructor(
    private readonly prisma: PrismaService,
    private readonly grading: GradingService,
  ) {}

  async run(job: RegradeJob): Promise<void> {
    const trace = job.requestId ?? "-";
    this.logger.log(
      `[${trace}] regrade ${job.runId}: grading ${job.submissionId}`,
    );

    await this.grading.grade(job.submissionId, async () => {
      // A repair has nobody watching it. The live path streams per-case
      // progress to the student who is waiting; here the run's counters are
      // the only progress anybody reads.
    });

    const settled = await this.prisma.submission.findUnique({
      where: { id: job.submissionId },
      select: { status: true },
    });
    // ERRORED and CANCELLED are judge faults, and a repair that hit one has not
    // repaired anything — it counts against the run so the operator sees that
    // the number they were promised was not reached.
    const failed =
      !settled || settled.status === "ERRORED" || settled.status === "CANCELLED";

    await this.prisma.platformOperationRun.update({
      where: { id: job.runId },
      data: failed
        ? { failedCount: { increment: 1 } }
        : { completedCount: { increment: 1 } },
    });

    await this.settleIfDone(job, trace);
  }

  /**
   * Marks the run finished, once — and only once.
   *
   * Two guards, and both are needed. `dispatchedCount === plannedCount` waits
   * for the API to finish handing out the work: repairs are written in chunks,
   * and without this a run whose first chunk graded quickly would report itself
   * complete while the second chunk was still being created. The `status:
   * "RUNNING"` filter on `updateMany` is what makes the write itself the
   * election — several workers can settle their last job at the same instant,
   * and exactly one of them changes a row.
   */
  private async settleIfDone(job: RegradeJob, trace: string): Promise<void> {
    const run = await this.prisma.platformOperationRun.findUnique({
      where: { id: job.runId },
      select: {
        academyId: true,
        actorUserId: true,
        targetId: true,
        requestId: true,
        supportGrantId: true,
        plannedCount: true,
        dispatchedCount: true,
        completedCount: true,
        failedCount: true,
      },
    });
    if (!run) return;
    if (run.dispatchedCount !== run.plannedCount) return;
    if (run.completedCount + run.failedCount < run.dispatchedCount) return;

    const claimed = await this.prisma.platformOperationRun.updateMany({
      where: { id: job.runId, status: "RUNNING" },
      data: { status: "COMPLETED", finishedAt: new Date() },
    });
    if (claimed.count === 0) return;

    this.logger.log(
      `[${trace}] regrade ${job.runId}: complete — ${run.completedCount} repaired, ${run.failedCount} failed`,
    );

    // The judge is outside a request, so `currentSupportGrantId()` is empty
    // here by design. The grant was copied onto the run at dispatch precisely
    // so this row can carry it: without it, an operator working under support
    // access would have their dispatch attributed and their completion not.
    await this.prisma.$transaction((tx) =>
      this.audit.write(tx, {
        actorUserId: run.actorUserId,
        academyId: run.academyId,
        action: "platform.regrade.completed",
        targetType: "material",
        targetId: run.targetId,
        after: {
          runId: job.runId,
          completed: run.completedCount,
          failed: run.failedCount,
        },
        requestId: run.requestId ?? undefined,
        supportGrantId: run.supportGrantId ?? undefined,
      }),
    );
  }
}
