import { academyLocalDate } from "@cove/shared";

import type { AiUsageKind, Prisma } from "../generated/prisma/client.js";
import type { AiUsage } from "./ai-model.js";

/** The first day of this month in Seoul, as the usage table keys it. */
export function usageMonth(now = new Date()): string {
  return `${academyLocalDate(now).slice(0, 7)}-01`;
}

/** OpenAI's Fast mode costs twice the standard rate, input and output alike. */
const FAST_PRICE_FACTOR = 2;

/** Millionths of a dollar, rounded up so a limit is never undercounted. The prices are standard-tier prices. */
export function costMicros(
  usage: AiUsage,
  price: { inputUsdPerMtok: number; outputUsdPerMtok: number },
): number {
  const factor = usage.serviceTier === "fast" ? FAST_PRICE_FACTOR : 1;
  return Math.ceil((usage.inputTokens * price.inputUsdPerMtok + usage.outputTokens * price.outputUsdPerMtok) * factor);
}

export async function readMonthCost(
  db: Pick<Prisma.TransactionClient, "$queryRaw">,
  kind: AiUsageKind,
  now = new Date(),
): Promise<number> {
  const [row] = await db.$queryRaw<{ cost: bigint }[]>`
    SELECT cost_micros AS cost FROM ai_usage_months
    WHERE month = ${usageMonth(now)}::date AND kind = ${kind}::"AiUsageKind"`;
  return Number(row?.cost ?? 0);
}

/** One paid call, added to its month in one statement. */
export async function recordUsage(
  db: Pick<Prisma.TransactionClient, "$executeRaw">,
  kind: AiUsageKind,
  usage: { inputTokens: number; outputTokens: number; costMicros: number },
  now = new Date(),
): Promise<void> {
  await db.$executeRaw`
    INSERT INTO ai_usage_months AS u (month, kind, requests, input_tokens, output_tokens, cost_micros)
    VALUES (${usageMonth(now)}::date, ${kind}::"AiUsageKind", 1, ${usage.inputTokens}, ${usage.outputTokens}, ${usage.costMicros})
    ON CONFLICT (month, kind) DO UPDATE SET requests = u.requests + 1,
      input_tokens = u.input_tokens + EXCLUDED.input_tokens,
      output_tokens = u.output_tokens + EXCLUDED.output_tokens,
      cost_micros = u.cost_micros + EXCLUDED.cost_micros`;
}
