import type { ConfigService } from "@nestjs/config";

import type { ApiEnvironment } from "../config/env.schema.js";
import type { AiEffort } from "./ai-model.js";

/** The assistant's settings, read once per use so a test can change them. */
export function aiSettings(config: ConfigService<ApiEnvironment, true>) {
  const get = <K extends keyof ApiEnvironment>(key: K) => config.get(key, { infer: true }) as ApiEnvironment[K];
  return {
    help: {
      enabled: get("AI_ASSISTANT_ENABLED") === true,
      model: get("AI_ASSISTANT_MODEL"),
      effort: get("AI_ASSISTANT_EFFORT") as AiEffort,
      timeoutMs: get("AI_ASSISTANT_TIMEOUT_MS"),
      maxOutputTokens: get("AI_ASSISTANT_MAX_OUTPUT_TOKENS"),
      concurrency: get("AI_ASSISTANT_CONCURRENCY"),
      problemLimit: get("AI_ASSISTANT_PROBLEM_LIMIT"),
      dailyLimit: get("AI_ASSISTANT_DAILY_LIMIT"),
      budgetMicros: get("AI_ASSISTANT_MONTHLY_BUDGET_USD") * 1_000_000,
      price: { inputUsdPerMtok: get("AI_ASSISTANT_INPUT_USD_PER_MTOK"), outputUsdPerMtok: get("AI_ASSISTANT_OUTPUT_USD_PER_MTOK") },
      retentionDays: get("AI_HELP_RETENTION_DAYS"),
    },
    library: {
      enabled: get("AI_LIBRARY_ENABLED") === true,
      model: get("AI_LIBRARY_MODEL"),
      effort: get("AI_LIBRARY_EFFORT") as AiEffort,
      budgetMicros: get("AI_LIBRARY_MONTHLY_BUDGET_USD") * 1_000_000,
      price: { inputUsdPerMtok: get("AI_LIBRARY_INPUT_USD_PER_MTOK"), outputUsdPerMtok: get("AI_LIBRARY_OUTPUT_USD_PER_MTOK") },
      hours: get("AI_LIBRARY_HOURS"),
      quietMinutes: get("AI_LIBRARY_QUIET_MINUTES"),
      sendSolutions: get("AI_LIBRARY_SEND_SOLUTIONS") !== false,
    },
  };
}
export type AiSettings = ReturnType<typeof aiSettings>;

/** Whether Seoul's clock is inside `from-to`; `22-7` runs past midnight. */
export function withinHours(hours: string, now = new Date()): boolean {
  const [from, to] = hours.split("-").map(Number) as [number, number];
  if (from === to) return false;
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", hourCycle: "h23", hour: "2-digit" }).format(now));
  return from < to ? hour >= from && hour < to : hour >= from || hour < to;
}
