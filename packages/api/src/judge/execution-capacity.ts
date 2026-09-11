/**
 * Who may occupy the judge's execution slots, and in what order.
 *
 * Official submissions, maintenance regrades and public sample checks all run
 * student code through the same runners and the same comparators, and a
 * separate queue for each does not change that. This gate is what does:
 *
 * - Official grading is never made to wait here. It is counted, and a student
 *   who pressed Submit is always the first claim on the judge.
 * - Background work — regrades and sample checks together — may hold at most
 *   `total - 1` slots whenever there is more than one, so one slot is always
 *   free for a submission that arrives. A regrade and a burst of practice
 *   cannot consume that reservation between them.
 * - With a single slot there is nothing to reserve. Background work is then
 *   dispatched only while no official work is running; a submission arriving
 *   mid-check waits at most for that one bounded run to finish.
 *
 * Each job holds one slot for its whole run: its cases run one after another,
 * so it never executes more than one program at a time. A slot is released
 * only when the work is actually over, never because a caller stopped waiting.
 */
export class ExecutionCapacity {
  private official = 0;
  private background = 0;
  private readonly waiters: Array<{
    admit: () => void;
    requireIdle: boolean;
  }> = [];

  constructor(private readonly total: number) {
    if (!Number.isInteger(total) || total < 1) {
      throw new Error("execution capacity must be a positive integer");
    }
  }

  /** Background slots: everything but one reserved for official grading. */
  get backgroundLimit(): number {
    return this.total > 1 ? this.total - 1 : 1;
  }

  /** Runs official grading, counted but never delayed. */
  async runOfficial<T>(work: () => Promise<T>): Promise<T> {
    this.official += 1;
    try {
      return await work();
    } finally {
      this.official -= 1;
      this.wake();
    }
  }

  /**
   * Waits for a background slot, then runs `work` in it. No deadline: a
   * regrade simply waits its turn behind submissions and other background.
   */
  async runBackground<T>(work: () => Promise<T>): Promise<T> {
    await new Promise<void>((resolve) => this.enqueue(resolve));
    try {
      return await work();
    } finally {
      this.background -= 1;
      this.wake();
    }
  }

  /**
   * A background slot if one frees up before `until` (epoch ms), else null.
   * The caller must call the returned release exactly when its work is over.
   */
  async tryBackground(until: number): Promise<(() => void) | null> {
    const admitted = await new Promise<boolean>((resolve) => {
      const waiter = this.enqueue(() => resolve(true));
      if (!waiter) return;
      const timer = setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index === -1) return;
        this.waiters.splice(index, 1);
        resolve(false);
      }, Math.max(0, until - Date.now()));
      timer.unref();
    });
    if (!admitted) return null;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.background -= 1;
      this.wake();
    };
  }

  stats(): { official: number; background: number; waiting: number } {
    return {
      official: this.official,
      background: this.background,
      waiting: this.waiters.length,
    };
  }

  /** Admits now if allowed, else queues. Returns the queued waiter, if any. */
  private enqueue(admit: () => void): { admit: () => void; requireIdle: boolean } | null {
    const waiter = { admit, requireIdle: this.total === 1 };
    if (this.waiters.length === 0 && this.admissible(waiter)) {
      this.background += 1;
      admit();
      return null;
    }
    this.waiters.push(waiter);
    return waiter;
  }

  private admissible(waiter: { requireIdle: boolean }): boolean {
    if (this.background >= this.backgroundLimit) return false;
    return !waiter.requireIdle || this.official === 0;
  }

  /** First come, first served among background work. */
  private wake(): void {
    while (this.waiters.length > 0 && this.admissible(this.waiters[0]!)) {
      const waiter = this.waiters.shift()!;
      this.background += 1;
      waiter.admit();
    }
  }
}
