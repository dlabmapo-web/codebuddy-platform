/**
 * A token bucket per socket per event family.
 *
 * Deliberately in memory and per connection: the cost being bounded here is
 * this process's CPU and this room's bandwidth, and a cross-instance counter
 * would add a Redis round trip to the hot path it is meant to protect. Durable
 * per-user limits stay with the HTTP endpoints that create durable state.
 */
export type RateLimitRule = {
  /** Burst size. */
  capacity: number;
  /** How long a full bucket takes to refill. */
  windowMs: number;
};

export class SocketRateLimiter {
  private readonly buckets = new Map<string, { tokens: number; updatedAt: number }>();

  constructor(private readonly rules: Record<string, RateLimitRule>) {}

  /**
   * Consumes one token, or refuses. A refusal is a dropped event and a metric,
   * never a disconnection on its own — an enthusiastic typist is not an
   * attacker, and repeated *invalid* payloads are handled separately.
   */
  take(key: string, now: number = Date.now()): boolean {
    const rule = this.rules[key];
    if (!rule) return true;
    const bucket = this.buckets.get(key) ?? {
      tokens: rule.capacity,
      updatedAt: now,
    };
    const refill =
      ((now - bucket.updatedAt) * rule.capacity) / rule.windowMs;
    const tokens = Math.min(rule.capacity, bucket.tokens + Math.max(0, refill));
    if (tokens < 1) {
      this.buckets.set(key, { tokens, updatedAt: now });
      return false;
    }
    this.buckets.set(key, { tokens: tokens - 1, updatedAt: now });
    return true;
  }

  clear(): void {
    this.buckets.clear();
  }
}

/**
 * Ceilings, not targets. Cursors and pointers are already coalesced client
 * side; these stop a modified client from turning one room into a fire hose.
 */
export const monitoringRateRules: Record<string, RateLimitRule> = {
  "class.join": { capacity: 10, windowMs: 60_000 },
  "student.watch.start": { capacity: 20, windowMs: 60_000 },
  "presence.publish": { capacity: 30, windowMs: 60_000 },
  "document.sync": { capacity: 30, windowMs: 60_000 },
  "document.update": { capacity: 240, windowMs: 60_000 },
  "awareness.update": { capacity: 900, windowMs: 60_000 },
  "run.activity": { capacity: 60, windowMs: 60_000 },
  "feedback.send": { capacity: 30, windowMs: 60_000 },
};

/** How many malformed payloads one socket may send before it is closed. */
export const invalidPayloadAllowance = 5;
