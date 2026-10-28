// Experimental fixture only. No application router or production engine imports this.
import { performance } from 'node:perf_hooks';

export class NativePool {
  entries = new Map();
  pending = [];
  active = 0;
  closed = false;
  failure = null;
  executions = new Set();
  observations = [];
  constructor(driver, { capacity = 2, spare = 1 } = {}) {
    if (![2, 4].includes(capacity) || spare !== 1) throw new Error('Prototype requires a reviewed capacity and one spare');
    Object.assign(this, { driver, capacity, target: capacity + spare });
  }
  stats() {
    const values = [...this.entries.values()];
    return { allocated: values.length, active: this.active, ready: values.filter(e => e.state === 'ready').length,
      preparing: values.filter(e => e.state === 'preparing').length, draining: values.filter(e => e.state === 'draining').length,
      quarantined: values.filter(e => e.state === 'quarantined').length, waiting: this.pending.length,
      closed: this.closed, healthy: !this.closed && !this.failure };
  }
  observe(stage, began) { this.observations.push({ stage, ms: performance.now() - began }); }
  fail(error) {
    this.failure ??= error;
    for (const job of this.pending.splice(0)) { job.detach(); job.reject(error); }
  }
  async warmUp() {
    if (this.closed || this.entries.size) throw new Error('Pool already initialized or closed');
    const attempts = await Promise.allSettled(Array.from({ length: this.target }, (_, slot) => this.spawn(slot)));
    if (attempts.some(r => r.status === 'rejected') || this.failure) throw this.failure ?? new Error('Native warmup failed');
  }
  async spawn(slot) {
    if (this.closed || this.failure || this.entries.has(slot) || this.entries.size >= this.target) throw new Error('Allocation refused');
    const entry = { slot, state: 'preparing', retiring: null, controller: null };
    this.entries.set(slot, entry); // Count before starting the daemon request.
    const began = performance.now();
    entry.preparation = Promise.resolve().then(() => this.driver.prepare(entry));
    try {
      await entry.preparation;
      this.observe('prepare', began);
      if (this.closed || entry.retiring) { await this.retire(entry); return; }
      entry.state = 'ready';
      this.dispatch();
      this.refill();
    } catch (error) {
      this.fail(error);
      await this.retire(entry);
      throw error;
    }
  }
  refill() {
    if (this.closed || this.failure || this.entries.size >= this.target ||
        [...this.entries.values()].some(e => e.state === 'preparing')) return;
    const slot = Array.from({ length: this.target }, (_, i) => i).find(i => !this.entries.has(i));
    void this.spawn(slot).catch(error => this.fail(error));
  }
  run(request) {
    if (this.closed || this.failure) return Promise.reject(this.failure ?? new Error('Pool closed'));
    if (request.signal?.aborted) return Promise.reject(new Error('Execution cancelled'));
    if (this.pending.length >= 64) return Promise.reject(new Error('Fixture queue full'));
    return new Promise((resolve, reject) => {
      const controller = new AbortController();
      const job = { request, resolve, reject, controller, since: performance.now(), detach: () => {} };
      const cancel = () => {
        const index = this.pending.indexOf(job);
        if (index >= 0) { this.pending.splice(index, 1); job.detach(); reject(new Error('Execution cancelled')); }
        else controller.abort();
      };
      job.detach = () => request.signal?.removeEventListener('abort', cancel);
      request.signal?.addEventListener('abort', cancel, { once: true });
      this.pending.push(job);
      this.dispatch();
    });
  }
  dispatch() {
    if (this.closed || this.failure) return;
    while (this.active < this.capacity && this.pending.length) {
      const entry = [...this.entries.values()].find(e => e.state === 'ready');
      if (!entry) { this.refill(); return; }
      const job = this.pending.shift();
      entry.state = 'running'; entry.controller = job.controller; this.active++;
      this.observe('acquire', job.since);
      const operation = this.execute(entry, job);
      this.executions.add(operation);
      void operation.finally(() => this.executions.delete(operation));
    }
  }
  async execute(entry, job) {
    let result, failure;
    const began = performance.now();
    try { result = await this.driver.execute(entry, { ...job.request, signal: job.controller.signal }); }
    catch (error) { failure = error; }
    this.observe('execute', began);
    try { await this.retire(entry); }
    catch (error) { failure = error; this.fail(error); }
    this.active--; job.detach();
    if (job.controller.signal.aborted) failure ??= new Error('Execution cancelled');
    failure ? job.reject(failure) : job.resolve(result);
    this.refill(); this.dispatch();
  }
  retire(entry) {
    if (entry.retiring) return entry.retiring;
    entry.state = 'draining';
    entry.retiring = (async () => {
      await entry.preparation.catch(() => undefined);
      const began = performance.now();
      try {
        await this.driver.remove(entry);
        this.entries.delete(entry.slot); // Only acknowledged deletion releases a slot.
        this.observe('cleanup', began);
      } catch (error) { entry.state = 'quarantined'; this.fail(error); throw error; }
    })();
    return entry.retiring;
  }
  async dispose() {
    this.closed = true;
    for (const job of this.pending.splice(0)) { job.detach(); job.reject(new Error('Pool closed')); }
    for (const entry of this.entries.values()) entry.controller?.abort();
    const removals = await Promise.allSettled([...this.entries.values()].map(e => this.retire(e)));
    await Promise.allSettled([...this.executions]);
    if (removals.some(r => r.status === 'rejected')) throw new Error('Prototype cleanup remains unconfirmed');
  }
}
