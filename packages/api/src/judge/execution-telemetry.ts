import { z } from "zod";
import { AsyncLocalStorage } from "node:async_hooks";

export const executionStages = ["acquire", "prepare", "execute", "exit", "drain", "cleanup", "identity", "claim", "load", "engine", "compare", "comparator_acquire", "comparator_execute", "report", "commit", "grading", "service", "queue"] as const;
export type ExecutionStage = typeof executionStages[number];
export const executionKinds = ["sandbox", "official", "practice", "sample", "regrade"] as const;
export type ExecutionKind = typeof executionKinds[number];
const caseBuckets = ["unknown", "1", "2_5", "6_10", "11_50"] as const;
type CaseBucket = typeof caseBuckets[number];
const context = new AsyncLocalStorage<{ kind: ExecutionKind; cases: CaseBucket; jobId?: string }>();
export const withExecutionKind = <T>(kind: ExecutionKind, action: () => Promise<T>, jobId?: string) => context.run({ kind, cases: "unknown", jobId }, action);
/** Opaque job IDs are for restricted logs only; never copied into histograms. */
export function executionLogContext() {
  const value = context.getStore();
  return { kind: value?.kind ?? "sandbox", cases: value?.cases ?? "unknown", ...(value?.jobId ? { jobId: value.jobId } : {}) };
}
export const withExecutionCaseCount = <T>(count: number, action: () => Promise<T>) => context.run({
  kind: context.getStore()?.kind ?? "sandbox", jobId: context.getStore()?.jobId,
  cases: count < 1 || count > 50 ? "unknown" : count === 1 ? "1" : count <= 5 ? "2_5" : count <= 10 ? "6_10" : "11_50",
}, action);
export const durationBuckets = [.01, .025, .05, .1, .25, .5, 1, 1.5, 2, 4, 8, 15, 30, 60, 300] as const;
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const duration = z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER);
const observationSchema = z.object({
  stage: z.enum(executionStages), kind: z.enum(executionKinds), cases: z.enum(caseBuckets).default("unknown"), count,
  sum: duration, buckets: z.array(count).length(durationBuckets.length),
});

/** Fixed fields only. No source, output, identities or arbitrary metric labels. */
export const executionDiagnosticsSchema = z.object({
  version: z.literal(1), generation: z.uuid(),
  pool: z.object({
    capacity: count.max(64), spare: count.max(64), executing: count.max(128),
    idle: count.max(128), warming: count.max(128), draining: count.max(128), waiting: count,
    oldestWaitMs: duration, oldestWarmMs: duration, retryExhausted: z.boolean(),
    lastCompletedAgoMs: duration.nullable(),
  }),
  resources: z.object({
    cpuQuota: duration.nullable(), periods: count.nullable(), throttledPeriods: count.nullable(),
    throttledSeconds: duration.nullable(), cpuPressure: duration.nullable(),
    memoryBytes: count.nullable(), memoryPeakBytes: count.nullable(), memoryLimitBytes: count.nullable(),
    oom: count.nullable(), oomKill: count.nullable(), tasks: count.nullable(),
    eventLoopP95Ms: duration.nullable(),
  }),
  timings: z.array(observationSchema).max(executionStages.length * executionKinds.length * caseBuckets.length),
  failures: z.object({ prepare: count, drainFallback: count, forcedTermination: count }),
});
export type ExecutionDiagnostics = z.infer<typeof executionDiagnosticsSchema>;
export type TimingSnapshot = z.infer<typeof observationSchema>;

export class ExecutionTelemetry {
  private readonly observations = new Map<string, TimingSnapshot>();
  readonly failures = { prepare: 0, drainFallback: 0, forcedTermination: 0 };
  observe(stage: ExecutionStage, ms: number, kind: ExecutionKind = context.getStore()?.kind ?? "sandbox", cases: CaseBucket = context.getStore()?.cases ?? "unknown") {
    if (!executionStages.includes(stage) || !executionKinds.includes(kind) || !Number.isFinite(ms) || ms < 0) return;
    const key = `${stage}:${kind}:${cases}`;
    const value = this.observations.get(key) ?? { stage, kind, cases, count: 0, sum: 0, buckets: durationBuckets.map(() => 0) };
    value.count++; value.sum += ms / 1000;
    durationBuckets.forEach((bound, index) => { if (ms / 1000 <= bound) value.buckets[index]++; });
    this.observations.set(key, value);
  }
  async time<T>(stage: ExecutionStage, action: () => Promise<T>, kind: ExecutionKind = context.getStore()?.kind ?? "sandbox"): Promise<T> {
    const began = performance.now();
    try { return await action(); } finally { this.observe(stage, performance.now() - began, kind); }
  }
  snapshot(): TimingSnapshot[] {
    return [...this.observations.values()].map(value => ({ ...value, buckets: [...value.buckets] }));
  }
}

export function renderExecutionTimings(timings: TimingSnapshot[], component: "judge" | "sandbox") {
  return timings.flatMap(value => {
    const labels = `component="${component}",stage="${value.stage}",kind="${value.kind}",cases="${value.cases}"`;
    return [
      ...durationBuckets.map((bound, index) => `cove_judge_stage_seconds_bucket{${labels},le="${bound}"} ${value.buckets[index]}`),
      `cove_judge_stage_seconds_bucket{${labels},le="+Inf"} ${value.count}`,
      `cove_judge_stage_seconds_count{${labels}} ${value.count}`,
      `cove_judge_stage_seconds_sum{${labels}} ${value.sum}`,
    ];
  }).join("\n");
}
