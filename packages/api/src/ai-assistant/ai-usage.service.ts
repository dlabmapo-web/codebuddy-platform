import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AcademyAiUsage } from "@cove/shared";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import type { ApiEnvironment } from "../config/env.schema.js";
import { PrismaService } from "../database/prisma.service.js";
import { Prisma } from "../generated/prisma/client.js";
import { aiSettings } from "./ai-settings.js";
import { AiModelClient } from "./ai-model.js";

type UsageRow = {
  campus: boolean;
  week: { replies: number; failed: number; rejected: number; reported: number; matched: number; p95: number | null; students: number };
  hidden: number;
  libraries: { state: AcademyAiUsage["libraries"][number]["state"]; count: number }[];
  months: { month: string; requests: number; cost: number | string }[];
  courses: { courseId: string; title: string; problems: number; ready: number; replies: number }[];
};

/**
 * How one campus uses the AI teacher, for its manager (the page moved from the
 * operator console to the campus, November 27, 2026). Counts and cost only,
 * never a student's code or words. One statement after the permission check.
 */
@Injectable()
export class AiUsageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademyAccessService,
    private readonly config: ConfigService<ApiEnvironment, true>,
    private readonly model: AiModelClient,
  ) {}

  async academy(identity: SupabaseIdentity, input: { academyId: string }): Promise<AcademyAiUsage> {
    await this.access.requirePermission(identity.authUserId, input.academyId, "academy.settings.manage");
    const settings = aiSettings(this.config);
    const academyId = input.academyId;
    const [row] = await this.prisma.$queryRaw<{ usage: UsageRow }[]>(Prisma.sql`
      WITH problems AS (
        SELECT pe.material_id, cm.course_id, c.title, c.ai_teacher_enabled AND pe.ai_feedback_enabled AS ai_on
        FROM courses c JOIN course_modules cm ON cm.course_id = c.id JOIN lectures l ON l.course_module_id = cm.id
        JOIN materials m ON m.lecture_id = l.id JOIN programming_exercises pe ON pe.material_id = m.id
        WHERE c.academy_id = ${academyId}::uuid
      ), week AS (
        SELECT * FROM ai_help_replies WHERE academy_id = ${academyId}::uuid AND created_at > now() - interval '7 days'
      )
      SELECT jsonb_build_object(
        'campus', EXISTS (SELECT 1 FROM academy_feature_flags f WHERE f.academy_id = ${academyId}::uuid AND f.feature = 'AI_ASSISTANT' AND f.is_enabled),
        'week', (SELECT jsonb_build_object(
            'replies', count(*) FILTER (WHERE status = 'DONE'), 'failed', count(*) FILTER (WHERE status = 'FAILED'),
            'rejected', count(*) FILTER (WHERE failure_code LIKE 'REJECTED%'), 'reported', count(*) FILTER (WHERE reported_at IS NOT NULL),
            'matched', count(*) FILTER (WHERE status = 'DONE' AND library_item_id IS NOT NULL), 'students', count(DISTINCT user_id),
            'p95', (percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE status = 'DONE'))::int) FROM week),
        'hidden', (SELECT count(*) FROM ai_library_items i JOIN problems p ON p.material_id = i.material_id
            WHERE i.state = 'HIDDEN' AND i.reject_reason = 'REPORTED'),
        'libraries', COALESCE((SELECT jsonb_agg(jsonb_build_object('state', x.state, 'count', x.count) ORDER BY x.state) FROM (
            SELECT lib.state, count(*)::int AS count FROM ai_libraries lib JOIN problems p ON p.material_id = lib.material_id
            WHERE p.ai_on GROUP BY lib.state) x), '[]'::jsonb),
        'months', COALESCE((SELECT jsonb_agg(jsonb_build_object('month', x.month, 'requests', x.requests, 'cost', x.cost) ORDER BY x.month DESC) FROM (
            SELECT to_char(created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM') AS month, count(*)::int AS requests, COALESCE(sum(cost_micros), 0) AS cost
            FROM ai_help_replies WHERE academy_id = ${academyId}::uuid AND cost_micros > 0 AND created_at > now() - interval '12 months'
            GROUP BY 1) x), '[]'::jsonb),
        'courses', COALESCE((SELECT jsonb_agg(jsonb_build_object('courseId', x.course_id, 'title', x.title, 'problems', x.problems, 'ready', x.ready, 'replies', x.replies)
            ORDER BY x.title, x.course_id) FROM (
            SELECT p.course_id, p.title, count(*) FILTER (WHERE p.ai_on)::int AS problems,
              count(*) FILTER (WHERE p.ai_on AND lib.state = 'READY')::int AS ready,
              (SELECT count(*)::int FROM week r JOIN problems q ON q.material_id = r.material_id WHERE q.course_id = p.course_id AND r.status = 'DONE') AS replies
            FROM problems p JOIN courses c ON c.id = p.course_id LEFT JOIN ai_libraries lib ON lib.material_id = p.material_id
            WHERE c.ai_teacher_enabled GROUP BY p.course_id, p.title) x), '[]'::jsonb)
      ) AS usage`);
    const usage = row!.usage;
    return {
      enabled: {
        campus: usage.campus, help: settings.help.enabled && this.model.available, library: settings.library.enabled && this.model.available,
        model: settings.help.model, libraryModel: settings.library.model,
      },
      problemLimit: settings.help.problemLimit,
      dailyLimit: settings.help.dailyLimit,
      helpBudgetUsd: settings.help.budgetMicros / 1_000_000,
      months: usage.months.map((month) => ({ month: month.month, requests: month.requests, costUsd: Number(month.cost) / 1_000_000 })),
      libraries: usage.libraries,
      last7Days: {
        replies: usage.week.replies, failed: usage.week.failed, rejected: usage.week.rejected, reported: usage.week.reported,
        matched: usage.week.matched, p95Ms: usage.week.p95, students: usage.week.students,
      },
      hiddenItems: usage.hidden,
      courses: usage.courses,
    };
  }
}
