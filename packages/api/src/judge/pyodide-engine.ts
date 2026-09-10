import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type {
  ExecutionEngine,
  ExecutionRequest,
  ExecutionResult,
} from "./execution-engine.js";

const MAX_OUTPUT_BYTES = 256 * 1024;
/** After the deadline the runner is signalled, then killed if it ignores it. */
const TERMINATE_GRACE_MS = 100;
/** A runner that never reports readiness is an infrastructure fault. */
const STARTUP_TIMEOUT_MS = 30_000;
const SPAWN_ATTEMPTS = 3;
const SPAWN_RETRY_MS = 1_000;
/** How often the parent checks a running case against its memory limit. */
const MEMORY_POLL_MS = 100;
/** How long a finished runner may take to drain its pipes before we stop waiting. */
const DRAIN_GRACE_MS = 2_000;
/** Consecutive unreadable samples before a case is abandoned as unmeasurable. */
const BLIND_SAMPLES_ALLOWED = 5;
const PAGE_BYTES = 4096;

/**
 * One student program's process, used once and killed.
 *
 * Worker threads cannot host this. Pyodide exposes the host `globalThis` to
 * Python as the `js` module, and `js.Function` is arbitrary JavaScript, so
 * student code inside a thread could read the judge's environment — database
 * and Redis credentials among it — and could call `process.exit` to take the
 * whole judge down with it. A child process is what makes those reachable
 * things worthless: it is spawned with an empty environment, it holds no
 * handles the parent cares about, and killing it is unconditional.
 */
class RunnerProcess {
  private readonly child: ChildProcess;
  private readonly ready: Promise<void>;
  private readonly stdoutChunks: Buffer[] = [];
  private readonly stderrChunks: Buffer[] = [];
  private stdoutBytes = 0;
  private stderrBytes = 0;
  private outputCapped = false;
  private exited: { code: number | null; signal: string | null } | null = null;
  private closed = false;
  private onClose: (() => void) | null = null;
  private killed = false;

  constructor(
    runnerPath: string,
    pyodideDir: string,
    /** Injected so the fail-closed path is testable without breaking /proc. */
    private readonly readRssMb: (pid: number) => number | null,
  ) {
    this.child = spawn(
      process.execPath,
      [
        // Node's permission model would belong here — it denies filesystem,
        // child processes and worker threads at the runtime rather than by
        // convention. It cannot be used: Pyodide calls `process.binding`, which
        // `--permission` refuses unconditionally, so the interpreter never
        // boots. The runner removes those entry points itself instead; see
        // `lockDownHost`.
        // A JS heap ceiling as a first bound; the parent's RSS check below is
        // what actually enforces the exercise's limit.
        "--max-old-space-size=512",
        runnerPath,
        pyodideDir,
      ],
      {
        // Empty, deliberately: everything the judge holds in its environment is
        // a secret to the code about to run here.
        env: {},
        stdio: ["ignore", "pipe", "pipe", "pipe"],
        // Its own process group, so that killing it kills anything it managed
        // to start rather than leaving orphans behind holding the CPU.
        detached: true,
      },
    );

    this.child.stdout?.on("data", (chunk: Buffer) => this.collect(chunk));
    this.child.stderr?.on("data", (chunk: Buffer) => {
      const room = MAX_OUTPUT_BYTES - this.stderrBytes;
      if (room <= 0) return;
      const kept = chunk.subarray(0, room);
      this.stderrChunks.push(kept);
      this.stderrBytes += kept.byteLength;
    });
    this.child.on("exit", (code, signal) => {
      this.exited = { code, signal };
      // Not settled here. `exit` fires when the process is gone, which is not
      // when its pipes are drained: output already written can still be
      // sitting unread, and finalising now truncates it. `close` is the event
      // that means every stdio stream is finished.
      //
      // The timer is a safety net, not the mechanism — a `close` that never
      // arrives would otherwise hang the case past its own deadline.
      const fallback = setTimeout(() => this.markClosed(), DRAIN_GRACE_MS);
      fallback.unref();
    });
    this.child.on("close", () => this.markClosed());

    this.ready = this.awaitReady();
  }

  warmUp(): Promise<void> {
    return this.ready;
  }

  /**
   * Truncate rather than buffer without bound; a flood is not a verdict.
   *
   * Bytes are kept as bytes and decoded once at the end. Decoding each pipe
   * chunk on its own splits any multi-byte character that straddles a chunk
   * boundary into replacement characters — a student printing Korean or an
   * emoji got `���` back, and the comparison then failed on output that was
   * actually correct.
   */
  private collect(chunk: Buffer): void {
    const room = MAX_OUTPUT_BYTES - this.stdoutBytes;
    if (chunk.byteLength > room) this.outputCapped = true;
    if (room <= 0) return;
    const kept = chunk.subarray(0, room);
    this.stdoutChunks.push(kept);
    this.stdoutBytes += kept.byteLength;
  }

  private get stdout(): string {
    return Buffer.concat(this.stdoutChunks).toString("utf8");
  }

  private get stderr(): string {
    return Buffer.concat(this.stderrChunks).toString("utf8");
  }

  private markClosed(): void {
    if (this.closed) return;
    this.closed = true;
    this.onClose?.();
  }

  private awaitReady(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.kill();
        reject(new Error("runner did not report readiness in time"));
      }, STARTUP_TIMEOUT_MS);
      timer.unref();

      let seen = "";
      const control = this.child.stdio[3];
      if (!control || !("on" in control)) {
        clearTimeout(timer);
        reject(new Error("runner control channel unavailable"));
        return;
      }
      control.on("data", (chunk: Buffer) => {
        seen += chunk.toString("utf8");
        if (seen.includes("READY")) {
          clearTimeout(timer);
          // Stop reading here. Everything the student writes to this channel
          // afterwards is ignored rather than mistaken for protocol.
          control.removeAllListeners("data");
          resolve();
        }
      });
      this.child.on("exit", () => {
        clearTimeout(timer);
        reject(new Error("runner exited before reporting readiness"));
      });
      this.child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  /**
   * Runs one case. Settles exactly once, whatever order the pipes, the timer
   * and the exit event arrive in.
   */
  async run(request: ExecutionRequest): Promise<ExecutionResult> {
    await this.ready;
    const startedAt = Date.now();

    return new Promise<ExecutionResult>((resolve, reject) => {
      let settled = false;
      let timedOut = false;
      let exceededMemory = false;
      let unmeasurable = false;

      const settle = (): void => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        clearTimeout(grace);
        clearInterval(memory);
        const runtimeMs = Date.now() - startedAt;
        if (unmeasurable) {
          reject(
            new Error("runner memory could not be measured; refusing to grade"),
          );
          return;
        }
        resolve(this.resultFor(timedOut, exceededMemory, runtimeMs));
      };

      const grace: NodeJS.Timeout = setTimeout(() => undefined, 0);
      clearTimeout(grace);

      // `memoryLimitMb` was accepted and ignored for as long as the judge ran
      // student code in its own threads, because a thread has no memory of its
      // own to measure. A process does.
      //
      // Measured as growth from the idle interpreter, not as absolute RSS: a
      // warm Pyodide is already ~170MB before the student's first statement, so
      // comparing the total against an exercise's limit would fail every
      // program on a 128MB budget and pass every one on a generous limit.
      const baselineMb = this.rssMb() ?? 0;
      let blindSamples = 0;
      const memory = setInterval(() => {
        const rss = this.rssMb();
        if (rss === null) {
          // Fail closed. A measurement that cannot be taken is not a
          // measurement of zero, and continuing would run the case with no
          // ceiling at all. A process that has already exited settles through
          // its own event, so repeated blindness here means monitoring is
          // broken rather than the case being over.
          blindSamples += 1;
          if (blindSamples >= BLIND_SAMPLES_ALLOWED) {
            unmeasurable = true;
            this.kill();
            settle();
          }
          return;
        }
        blindSamples = 0;
        if (rss - baselineMb > request.memoryLimitMb) {
          exceededMemory = true;
          this.kill();
          settle();
        }
      }, MEMORY_POLL_MS);
      memory.unref();

      const deadline = setTimeout(() => {
        timedOut = true;
        // Signal first, as the spec asks; a WASM loop will not service it, so
        // the unconditional kill below is what actually ends the case.
        this.child.kill("SIGTERM");
        const hard = setTimeout(() => {
          this.kill();
          settle();
        }, TERMINATE_GRACE_MS);
        hard.unref();
      }, request.timeLimitMs);
      deadline.unref();

      // Checked before the job is handed over, not only while it runs: a
      // program that finishes in twenty milliseconds would otherwise settle
      // long before the blind-sample threshold and be graded with no ceiling
      // at all, which is exactly the silent hole this is meant to close.
      if (this.rssMb() === null) {
        unmeasurable = true;
        this.kill();
        settle();
        return;
      }

      if (this.closed) {
        settle();
        return;
      }
      this.onClose = settle;

      const control = this.child.stdio[3];
      if (control && "write" in control) {
        // A runner killed before the job lands — the fail-closed path above
        // does exactly that — leaves a closed pipe behind. EPIPE here is that
        // race, not a fault to report: the case has already settled, and an
        // unhandled write error would take the judge down with it.
        control.on("error", () => undefined);
        control.write(
          `${JSON.stringify({ code: request.code, stdin: request.stdin })}\n`,
          () => undefined,
        );
      }
    });
  }

  private resultFor(
    timedOut: boolean,
    exceededMemory: boolean,
    runtimeMs: number,
  ): ExecutionResult {
    const exited = this.exited;
    const killedBySignal = exited?.signal !== null && exited?.signal !== undefined;

    if (exceededMemory) {
      return {
        stdout: this.stdout,
        stderr: "",
        outcome: "MEMORY_LIMIT",
        runtimeMs,
      };
    }
    if (timedOut) {
      return { stdout: this.stdout, stderr: "", outcome: "TIME_LIMIT", runtimeMs };
    }
    if (this.outputCapped) {
      // Truncation is not a crash; the comparison still runs on what was read.
      return {
        stdout: this.stdout,
        stderr: this.stderr,
        outcome: exited?.code === 0 ? "PASSED" : "RUNTIME_ERROR",
        runtimeMs,
      };
    }
    // 70 is the runner's own boot/protocol failure, and a signal death that was
    // not our deadline is a crashed runner. Neither is the student's verdict.
    if (exited?.code === 70 || (killedBySignal && !this.killed)) {
      return {
        stdout: this.stdout,
        stderr: this.stderr,
        outcome: "RUNTIME_ERROR",
        runtimeMs,
      };
    }
    return {
      stdout: this.stdout,
      stderr: exited?.code === 0 ? this.stderr : this.stderr.trim(),
      outcome: exited?.code === 0 ? "PASSED" : "RUNTIME_ERROR",
      runtimeMs,
    };
  }

  /**
   * Ends the runner and everything it started.
   *
   * Deliberately not guarded on `child.killed`: that flag means "a signal was
   * delivered", not "the process is gone", so after the SIGTERM at the deadline
   * it is already true and using it here would skip the SIGKILL entirely —
   * leaving a runaway program alive with its slot counted as freed. Only actual
   * exit ends the job.
   */
  get pid(): number | undefined {
    return this.child.pid;
  }

  kill(): void {
    this.killed = true;
    if (this.exited !== null) return;
    const pid = this.child.pid;
    if (pid === undefined) return;
    try {
      // Negative pid: the whole process group, so descendants die too.
      process.kill(-pid, "SIGKILL");
    } catch {
      try {
        this.child.kill("SIGKILL");
      } catch {
        // Already gone.
      }
    }
  }

  /** Resident memory of the runner, or null when it cannot be read. */
  private rssMb(): number | null {
    const pid = this.child.pid;
    if (pid === undefined || this.exited !== null) return null;
    return this.readRssMb(pid);
  }

  async dispose(): Promise<void> {
    if (this.closed) return;
    this.kill();
    await new Promise<void>((resolve) => {
      if (this.closed) {
        resolve();
        return;
      }
      this.onClose = resolve;
      // Same safety net: a killed process whose `close` is lost must not hold
      // shutdown open for ever.
      const fallback = setTimeout(resolve, DRAIN_GRACE_MS);
      fallback.unref();
    });
  }
}

/**
 * Resident memory of one pid in MB, or null when it cannot be read.
 *
 * `/proc` first, because it needs nothing installed: the production image is
 * built on a slim base and `ps` comes from `procps`, which it does not
 * install. Reading a pid's own `statm` is a plain file read on Linux, so the
 * limit is enforced by the same code path in development and production. The
 * `ps` branch is macOS, where `/proc` does not exist.
 */
export function readProcessRssMb(pid: number): number | null {
  try {
    // statm field 2 is resident pages.
    const pages = Number(
      readFileSync(`/proc/${pid}/statm`, "utf8").split(" ")[1],
    );
    if (Number.isFinite(pages)) return (pages * PAGE_BYTES) / (1024 * 1024);
  } catch {
    // Not Linux, or the process is already gone.
  }
  try {
    const kb = Number(
      execFileSync("ps", ["-o", "rss=", "-p", String(pid)], {
        encoding: "utf8",
      }).trim(),
    );
    return Number.isFinite(kb) ? kb / 1024 : null;
  } catch {
    return null;
  }
}

/**
 * A pool of pre-warmed runner processes, each used for exactly one case.
 *
 * Per case rather than per submission: it is the boundary the grading loop
 * already has, and it matches the fresh process Elice starts for every check.
 * Startup is roughly 750ms, so the pool keeps `capacity + spare` processes
 * warming ahead of demand — a spare shortens the wait but does not remove it
 * under sustained load, which is why total processes are bounded rather than
 * spawned on demand.
 */
export class PyodideExecutionEngine implements ExecutionEngine {
  readonly version: string;
  private readonly capacity: number;
  private readonly spare: number;
  private runnerPath: string;
  private readonly runningTypeScript: boolean;
  private readonly pyodideDir: string;
  private readonly idle: RunnerProcess[] = [];
  private readonly live = new Set<RunnerProcess>();
  private readonly waiters: Array<{
    resolve: (runner: RunnerProcess) => void;
    reject: (error: Error) => void;
  }> = [];
  /**
   * Runners that exist but are not yet warm.
   *
   * A set rather than a counter: a counter says how many are booting but not
   * which processes they are, so `dispose` had nothing to kill and could return
   * while freshly spawned interpreters were still coming up — surviving the
   * shutdown that was supposed to end them.
   */
  private readonly warmingRunners = new Set<RunnerProcess>();
  private disposed = false;
  private spawnFailure: Error | null = null;

  constructor(
    version = process.env.PYODIDE_VERSION ?? "0.27.5",
    concurrency = 1,
    spare = 1,
    private readonly readRssMb: (pid: number) => number | null = readProcessRssMb,
  ) {
    this.version = `pyodide-${version}`;
    this.capacity = Math.max(1, concurrency);
    this.spare = Math.max(0, spare);
    this.runningTypeScript = import.meta.url.endsWith(".ts");
    this.runnerPath = fileURLToPath(
      new URL(
        this.runningTypeScript ? "./pyodide-runner.ts" : "./pyodide-runner.js",
        import.meta.url,
      ),
    );
    // The narrowest tree the runner can still boot from: Pyodide's own package,
    // the compiled runner beside this file, and the module graph that resolves
    // them. Everything else — the judge's `.env`, the rest of the host — is
    // refused by the runtime, not by convention.
    const require = createRequire(import.meta.url);
    const pyodideDir = dirname(require.resolve("pyodide/package.json"));
    this.pyodideDir = pyodideDir;
    if (this.runningTypeScript) {
      // Development only. The runner cannot be loaded through tsx here: tsx
      // registers a module hook, `register()` needs a worker thread, and the
      // permission model denies workers — which is worth more than the
      // convenience. So the runner is transpiled once, to a temporary plain
      // module with its one bare import resolved to an absolute path, and the
      // child loads that with no loader at all. A built judge runs the
      // compiled `.js` directly and skips all of this.
      const source = readFileSync(this.runnerPath, "utf8").replace(
        'from "pyodide"',
        `from ${JSON.stringify(pathToFileURL(join(pyodideDir, "pyodide.mjs")).href)}`,
      );
      const esbuild = require("esbuild") as {
        transformSync: (
          input: string,
          options: Record<string, unknown>,
        ) => { code: string };
      };
      const compiled = esbuild.transformSync(source, {
        loader: "ts",
        format: "esm",
        target: "node22",
      }).code;
      // Real path, not the symlinked one: macOS resolves `/var/folders` to
      // `/private/var/folders`, and the permission allowlist is matched against
      // what the filesystem actually reports.
      const directory = realpathSync(mkdtempSync(join(tmpdir(), "cove-runner-")));
      this.runnerPath = join(directory, "pyodide-runner.mjs");
      writeFileSync(this.runnerPath, compiled, "utf8");
    }
  }



  /** Target warm processes: one per concurrency slot, plus the spares. */
  private get target(): number {
    return this.capacity + this.spare;
  }

  async warmUp(): Promise<void> {
    await Promise.all(
      Array.from({ length: this.target }, () => this.spawnOne()),
    );
  }

  async run(request: ExecutionRequest): Promise<ExecutionResult> {
    const runner = await this.acquire();
    try {
      return await runner.run(request);
    } finally {
      // Used once. Killing is what makes the next case a fresh interpreter,
      // and it is unconditional because the process holds nothing we need.
      //
      // Awaited before the pool forgets it: the bound counts processes, not
      // intentions, so releasing the slot and spawning the replacement while
      // the old one is still dying puts `capacity + spare + 1` interpreters
      // on the host — and if it is dying slowly, more than that.
      await runner.dispose().catch(() => undefined);
      this.live.delete(runner);
      this.top_up();
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    while (this.waiters.length > 0) {
      this.waiters.shift()?.reject(new Error("Execution engine disposed"));
    }
    // Warming runners included: they are real processes, and a shutdown that
    // returns while they are still booting leaves them running.
    const runners = [...this.live, ...this.idle, ...this.warmingRunners];
    this.live.clear();
    this.idle.length = 0;
    this.warmingRunners.clear();
    await Promise.all(runners.map((runner) => runner.dispose()));
  }

  private acquire(): Promise<RunnerProcess> {
    if (this.disposed) {
      return Promise.reject(new Error("Execution engine disposed"));
    }
    const runner = this.idle.pop();
    if (runner) {
      this.live.add(runner);
      this.top_up();
      return Promise.resolve(runner);
    }
    if (this.spawnFailure && this.warmingRunners.size === 0) {
      return Promise.reject(this.spawnFailure);
    }
    const waiting = new Promise<RunnerProcess>((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
    this.top_up();
    return waiting;
  }

  /**
   * Bring the pool back up to target.
   *
   * Executing, idle and warming processes all count against the one bound. A
   * waiting case must not add to it: each runner holds ~170MB, so letting
   * demand drive spawning turns a queue spike into memory exhaustion. Waiters
   * are served by the next process to finish warming, not by a new one.
   */
  private top_up(): void {
    if (this.disposed) return;
    const total = this.live.size + this.idle.length + this.warmingRunners.size;
    for (let index = total; index < this.target; index += 1) {
      void this.spawnOne().catch(() => undefined);
    }
  }

  /** Pool census. Read by the tests, and by the operations view in milestone 6. */
  stats(): {
    executing: number;
    idle: number;
    warming: number;
    total: number;
    pids: number[];
  } {
    return {
      executing: this.live.size,
      idle: this.idle.length,
      warming: this.warmingRunners.size,
      total:
        this.live.size + this.idle.length + this.warmingRunners.size,
      pids: [...this.live, ...this.idle, ...this.warmingRunners]
        .map((runner) => runner.pid)
        .filter((pid): pid is number => pid !== undefined),
    };
  }

  private async spawnOne(attempt = 1): Promise<void> {
    if (this.disposed) return;
    const runner = new RunnerProcess(
      this.runnerPath,
      this.pyodideDir,
      this.readRssMb,
    );
    this.warmingRunners.add(runner);
    try {
      await runner.warmUp();
      this.warmingRunners.delete(runner);
      if (this.disposed) {
        await runner.dispose();
        return;
      }
      this.spawnFailure = null;
      const waiter = this.waiters.shift();
      if (waiter) {
        this.live.add(runner);
        waiter.resolve(runner);
      } else {
        this.idle.push(runner);
      }
    } catch (error) {
      this.warmingRunners.delete(runner);
      await runner.dispose().catch(() => undefined);
      if (this.disposed) return;
      if (attempt < SPAWN_ATTEMPTS) {
        await new Promise((resolve) => {
          setTimeout(resolve, SPAWN_RETRY_MS).unref();
        });
        await this.spawnOne(attempt + 1);
        return;
      }
      // Out of retries: fail the waiting cases rather than hang them. Grading
      // records this as a judge fault, which costs the student no attempt.
      const failure = error instanceof Error ? error : new Error(String(error));
      this.spawnFailure = failure;
      while (this.waiters.length > 0) {
        this.waiters.shift()?.reject(failure);
      }
    }
  }
}
