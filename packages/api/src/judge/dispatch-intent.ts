import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../database/prisma.service.js';
import type { JudgeQueue } from './judge.queue.js';

/** Database outbox. A lost queue reply leaves the intent retryable with the same job ID. */
export class DispatchIntentService {
  private recovering: Promise<void> | null = null;
  private flushing: Promise<number> | null = null;
  constructor(private readonly db: PrismaService, private readonly queue: JudgeQueue) {}
  async flush(limit = 100): Promise<number> {
    if (this.flushing) return this.flushing;
    this.flushing = this.dispatch(limit);
    try { return await this.flushing; } finally { this.flushing = null; }
  }
  async recoverLeased(ownedAttempts: ReadonlySet<string>): Promise<void> {
    if (this.recovering) return this.recovering;
    this.recovering = this.redeliverLeased(ownedAttempts);
    try { await this.recovering; } finally { this.recovering = null; }
  }
  private async redeliverLeased(ownedAttempts: ReadonlySet<string>) {
    const [submissions, practices] = await Promise.all([
      this.db.submission.findMany({ where: { status: 'RUNNING', executionGeneration: { not: null } }, select: { id: true, regradeRunId: true }, take: 100 }),
      this.db.staffPracticeAttempt.findMany({ where: { status: 'RUNNING', executionGeneration: { not: null } }, select: { id: true }, take: 100 }),
    ]);
    for (const row of submissions) {
      if (ownedAttempts.has(row.id)) continue;
      if (row.regradeRunId) await this.queue.enqueueRegrade({ submissionId: row.id, runId: row.regradeRunId, requestId: null });
      else await this.queue.enqueue(row.id);
    }
    for (const row of practices) if (!ownedAttempts.has(row.id)) await this.queue.enqueuePractice(row.id);
  }
  private async dispatch(limit: number): Promise<number> {
    const now = new Date();
    const rows = await this.db.gradingDispatchIntent.findMany({
      where: { dispatchedAt: null, nextAttemptAt: { lte: now }, OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }] },
      orderBy: [{ nextAttemptAt: 'asc' }, { id: 'asc' }], take: Math.min(100, limit),
      include: { submission: { select: { regradeRunId: true } } },
    });
    let sent = 0;
    for (const row of rows) {
      const leaseToken = randomUUID();
      const claimed = await this.db.gradingDispatchIntent.updateMany({
        where: { id: row.id, dispatchedAt: null, OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }] },
        data: { leaseToken, leaseExpiresAt: new Date(Date.now() + 30_000), dispatchAttempts: { increment: 1 } },
      });
      if (!claimed.count) continue;
      try {
        if (row.staffPracticeAttemptId) await this.queue.enqueuePractice(row.staffPracticeAttemptId);
        else if (row.submissionId && row.submission?.regradeRunId) await this.queue.enqueueRegrade({ submissionId: row.submissionId, runId: row.submission.regradeRunId, requestId: null });
        else if (row.submissionId) await this.queue.enqueue(row.submissionId);
        await this.db.gradingDispatchIntent.updateMany({ where: { id: row.id, leaseToken }, data: { dispatchedAt: new Date(), leaseToken: null, leaseExpiresAt: null } });
        sent++;
      } catch {
        await this.db.gradingDispatchIntent.updateMany({ where: { id: row.id, leaseToken }, data: { nextAttemptAt: new Date(Date.now() + 2_000), leaseToken: null, leaseExpiresAt: null } });
      }
    }
    return sent;
  }
}
