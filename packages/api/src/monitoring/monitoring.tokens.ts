import type { Redis } from "ioredis";

/**
 * The monitoring Redis handle, injected rather than constructed so the module
 * resolves to `null` without a configured Redis and every ordinary read keeps
 * working. Realtime then reports itself degraded instead of pretending a
 * single node is the whole cluster.
 */
export const MONITORING_REDIS = Symbol("MONITORING_REDIS");

export type MonitoringRedis = Redis | null;

/** One namespace for every monitoring key, separate from the grading queue. */
export const monitoringKeyPrefix = "cove:mon:";
