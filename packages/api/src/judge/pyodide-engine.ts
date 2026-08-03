import { Worker } from "node:worker_threads";

import type {
  ExecutionEngine,
  ExecutionRequest,
  ExecutionResult,
} from "./execution-engine.js";

type ThreadReply =
  | { type: "ready" }
  | { type: "result"; id: number; result: ExecutionResult }
  | { type: "fatal"; id?: number; message: string };

type WaitingRun = {
  resolve: (result: ExecutionResult) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

/**
 * A single warm Pyodide interpreter hosted in a worker thread.
 *
 * The timeout is owned by the parent thread and writes SIGINT into shared
 * memory. This matters: a timer beside Pyodide cannot fire while
 * `while True: pass` occupies that same event loop.
 */
class RuntimeThread {
  private readonly worker: Worker;
  private readonly interrupt = new Uint8Array(new SharedArrayBuffer(1));
  private readonly ready: Promise<void>;
  private readyResolve!: () => void;
  private readyReject!: (error: Error) => void;
  private nextId = 1;
  private waiting: WaitingRun | null = null;

  constructor() {
    this.ready = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    const runningTypeScript = import.meta.url.endsWith(".ts");
    const workerUrl = new URL(
      runningTypeScript ? "./pyodide-thread.ts" : "./pyodide-thread.js",
      import.meta.url,
    );
    this.worker = new Worker(workerUrl, {
      workerData: { interrupt: this.interrupt },
      ...(runningTypeScript ? { execArgv: ["--import", "tsx"] } : {}),
    });
    this.worker.on("message", (reply: ThreadReply) => this.onMessage(reply));
    this.worker.on("error", (error) => this.fail(error));
    this.worker.on("exit", (code) => {
      if (code !== 0) this.fail(new Error(`Pyodide thread exited with ${code}`));
    });
  }

  warmUp(): Promise<void> {
    return this.ready;
  }

  async run(request: ExecutionRequest): Promise<ExecutionResult> {
    await this.ready;
    if (this.waiting) throw new Error("Pyodide thread received concurrent work");

    const id = this.nextId++;
    return new Promise<ExecutionResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        Atomics.store(this.interrupt, 0, 2);
      }, request.timeLimitMs);
      this.waiting = { resolve, reject, timer };
      this.worker.postMessage({ type: "run", id, request });
    });
  }

  async dispose(): Promise<void> {
    this.fail(new Error("Pyodide thread disposed"));
    await this.worker.terminate();
  }

  private onMessage(reply: ThreadReply): void {
    if (reply.type === "ready") {
      this.readyResolve();
      return;
    }
    if (reply.type === "fatal") {
      this.fail(new Error(reply.message));
      return;
    }
    const waiting = this.waiting;
    if (!waiting) return;
    clearTimeout(waiting.timer);
    Atomics.store(this.interrupt, 0, 0);
    this.waiting = null;
    waiting.resolve(reply.result);
  }

  private fail(error: Error): void {
    this.readyReject(error);
    const waiting = this.waiting;
    if (!waiting) return;
    clearTimeout(waiting.timer);
    this.waiting = null;
    waiting.reject(error);
  }
}

/**
 * A small pool gives BullMQ one persistent interpreter per concurrency slot.
 * Calls wait for a free slot; runtimes are never shared concurrently.
 */
export class PyodideExecutionEngine implements ExecutionEngine {
  readonly version: string;
  private readonly threads: RuntimeThread[];
  private readonly available: RuntimeThread[] = [];
  private readonly waiters: Array<(thread: RuntimeThread) => void> = [];

  constructor(
    version = process.env.PYODIDE_VERSION ?? "0.27.5",
    concurrency = 1,
  ) {
    this.version = `pyodide-${version}`;
    this.threads = Array.from(
      { length: Math.max(1, concurrency) },
      () => new RuntimeThread(),
    );
  }

  async warmUp(): Promise<void> {
    await Promise.all(this.threads.map((thread) => thread.warmUp()));
    this.available.push(...this.threads);
  }

  async run(request: ExecutionRequest): Promise<ExecutionResult> {
    const thread = await this.acquire();
    try {
      return await thread.run(request);
    } finally {
      this.release(thread);
    }
  }

  async dispose(): Promise<void> {
    await Promise.all(this.threads.map((thread) => thread.dispose()));
    this.available.length = 0;
  }

  private acquire(): Promise<RuntimeThread> {
    const thread = this.available.pop();
    if (thread) return Promise.resolve(thread);
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  private release(thread: RuntimeThread): void {
    const waiter = this.waiters.shift();
    if (waiter) waiter(thread);
    else this.available.push(thread);
  }
}
