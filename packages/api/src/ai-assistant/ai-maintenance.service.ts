import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { ApiEnvironment } from "../config/env.schema.js";
import { PrismaService } from "../database/prisma.service.js";
import { aiSettings } from "./ai-settings.js";

const INTERVAL_MS = 6 * 3_600_000;
const BATCH = 2_000;

/** Removes what is past its time, in bounded batches. Runs whether or not AI is on. */
@Injectable()
export class AiMaintenanceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiMaintenanceService.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService<ApiEnvironment, true>) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.run().catch(() => this.logger.warn("AI cleanup failed")), INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async run(): Promise<{ replies: number; checks: number; items: number; helpChecks: number }> {
    const days = aiSettings(this.config).help.retentionDays;
    const replies = await this.prisma.$executeRaw`
      DELETE FROM ai_help_replies WHERE id IN (
        SELECT id FROM ai_help_replies WHERE created_at < now() - make_interval(days => ${days}::int) LIMIT ${BATCH})`;
    const checks = await this.prisma.$executeRaw`
      DELETE FROM ai_library_checks WHERE id IN (
        SELECT k.id FROM ai_library_checks k JOIN ai_libraries lib ON lib.material_id = k.material_id
        WHERE k.finished_at < now() - interval '7 days' AND lib.state NOT IN ('CHECKING', 'REVIEWING') LIMIT ${BATCH})`;
    // A student's example check goes with its answers; one with none after a
    // day only saved running the same code twice, and has done that job.
    const helpChecks = await this.prisma.$executeRaw`
      DELETE FROM ai_help_checks WHERE id IN (
        SELECT k.id FROM ai_help_checks k
        WHERE k.created_at < now() - make_interval(days => ${days}::int)
           OR (k.created_at < now() - interval '1 day' AND NOT EXISTS (SELECT 1 FROM ai_help_replies r WHERE r.check_id = k.id))
        LIMIT ${BATCH})`;
    // Kept while a reply of the last month names it, so its counts stay true.
    const items = await this.prisma.$executeRaw`
      DELETE FROM ai_library_items WHERE id IN (
        SELECT i.id FROM ai_library_items i WHERE i.state = 'REJECTED' AND i.updated_at < now() - interval '30 days'
          AND NOT EXISTS (SELECT 1 FROM ai_help_replies r WHERE r.library_item_id = i.id AND r.created_at > now() - interval '30 days') LIMIT ${BATCH})`;
    return { replies, checks, items, helpChecks };
  }
}
