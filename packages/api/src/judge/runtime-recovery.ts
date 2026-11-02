import { RegradeRunner } from "./regrade.runner.js";
import type { PrismaService } from "../database/prisma.service.js";
import { frozenNativeDescriptor } from "./native-admission.js";
import { JudgeQueue, runtimeQueueName } from "./judge.queue.js";

/** A QUEUED row is durable dispatch intent, including a lost Redis acknowledgement. */
export class RuntimeRecovery {
  private runningCursor?: string;
  constructor(private readonly prisma: PrismaService, private readonly queue: JudgeQueue) {}
  async sweep() {
    const descriptor = this.queue.descriptor;
    const officialName = descriptor ? runtimeQueueName("official", descriptor) : null;
    const repairName = runtimeQueueName("regrade", descriptor);
    const practiceName = descriptor ? runtimeQueueName("practice", descriptor) : null;
    const family = descriptor ? { executionQueue: { in: [officialName!, repairName] } } : { OR: [{ executionQueue: null }, { executionQueue: repairName }] };
    const select = { id: true, status: true, executionRuntimeSnapshot: true, regradeRunId: true, startedAt: true } as const;
    // Queue repair cannot be starved by long healthy RUNNING jobs. Running pages rotate too.
    const [queued, running] = await Promise.all([
      this.prisma.submission.findMany({ where: { ...family, status: "QUEUED", createdAt: { lt: new Date(Date.now() - 30_000) } },
        take: 100, orderBy: { createdAt: "asc" }, select }),
      this.prisma.submission.findMany({ where: { ...family, status: "RUNNING", ...(this.runningCursor ? { id: { gt: this.runningCursor } } : {}) },
        take: 100, orderBy: { id: "asc" }, select }),
    ]);
    this.runningCursor = running.length === 100 ? running.at(-1)!.id : undefined;
    const rows = [...queued, ...running];
    for (const row of rows) {
      const runtime = frozenNativeDescriptor(row.executionRuntimeSnapshot);
      // A corrupt stored queue cannot authorize execution on another release.
      if (runtimeQueueName("official", runtime) !== runtimeQueueName("official", descriptor)) continue;
      const target = row.regradeRunId ? this.queue.regradeQueue : this.queue.queue;
      const jobId = row.regradeRunId ? `regrade-${row.regradeRunId}-${row.id}` : row.id;
      const job = await target.getJob(jobId);
      const state = await job?.getState();
      if (row.status === "RUNNING") {
        // BullMQ renews its lock while a healthy job runs; wall-clock age alone proves nothing.
        if (state === "active" || !row.startedAt || Date.now() - row.startedAt.getTime() < 60_000) continue;
        await this.prisma.submission.updateMany({ where: { id: row.id, status: "RUNNING", startedAt: row.startedAt },
          data: { status: "ERRORED", failureReason: "WORKER_LOST", gradedAt: new Date() } });
        if (row.regradeRunId) await new RegradeRunner(this.prisma).account({ runId: row.regradeRunId, submissionId: row.id, requestId: null });
        continue;
      }
      if (state === "failed") { await job!.retry(); continue; }
      if (job) continue;
      if (row.regradeRunId) await this.queue.enqueueRegrade({ runId: row.regradeRunId, submissionId: row.id, requestId: null });
      else await this.queue.enqueue(row.id);
    }
    const uncounted = await this.prisma.submission.findMany({
      where: { executionQueue: repairName, regradeRunId: { not: null }, regradeCountedAt: null,
        status: { in: ["PASSED", "FAILED", "ERRORED", "CANCELLED"] } },
      take: 100, select: { id: true, regradeRunId: true },
    });
    for (const row of uncounted) await new RegradeRunner(this.prisma).account({ runId: row.regradeRunId!, submissionId: row.id, requestId: null });
    const attempts = await this.prisma.staffPracticeAttempt.findMany({
      where: { executionQueue: practiceName, status: { in: ["QUEUED", "RUNNING"] }, createdAt: { lt: new Date(Date.now() - 30_000) } },
      take: 100, orderBy: { createdAt: "asc" }, select: { id: true, status: true, startedAt: true },
    });
    for (const row of attempts) {
      const job = await this.queue.practiceQueue.getJob(row.id);
      const state = await job?.getState();
      if (row.status === "QUEUED") {
        if (state === "failed") await job!.retry();
        else if (!job) await this.queue.enqueuePractice(row.id);
      } else if (state !== "active" && row.startedAt && Date.now() - row.startedAt.getTime() >= 60_000) {
        await this.prisma.staffPracticeAttempt.updateMany({ where: { id: row.id, status: "RUNNING", startedAt: row.startedAt },
          data: { status: "ERRORED", gradedAt: new Date() } });
      }
    }
  }
}
