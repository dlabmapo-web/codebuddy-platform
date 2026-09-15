/** Tracks this tab's acknowledged edits, independently of student activity or DB saves. */
export class PendingTeacherUpdates {
  private updates = new Map<string, { send: (done: (ok: boolean) => void) => void; failed: boolean; retry: boolean }>();
  private listeners = new Set<() => void>();

  reset() {
    this.updates.clear();
  }

  get pending() { return this.updates.size > 0; }

  add(id: string, send: (done: (ok: boolean) => void) => void) {
    this.updates.set(id, { send, failed: false, retry: false });
    this.send(id);
  }

  private send(id: string) {
    const entry = this.updates.get(id);
    if (!entry) return;
    entry.failed = false;
    entry.retry = false;
    entry.send((ok) => {
      if (this.updates.get(id) !== entry) return;
      if (ok) this.updates.delete(id);
      else entry.failed = true;
      for (const listener of this.listeners) listener();
    });
  }

  settle(timeoutMs = 8_000): Promise<boolean> {
    // Wait for operations already in flight. Only a previous failure/deadline
    // earns a replay; duplicating a burst of edits on the first click could
    // rate-limit an otherwise healthy connection.
    for (const [id, entry] of this.updates) {
      if (entry.failed || entry.retry) this.send(id);
    }
    return new Promise((resolve) => {
      const finish = (ok: boolean) => {
        clearTimeout(timer);
        this.listeners.delete(check);
        resolve(ok);
      };
      const check = () => {
        if (this.updates.size === 0) finish(true);
        else if ([...this.updates.values()].some((entry) => entry.failed)) finish(false);
      };
      const timer = setTimeout(() => {
        for (const entry of this.updates.values()) entry.retry = true;
        finish(false);
      }, timeoutMs);
      this.listeners.add(check);
      check();
    });
  }
}
