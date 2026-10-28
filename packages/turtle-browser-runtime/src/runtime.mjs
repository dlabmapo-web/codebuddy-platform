import { DrawingRenderer } from './renderer.mjs';
import { encodedSize, limits } from './protocol.mjs';

/** One active single-use worker and one clean spare. No admission authority here. */
export class LocalTurtleRuntime {
  constructor(canvas, cursors, notify) {
    this.notify = notify; this.disposed = false;
    this.renderer = new DrawingRenderer(canvas, cursors, {
      output: text => this.send('output', { text }),
      painted: () => this.send('painted'),
      drained: () => {
        const terminal = this.terminal ?? { kind: 'displaying' };
        this.terminal = null; clearTimeout(this.deadline); clearTimeout(this.lease);
        this.send(terminal.kind, terminal.message ? { message: terminal.message } : {});
      },
      error: message => this.fail(message),
    });
    this.prepare();
  }
  send(kind, fields = {}) { if (!this.disposed) this.notify({ version: 1, kind, generation: this.generation, ...fields }); }
  prepare() {
    if (this.disposed || this.spare) return;
    const began = performance.now(); const worker = new Worker(new URL('./worker.js', import.meta.url));
    const spare = this.spare = { worker, ready: false, stages: {} };
    spare.promise = new Promise((resolve, reject) => { spare.resolve = resolve; spare.reject = reject; });
    // Preparation failure is reported, never an unhandled rejection.
    spare.promise.catch(() => {});
    const failed = message => {
      clearTimeout(spare.timer); worker.terminate();
      if (this.spare === spare) this.spare = null;
      spare.reject(new Error(message)); this.send('prepare-failed', { message, stages: spare.stages });
    };
    worker.onerror = event => failed('Python worker preparation failed: ' + String(event.message).slice(0, 300));
    worker.onmessage = event => {
      if (event.data?.kind === 'bootstrap-failed') { failed(event.data.message); return; }
      if (event.data?.kind === 'prepare-stage') { spare.stages[event.data.stage] = event.data.ms; this.send('prepare-progress', { stage: event.data.stage }); return; }
      if (event.data?.kind !== 'ready' || event.data.version !== 1 || spare.ready) return;
      clearTimeout(spare.timer);
      if (this.disposed || this.spare !== spare) { worker.terminate(); return; }
      spare.ready = true; spare.resolve(worker);
      this.send('ready', { preparationMs: performance.now() - began, stages: spare.stages });
    };
    spare.timer = setTimeout(() => failed('Python preparation timed out'), 10000);
  }
  async run(data) {
    if (this.disposed) return;
    if (typeof data.generation !== 'string' || !/^[\da-f-]{36}$/i.test(data.generation) || typeof data.source !== 'string' || encodedSize(data.source) > limits.source) throw new Error('Invalid local run');
    this.stop(); this.generation = data.generation;
    const generation = this.generation;
    this.prepare(); const spare = this.spare;
    if (!spare) throw new Error('Runtime not prepared');
    this.send('preparing');
    const worker = await spare.promise;
    if (this.disposed || generation !== this.generation) return;
    this.spare = null; this.active = worker; this.renderer.reset(generation);
    this.send('computing');
    let ended = false;
    const terminal = (kind, message) => {
      if (ended) return; ended = true;
      worker.terminate(); if (this.active === worker) this.active = null;
      if (generation !== this.generation || this.disposed) return;
      // Runtime errors and unsupported calls follow the preceding teaching
      // animation/output. Stop and protocol violations still terminate at once.
      this.terminal = { kind: kind === 'complete' ? 'displaying' : kind, message };
      this.send('rendering'); this.renderer.complete();
    };
    worker.onmessage = event => {
      if (ended || generation !== this.generation || this.disposed) return;
      const m = event.data;
      try {
        if (m?.generation !== generation || m.version !== 1) return;
        if (m.kind === 'events') this.renderer.accept(m);
        else if (['complete', 'unsupported', 'failed'].includes(m.kind) && typeof m.message === 'string' && encodedSize(m.message) <= 8192) terminal(m.kind, m.message);
        else throw new Error('Invalid worker event');
      } catch (e) { this.fail(e.message); }
    };
    worker.onerror = () => terminal('failed', 'Python worker failed');
    this.deadline = setTimeout(() => { if (this.generation === generation) { this.stop(); this.notify({ version: 1, generation, kind: 'timed-out' }); } }, limits.runMs);
    this.renew(data.leaseUntil ?? Date.now() + 30000);
    worker.postMessage({ version: 1, kind: 'run', generation, source: data.source });
    this.prepare();
  }
  renew(until) {
    clearTimeout(this.lease);
    if (!this.generation || !Number.isFinite(until)) return;
    const generation = this.generation;
    this.lease = setTimeout(() => { if (this.generation === generation) { this.stop(); this.notify({ version: 1, generation, kind: 'lease-expired' }); } }, Math.max(0, Math.min(30000, until - Date.now())));
  }
  fail(message) { const generation = this.generation; this.stop(); this.notify({ version: 1, generation, kind: 'failed', message: String(message).slice(0, 4096) }); }
  stop(clear = false) {
    clearTimeout(this.deadline); clearTimeout(this.lease);
    this.terminal = null;
    this.active?.terminate(); this.active = null; this.generation = '';
    this.renderer.stop(); if (clear) this.renderer.reset();
  }
  dispose() {
    this.disposed = true; this.stop();
    if (this.spare) { clearTimeout(this.spare.timer); this.spare.worker.terminate(); this.spare.reject(new Error('Disposed')); this.spare = null; }
  }
}
