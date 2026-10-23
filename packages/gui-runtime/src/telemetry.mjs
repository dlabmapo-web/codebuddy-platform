// Bounded-cardinality telemetry. Never accept identifiers/source as labels.
const stages = new Set(['create', 'display', 'inspect', 'assets', 'spawn', 'launch', 'queue', 'cleanup', 'prepare']);
const modes = new Set(['cold', 'warm', 'standby']);
const counters = new Set(['warm_hit', 'warm_miss', 'prepare_failure', 'cleanup_failure', 'launch_failure']);
const buckets = [.01, .025, .05, .1, .25, .5, 1, 1.5, 2, 4, 8, 15, 30];
export class Telemetry {
  histograms = new Map();
  counters = new Map();
  increment(name) {
    if (!counters.has(name)) throw new Error('Invalid metric');
    this.counters.set(name, (this.counters.get(name) || 0) + 1);
  }
  observe(stage, mode, ms) {
    if (!stages.has(stage) || !modes.has(mode) || !Number.isFinite(ms) || ms < 0) throw new Error('Invalid observation');
    const key = `${stage}:${mode}`;
    const h = this.histograms.get(key) || { count: 0, sum: 0, buckets: buckets.map(() => 0) };
    h.count++; h.sum += ms / 1000;
    buckets.forEach((b, i) => { if (ms / 1000 <= b) h.buckets[i]++; });
    this.histograms.set(key, h);
  }
  async time(stage, mode, operation) {
    const start = performance.now();
    try { return await operation(); } finally { this.observe(stage, mode, performance.now() - start); }
  }
  render(status) {
    const lines = ['# TYPE cove_turtle_stage_seconds histogram'];
    for (const [key, h] of this.histograms) {
      const [stage, mode] = key.split(':');
      const labels = `stage="${stage}",mode="${mode}"`;
      buckets.forEach((b, i) => lines.push(`cove_turtle_stage_seconds_bucket{${labels},le="${b}"} ${h.buckets[i]}`));
      lines.push(`cove_turtle_stage_seconds_bucket{${labels},le="+Inf"} ${h.count}`,
        `cove_turtle_stage_seconds_count{${labels}} ${h.count}`, `cove_turtle_stage_seconds_sum{${labels}} ${h.sum}`);
    }
    for (const name of counters) lines.push(`cove_turtle_${name}_total ${this.counters.get(name) || 0}`);
    for (const name of ['allocated', 'ready', 'building', 'draining', 'uncertain', 'active', 'queued', 'enabled', 'degraded'])
      lines.push(`cove_turtle_${name} ${Number(status[name] || 0)}`);
    return lines.join('\n') + '\n';
  }
}
