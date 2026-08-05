import { Injectable } from "@nestjs/common";

/**
 * Bounded operational counters.
 *
 * Counts and durations only, keyed by fixed names and public reason codes.
 * There is deliberately no per-student or per-class label: a metric that
 * carried one would turn a dashboard into a directory of who was being watched
 * and grow without limit at the same time.
 */

export type MonitoringCounter =
  | "socket.connected"
  | "socket.rejected"
  | "class.joined"
  | "class.join.denied"
  | "watch.started"
  | "watch.denied"
  | "watch.replaced"
  | "document.update.applied"
  | "document.update.rejected"
  | "document.resync"
  | "document.flush.failed"
  | "feedback.created"
  | "feedback.idempotent"
  | "feedback.failed"
  | "revocation.applied"
  | "presence.degraded"
  | "payload.rejected"
  | "rate.limited";

@Injectable()
export class MonitoringMetricsService {
  private readonly counters = new Map<string, number>();
  private readonly durations = new Map<string, { count: number; totalMs: number }>();

  increment(counter: MonitoringCounter, by = 1): void {
    this.counters.set(counter, (this.counters.get(counter) ?? 0) + by);
  }

  /** Reason strings are public error codes, which are a closed set. */
  incrementWithReason(counter: MonitoringCounter, reason: string): void {
    const key = `${counter}:${reason}`;
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);
  }

  observe(name: string, durationMs: number): void {
    const current = this.durations.get(name) ?? { count: 0, totalMs: 0 };
    this.durations.set(name, {
      count: current.count + 1,
      totalMs: current.totalMs + durationMs,
    });
  }

  snapshot(): {
    counters: Record<string, number>;
    durations: Record<string, { count: number; averageMs: number }>;
  } {
    return {
      counters: Object.fromEntries(this.counters),
      durations: Object.fromEntries(
        [...this.durations].map(([name, value]) => [
          name,
          {
            count: value.count,
            averageMs: value.count === 0 ? 0 : value.totalMs / value.count,
          },
        ]),
      ),
    };
  }
}
