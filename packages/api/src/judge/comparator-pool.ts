import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";

import type { CaseComparator } from "@cove/shared";

import { COMPARATOR_HARNESS } from "./comparator-runner.js";

/** Initial default from §3.1 of the implementation spec, recorded in policy. */
export const DEFAULT_COMPARATOR_BUDGET_MS = 100;
/** A comparator that ignores its interrupt is replaced rather than waited on. */
const TERMINATE_GRACE_MS = 100;
const STARTUP_TIMEOUT_MS = 30_000;

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
  | { kind: "error"; detail: string };

export type ComparisonRequest = {
  comparator: CaseComparator;
  actual: string;
  expected: string;
  budgetMs?: number;
};

type ThreadReply =
  | { type: "ready" }
  | { type: "result"; id: number; result: string }
  | { type: "fatal"; message: string };

class ComparatorThread {
  private readonly worker: Worker;
  private readonly interrupt = new Uint8Array(new SharedArrayBuffer(1));
  private readonly ready: Promise<void>;
  private readyResolve!: () => void;
  private readyReject!: (error: Error) => void;
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

  constructor() {
    this.ready = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    const runningTypeScript = import.meta.url.endsWith(".ts");
    const workerUrl = new URL(
      runningTypeScript ? "./comparator-thread.ts" : "./comparator-thread.js",
      import.meta.url,
    );
    this.worker = new Worker(fileURLToPath(workerUrl), {
      workerData: { interrupt: this.interrupt, harness: COMPARATOR_HARNESS },
      ...(runningTypeScript ? { execArgv: ["--import", "tsx"] } : {}),
    });
    const startup = setTimeout(() => {
      this.readyReject(new Error("comparator did not start in time"));
    }, STARTUP_TIMEOUT_MS);
    startup.unref();
    this.worker.on("message", (reply: ThreadReply) => {
      if (reply.type === "ready") {
        clearTimeout(startup);
        this.readyResolve();
        return;
      }
      if (reply.type === "fatal") {
        clearTimeout(startup);
        this.readyReject(new Error(reply.message));
        return;
      }
      const pending = this.pending;
      // A late reply to an abandoned request. Dropping it is the point.
      if (!pending || pending.id !== reply.id) return;
      this.finish(JSON.parse(reply.result) as ComparisonResult);
    });
    this.worker.on("error", (error) => {
      this.readyReject(error);
      this.dead = true;
      this.finish({ kind: "error", detail: String(error).slice(0, 200) });
    });
  }

  warmUp(): Promise<void> {
    return this.ready;
  }

  get isDead(): boolean {
    return this.dead;
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
          this.dead = true;
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
  }
}

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
 */
export class ComparatorPool {
  private readonly size: number;
  private readonly idle: ComparatorThread[] = [];
  private readonly waiters: Array<{
    resolve: (thread: ComparatorThread) => void;
    reject: (error: Error) => void;
  }> = [];
  private live = 0;
  private disposed = false;

  constructor(size = 1) {
    this.size = Math.max(1, size);
  }

  async warmUp(): Promise<void> {
    const threads = Array.from({ length: this.size }, () => new ComparatorThread());
    this.live = threads.length;
    await Promise.all(threads.map((thread) => thread.warmUp()));
    for (const thread of threads) this.release(thread);
  }

  async compare(request: ComparisonRequest): Promise<ComparisonResult> {
    if (this.disposed) return { kind: "error", detail: "pool disposed" };
    let thread: ComparatorThread;
    try {
      thread = await this.acquire();
    } catch (error) {
      return { kind: "error", detail: String(error).slice(0, 200) };
    }
    try {
      return await thread.compare(request);
    } finally {
      if (thread.isDead) {
        void this.replace(thread);
      } else {
        this.release(thread);
      }
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    while (this.waiters.length > 0) {
      this.waiters.shift()?.reject(new Error("comparator pool disposed"));
    }
    const threads = [...this.idle];
    this.idle.length = 0;
    await Promise.all(threads.map((thread) => thread.dispose()));
  }

  private acquire(): Promise<ComparatorThread> {
    if (this.disposed) {
      return Promise.reject(new Error("comparator pool disposed"));
    }
    const thread = this.idle.pop();
    if (thread) return Promise.resolve(thread);
    return new Promise<ComparatorThread>((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
  }

  private release(thread: ComparatorThread): void {
    if (this.disposed) {
      void thread.dispose();
      return;
    }
    const waiter = this.waiters.shift();
    if (waiter) waiter.resolve(thread);
    else this.idle.push(thread);
  }

  /** Retire a thread that timed out, and bring its replacement up warm. */
  private async replace(dead: ComparatorThread): Promise<void> {
    this.live -= 1;
    await dead.dispose().catch(() => undefined);
    if (this.disposed) return;
    const thread = new ComparatorThread();
    this.live += 1;
    try {
      await thread.warmUp();
      this.release(thread);
    } catch (error) {
      this.live -= 1;
      // Nothing is coming to serve them; failing is better than hanging, and a
      // comparator fault is a grader error rather than a wrong answer.
      const failure = error instanceof Error ? error : new Error(String(error));
      while (this.waiters.length > 0) this.waiters.shift()?.reject(failure);
    }
  }
}
