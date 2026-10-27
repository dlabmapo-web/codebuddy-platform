import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { JudgeReadiness } from "./judge-readiness.js";
import { executionDiagnosticsSchema, ExecutionTelemetry, withExecutionKind, withExecutionCaseCount, renderExecutionTimings } from "./execution-telemetry.js";
import { sandboxResources } from "./sandbox-resources.js";
import { createServer } from "node:net";
import { startJudgeMonitor } from "./judge-monitor.js";
import { vi } from "vitest";
import type { ExecutionDiagnostics } from "./execution-telemetry.js";

export function diagnostics(pool: Partial<ExecutionDiagnostics["pool"]> = {}): ExecutionDiagnostics {
  return { version: 1, generation: randomUUID(), pool: { capacity: 2, spare: 1, executing: 0, idle: 3, warming: 0,
    draining: 0, waiting: 0, oldestWaitMs: 0, oldestWarmMs: 0, retryExhausted: false, lastCompletedAgoMs: null, ...pool },
    resources: sandboxResources(null, () => { throw new Error("unavailable"); }), timings: [],
    failures: { prepare: 0, drainFallback: 0, forcedTermination: 0 } };
}
describe("judge scheduling readiness", () => {
  it("does not overlap stalled queue diagnostics or make a healthy runtime unready", async () => {
    vi.useFakeTimers();
    const queues = vi.fn(() => new Promise<never>(() => {}));
    const monitor = startJudgeMonitor({ port: 0, bind: "127.0.0.1", guard: false, telemetry: new ExecutionTelemetry(),
      workers: [], diagnostics: async () => diagnostics(), queues });
    try {
      await vi.advanceTimersByTimeAsync(20000);
      expect(queues).toHaveBeenCalledTimes(1);
      expect(monitor.readiness.state().ready).toBe(true);
    } finally { await monitor.close(); vi.useRealTimers(); }
  });
  it("keeps liveness independent, authenticates read-only metrics and guards all queues only when enabled", async () => {
    const reservation = createServer();
    await new Promise<void>(resolve => reservation.listen(0, "127.0.0.1", resolve));
    const address = reservation.address(); if (!address || typeof address === "string") throw new Error("No test port");
    await new Promise<void>(resolve => reservation.close(() => resolve()));
    const workers = Array.from({ length: 4 }, () => ({ pause: vi.fn(async () => {}), resume: vi.fn(), client: Promise.resolve({ status: "ready" }) }));
    let current = diagnostics();
    const monitor = startJudgeMonitor({ port: address.port, bind: "127.0.0.1", secret: "m".repeat(32), guard: true,
      telemetry: new ExecutionTelemetry(), workers, diagnostics: async () => current });
    const url = `http://127.0.0.1:${address.port}`;
    try {
      await monitor.refresh(); expect(workers.every(worker => worker.pause.mock.calls.length === 0)).toBe(true);
      current = diagnostics({ retryExhausted: true }); await monitor.refresh();
      expect(workers.every(worker => worker.pause.mock.calls.length === 1)).toBe(true);
      expect((await fetch(url + "/health")).status).toBe(200);
      expect((await fetch(url + "/ready")).status).toBe(503);
      expect((await fetch(url + "/metrics")).status).toBe(401);
      const metrics = await fetch(url + "/metrics", { headers: { Authorization: "Bearer " + "m".repeat(32) } });
      expect(metrics.status).toBe(200); expect(await metrics.text()).not.toContain(current.generation);
      expect((await fetch(url + "/health", { method: "POST" })).status).toBe(405);
      expect((await fetch(url + "/sessions")).status).toBe(404);
      current = diagnostics();
      await monitor.refresh(); await monitor.refresh();
      expect(workers.every(worker => worker.resume.mock.calls.length === 0)).toBe(true);
      await monitor.refresh(); expect(workers.every(worker => worker.resume.mock.calls.length === 1)).toBe(true);
    } finally { await monitor.close(); }
  });
  it("does not activate admission guards against legacy peers", () => {
    const ready = new JudgeReadiness(); ready.update(undefined, true);
    expect(ready.state()).toMatchObject({ ready: false, reason: "unavailable", supported: false });
    expect(ready.shouldPause()).toBe(false);
  });
  it("distinguishes legitimate busy work and bounded replacement from starvation", () => {
    const ready = new JudgeReadiness();
    ready.update(diagnostics({ executing: 2, idle: 0, waiting: 1, oldestWaitMs: 60000 }), true);
    expect(ready.state().ready).toBe(true);
    ready.update(diagnostics({ idle: 0, warming: 1, waiting: 1, oldestWaitMs: 10000, oldestWarmMs: 12000 }), true);
    expect(ready.state().ready).toBe(true);
    ready.update(diagnostics({ idle: 0, warming: 1, waiting: 1, oldestWaitMs: 10000, oldestWarmMs: 31000 }), true);
    expect(ready.state().reason).toBe("starved");
  });
  it("requires three healthy samples after degradation and fails on stale/Redis health", () => {
    let now = 0; const ready = new JudgeReadiness(() => now);
    ready.update(diagnostics({ retryExhausted: true }), true);
    expect(ready.shouldPause()).toBe(true);
    for (let i = 0; i < 2; i++) { ready.update(diagnostics(), true); expect(ready.shouldPause()).toBe(true); }
    ready.update(diagnostics(), true); expect(ready.shouldPause()).toBe(false);
    now += 15001; expect(ready.state().reason).toBe("stale"); expect(ready.shouldPause()).toBe(true);
    ready.update(diagnostics(), false); expect(ready.state().reason).toBe("redis");
  });
});
describe("bounded execution telemetry", () => {
  it("retains independent concurrent contexts and excludes contents/identifiers", async () => {
    const telemetry = new ExecutionTelemetry();
    await Promise.all([withExecutionKind("official", () => withExecutionCaseCount(10, async () => { await Promise.resolve(); telemetry.observe("engine", 10); })),
      withExecutionKind("practice", () => withExecutionCaseCount(1, async () => { await Promise.resolve(); telemetry.observe("engine", 20); }))]);
    expect(telemetry.snapshot()).toMatchObject([{ kind: "official", cases: "6_10", count: 1 }, { kind: "practice", cases: "1", count: 1 }]);
    telemetry.observe("engine", Infinity); telemetry.observe("engine", -1);
    expect(telemetry.snapshot()).toHaveLength(2);
    const snapshot = { ...diagnostics(), timings: telemetry.snapshot(), source: "PRIVATE" };
    const parsed = executionDiagnosticsSchema.parse(snapshot);
    expect(JSON.stringify(parsed)).not.toContain("PRIVATE");
    const rendered = renderExecutionTimings(parsed.timings, "judge");
    expect(rendered).toContain('cases="6_10"'); expect(rendered).not.toContain(parsed.generation);
    expect(executionDiagnosticsSchema.safeParse({ ...snapshot, pool: { ...snapshot.pool, idle: -1 } }).success).toBe(false);
  });
  it("reports unavailable resource measurements as null rather than healthy zeros", () => {
    expect(Object.values(sandboxResources(null, () => { throw new Error(); })).every(v => v === null)).toBe(true);
    const files: Record<string, string> = { "cpu.max": "150000 100000", "cpu.stat": "nr_periods 100\nnr_throttled 20\nthrottled_usec 2500000", "memory.events": "oom 0\noom_kill 0", "memory.current": "100", "memory.peak": "200", "memory.max": "300", "pids.current": "8", "cpu.pressure": "full avg10=4.50 avg60=2.00 total=100" };
    expect(sandboxResources(1, file => files[file]!)).toMatchObject({ cpuQuota: 1.5, periods: 100, throttledPeriods: 20, throttledSeconds: 2.5, memoryBytes: 100, cpuPressure: 4.5, oom: 0 });
  });
});
