import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PyodideExecutionEngine } from "./pyodide-engine.js";

/**
 * Milestone 0's exit gate.
 *
 * Two boundaries are on trial here, and they are independent: one execution
 * must not contaminate another, and student code must not be able to forge the
 * verdict of its own execution. Recycling alone only ever addressed the first.
 */
describe("PyodideExecutionEngine", () => {
  const engine = new PyodideExecutionEngine("0.27.5", 2, 1);
  const limits = { stdin: "", timeLimitMs: 10_000, memoryLimitMb: 256 };

  beforeAll(async () => {
    await engine.warmUp();
  }, 120_000);

  afterAll(async () => {
    await engine.dispose();
  });

  describe("result integrity — the student cannot forge their own verdict", () => {
    /**
     * The original defect. `globals().clear()` never cleared `sys.modules`, and
     * the old harness serialized every result through `json.dumps`, so rebinding
     * it replaced the graded stdout of this run and every run that followed.
     */
    it("ignores a rebound json.dumps", async () => {
      const result = await engine.run({
        ...limits,
        code: [
          "import json",
          "json.dumps = lambda *a, **k: '{\"stdout\": \"FORGED\", \"stderr\": \"\", \"error\": null}'",
          "print('real output')",
        ].join("\n"),
      });

      expect(result.stdout).toContain("real output");
      expect(result.stdout).not.toContain("FORGED");
      expect(result.outcome).toBe("PASSED");
    });

    it("ignores a rebound print builtin", async () => {
      const result = await engine.run({
        ...limits,
        code: [
          "import builtins",
          "builtins.print = lambda *a, **k: None",
          "import sys",
          "sys.__stdout__.write('real output\\n')",
        ].join("\n"),
      });

      expect(result.stdout).toContain("real output");
    });

    it("cannot suppress a crash by rebinding the error path", async () => {
      // Neither excepthook nor a rebound stderr decides the verdict: the
      // exception surfaces to the host frame and sets the exit status there.
      const result = await engine.run({
        ...limits,
        code: [
          "import sys, io",
          "sys.excepthook = lambda *a: None",
          "sys.stderr = io.StringIO()",
          "raise ValueError('boom')",
        ].join("\n"),
      });

      expect(result.outcome).toBe("RUNTIME_ERROR");
    });

    it("cannot report success by exiting zero after a rebound stdout", async () => {
      const result = await engine.run({
        ...limits,
        code: [
          "import sys, io",
          "sys.stdout = io.StringIO()",
          "print('swallowed')",
        ].join("\n"),
      });

      // Their own choice, and it costs them: the parent read nothing, so the
      // comparison runs against nothing.
      expect(result.stdout).not.toContain("swallowed");
      expect(result.outcome).toBe("PASSED");
    });
  });

  describe("isolation between executions", () => {
    it("does not carry a poisoned module into the next execution", async () => {
      await engine.run({
        ...limits,
        code: [
          "import json",
          "json.dumps = lambda *a, **k: '{\"stdout\": \"FORGED\"}'",
          "import sys",
          "sys._poisoned = True",
        ].join("\n"),
      });

      const next = await engine.run({
        ...limits,
        code: [
          "import sys",
          "print(getattr(sys, '_poisoned', 'clean'))",
        ].join("\n"),
      });

      expect(next.stdout.trim()).toBe("clean");
    });

    it("does not leak globals between executions", async () => {
      await engine.run({ ...limits, code: "student_secret = 42" });
      const result = await engine.run({
        ...limits,
        code: "print('student_secret' in globals())",
      });

      expect(result.stdout.trim()).toBe("False");
    });

    it("gives every case of one submission fresh state", async () => {
      // Per case, not per submission: the grading loop calls run() once per
      // case, so this is the boundary that actually exists.
      await engine.run({ ...limits, code: "import sys\nsys._case = 1" });
      const second = await engine.run({
        ...limits,
        code: "import sys\nprint(getattr(sys, '_case', 'fresh'))",
      });

      expect(second.stdout.trim()).toBe("fresh");
    });
  });

  describe("host isolation", () => {
    it("exposes none of the judge's environment to student code", async () => {
      // Pyodide hands Python the host globalThis as `js`, and `js.Function` is
      // arbitrary JavaScript, so anything in the runner's environment is
      // readable by student code. The judge's own environment holds the
      // database and Redis credentials, so the runner is given none of it.
      //
      // Asserted by canary rather than by an empty key count: macOS injects
      // `__CF_USER_TEXT_ENCODING` into every process whatever we pass, and that
      // is the OS talking, not inheritance from the judge.
      process.env.COVE_TEST_CANARY = "canary-must-not-leak";
      try {
        const result = await engine.run({
          ...limits,
          code: [
            "import js",
            "env = js.process.env",
            "for name in ('COVE_TEST_CANARY', 'DATABASE_URL', 'REDIS_URL'):",
            "    print(name, getattr(env, name, None))",
          ].join(String.fromCharCode(10)),
        });

        expect(result.stdout).toContain("COVE_TEST_CANARY None");
        expect(result.stdout).toContain("DATABASE_URL None");
        expect(result.stdout).toContain("REDIS_URL None");
        expect(result.stdout).not.toContain("canary-must-not-leak");
      } finally {
        delete process.env.COVE_TEST_CANARY;
      }
    });

    it("does not let student code decide its own exit status", async () => {
      // The exit status is the verdict. While `process.exit` was read off
      // `process` at the point of use, replacing it through the `js` bridge
      // turned a raised ValueError into a PASSED — the traceback was printed
      // and the verdict said the program had succeeded.
      const result = await engine.run({
        ...limits,
        code: [
          "import js",
          "js.process.exit = js.Function('return () => {}')()",
          "print(123)",
          "raise ValueError('must fail')",
        ].join(String.fromCharCode(10)),
      });

      expect(result.outcome).toBe("RUNTIME_ERROR");
      expect(result.stdout).toBe("123" + String.fromCharCode(10));
      expect(result.stderr).toContain("ValueError");
    }, 30_000);

    it("does not expose an exit path to student code at all", async () => {
      const result = await engine.run({
        ...limits,
        code: [
          "import js",
          "print(getattr(js.process, 'exit', None), getattr(js.process, 'reallyExit', None), end='')",
        ].join(String.fromCharCode(10)),
      });

      expect(result.stdout).toBe("None None");
    });

    it("keeps serving after a runner dies", async () => {
      const after = await engine.run({ ...limits, code: "print('alive')" });
      expect(after.stdout.trim()).toBe("alive");
    });
  });

  describe("deadlines and termination", () => {
    it("terminates a busy loop at the deadline", async () => {
      const result = await engine.run({
        ...limits,
        code: "while True:\n    pass",
        timeLimitMs: 500,
      });

      expect(result.outcome).toBe("TIME_LIMIT");
      expect(result.runtimeMs).toBeLessThan(5_000);
    }, 30_000);

    it("terminates a loop that swallows interrupts", async () => {
      // Cooperative interruption is not a boundary; SIGKILL is.
      const result = await engine.run({
        ...limits,
        code: [
          "while True:",
          "    try:",
          "        pass",
          "    except BaseException:",
          "        continue",
        ].join("\n"),
        timeLimitMs: 500,
      });

      expect(result.outcome).toBe("TIME_LIMIT");
    }, 30_000);

    it("reports a crashed runner as a runtime error, not a pass", async () => {
      const result = await engine.run({
        ...limits,
        code: "import js\njs.process.exit(70)",
      });

      expect(result.outcome).toBe("RUNTIME_ERROR");
    });

    it("caps stdout before it is accumulated", async () => {
      const result = await engine.run({
        ...limits,
        code: "print('x' * 400_000)",
      });

      expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(256 * 1024);
    }, 30_000);
  });

  describe("stdio fidelity", () => {
    it("keeps output that has no trailing newline", async () => {
      // Python block-buffers stdout, so `end=""` leaves the last write sitting
      // in the buffer. The runner sets PYTHONUNBUFFERED, which is what Elice's
      // `python3 -u` does, and captures bytes rather than lines.
      const result = await engine.run({ ...limits, code: "print(123, end='')" });

      expect(result.stdout).toBe("123");
      expect(result.outcome).toBe("PASSED");
    });

    it("preserves non-ASCII output byte for byte", async () => {
      const result = await engine.run({
        ...limits,
        code: "print('é中\u00e9', end='')",
      });

      expect(result.stdout).toBe("é中é");
    });

    it("reads stdin to EOF", async () => {
      // An empty string is not EOF for the line-oriented callback, and
      // `sys.stdin.read()` spun on it until the case died on its time limit.
      const result = await engine.run({
        ...limits,
        code: "import sys" + String.fromCharCode(10) + "print(repr(sys.stdin.read()), end='')",
        stdin: "abc\n",
      });

      expect(result.outcome).toBe("PASSED");
      expect(result.stdout).toBe("'abc\\n'");
    });

    it("reads to EOF when no input was supplied", async () => {
      const result = await engine.run({
        ...limits,
        code: "import sys" + String.fromCharCode(10) + "print(repr(sys.stdin.read()), end='')",
        stdin: "",
      });

      expect(result.outcome).toBe("PASSED");
      expect(result.stdout).toBe("''");
    });

    it("raises EOFError when input() reads past the supplied data", async () => {
      const result = await engine.run({
        ...limits,
        code: "input()" + String.fromCharCode(10) + "input()",
        stdin: "only-one-line\n",
      });

      expect(result.outcome).toBe("RUNTIME_ERROR");
      expect(result.stderr).toContain("EOFError");
    });
  });

  describe("host lockdown", () => {
    const denied = async (expression: string): Promise<string> => {
      const result = await engine.run({
        ...limits,
        code:
          "import js" +
          String.fromCharCode(10) +
          `print(js.Function('try { ${expression}; return "REACHED" } catch (e) { return "DENIED" }')(), end='')`,
      });
      return result.stdout;
    };

    it("denies outbound network from the JavaScript bridge", async () => {
      expect(await denied('require("node:net")')).toContain("DENIED");
    });

    it("denies fetch", async () => {
      const result = await engine.run({
        ...limits,
        code: "import js" + String.fromCharCode(10) + "print(getattr(js, 'fetch', None), end='')",
      });
      expect(result.stdout).toBe("None");
    });

    it("denies native bindings", async () => {
      const result = await engine.run({
        ...limits,
        code:
          "import js" +
          String.fromCharCode(10) +
          "print(getattr(js.process, 'binding', None), end='')",
      });
      expect(result.stdout).toBe("None");
    });

    it("confines Python's own filesystem to the in-memory FS", async () => {
      const result = await engine.run({
        ...limits,
        code:
          "try:" +
          String.fromCharCode(10) +
          "    open('/etc/hostname').read()" +
          String.fromCharCode(10) +
          "    print('REACHED', end='')" +
          String.fromCharCode(10) +
          "except OSError:" +
          String.fromCharCode(10) +
          "    print('DENIED', end='')",
      });

      expect(result.stdout).toBe("DENIED");
    });
  });

  describe("chunked output decoding", () => {
    it("decodes multi-byte characters split across pipe chunks", async () => {
      // Each pipe chunk used to be decoded on its own, so a character whose
      // UTF-8 bytes straddled a chunk boundary came back as replacement
      // characters and the comparison failed on correct output. Flushing
      // between the bytes of one character forces that boundary.
      const result = await engine.run({
        ...limits,
        code: [
          "import sys",
          "raw = '한'.encode('utf-8')",
          "for byte in raw:",
          "    sys.stdout.buffer.write(bytes([byte]))",
          "    sys.stdout.buffer.flush()",
        ].join(String.fromCharCode(10)),
      });

      expect(result.stdout).toBe("한");
      expect(result.stdout).not.toContain("\uFFFD");
    }, 30_000);

    it("decodes a large multi-byte stream without corruption", async () => {
      const result = await engine.run({
        ...limits,
        code: "print('한글' * 5000, end='')",
      });

      expect(result.stdout).toBe("한글".repeat(5000));
    }, 30_000);
  });

  describe("signalling the judge", () => {
    it("does not expose the parent pid or the ability to signal it", async () => {
      // The runner shares the judge's OS identity, so `process.kill(ppid)`
      // would be a student stopping the judge itself.
      const result = await engine.run({
        ...limits,
        code: [
          "import js",
          "print(getattr(js.process, 'kill', None), getattr(js.process, 'ppid', None), getattr(js.process, 'abort', None), end='')",
        ].join(String.fromCharCode(10)),
      });

      expect(result.stdout).toBe("None None None");
    });
  });

  describe("resource limits", () => {
    it("ends a case that exceeds its memory limit", async () => {
      // `memoryLimitMb` was accepted and ignored while student code ran in the
      // judge's own threads. A process has memory of its own to measure.
      const result = await engine.run({
        ...limits,
        code: [
          "import asyncio",
          "blocks = []",
          "for _ in range(40):",
          "    blocks.append(bytearray(16 * 1024 * 1024))",
          "    await asyncio.sleep(0.02)",
        ].join(String.fromCharCode(10)),
        memoryLimitMb: 128,
        timeLimitMs: 20_000,
      });

      expect(result.outcome).toBe("MEMORY_LIMIT");
    }, 60_000);

    it("leaves no runner alive after one ignores SIGTERM", async () => {
      // `child.killed` means "a signal was delivered", not "the process is
      // gone". Guarding the SIGKILL on it skipped the kill once the deadline's
      // SIGTERM had been sent — and because the deadline settles the case
      // either way, the verdict still read TIME_LIMIT while the program kept
      // running. The leak is the symptom, so the leak is what this asserts.
      const pool = new PyodideExecutionEngine("0.27.5", 1, 0);
      await pool.warmUp();
      const [victim] = pool.stats().pids;
      expect(victim).toBeGreaterThan(0);
      const alive = (pid: number): boolean => {
        try {
          process.kill(pid, 0);
          return true;
        } catch {
          return false;
        }
      };
      try {
        const result = await pool.run({
          ...limits,
          code: [
            "import js, asyncio",
            "js.process.on('SIGTERM', js.Function('return () => {}')())",
            "await asyncio.sleep(60)",
          ].join(String.fromCharCode(10)),
          timeLimitMs: 700,
        });
        expect(result.outcome).toBe("TIME_LIMIT");

        await new Promise((resolve) => setTimeout(resolve, 1_000));
        expect(alive(victim)).toBe(false);
      } finally {
        await pool.dispose();
      }
    }, 90_000);
  });

  describe("memory monitoring failure", () => {
    it("refuses to grade when memory cannot be measured", async () => {
      // Fail closed. A measurement that cannot be taken is not a measurement
      // of zero: returning null used to mean the case simply ran unbounded,
      // and the production image has no `procps` for the `ps` fallback, so a
      // Linux `/proc` regression would have silently disabled the limit
      // everywhere at once. Grading throws instead, which `GradingService`
      // records as a judge fault costing the student no attempt.
      const blind = new PyodideExecutionEngine("0.27.5", 1, 0, () => null);
      await blind.warmUp();
      try {
        await expect(
          blind.run({ ...limits, code: "print('should not be graded')" }),
        ).rejects.toThrow(/could not be measured/);
      } finally {
        await blind.dispose();
      }
    }, 60_000);

    it("enforces the limit from the injected reader", async () => {
      let sample = 100;
      const climbing = new PyodideExecutionEngine("0.27.5", 1, 0, () => {
        sample += 200;
        return sample;
      });
      await climbing.warmUp();
      try {
        const result = await climbing.run({
          ...limits,
          code: "import asyncio" + String.fromCharCode(10) + "await asyncio.sleep(5)",
          memoryLimitMb: 128,
        });
        expect(result.outcome).toBe("MEMORY_LIMIT");
      } finally {
        await climbing.dispose();
      }
    }, 60_000);
  });

  describe("output draining", () => {
    it("waits for the pipes to finish before finalizing a result", async () => {
      // `exit` fires when the process is gone, not when its pipes are drained.
      // Finalizing there truncated output that had been written but not yet
      // read — the more a program printed just before ending, the more of its
      // answer went missing.
      const size = 200_000;
      const result = await engine.run({
        ...limits,
        code: `print('x' * ${size}, end='')`,
      });

      expect(result.stdout.length).toBe(size);
      expect(result.outcome).toBe("PASSED");
    }, 30_000);

    it("keeps stderr from a program that fails immediately after writing", async () => {
      const result = await engine.run({
        ...limits,
        code: [
          "import sys",
          "sys.stderr.write('y' * 50000)",
          "raise ValueError('after the write')",
        ].join(String.fromCharCode(10)),
      });

      expect(result.outcome).toBe("RUNTIME_ERROR");
      expect(result.stderr).toContain("y".repeat(50000));
      expect(result.stderr).toContain("ValueError");
    }, 30_000);
  });

  describe("shutdown", () => {
    it("terminates runners that are still warming", async () => {
      // Warming runners were tracked by a counter, so `dispose` knew how many
      // were booting but not which processes they were: shutdown returned
      // while freshly spawned interpreters were still coming up, and they
      // outlived the engine that started them.
      const pool = new PyodideExecutionEngine("0.27.5", 2, 1);
      const warming = pool.warmUp();
      // Long enough for the children to exist, short enough that none is warm.
      await new Promise((resolve) => setTimeout(resolve, 300));
      const pids = pool.stats().pids;
      expect(pids.length).toBeGreaterThan(0);

      await pool.dispose();

      // Checked the instant dispose returns, with no grace period. A warming
      // runner does eventually tear itself down once its boot finishes, so a
      // test that waits proves nothing: the guarantee is that shutdown does
      // not *return* while processes it started are still alive.
      const survivors = pids.filter((pid) => {
        try {
          process.kill(pid, 0);
          return true;
        } catch {
          return false;
        }
      });
      expect(survivors).toEqual([]);
      await warming.catch(() => undefined);
    }, 90_000);
  });

  describe("production build", () => {
    it("compiles the runner into the judge worker bundle", async () => {
      // The runner is spawned by path, never imported, so TypeScript cannot
      // discover it through the module graph — it has to be named explicitly.
      // The judge worker's include still listed the deleted `pyodide-thread.ts`
      // after this milestone replaced it, so a production build shipped an
      // engine whose runner was simply absent.
      const { readFile } = await import("node:fs/promises");
      const config = await readFile(
        new URL("../../../judge-worker/tsconfig.json", import.meta.url),
        "utf8",
      );

      expect(config).toContain("pyodide-runner.ts");
      expect(config).not.toContain("pyodide-thread.ts");
    });
  });

  describe("pool lifecycle", () => {
    it("never exceeds capacity + spare, however many cases are waiting", async () => {
      // The bound §2.4 asks for. Each runner is ~170MB, so if a queue of
      // waiting cases could pull new processes into existence, a submission
      // spike would become memory exhaustion instead of a queue.
      const pool = new PyodideExecutionEngine("0.27.5", 2, 1);
      await pool.warmUp();
      const seen: number[] = [];
      const watch = setInterval(() => seen.push(pool.stats().total), 25);
      try {
        await Promise.all(
          Array.from({ length: 8 }, () =>
            pool.run({ ...limits, code: "print(sum(range(200000)))" }),
          ),
        );
      } finally {
        clearInterval(watch);
        await pool.dispose();
      }

      expect(seen.length).toBeGreaterThan(0);
      expect(Math.max(...seen)).toBeLessThanOrEqual(3);
    }, 120_000);

    it("rejects waiting cases when the pool is disposed", async () => {
      // A stranded promise would hang a grading job forever rather than
      // failing it as a judge fault.
      const pool = new PyodideExecutionEngine("0.27.5", 1, 0);
      await pool.warmUp();
      // Handlers attached at creation, not after dispose: the rejection lands
      // during dispose, and a handler added a tick later is an unhandled one.
      const settle = (promise: Promise<unknown>): Promise<unknown> =>
        promise.then(
          () => null,
          (error: unknown) => error,
        );
      const first = settle(
        pool.run({ ...limits, code: "print(sum(range(400000)))" }),
      );
      const queued = settle(pool.run({ ...limits, code: "print('never')" }));
      await pool.dispose();

      await expect(queued).resolves.toMatchObject({
        message: expect.stringContaining("disposed"),
      });
      await first;
    }, 60_000);

    it("fails rather than hangs when runners cannot be spawned", async () => {
      const broken = new PyodideExecutionEngine("0.27.5", 1, 0);
      (broken as unknown as { runnerPath: string }).runnerPath =
        "/nonexistent/cove-runner-does-not-exist.js";

      await expect(
        broken.run({ ...limits, code: "print('unreachable')" }),
      ).rejects.toThrow();
      await broken.dispose();
    }, 60_000);

    it("settles a case exactly once when the runner dies mid-run", async () => {
      const result = await engine.run({
        ...limits,
        code: "import js" + String.fromCharCode(10) +
          "js.process.kill(js.process.pid, 'SIGKILL')",
      });

      // A signal death that was not our deadline is a crashed runner, and a
      // crash is not a pass.
      expect(result.outcome).toBe("RUNTIME_ERROR");
      expect(result.outcome).not.toBe("PASSED");
    }, 30_000);
  });

  describe("ordinary execution", () => {
    it("runs a program against stdin and reports its output", async () => {
      const result = await engine.run({
        ...limits,
        code: "a = int(input())\nb = int(input())\nprint(a + b)",
        stdin: "3\n4\n",
      });

      expect(result.stdout.trim()).toBe("7");
      expect(result.outcome).toBe("PASSED");
    });

    it("reports an uncaught exception with its type", async () => {
      const result = await engine.run({
        ...limits,
        code: "raise ValueError('bad input')",
      });

      expect(result.outcome).toBe("RUNTIME_ERROR");
      expect(result.stderr).toContain("ValueError");
      expect(result.stderr).toContain("bad input");
    });

    it("serves concurrent cases without sharing a process", async () => {
      const [first, second] = await Promise.all([
        engine.run({ ...limits, code: "import sys\nsys._a = 1\nprint('one')" }),
        engine.run({
          ...limits,
          code: "import sys\nprint(getattr(sys, '_a', 'clean'))",
        }),
      ]);

      expect(first.stdout.trim()).toBe("one");
      expect(second.stdout.trim()).toBe("clean");
    }, 30_000);
  });
});
