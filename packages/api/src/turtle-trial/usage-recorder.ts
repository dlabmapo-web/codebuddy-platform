import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { TURTLE_USAGE_RETENTION_DAYS } from '@cove/shared';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma.service.js';
import type { TrialGrant } from './trial-store.js';

export const usageFlushMs = 15_000;
export const usageBufferLimit = 20_000;
export const usageBatchRows = 500;
const purgeMs = 24 * 3_600_000;
type Usage = { academyId: string; hour: number; device: string; entries: number; runs: number; seenAt: number };

/**
 * Who used public Turtle, counted without knowing who they are.
 *
 * Counts wait in memory and are written in batches, so a student's entry or
 * drawing never waits for, or fails on, a statement. Kept out of Redis on
 * purpose: it is `noeviction` and shared with grading.
 */
@Injectable()
export class TurtleUsageRecorder implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TurtleUsageRecorder.name);
  private pending = new Map<string, Usage>();
  private flushing: Promise<void> | null = null;
  private timer?: ReturnType<typeof setInterval>;
  private purgedAt = 0;
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), usageFlushMs);
    this.timer.unref?.();
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.flushing;
    await this.flush();
  }

  /** A grant without an academy came from the old shared code, which belongs to no campus. */
  record(grant: Pick<TrialGrant, 'academyId' | 'device' | 'hash'>, kind: 'entry' | 'run' | 'seen', now = Date.now()) {
    if (!grant.academyId) return;
    this.add({ academyId: grant.academyId, device: (grant.device || grant.hash).slice(0, 32), hour: Math.floor(now / 3_600_000) * 3_600_000,
      entries: kind === 'entry' ? 1 : 0, runs: kind === 'run' ? 1 : 0, seenAt: now });
  }
  private add(usage: Usage) {
    const key = usage.academyId + ':' + usage.hour + ':' + usage.device;
    const row = this.pending.get(key);
    if (row) {
      row.entries += usage.entries; row.runs += usage.runs; row.seenAt = Math.max(row.seenAt, usage.seenAt);
    } else if (this.pending.size < usageBufferLimit) this.pending.set(key, { ...usage });
  }

  private async tick() {
    await this.flush();
    if (Date.now() - this.purgedAt < purgeMs) return;
    this.purgedAt = Date.now();
    try {
      await this.prisma.turtleUsageHour.deleteMany({ where: { hour: { lt: new Date(Date.now() - TURTLE_USAGE_RETENTION_DAYS * 86_400_000) } } });
    } catch (error) { this.logger.warn(`usage purge failed: ${String(error)}`); }
  }
  /** One write at a time; what a failed batch held is counted again next time. */
  flush(): Promise<void> {
    return this.flushing ??= this.write().finally(() => { this.flushing = null; });
  }
  private async write() {
    if (!this.pending.size) return;
    // Sorted, so two API processes lock shared rows in the same order.
    const rows = [...this.pending].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, row]) => row);
    this.pending = new Map();
    for (let i = 0; i < rows.length; i += usageBatchRows) {
      const batch = rows.slice(i, i + usageBatchRows);
      try { await this.insert(batch); }
      catch (error) {
        this.logger.warn(`usage write failed, will retry: ${String(error)}`);
        for (const row of rows.slice(i)) this.add(row);
        return;
      }
    }
  }
  private async insert(batch: Usage[]) {
    // The join drops rows of an academy deleted meanwhile, rather than failing the batch.
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO turtle_usage_hours AS saved (academy_id, hour, device_hash, entries, runs, last_seen_at)
      SELECT a.id, v.hour::timestamptz, v.device, v.entries::int, v.runs::int, v.seen::timestamptz
      FROM (VALUES ${Prisma.join(batch.map((row) => Prisma.sql`(${row.academyId}::uuid, ${new Date(row.hour)}::timestamptz, ${row.device}::text, ${row.entries}::int, ${row.runs}::int, ${new Date(row.seenAt)}::timestamptz)`))})
        AS v(academy_id, hour, device, entries, runs, seen)
      JOIN academies a ON a.id = v.academy_id
      ORDER BY a.id, v.hour, v.device
      ON CONFLICT (academy_id, hour, device_hash) DO UPDATE SET
        entries = saved.entries + EXCLUDED.entries,
        runs = saved.runs + EXCLUDED.runs,
        last_seen_at = GREATEST(saved.last_seen_at, EXCLUDED.last_seen_at)`);
  }
}
