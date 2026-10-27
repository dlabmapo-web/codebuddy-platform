import type { ExecutionDiagnostics } from "./execution-telemetry.js";

export type JudgeReadinessState = { ready: boolean; reason: "ready" | "redis" | "unavailable" | "stale" | "starved" | "replacement"; supported: boolean };
/** Timers use local monotonic receipt times, never the remote process's clock. */
export class JudgeReadiness {
  private receivedAt = -Infinity;
  private supported = false;
  private redis = false;
  private healthySamples = 0;
  private recovering = false;
  diagnostics: ExecutionDiagnostics | undefined;
  constructor(private readonly now = () => performance.now()) {}
  update(diagnostics: ExecutionDiagnostics | undefined, redis: boolean) {
    this.redis = redis;
    this.diagnostics = diagnostics;
    if (diagnostics) { this.supported = true; this.receivedAt = this.now(); }
    const state = this.state();
    this.healthySamples = state.ready ? this.healthySamples + 1 : 0;
    if (this.supported && !state.ready) this.recovering = true;
    if (this.healthySamples >= 3) this.recovering = false;
  }
  state(): JudgeReadinessState {
    const result = (ready: boolean, reason: JudgeReadinessState["reason"]) => ({ ready, reason, supported: this.supported });
    if (!this.redis) return result(false, "redis");
    if (!this.diagnostics) return result(false, "unavailable");
    if (this.now() - this.receivedAt > 15000) return result(false, "stale");
    const p = this.diagnostics.pool;
    if (p.retryExhausted) return result(false, "replacement");
    if (p.waiting > 0 && p.oldestWaitMs > 5000 && p.executing === 0 && p.idle === 0 && (p.warming === 0 || p.oldestWarmMs > 30000)) return result(false, "starved");
    return result(true, "ready");
  }
  /** Legacy peers do not activate the new guard during a mixed-version rollout. */
  shouldPause() { return this.supported && (!this.state().ready || this.recovering); }
}
