import { randomUUID } from 'node:crypto';
import { profileKey } from './sandbox.mjs';
// Every entry, including failed creation and draining, owns a physical budget slot.
export class StandbyPool {
  entries = new Set();
  retiredIds = new Set();
  generation = randomUUID();
  closed = false;
  fatal = false;
  failures = [];
  retryAt = 0;
  failureCount = 0;
  lastInventory = 0;
  constructor({ driver, telemetry, enabled = false, capacity = 1, profile, instance = 'trial', now = Date.now, ttl = 600000 }) {
    Object.assign(this, { driver, telemetry, enabled, capacity, profile, instance, now, ttl });
    this.limit = enabled ? 2 : capacity;
  }
  status() {
    const values = [...this.entries];
    return { enabled: this.enabled, allocated: values.length,
      ready: values.filter(e => e.state === 'READY').length,
      building: values.filter(e => ['CREATING', 'VERIFYING'].includes(e.state)).length,
      draining: values.filter(e => e.state === 'DRAINING').length,
      uncertain: values.filter(e => e.uncertain).length,
      degraded: this.fatal || this.now() < this.retryAt,
      healthy: !this.closed && !this.fatal && !values.some(e => e.cleanupFailed) };
  }
  create(profile, mode) {
    if (this.closed || this.fatal || this.entries.size >= this.limit) throw Object.assign(new Error('Sandbox capacity unavailable'), { status: 503 });
    const slot = Array.from({ length: this.limit }, (_, i) => i).find(i => ![...this.entries].some(e => e.slot === i));
    // Stable names enforce the physical bound even if an old broker's create RPC
    // completes after a crash. Docker atomically reserves a container name.
    const entry = { slot, name: `cove-gui-${this.instance}-slot-${slot}`, generation: this.generation, profile,
      mode, state: 'CREATING', claimed: false };
    this.entries.add(entry);
    const signal = AbortSignal.timeout(15000);
    entry.task = this.telemetry.time('prepare', mode, async () => {
      try {
        await this.driver.prepare(entry, signal);
        signal.throwIfAborted();
        if (this.closed) throw new Error('Pool closed');
        entry.state = entry.claimed ? 'CLAIMED' : 'READY'; entry.readyAt = this.now();
        this.failureCount = 0;
      } catch (error) {
        entry.uncertain = !!error.uncertain;
        if (error.integrity || error.uncertain) this.fatal = true;
        entry.state = 'DRAINING';
        throw error;
      }
    });
    // Background failures are observed here; claim still receives the original rejection.
    entry.task.catch(async () => {
      if (!entry.cancelled && !this.closed) {
        this.telemetry.increment('prepare_failure');
        this.failureCount++;
        this.failures = this.failures.filter(t => this.now() - t < 60000); this.failures.push(this.now());
        this.retryAt = this.now() + (this.failures.length >= 3 ? 60000 : Math.min(30000, 1000 * 2 ** Math.min(5, this.failureCount - 1))) + Math.floor(Math.random() * 250);
      }
      await this.retire(entry);
    });
    return entry;
  }
  refill() {
    if (!this.enabled || this.closed || this.fatal || this.now() < this.retryAt ||
        this.entries.size >= this.limit || [...this.entries].some(e => !e.claimed)) return;
    this.create(this.profile, 'standby');
  }
  async claim(profile, signal, onClaim = () => {}) {
    if (!this.status().healthy || this.status().draining) throw Object.assign(new Error('Sandbox cleanup pending'), { status: 503 });
    signal.throwIfAborted();
    let entry = [...this.entries].find(e => !e.claimed && ['READY', 'CREATING', 'VERIFYING'].includes(e.state) &&
      profileKey(e.profile) === profileKey(profile));
    if (entry?.state === 'READY' && this.now() - entry.readyAt >= this.ttl) {
      await this.retire(entry); entry = undefined;
      if (!this.status().healthy) throw new Error('Sandbox cleanup pending');
    }
    const mode = entry?.state === 'READY' ? 'warm' : 'cold';
    entry ||= this.create(profile, 'cold');
    entry.claimed = true;
    onClaim(entry);
    if (entry.state === 'READY') entry.state = 'CLAIMED';
    const abort = () => { entry.cancelled = true; };
    signal.addEventListener('abort', abort, { once: true });
    try {
      await entry.task;
      signal.throwIfAborted();
      if (this.closed || this.fatal) throw new Error('Pool unavailable');
      await this.telemetry.time('inspect', mode, () => this.driver.inspect(entry, signal));
      signal.throwIfAborted();
      entry.mode = mode;
      this.telemetry.increment(mode === 'warm' ? 'warm_hit' : 'warm_miss');
      return entry;
    } catch (error) {
      if (error.integrity) this.fatal = true;
      await this.retire(entry);
      // A dead unused display is replaceable. Isolation/unknown outcomes are not.
      if (mode === 'warm' && error.unavailable && !error.integrity && !signal.aborted && this.status().healthy)
        return this.claim(profile, signal, onClaim);
      throw error;
    } finally { signal.removeEventListener('abort', abort); }
  }
  async retire(entry) {
    if (!entry || !this.entries.has(entry)) return;
    if (entry.removing) return entry.removing;
    entry.state = 'DRAINING';
    entry.removing = (async () => {
      try {
        await this.telemetry.time('cleanup', entry.mode, () => this.driver.remove(entry));
        if (!entry.uncertain) {
          if (entry.id) this.retiredIds.add(entry.id);
          if (this.retiredIds.size > 2048) this.retiredIds.delete(this.retiredIds.values().next().value);
          this.entries.delete(entry);
        }
      } catch { entry.cleanupFailed = true; this.telemetry.increment('cleanup_failure'); }
      finally { entry.removing = undefined; }
    })();
    return entry.removing;
  }
  async reconcile(refill = true) {
    for (const entry of [...this.entries]) {
      if (entry.state === 'DRAINING') await this.retire(entry);
      else if (entry.state === 'READY' && this.now() - entry.readyAt >= this.ttl) await this.retire(entry);
    }
    if (this.driver.inventory && this.now() - this.lastInventory >= 5000) {
      this.lastInventory = this.now();
      try {
        for (const orphan of await this.driver.inventory()) {
          // A list snapshot can race an ordinary acknowledged removal.
          if (this.retiredIds.has(orphan.id)) continue;
          if ([...this.entries].some(e => e.name === orphan.name)) continue;
          // Late creates from a crashed generation still consume a budget slot.
          const suffix = orphan.name.match(/-slot-(\d+)$/);
          orphan.slot = suffix ? Number(suffix[1]) : -1;
          orphan.state = 'DRAINING'; orphan.claimed = true;
          this.entries.add(orphan);
          if (orphan.generation === this.generation) this.fatal = true;
          await this.retire(orphan);
        }
      } catch { this.fatal = true; this.telemetry.increment('cleanup_failure'); }
    }
    if (refill) this.refill();
  }
  async close() {
    this.closed = true;
    for (const entry of this.entries) entry.cancelled = true;
    await Promise.allSettled([...this.entries].map(e => e.task));
    await Promise.all([...this.entries].map(e => this.retire(e)));
  }
}
