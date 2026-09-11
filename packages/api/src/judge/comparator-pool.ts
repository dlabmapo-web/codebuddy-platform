import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";

import type { CaseComparator } from "@cove/shared";

import { COMPARATOR_HARNESS } from "./comparator-runner.js";

/** Initial default from §3.1 of the implementation spec, recorded in policy. */
export const DEFAULT_COMPARATOR_BUDGET_MS = 100;
/** A comparator that ignores its interrupt is replaced rather than waited on. */
const TERMINATE_GRACE_MS = 100;
const STARTUP_TIMEOUT_MS = 30_000;
/** Bounded, like the runner's: a replacement that cannot start is a fault. */
const SPAWN_ATTEMPTS = 3;
const SPAWN_RETRY_MS = 1_000;

/**
 * What a comparison concluded.
 *
 * A timeout or an unusable pattern is a grader fault, not a wrong answer: the
 * student's output was never actually judged, and recording `WRONG_OUTPUT`
 * would blame them for the author's regex.
 */
export type ComparisonResult =
  | { kind: "match" }
  | { kind: "no-match" }
  | { kind: "invalid-pattern"; detail: string }
  | { kind: "timeout" }
  /**
   * The caller's own deadline ran out — while waiting for a comparator, or
   * because it cut the comparison short. Not the comparator's fault, and not
   * a verdict: the run as a whole is out of time.
   */
  | { kind: "deadline" }
  | { kind: "error"; detail: string };

export type ComparisonRequest = {
  comparator: CaseComparator;
  actual: string;
  expected: string;
  /** This comparison's own budget, once it has an interpreter. */
  budgetMs?: number;
  /**
   * Epoch milliseconds by which the whole comparison — queueing for an
   * interpreter included — must be over. The effective budget is the lesser
   * of `budgetMs` and what is left of this.
   */
  deadlineAt?: number;
};

/** What grading needs from a comparator, so tests need no interpreter. */
export interface OutputComparator {
  compare(request: ComparisonRequest): Promise<ComparisonResult>;
  /**
   * `pyodide-<version>` as the interpreters themselves report it, or null
   * before any has started. Grading refuses a submission recorded against a
   * different one.
   */
  readonly version: string | null;
}

/** One interpreter as the pool sees it. Injectable, so lifecycle is testable. */
export interface ComparatorWorker {
  warmUp(): Promise<void>;
  compare(request: ComparisonRequest): Promise<ComparisonResult>;
  /** Resolves only once the underlying thread has actually stopped. */
  dispose(): Promise<void>;
  readonly isDead: boolean;
  /** The Pyodide version this interpreter reported when it became ready. */
  readonly version: string | null;
}

/** Raised to a waiter whose deadline passed before an interpreter was free. */
class DeadlineExpired extends Error {}

type ThreadReply =
  | { type: "ready"; version: string }
  | { type: "result"; id: number; result: string }
  | { type: "fatal"; message: string };

class ComparatorThread implements ComparatorWorker {
  private readonly worker: Worker;
  private readonly interrupt = new Uint8Array(new SharedArrayBuffer(1));
  private readonly ready: Promise<void>;
  private readyResolve!: () => void;
  private readyReject!: (error: Error) => void;
  /** Settles when the thread is gone, however it went. */
  private readonly exited: Promise<void>;
  private nextId = 1;
  /**
   * The one request in flight, by id.
   *
   * Both halves matter. A single settle slot let a second concurrent request
   * overwrite the first's handler, so a matching pair could return a timeout
   * for work that had already succeeded. Checking the id on the way back is
   * the other half: a reply belonging to a request that has already timed out
   * must be discarded, not delivered to whatever is waiting now.
   */
  private pending: {
    id: number;
    settle: (result: ComparisonResult) => void;
    deadline: NodeJS.Timeout;
    grace: NodeJS.Timeout | null;
    interrupted: boolean;
  } | null = null;
  private dead = false;
  private reportedVersion: string | null = null;

  constructor() {
    this.ready = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    // Nobody may be awaiting readiness when a thread dies early; the rejection
    // is still delivered to anyone who asks later.
    this.ready.catch(() => undefined);
    const runningTypeScript = import.meta.url.endsWith(".ts");
    const workerUrl = new URL(
      runningTypeScript ? "./comparator-thread.ts" : "./comparator-thread.js",
      import.meta.url,
    );
    this.worker = new Worker(fileURLToPath(workerUrl), {
      workerData: { interrupt: this.interrupt, harness: COMPARATOR_HARNESS },
      ...(runningTypeScript ? { execArgv: ["--import", "tsx"] } : {}),
    });
    this.exited = new Promise<void>((resolve) => {
      this.worker.once("exit", () => resolve());
    });
    const startup = setTimeout(() => {
      this.readyReject(new Error("comparator did not start in time"));
      this.dead = true;
      void this.worker.terminate();
    }, STARTUP_TIMEOUT_MS);
    startup.unref();
    this.worker.on("message", (reply: ThreadReply) => {
      if (reply.type === "ready") {
        clearTimeout(startup);
        this.reportedVersion = reply.version;
        this.readyResolve();
        return;
      }
      if (reply.type === "fatal") {
        clearTimeout(startup);
        this.dead = true;
        this.readyReject(new Error(reply.message));
        return;
      }
      const pending = this.pending;
      // A late reply to an abandoned request. Dropping it is the point.
      if (!pending || pending.id !== reply.id) return;
      this.finish(JSON.parse(reply.result) as ComparisonResult);
    });
    this.worker.on("error", (error) => {
      this.dead = true;
      this.readyReject(error);
      this.finish({ kind: "error", detail: String(error).slice(0, 200) });
    });
    // A thread can also simply stop — terminated, or out of memory — without
    // an `error`. Without this a request in flight waited out its whole
    // deadline and grace to be reported as a timeout, and a thread still
    // warming left its caller waiting on the startup watchdog.
    this.worker.on("exit", () => {
      clearTimeout(startup);
      this.dead = true;
      this.readyReject(new Error("comparator exited"));
      this.finish({ kind: "error", detail: "comparator exited" });
    });
  }

  warmUp(): Promise<void> {
    return this.ready;
  }

  get isDead(): boolean {
    return this.dead;
  }

  get version(): string | null {
    return this.reportedVersion;
  }

  /** Settles the request in flight and clears every timer it owns. */
  private finish(result: ComparisonResult): void {
    const pending = this.pending;
    if (!pending) return;
    clearTimeout(pending.deadline);
    if (pending.grace) clearTimeout(pending.grace);
    this.pending = null;
    // Once the deadline has fired, the verdict is already timeout. Python's
    // regex engine does not service the interrupt during backtracking — it is
    // delivered to the asyncio loop instead, and surfaces as a PythonError
    // that has nothing to do with the author's pattern. Reporting that as a
    // grader error would blame a valid pattern for our own deadline. A result
    // that genuinely completed in the grace window is still honoured.
    const settled =
      pending.interrupted && result.kind === "error"
        ? ({ kind: "timeout" } as const)
        : result;
    pending.settle(settled);
  }

  async compare(request: ComparisonRequest): Promise<ComparisonResult> {
    await this.ready;
    if (this.dead) return { kind: "error", detail: "comparator unavailable" };
    // The pool hands out one thread at a time; this catches a caller that
    // bypassed it rather than silently corrupting a result.
    if (this.pending) throw new Error("comparator thread received concurrent work");
    const budgetMs = request.budgetMs ?? DEFAULT_COMPARATOR_BUDGET_MS;
    const id = this.nextId++;

    return new Promise<ComparisonResult>((resolve) => {
      const deadline = setTimeout(() => {
        const pending = this.pending;
        if (!pending || pending.id !== id) return;
        // Interrupt first; a regex engine that never services it gets the
        // thread destroyed, because cooperation is not a guarantee.
        Atomics.store(this.interrupt, 0, 2);
        pending.interrupted = true;
        // An interpreter that has taken an interrupt into its event loop is not
        // trustworthy as idle, whether or not it answers in time.
        this.dead = true;
        const grace = setTimeout(() => {
          if (this.pending?.id !== id) return;
          void this.worker.terminate();
          this.finish({ kind: "timeout" });
        }, TERMINATE_GRACE_MS);
        grace.unref();
        pending.grace = grace;
      }, budgetMs);
      deadline.unref();

      this.pending = { id, settle: resolve, deadline, grace: null, interrupted: false };
      this.worker.postMessage({
        type: "compare",
        id,
        payload: JSON.stringify({
          comparator: request.comparator,
          actual: request.actual,
          expected: request.expected,
        }),
      });
    });
  }

  async dispose(): Promise<void> {
    this.dead = true;
    this.finish({ kind: "error", detail: "comparator disposed" });
    await this.worker.terminate();
    await this.exited;
  }
}

export type ComparatorPoolOptions = {
  /** Test seam: the pool's lifecycle is what is under test, not Pyodide. */
  createWorker?: () => ComparatorWorker;
  spawnAttempts?: number;
  spawnRetryMs?: number;
};

/**
 * A small pool of comparator interpreters, leased one at a time.
 *
 * Reused across submissions by design — they never execute submitted code —
 * but never *shared* while working: a thread handles one comparison, and a
 * caller with nowhere to go waits in the queue rather than being handed a busy
 * thread. Round-robin without a lease was the bug: two concurrent comparisons
 * landed on the same interpreter and the second overwrote the first's handler.
 *
 * A thread that missed its deadline is retired before anything can reuse it,
 * because a worker that ignored an interrupt cannot be assumed idle.
 *
 * Every thread that exists is tracked, whether idle, leased or still warming,
 * so shutdown ends all of them and returns only once they have stopped. An
 * idle-only list was the earlier bug: `dispose` returned at once while a leased
 * comparison ran on until its own timeout, and a warming thread came up after
 * the pool that owned it was gone.
 */
export class ComparatorPool implements OutputComparator {
  private readonly size: number;
  private readonly createWorker: () => ComparatorWorker;
  private readonly spawnAttempts: number;
  private readonly spawnRetryMs: number;
  /** Every thread that exists, in any state. The one bound the pool keeps. */
  private readonly threads = new Set<ComparatorWorker>();
  private readonly idle: ComparatorWorker[] = [];
  private readonly leased = new Set<ComparatorWorker>();
  private readonly waiters: Array<{
    resolve: (thread: ComparatorWorker) => void;
    reject: (error: Error) => void;
  }> = [];
  /**
   * The Pyodide version every live interpreter reported. Fixed by the first
   * to start; a replacement reporting anything else is refused, so the pool
   * never mixes runtimes and never changes version under a running judge.
   */
  private runtimeVersion: string | null = null;
  /** Spawns, retirements and their retries still in progress. */
  private readonly lifecycle = new Set<Promise<void>>();
  /**
   * Threads on their way: warming, retrying, or reserved by a retirement that
   * is still stopping the thread it replaces. Counted from the moment the slot
   * is claimed, so no caller ever sees an empty pool between a thread dying
   * and its replacement existing.
   */
  private starting = 0;
  private disposed = false;
  private wakeDisposed!: () => void;
  private readonly disposedSignal = new Promise<void>((resolve) => {
    this.wakeDisposed = resolve;
  });
  /**
   * Set when a thread could not be brought up within its retries, cleared by
   * the next one that does.
   *
   * Persistent rather than delivered once: without it, a caller arriving after
   * a failed replacement found no idle thread and nothing coming, joined the
   * queue, and waited for ever.
   */
  private failure: Error | null = null;

  constructor(size = 1, options: ComparatorPoolOptions = {}) {
    this.size = Math.max(1, size);
    this.createWorker = options.createWorker ?? (() => new ComparatorThread());
    this.spawnAttempts = Math.max(1, options.spawnAttempts ?? SPAWN_ATTEMPTS);
    this.spawnRetryMs = Math.max(0, options.spawnRetryMs ?? SPAWN_RETRY_MS);
  }

  /** Brings the pool up; throws if not a single comparator could start. */
  async warmUp(): Promise<void> {
    const spawns: Array<Promise<void>> = [];
    while (!this.disposed && this.capacity() < this.size) spawns.push(this.spawn());
    await Promise.all(spawns);
    if (this.threads.size === 0 && !this.disposed) {
      throw this.failure ?? new Error("no comparator could be started");
    }
  }

  get version(): string | null {
    return this.runtimeVersion === null ? null : `pyodide-${this.runtimeVersion}`;
  }

  async compare(request: ComparisonRequest): Promise<ComparisonResult> {
    if (this.disposed) return { kind: "error", detail: "pool disposed" };
    let thread: ComparatorWorker;
    try {
      thread = await this.acquire(request.deadlineAt);
    } catch (error) {
      if (error instanceof DeadlineExpired) return { kind: "deadline" };
      return { kind: "error", detail: String(error).slice(0, 200) };
    }
    try {
      // The wait for an interpreter has already spent some of the caller's
      // time. What remains, not the comparator's own budget, is the ceiling.
      const ownBudget = request.budgetMs ?? DEFAULT_COMPARATOR_BUDGET_MS;
      const left =
        request.deadlineAt === undefined
          ? Number.POSITIVE_INFINITY
          : request.deadlineAt - Date.now();
      if (left <= 0) return { kind: "deadline" };
      const budgetMs = Math.min(ownBudget, left);
      const result = await thread.compare({ ...request, budgetMs });
      // Cut short by the caller's deadline rather than its own budget: that
      // is the run being out of time, not the pattern being too slow.
      return result.kind === "timeout" && budgetMs < ownBudget
        ? { kind: "deadline" }
        : result;
    } catch (error) {
      return { kind: "error", detail: String(error).slice(0, 200) };
    } finally {
      this.leased.delete(thread);
      if (thread.isDead) {
        void this.retire(thread);
      } else {
        this.release(thread);
      }
    }
  }

  /**
   * Ends every thread — idle, leased and warming — and returns once all of
   * them have stopped. A leased comparison settles as a grader error rather
   * than running on to its deadline.
   */
  async dispose(): Promise<void> {
    this.disposed = true;
    this.wakeDisposed();
    while (this.waiters.length > 0) {
      this.waiters.shift()?.reject(new Error("comparator pool disposed"));
    }
    const threads = [...this.threads];
    this.threads.clear();
    this.idle.length = 0;
    this.leased.clear();
    await Promise.all(threads.map((thread) => thread.dispose().catch(() => undefined)));
    // A spawn or retirement may be between steps; each checks `disposed` and
    // exits, and waiting here is what makes "returned" mean "nothing left".
    await Promise.all([...this.lifecycle]);
  }

  /** Pool census, for tests and the operations view. */
  stats(): {
    /** Thread objects that exist, including any still stopping. */
    total: number;
    idle: number;
    leased: number;
    starting: number;
    waiting: number;
    failed: boolean;
  } {
    return {
      total: this.threads.size,
      idle: this.idle.length,
      leased: this.leased.size,
      starting: this.starting,
      waiting: this.waiters.length,
      failed: this.failure !== null,
    };
  }

  /** Threads serving, idle, or on their way. */
  private capacity(): number {
    return this.idle.length + this.leased.size + this.starting;
  }

  private acquire(deadlineAt?: number): Promise<ComparatorWorker> {
    if (this.disposed) {
      return Promise.reject(new Error("comparator pool disposed"));
    }
    const thread = this.idle.pop();
    if (thread) {
      this.leased.add(thread);
      return Promise.resolve(thread);
    }
    if (this.leased.size + this.starting === 0) {
      // Nothing idle, leased or on its way: nothing will ever be released to
      // a waiter. Fail now with the recorded cause, and try to recover in the
      // background so a later comparison may find the pool healthy again.
      const failure = this.failure ?? new Error("no comparator available");
      this.topUp();
      return Promise.reject(failure);
    }
    if (this.failure) this.topUp();
    if (deadlineAt !== undefined && deadlineAt <= Date.now()) {
      return Promise.reject(new DeadlineExpired());
    }
    return new Promise<ComparatorWorker>((resolve, reject) => {
      let timer: NodeJS.Timeout | null = null;
      const waiter = {
        resolve: (thread: ComparatorWorker) => {
          if (timer) clearTimeout(timer);
          resolve(thread);
        },
        reject: (error: Error) => {
          if (timer) clearTimeout(timer);
          reject(error);
        },
      };
      // Queueing is the caller's time too. A waiter still queued at its
      // deadline leaves the queue, so no interpreter is later handed to work
      // nobody is waiting for any more.
      if (deadlineAt !== undefined) {
        timer = setTimeout(() => {
          const index = this.waiters.indexOf(waiter);
          if (index !== -1) this.waiters.splice(index, 1);
          reject(new DeadlineExpired());
        }, deadlineAt - Date.now());
        timer.unref();
      }
      this.waiters.push(waiter);
    });
  }

  private release(thread: ComparatorWorker): void {
    if (this.disposed || !this.threads.has(thread)) {
      void thread.dispose().catch(() => undefined);
      return;
    }
    const waiter = this.waiters.shift();
    if (waiter) {
      this.leased.add(thread);
      waiter.resolve(thread);
    } else {
      this.idle.push(thread);
    }
  }

  /**
   * Retire a thread that timed out or died, and bring its replacement up.
   *
   * The replacement's slot is claimed before the dead thread is stopped, so a
   * caller arriving in between waits for it instead of finding the pool empty.
   */
  private retire(dead: ComparatorWorker): Promise<void> {
    this.starting += 1;
    return this.track(
      (async () => {
        try {
          await dead.dispose().catch(() => undefined);
          this.threads.delete(dead);
          await this.bringUp();
        } finally {
          this.starting -= 1;
          this.failIfStranded();
        }
      })(),
    );
  }

  /** Restores capacity lost to failed replacements, never past the bound. */
  private topUp(): void {
    while (!this.disposed && this.capacity() < this.size) void this.spawn();
  }

  private spawn(): Promise<void> {
    this.starting += 1;
    return this.track(
      (async () => {
        try {
          await this.bringUp();
        } finally {
          this.starting -= 1;
          this.failIfStranded();
        }
      })(),
    );
  }

  /** One thread, with bounded retries. The caller holds its slot. */
  private async bringUp(): Promise<void> {
    for (let attempt = 1; attempt <= this.spawnAttempts; attempt += 1) {
      if (this.disposed) return;
      const thread = this.createWorker();
      this.threads.add(thread);
      try {
        await thread.warmUp();
        if (this.disposed || !this.threads.has(thread)) {
          await thread.dispose().catch(() => undefined);
          return;
        }
        const reported = thread.version;
        if (reported === null) {
          throw new Error("comparator did not report its runtime version");
        }
        if (this.runtimeVersion !== null && reported !== this.runtimeVersion) {
          throw new Error(
            `comparator runtime changed from ${this.runtimeVersion} to ${reported}`,
          );
        }
        this.runtimeVersion = reported;
        this.failure = null;
        this.release(thread);
        return;
      } catch (error) {
        this.threads.delete(thread);
        await thread.dispose().catch(() => undefined);
        this.failure = error instanceof Error ? error : new Error(String(error));
        if (attempt < this.spawnAttempts) {
          await Promise.race([
            new Promise((resolve) => setTimeout(resolve, this.spawnRetryMs).unref()),
            this.disposedSignal,
          ]);
        }
      }
    }
  }

  /**
   * Waiters are served by a thread being released. When nothing is idle,
   * leased or on its way, nothing ever will be: they are failed with the cause
   * rather than left waiting. A comparator fault is a grader error, never a
   * wrong answer.
   */
  private failIfStranded(): void {
    if (this.capacity() > 0) return;
    const failure = this.failure ?? new Error("no comparator available");
    while (this.waiters.length > 0) this.waiters.shift()?.reject(failure);
  }

  private track(operation: Promise<void>): Promise<void> {
    const tracked = operation.catch(() => undefined).finally(() => {
      this.lifecycle.delete(tracked);
    });
    this.lifecycle.add(tracked);
    return tracked;
  }
}
