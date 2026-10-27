import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { sandboxResources } from "./sandbox-resources.js";
import type { ExecutionDiagnostics } from "./execution-telemetry.js";
import { ExecutionTelemetry, renderExecutionTimings } from "./execution-telemetry.js";
import { JudgeReadiness } from "./judge-readiness.js";

type Worker = { pause(doNotWaitActive?: boolean): Promise<void>; resume(): void; client: Promise<{ status: string }> };
type QueueSnapshot = { kind: "official" | "practice" | "sample" | "regrade"; waiting: number; active: number; delayed: number; failed: number; oldestWaitMs: number };
function resourceMetrics(r: ExecutionDiagnostics["resources"], component: "worker" | "sandbox") {
  const values = { cpu_quota: r.cpuQuota, cpu_periods_total: r.periods, cpu_throttled_periods_total: r.throttledPeriods,
    cpu_throttled_seconds_total: r.throttledSeconds, cpu_pressure_pct: r.cpuPressure,
    memory_bytes: r.memoryBytes, memory_peak_bytes: r.memoryPeakBytes, memory_limit_bytes: r.memoryLimitBytes,
    oom_total: r.oom, oom_kill_total: r.oomKill, tasks: r.tasks, event_loop_p95_seconds: r.eventLoopP95Ms === null ? null : r.eventLoopP95Ms / 1000 };
  return Object.entries(values).flatMap(([key, value]) => value === null ? [] : [`cove_judge_${component}_${key} ${value}`]);
}
export function startJudgeMonitor(options: {
  port: number; bind: string; secret?: string; guard: boolean; telemetry: ExecutionTelemetry;
  diagnostics: () => Promise<ExecutionDiagnostics | undefined>; workers: Worker[];
  queues?: () => Promise<QueueSnapshot[]>;
}) {
  const readiness = new JudgeReadiness();
  const delay = monitorEventLoopDelay({ resolution: 20 }); delay.enable();
  let stopped = false, paused = false, polling: Promise<void> | undefined;
  let queues: QueueSnapshot[] | undefined;
  let queuePolling: Promise<void> | undefined, queuesAt = -Infinity;
  let stopPoll!: () => void;
  const stoppedSignal = new Promise<void>(resolve => { stopPoll = resolve; });
  const poll = async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tasks = [options.diagnostics(), Promise.allSettled(options.workers.map(async worker => (await worker.client).status === "ready")).then(states => states.every(state => state.status === "fulfilled" && state.value))] as const;
    try {
      const [diagnostics, redisReady] = await Promise.race([
        Promise.all(tasks),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("health poll deadline")), 5000); timer.unref(); }),
      ]);
      readiness.update(diagnostics, redisReady);
    } catch { readiness.update(undefined, false); }
    finally { clearTimeout(timer); }
    if (!stopped && options.guard) {
      const nextPaused = readiness.shouldPause();
      if (nextPaused !== paused) {
        // Only this monitor owns these pauses; current cases retain their slots.
        if (nextPaused) await Promise.all(options.workers.map(worker => worker.pause(true)));
        else options.workers.forEach(worker => worker.resume());
        paused = nextPaused;
      }
    }
    // A deadline reports degradation but does not abandon underlying reads and
    // start another poll on top of them. Shutdown can cancel this wait safely.
    await Promise.race([Promise.allSettled(tasks), stoppedSignal]);
  };
  const tick = () => {
    if (polling || stopped) return;
    if (options.queues && !queuePolling) {
      queuePolling = options.queues().then(snapshot => { queues = snapshot; queuesAt = performance.now(); })
        .catch(() => { queues = undefined; }).finally(() => { queuePolling = undefined; });
    }
    polling = poll().catch(() => { readiness.update(undefined, false); }).finally(() => { polling = undefined; });
  };
  tick();
  const interval = setInterval(tick, 5000); interval.unref();
  const server = options.port > 0 ? createServer((request, response) => {
    response.setHeader("Cache-Control", "private, no-store");
    if (request.method !== "GET") { response.writeHead(405); response.end(); return; }
    const path = request.url?.split("?")[0];
    if (path === "/health") {
      response.writeHead(200, { "Content-Type": "application/json" }); response.end('{"status":"ok"}'); return;
    }
    if (path === "/ready") {
      const state = readiness.state(); response.writeHead(state.ready ? 200 : 503, { "Content-Type": "application/json" }); response.end(JSON.stringify(state)); return;
    }
    if (path !== "/metrics" || !options.secret) { response.writeHead(404); response.end(); return; }
    const expected = Buffer.from(`Bearer ${options.secret}`), supplied = Buffer.from(request.headers.authorization ?? "");
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) { response.writeHead(401); response.end(); return; }
    const state = readiness.state(), diagnostics = readiness.diagnostics;
    const lines = ["# TYPE cove_judge_stage_seconds histogram", renderExecutionTimings(options.telemetry.snapshot(), "judge"),
      `cove_judge_ready ${Number(state.ready)}`, `cove_judge_diagnostics_available ${Number(Boolean(diagnostics) && state.reason !== "stale")}`,
      `cove_judge_guard_paused ${Number(paused)}`];
    lines.push(...resourceMetrics(sandboxResources(delay.percentile(95) / 1e6), "worker"));
    if (diagnostics && state.reason !== "stale") {
      lines.push(renderExecutionTimings(diagnostics.timings, "sandbox"));
      for (const key of ["capacity", "spare", "executing", "idle", "warming", "draining", "waiting"] as const) lines.push(`cove_judge_pool_${key} ${diagnostics.pool[key]}`);
      lines.push(`cove_judge_pool_oldest_wait_seconds ${diagnostics.pool.oldestWaitMs / 1000}`, `cove_judge_pool_oldest_warm_seconds ${diagnostics.pool.oldestWarmMs / 1000}`);
      lines.push(...resourceMetrics(diagnostics.resources, "sandbox"));
      lines.push(`cove_judge_prepare_failure_total ${diagnostics.failures.prepare}`, `cove_judge_drain_fallback_total ${diagnostics.failures.drainFallback}`, `cove_judge_forced_termination_total ${diagnostics.failures.forcedTermination}`);
    }
    const queueFresh = queues && performance.now() - queuesAt <= 15000;
    lines.push(`cove_judge_queue_diagnostics_available ${Number(Boolean(queueFresh))}`);
    if (queueFresh && queues) for (const queue of queues) {
      for (const field of ["waiting", "active", "delayed", "failed"] as const) lines.push(`cove_judge_queue_${field}{kind="${queue.kind}"} ${queue[field]}`);
      lines.push(`cove_judge_queue_oldest_wait_seconds{kind="${queue.kind}"} ${queue.oldestWaitMs / 1000}`);
    }
    response.writeHead(200, { "Content-Type": "text/plain; version=0.0.4" }); response.end(lines.filter(Boolean).join("\n") + "\n");
  }).listen(options.port, options.bind) : null;
  return { readiness, async refresh() { tick(); await polling; }, async close() { stopped = true; delay.disable(); clearInterval(interval); stopPoll(); await polling;
    if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  } };
}
