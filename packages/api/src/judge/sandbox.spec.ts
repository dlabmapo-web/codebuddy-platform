import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PyodideExecutionEngine, RunnerIdentityPool } from "./pyodide-engine.js";
import { SandboxExecutionEngine } from "./sandbox-engine.js";
import { readFrame, writeFrame } from "./sandbox-protocol.js";
import {
  isolationProblems,
  SandboxNotIsolatedError,
  startSandbox,
} from "./sandbox-server.js";

/**
 * The student-code sandbox and the judge's client for it.
 *
 * The OS half of the boundary — no network, no secrets, a uid per runner — is
 * a property of the container and is exercised against a real one (see the
 * verification notes in the implementation spec). What is tested here is the
 * half that lives in code: that the sandbox refuses to run when it cannot show
 * it is isolated, and that the judge accepts nothing from it but a
 * well-formed answer to the question it asked.
 */

const clean = {
  interfaces: { lo: [] },
  environment: { PATH: "/usr/bin", NODE_ENV: "production", PYODIDE_VERSION: "0.27.5" },
  uid: 0,
  runnerUidBase: 20_000,
  clientGid: 1001,
};

describe("sandbox isolation self-check", () => {
  it("passes a container with only loopback, no secrets and identity switching", () => {
    expect(isolationProblems(clean)).toEqual([]);
  });

  it("refuses a container that can reach a network", () => {
    expect(isolationProblems({ ...clean, interfaces: { lo: [], eth0: [] } })).toEqual([
      "network interfaces present: eth0",
    ]);
  });

  it("refuses a container holding the judge's secrets", () => {
    const problems = isolationProblems({
      ...clean,
      environment: {
        ...clean.environment,
        DATABASE_URL: "postgres://",
        REDIS_URL: "redis://",
        SUPABASE_SERVICE_ROLE_KEY: "x",
      },
    });
    expect(problems).toEqual([
      "secret-looking environment: DATABASE_URL, REDIS_URL, SUPABASE_SERVICE_ROLE_KEY",
    ]);
  });

  it("refuses to run runners under the server's own identity", () => {
    expect(isolationProblems({ ...clean, uid: 1001 })).toContain(
      "server cannot switch runner identity (not uid 0)",
    );
    expect(isolationProblems({ ...clean, runnerUidBase: null })).toContain(
      "SANDBOX_RUNNER_UID_BASE is not set",
    );
    expect(isolationProblems({ ...clean, clientGid: null })).toContain(
      "SANDBOX_CLIENT_GID is not set, so the socket cannot be restricted",
    );
  });

  it("will not start when isolation is required and missing", async () => {
    // This machine has a network and is not uid 0, which is exactly what a
    // misconfigured production container would look like.
    await expect(
      startSandbox({
        socketPath: join(tmpdir(), "never.sock"),
        clientGid: null,
        concurrency: 1,
        spare: 0,
        pyodideVersion: "0.27.5",
        runnerUidBase: null,
        requireIsolation: true,
      }),
    ).rejects.toBeInstanceOf(SandboxNotIsolatedError);
  });
});

describe("runner identities", () => {
  it("hands each runner its own uid and sweeps it before reuse", () => {
    const swept: number[] = [];
    const pool = new RunnerIdentityPool(20_000, 2, (uid) => swept.push(uid));

    const first = pool.acquire();
    const second = pool.acquire();
    expect(first).toEqual({ uid: 20_000, gid: 20_000 });
    expect(second).toEqual({ uid: 20_001, gid: 20_001 });
    expect(() => pool.acquire()).toThrow("no runner identity available");

    pool.release(first);
    expect(swept).toEqual([20_000]);
    expect(pool.acquire()).toEqual(first);
  });

  it("refuses uid 0 as a runner identity", () => {
    expect(() => new RunnerIdentityPool(0, 2)).toThrow();
  });

  it("names the runtime it actually loads, and refuses a configuration that disagrees", () => {
    // Grading compares this with the version recorded on each submission, so
    // it must be the installed Pyodide, not whatever the environment claims.
    expect(new PyodideExecutionEngine("0.27.5").version).toBe("pyodide-0.27.5");
    expect(new PyodideExecutionEngine(undefined).version).toBe("pyodide-0.27.5");
    expect(() => new PyodideExecutionEngine("0.28.0")).toThrow(
      "PYODIDE_VERSION is 0.28.0, but the installed runtime is 0.27.5",
    );
  });

  it("refuses an engine with fewer identities than runners", () => {
    expect(
      () =>
        new PyodideExecutionEngine(
          "0.27.5",
          2,
          1,
          undefined,
          new RunnerIdentityPool(20_000, 2, () => undefined),
        ),
    ).toThrow("fewer runner identities than runners");
  });
});

describe("sandbox round trip", () => {
  const directory = mkdtempSync(join(tmpdir(), "cove-sandbox-"));
  const socketPath = join(directory, "judge.sock");
  let sandbox: Awaited<ReturnType<typeof startSandbox>>;
  let engine: SandboxExecutionEngine;

  beforeAll(async () => {
    sandbox = await startSandbox({
      socketPath,
      clientGid: null,
      concurrency: 1,
      spare: 1,
      pyodideVersion: "0.27.5",
      runnerUidBase: null,
      requireIsolation: false,
    });
    engine = new SandboxExecutionEngine(socketPath, "0.27.5", false);
    await engine.warmUp();
  }, 120_000);

  afterAll(async () => {
    await engine?.dispose();
    await sandbox?.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("runs a program and returns what it printed", async () => {
    const result = await engine.run({
      code: "a, b = map(int, input().split())\nprint(a + b)",
      stdin: "20 22\n",
      timeLimitMs: 5_000,
      memoryLimitMb: 128,
    });

    expect(result).toEqual(
      expect.objectContaining({ outcome: "PASSED", stdout: "42\n" }),
    );
  }, 60_000);

  it("reports a crash and a time limit as verdicts", async () => {
    const crash = await engine.run({
      code: "raise ValueError('nope')",
      stdin: "",
      timeLimitMs: 5_000,
      memoryLimitMb: 128,
    });
    const loop = await engine.run({
      code: "while True:\n    pass",
      stdin: "",
      timeLimitMs: 300,
      memoryLimitMb: 128,
    });

    expect(crash.outcome).toBe("RUNTIME_ERROR");
    expect(crash.stderr).toContain("ValueError");
    expect(loop.outcome).toBe("TIME_LIMIT");
  }, 60_000);

  it("refuses a sandbox running a different runtime than the judge stamps", async () => {
    const mismatched = new SandboxExecutionEngine(socketPath, "9.9.9", false);
    await expect(mismatched.warmUp()).rejects.toThrow("judge expects pyodide-9.9.9");
  });

  it("refuses an unverified sandbox where isolation is required", async () => {
    // This sandbox is the development one, honestly reporting isolated=false.
    const strict = new SandboxExecutionEngine(socketPath, "0.27.5", true);
    await expect(strict.warmUp()).rejects.toThrow("did not verify its isolation");
  });
});

describe("the judge trusts only a well-formed answer to its own question", () => {
  const directory = mkdtempSync(join(tmpdir(), "cove-fake-sandbox-"));
  let server: Server | null = null;

  afterAll(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  /** A sandbox that answers every request with `reply(request)`. */
  const fake = async (
    name: string,
    reply: (request: { id: string }) => unknown,
  ): Promise<SandboxExecutionEngine> => {
    server?.close();
    const socketPath = join(directory, `${name}.sock`);
    server = createServer((socket) => {
      socket.on("error", () => undefined);
      void readFrame(socket).then((request) => {
        const answer = reply(request as { id: string });
        if (answer === undefined) {
          socket.destroy();
          return;
        }
        if (typeof answer === "string") socket.end(answer);
        else {
          writeFrame(socket, answer);
          socket.end();
        }
      });
    });
    await new Promise<void>((resolve) => server!.listen(socketPath, resolve));
    return new SandboxExecutionEngine(socketPath, "0.27.5", false);
  };

  const request = { code: "print(1)", stdin: "", timeLimitMs: 100, memoryLimitMb: 64 };
  const passing = { stdout: "1\n", stderr: "", outcome: "PASSED", runtimeMs: 5 };

  it("rejects an answer to a different request", async () => {
    const engine = await fake("other-id", () => ({
      type: "result",
      id: "00000000-0000-4000-8000-000000000000",
      result: passing,
    }));
    await expect(engine.run(request)).rejects.toThrow("different request");
  });

  it("rejects a verdict that is not one", async () => {
    const engine = await fake("bad-outcome", (frame) => ({
      type: "result",
      id: frame.id,
      result: { ...passing, outcome: "PASSED_WITH_WARNING" },
    }));
    await expect(engine.run(request)).rejects.toThrow("failed validation");
  });

  it("rejects something that is not JSON", async () => {
    const engine = await fake("garbage", () => "not json\n");
    await expect(engine.run(request)).rejects.toThrow("not JSON");
  });

  it("treats a dropped connection as a judge fault", async () => {
    const engine = await fake("drop", () => undefined);
    await expect(engine.run(request)).rejects.toThrow();
  });

  it("treats the sandbox's own failure as a judge fault", async () => {
    const engine = await fake("error", (frame) => ({
      type: "error",
      id: frame.id,
      message: "no runner identity available",
    }));
    await expect(engine.run(request)).rejects.toThrow("could not run the case");
  });

  it("treats a missing sandbox as a judge fault", async () => {
    const engine = new SandboxExecutionEngine(join(directory, "absent.sock"), "0.27.5", false);
    await expect(engine.run(request)).rejects.toThrow();
  });

  it("accepts a well-formed answer to its own request", async () => {
    const engine = await fake("good", (frame) => ({
      type: "result",
      id: frame.id,
      result: passing,
    }));
    await expect(engine.run(request)).resolves.toEqual(passing);
    server?.close();
  });
});
