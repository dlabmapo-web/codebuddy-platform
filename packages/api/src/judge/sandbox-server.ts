import { chmodSync, existsSync, unlinkSync } from "node:fs";
import { createServer, type Server, type Socket } from "node:net";
import { networkInterfaces } from "node:os";

import {
  PyodideExecutionEngine,
  RunnerIdentityPool,
} from "./pyodide-engine.js";
import {
  readFrame,
  sandboxRequestSchema,
  SANDBOX_PROTOCOL_VERSION,
  writeFrame,
} from "./sandbox-protocol.js";

/**
 * The student-code sandbox: the only process that runs submitted programs.
 *
 * It exists because a denylist inside the judge was never a boundary. The
 * judge holds the database and Redis credentials and needs the network to use
 * them, and every runner it spawned shared its container, uid, filesystem and
 * network namespace. This process runs in a container of its own instead —
 * no network interface but loopback, nothing secret in its environment, a
 * read-only filesystem — and executes each case as a uid used by nothing else
 * at the time. The judge reaches it over one Unix socket and gets back a
 * validated result; that socket is the whole of the interface.
 *
 * Inside, the runner lockdown (`pyodide-runner.ts`) still applies, as defence
 * in depth. It is no longer what the isolation rests on.
 *
 * Boot is fail-closed where isolation is required: the process checks its
 * own surroundings and refuses to serve if it can see a network, a secret, or
 * lacks the privilege to give runners their own identity. `health` reports the
 * result, and the production judge refuses a sandbox that did not pass.
 */

export type SandboxConfig = {
  socketPath: string;
  /** The group allowed to connect: the judge's. */
  clientGid: number | null;
  concurrency: number;
  spare: number;
  pyodideVersion: string;
  runnerUidBase: number | null;
  requireIsolation: boolean;
};

export function readSandboxConfig(environment: NodeJS.ProcessEnv): SandboxConfig {
  const integer = (name: string, fallback: number | null): number | null => {
    const raw = environment[name];
    if (raw === undefined || raw === "") return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value)) throw new Error(`${name} must be an integer`);
    return value;
  };
  return {
    socketPath: environment.SANDBOX_SOCKET_PATH ?? "/run/cove-sandbox/judge.sock",
    clientGid: integer("SANDBOX_CLIENT_GID", null),
    concurrency: integer("SANDBOX_CONCURRENCY", 2) ?? 2,
    spare: integer("SANDBOX_SPARE", 1) ?? 1,
    pyodideVersion: environment.PYODIDE_VERSION ?? "0.27.5",
    runnerUidBase: integer("SANDBOX_RUNNER_UID_BASE", null),
    requireIsolation: environment.SANDBOX_REQUIRE_ISOLATION === "1",
  };
}

/** Names that would mean the judge's secrets reached this container. */
const SECRET_NAME = /DATABASE|REDIS|SUPABASE|SECRET|PASSWORD|TOKEN|_KEY$|^KEY|CREDENTIAL/i;

/**
 * Everything wrong with where this process finds itself, empty when isolated.
 *
 * Exported for the tests, which run it against fabricated surroundings.
 */
export function isolationProblems(input: {
  interfaces: Record<string, unknown>;
  environment: NodeJS.ProcessEnv;
  uid: number;
  runnerUidBase: number | null;
  clientGid: number | null;
}): string[] {
  const problems: string[] = [];
  const reachable = Object.keys(input.interfaces).filter((name) => name !== "lo");
  if (reachable.length > 0) {
    problems.push(`network interfaces present: ${reachable.join(", ")}`);
  }
  const secrets = Object.keys(input.environment).filter((name) =>
    SECRET_NAME.test(name),
  );
  if (secrets.length > 0) {
    problems.push(`secret-looking environment: ${secrets.join(", ")}`);
  }
  if (input.runnerUidBase === null || input.runnerUidBase <= 0) {
    problems.push("SANDBOX_RUNNER_UID_BASE is not set");
  }
  if (input.uid !== 0) {
    // Only a privileged server can hand runners a uid of their own, and the
    // container grants it SETUID/SETGID/KILL and nothing else.
    problems.push("server cannot switch runner identity (not uid 0)");
  }
  if (input.clientGid === null) {
    problems.push("SANDBOX_CLIENT_GID is not set, so the socket cannot be restricted");
  }
  return problems;
}

/**
 * Starts serving. Refuses — before running anything — when isolation is
 * required and missing. Returns a handle whose `close` stops accepting work
 * and disposes every runner.
 */
export async function startSandbox(config: SandboxConfig): Promise<{
  isolated: boolean;
  version: string;
  close: () => Promise<void>;
}> {
  const problems = isolationProblems({
    interfaces: networkInterfaces(),
    environment: process.env,
    uid: process.getuid?.() ?? -1,
    runnerUidBase: config.runnerUidBase,
    clientGid: config.clientGid,
  });
  if (config.requireIsolation && problems.length > 0) {
    // Fail closed: a sandbox that cannot show it is one must not run code.
    throw new SandboxNotIsolatedError(problems);
  }
  const isolated = problems.length === 0;

  const identities =
    config.runnerUidBase !== null && (process.getuid?.() ?? -1) === 0
      ? new RunnerIdentityPool(
          config.runnerUidBase,
          // One per runner that can exist at once, and room for a slow sweep.
          (config.concurrency + config.spare) * 2,
        )
      : null;
  const engine = new PyodideExecutionEngine(
    config.pyodideVersion,
    config.concurrency,
    config.spare,
    undefined,
    identities,
  );
  await engine.warmUp();

  const server = createServer((socket) => {
    void serve(socket, engine, isolated);
  });
  await listen(server, config);

  return {
    isolated,
    version: engine.version,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await engine.dispose();
    },
  };
}

export class SandboxNotIsolatedError extends Error {
  constructor(readonly problems: string[]) {
    super(`sandbox refused to start:\n- ${problems.join("\n- ")}`);
  }
}

async function serve(
  socket: Socket,
  engine: PyodideExecutionEngine,
  isolated: boolean,
): Promise<void> {
  socket.on("error", () => undefined);
  let frame: unknown;
  try {
    frame = await readFrame(socket);
  } catch {
    socket.destroy();
    return;
  }
  const parsed = sandboxRequestSchema.safeParse(frame);
  if (!parsed.success) {
    socket.destroy();
    return;
  }
  const request = parsed.data;
  if (request.type === "health") {
    writeFrame(socket, {
      type: "health",
      id: request.id,
      protocol: SANDBOX_PROTOCOL_VERSION,
      engineVersion: engine.version,
      isolated,
    });
    socket.end();
    return;
  }
  try {
    const result = await engine.run(request.request);
    writeFrame(socket, {
      type: "result",
      id: request.id,
      result: {
        stdout: result.stdout,
        stderr: result.stderr,
        outcome: result.outcome,
        runtimeMs: Math.max(0, Math.round(result.runtimeMs)),
      },
    });
  } catch (error) {
    writeFrame(socket, {
      type: "error",
      id: request.id,
      message: String(error).slice(0, 500),
    });
  }
  socket.end();
}

/**
 * Listens with the socket usable by the judge's group and nobody else.
 *
 * The socket file is created while this process's effective gid is the
 * judge's, which gives it that group without needing CAP_CHOWN, and is then
 * made `0660`. A runner has its own uid and gid, so even a program that got
 * out of its interpreter cannot connect and queue work under another identity.
 */
async function listen(server: Server, config: SandboxConfig): Promise<void> {
  if (existsSync(config.socketPath)) unlinkSync(config.socketPath);
  const switchGroup =
    config.clientGid !== null && typeof process.setegid === "function" &&
    (process.getuid?.() ?? -1) === 0;
  const previousGid = process.getegid?.();
  if (switchGroup) process.setegid!(config.clientGid!);
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(config.socketPath, () => {
        server.off("error", reject);
        resolve();
      });
    });
    chmodSync(config.socketPath, 0o660);
  } finally {
    if (switchGroup && previousGid !== undefined) process.setegid!(previousGid);
  }
}
