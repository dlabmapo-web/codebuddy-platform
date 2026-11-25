import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { PlatformAiUsage } from "@cove/shared";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { PlatformAccessService } from "../authorization/platform-access.service.js";
import type { ApiEnvironment } from "../config/env.schema.js";
import { PrismaService } from "../database/prisma.service.js";
import { aiSettings } from "./ai-settings.js";
import { AiModelClient } from "./ai-model.js";

/** What the assistant costs and how it behaves, for operators. Counts only. */
@Injectable()
export class AiUsageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PlatformAccessService,
    private readonly config: ConfigService<ApiEnvironment, true>,
    private readonly model: AiModelClient,
  ) {}

  async platform(identity: SupabaseIdentity): Promise<PlatformAiUsage> {
    await this.access.requirePermission(identity.authUserId, "platform.analytics.read");
    const settings = aiSettings(this.config);
    const [months, [week], libraries, academies] = await Promise.all([
      this.prisma.aiUsageMonth.findMany({ orderBy: [{ month: "desc" }, { kind: "asc" }], take: 12 }),
      this.prisma.$queryRaw<{ replies: number; failed: number; rejected: number; reported: number; matched: number; p95: number | null; students: number; hidden: number }[]>`
        SELECT count(*) FILTER (WHERE status = 'DONE')::int AS replies, count(*) FILTER (WHERE status = 'FAILED')::int AS failed,
          count(*) FILTER (WHERE failure_code LIKE 'REJECTED%')::int AS rejected, count(*) FILTER (WHERE reported_at IS NOT NULL)::int AS reported,
          count(*) FILTER (WHERE status = 'DONE' AND library_item_id IS NOT NULL)::int AS matched, count(DISTINCT user_id)::int AS students,
          (percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE status = 'DONE'))::int AS p95,
          (SELECT count(*)::int FROM ai_library_items WHERE state = 'HIDDEN' AND reject_reason = 'REPORTED') AS hidden
        FROM ai_help_replies WHERE created_at > now() - interval '7 days'`,
      this.prisma.aiLibrary.groupBy({ by: ["state"], _count: { _all: true } }),
      this.prisma.$queryRaw<{ academy_id: string; name: string; replies: number; students: number }[]>`
        SELECT a.id AS academy_id, a.name, count(r.id)::int AS replies, count(DISTINCT r.user_id)::int AS students
        FROM academy_feature_flags f JOIN academies a ON a.id = f.academy_id
        LEFT JOIN ai_help_replies r ON r.academy_id = a.id AND r.status = 'DONE' AND r.created_at > now() - interval '7 days'
        WHERE f.feature = 'AI_ASSISTANT' AND f.is_enabled GROUP BY a.id, a.name ORDER BY replies DESC, a.name LIMIT 100`,
    ]);
    return {
      enabled: {
        help: settings.help.enabled, library: settings.library.enabled, key: this.model.available,
        model: settings.help.model, libraryModel: settings.library.model,
      },
      budgetUsd: { help: settings.help.budgetMicros / 1_000_000, library: settings.library.budgetMicros / 1_000_000 },
      months: months.map((row) => ({
        month: row.month.toISOString().slice(0, 7), kind: row.kind, requests: row.requests,
        inputTokens: Number(row.inputTokens), outputTokens: Number(row.outputTokens), costUsd: Number(row.costMicros) / 1_000_000,
      })),
      libraries: libraries.map((row) => ({ state: row.state, count: row._count._all })),
      last7Days: {
        replies: week?.replies ?? 0, failed: week?.failed ?? 0, rejected: week?.rejected ?? 0, reported: week?.reported ?? 0,
        matched: week?.matched ?? 0, p95Ms: week?.p95 ?? null, students: week?.students ?? 0,
      },
      hiddenItems: week?.hidden ?? 0,
      academies: academies.map((row) => ({ academyId: row.academy_id, name: row.name, replies: row.replies, students: row.students })),
    };
  }
}
