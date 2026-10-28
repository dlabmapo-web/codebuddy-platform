import { turtleBrowserProfileId, turtleHelperVersion, turtleSourceBytes, type TurtleBrowserProfile, type TurtleBrowserRun, type TurtleBrowserStart, type TurtleStarterId } from '@cove/shared';
import { TurtleRequestError, turtleRequest } from './client';

export type BrowserState = { ready: boolean; pending: boolean; running: boolean; state: 'IDLE' | 'ADMITTING' | 'STARTING' | 'COMPUTING' | 'RENDERING' | 'DISPLAYING' | 'STOPPED' | 'ERROR' | 'UNSUPPORTED' | 'EXPIRED'; output: string; fullPython: boolean; firstStrokeMs?: number; admissionMs?: number; dispatchToStrokeMs?: number };
export type RuntimeEvent = { kind: string; generation?: string; text?: string; message?: string };
export interface TurtleBrowserBridge {
  ready: boolean;
  send(data: Record<string, unknown>): void;
}
type Pending = { input: TurtleBrowserStart; source: string; generation: string; cancelled: boolean };
type Active = { run: TurtleBrowserRun; generation: string };
const initial = (): BrowserState => ({ ready: false, pending: false, running: false, state: 'IDLE', output: '', fullPython: false });
const terminal = new Set(['displaying', 'unsupported', 'failed', 'timed-out', 'lease-expired']);

/** Parent-side admission authority. The isolated frame never receives a grant,
 * PIN, cookie, API URL or credential. Unknown admissions keep their frozen key. */
export class BrowserTurtleExecution {
  state = initial();
  private bridge: TurtleBrowserBridge | null = null;
  private profile?: TurtleBrowserProfile;
  private pending?: Pending;
  private active?: Active;
  private flight?: Promise<void>;
  private epoch = 0;
  private disposed = false;
  private clickedAt = 0;
  private admittedAt = 0;
  private generation = '';
  private renewTimer?: ReturnType<typeof setTimeout>;
  private leaseTimer?: ReturnType<typeof setTimeout>;
  constructor(private changed: (state: BrowserState) => void, private error: (error: unknown) => void,
    private request: typeof turtleRequest = (path, method, data) => turtleRequest(path, method, data, 10000)) {}
  activate() { this.disposed = false; }
  private report = (error: unknown) => { if (!this.disposed) this.error(error); };
  private update(patch: Partial<BrowserState>) { this.state = { ...this.state, ...patch }; if (!this.disposed) this.changed(this.state); }
  configure(profile?: TurtleBrowserProfile) { this.profile = profile; }
  attach(bridge: TurtleBrowserBridge | null) {
    if (this.bridge && this.bridge !== bridge) void this.stop();
    this.bridge = bridge;
    this.update({ ready: !!bridge?.ready });
  }
  event(event: RuntimeEvent) {
    if (event.kind === 'ready') { if (this.bridge) this.bridge.ready = true; this.update({ ready: true, fullPython: this.state.state === 'UNSUPPORTED' && this.state.fullPython }); return; }
    if (event.kind === 'prepare-failed') { this.update({ ready: false, fullPython: true }); return; }
    if (!this.generation || event.generation !== this.generation) return;
    if (event.kind === 'painted') {
      // Fixed local performance entries only. No source, output or run identity.
      const end = performance.now();
      if (this.clickedAt && end - this.clickedAt <= 120000) performance.measure('cove.turtle.browser.click-to-stroke', { start: this.clickedAt, end });
      if (this.admittedAt && end - this.admittedAt <= 120000) performance.measure('cove.turtle.browser.admission-to-stroke', { start: this.admittedAt, end });
      if (this.clickedAt) this.update({ firstStrokeMs: end - this.clickedAt, dispatchToStrokeMs: end - this.admittedAt });
      this.clickedAt = this.admittedAt = 0;
    } else if (!this.active) return;
    else if (['preparing', 'computing', 'rendering'].includes(event.kind)) {
      this.update({ state: event.kind === 'preparing' ? 'STARTING' : event.kind === 'computing' ? 'COMPUTING' : 'RENDERING' });
    } else if (event.kind === 'output') {
      const text = this.state.output + (event.text ?? '');
      if (new TextEncoder().encode(text).length > 262144) { this.localStop(); this.update({ state: 'ERROR' }); void this.settle().catch(this.report); }
      else this.update({ output: text });
    } else if (terminal.has(event.kind)) {
      this.timers();
      const unsupported = event.kind === 'unsupported';
      this.update({ running: false, state: event.kind === 'displaying' ? 'DISPLAYING' : unsupported ? 'UNSUPPORTED' : event.kind === 'lease-expired' || event.kind === 'timed-out' ? 'EXPIRED' : 'ERROR',
        output: this.state.output + (event.message ? '\n' + event.message.slice(0, 8192) : ''), fullPython: unsupported || this.state.fullPython });
      void this.settle().catch(this.report);
    }
  }
  private timers() { clearTimeout(this.renewTimer); clearTimeout(this.leaseTimer); }
  private localStop(clear = false) {
    this.epoch++; this.timers();
    this.generation = '';
    if (this.pending) this.pending.cancelled = true;
    this.bridge?.send({ kind: 'stop', generation: this.active?.generation ?? this.pending?.generation, clear });
    this.update({ running: false, state: 'STOPPED', ...(clear ? { output: '', fullPython: false } : {}) });
  }
  private async settle() {
    const active = this.active;
    if (!active) return;
    try { await this.request('browser-runs/' + active.run.id, 'DELETE'); }
    catch (error) {
      if (error instanceof TurtleRequestError && [401, 404].includes(error.status) && this.active === active) this.active = undefined;
      throw error;
    }
    if (this.active === active) this.active = undefined;
  }
  async stop(clear = false) {
    this.localStop(clear); // Never wait for the network before terminating Python.
    try {
      await this.flight;
      // Recovery works even when the kill switch denies new admission. Stop
      // never creates an unused admission just to find out whether one exists.
      if (this.pending) {
        const pending = this.pending;
        try {
          const run = await this.request<TurtleBrowserRun>('browser-runs/request/' + pending.input.requestKey);
          if (run.state === 'ACTIVE') this.active = { run, generation: pending.generation };
          this.pending = undefined;
        } catch (error) {
          if (error instanceof TurtleRequestError && [401, 404].includes(error.status)) this.pending = undefined;
          if (!(error instanceof TurtleRequestError && error.status === 404)) throw error;
        }
      }
      await this.settle();
      return true;
    } catch (error) { this.report(error); return false; }
  }
  async run(source: string, starterId: TurtleStarterId) {
    if (this.disposed || this.flight || !this.profile || !this.bridge?.ready) return;
    if (this.active) this.localStop();
    this.clickedAt = performance.now();
    performance.clearMeasures('cove.turtle.browser.click-to-stroke');
    performance.clearMeasures('cove.turtle.browser.admission-to-stroke');
    const epoch = ++this.epoch;
    const task = async () => {
      await this.settle();
      if (epoch !== this.epoch) return;
      if (this.pending && (this.pending.cancelled || this.pending.source !== source || this.pending.input.starterId !== starterId)) {
        this.pending.cancelled = true;
        await this.admit(this.pending); // Reconcile the old key without executing old editor contents.
        if (epoch !== this.epoch) return;
      }
      if (!this.pending) {
        const bytes = new TextEncoder().encode(source);
        if (bytes.length > turtleSourceBytes) throw new TurtleRequestError('SOURCE_TOO_LARGE', 413);
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        if (epoch !== this.epoch) return;
        this.pending = { input: { requestKey: crypto.randomUUID(), sourceHash: Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join(''), profile: turtleBrowserProfileId, helperVersion: turtleHelperVersion, starterId }, source, generation: crypto.randomUUID(), cancelled: false };
      }
      this.update({ pending: true, state: 'ADMITTING' });
      await this.admit(this.pending);
    };
    this.flight = task().catch(error => { this.update({ state: 'ERROR', fullPython: this.state.fullPython || (error instanceof TurtleRequestError && error.message === 'BROWSER_RUNTIME_UNAVAILABLE') }); this.report(error); }).finally(() => { this.flight = undefined; this.update({ pending: false }); });
    await this.flight;
  }
  private async admit(pending: Pending) {
    const began = performance.now();
    let run: TurtleBrowserRun;
    try { run = await this.request<TurtleBrowserRun>('browser-runs', 'POST', pending.input); }
    catch (error) {
      // Definite rejections can retire the key. Transport/5xx errors are unknown
      // outcomes and can only be retried with the same frozen metadata.
      if (error instanceof TurtleRequestError && error.status < 500 && error.message !== 'RUN_CONFLICT') this.pending = undefined;
      throw error;
    }
    this.active = { run, generation: pending.generation };
    if (this.pending === pending) this.pending = undefined;
    if (this.disposed || pending.cancelled || run.state !== 'ACTIVE') { await this.settle(); return; }
    if (!this.bridge?.ready || run.profile.runtimeId !== this.profile?.runtimeId || run.profile.origin !== this.profile.origin) { await this.settle(); throw new Error('BROWSER_RUNTIME_UNAVAILABLE'); }
    const leaseMs = Math.max(0, Math.min(30000, run.leaseMs - (performance.now() - began)));
    if (!leaseMs) { await this.settle(); throw new TurtleRequestError('RUN_ENDED', 409); }
    const generation = pending.generation;
    this.generation = generation;
    this.bridge.ready = false;
    this.admittedAt = performance.now();
    this.update({ ready: false, running: true, state: 'STARTING', output: '', fullPython: false, firstStrokeMs: undefined, admissionMs: performance.now() - began, dispatchToStrokeMs: undefined });
    this.bridge.send({ kind: 'run', generation, source: pending.source, leaseUntil: Date.now() + leaseMs });
    this.lease(generation, leaseMs);
  }
  private lease(generation: string, milliseconds: number) {
    this.timers();
    this.leaseTimer = setTimeout(() => { if (this.active?.generation === generation) { this.localStop(); this.update({ state: 'EXPIRED' }); void this.settle().catch(this.report); } }, milliseconds);
    this.renewTimer = setTimeout(() => { void this.renew(generation); }, Math.min(15000, milliseconds));
  }
  private async renew(generation: string) {
    const active = this.active;
    if (!active || active.generation !== generation || !this.state.running) return;
    const began = performance.now();
    try {
      const next = await this.request<TurtleBrowserRun>('browser-runs/' + active.run.id + '/renew', 'POST', {});
      if (this.active !== active || !this.state.running) return;
      const remaining = Math.max(0, Math.min(30000, next.leaseMs - (performance.now() - began)));
      if (!remaining || next.state !== 'ACTIVE') throw new TurtleRequestError('RUN_ENDED', 409);
      this.bridge?.send({ kind: 'renew', generation, leaseUntil: Date.now() + remaining });
      this.lease(generation, remaining);
    } catch (error) {
      if (this.active === active && this.state.running) { this.localStop(); this.update({ state: 'EXPIRED', fullPython: error instanceof TurtleRequestError && error.message === 'BROWSER_RUNTIME_UNAVAILABLE' }); this.report(error); void this.settle().catch(this.report); }
    }
  }
  async recover(run?: TurtleBrowserRun | null) {
    // Reload cannot reconnect to a worker: preserve the draft, retire the old
    // metadata and require a new explicit Run. Never replay source on bootstrap.
    if (!run || run.state !== 'ACTIVE') return;
    this.active = { run, generation: crypto.randomUUID() };
    await this.stop();
  }
  dispose() { this.disposed = true; this.localStop(); this.bridge = null; void this.stop().catch(() => {}); }
}
