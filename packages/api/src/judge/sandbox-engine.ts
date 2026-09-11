import { randomUUID } from "node:crypto";
import { createConnection, type Socket } from "node:net";

import type {
  ExecutionEngine,
  ExecutionRequest,
  ExecutionResult,
} from "./execution-engine.js";
import {
  readFrame,
  sandboxResponseSchema,
  writeFrame,
  type SandboxRequest,
  type SandboxResponse,
} from "./sandbox-protocol.js";

/**
 * Time allowed on top of a case's own limit: waiting for a warm runner under
 * load, a runner that has to be respawned, forced termination and pipe drain.
 * Past it the sandbox is treated as lost, which is a judge fault.
 */
const SANDBOX_SLACK_MS = 45_000;
const HEALTH_TIMEOUT_MS = 5_000;
/** The sandbox boots its own warm pool; the judge waits for it, within reason. */
const READY_WAIT_MS = 180_000;
const READY_POLL_MS = 1_000;

/**
 * Student code, executed somewhere else.
 *
 * The judge holds database and Redis credentials and needs the network to
 * reach them; student code must have neither. This engine is how the two are
 * kept apart: every case is sent over a Unix socket to the sandbox — a
 * separate container with no network interface but loopback, no secrets in
 * its environment, and a uid per runner — and only a validated result comes
 * back. Nothing student code does inside the sandbox can reach this process's
 * memory, filesystem, identity or network.
 *
 * A reply that is late, malformed, or answers a different request is an
 * infrastructure fault: the grade fails as a judge error, which costs the
 * student nothing, rather than taking an untrustworthy verdict.
 */
export class SandboxExecutionEngine implements ExecutionEngine {
  readonly version: string;
  private readonly sockets = new Set<Socket>();
  private disposed = false;

  constructor(
    private readonly socketPath: string,
    version: string,
    /** Production refuses a sandbox that could not prove its own isolation. */
    private readonly requireIsolation: boolean,
  ) {
    this.version = `pyodide-${version}`;
  }

  /**
   * Waits for the sandbox and checks what it says about itself: the same
   * runtime version the judge stamps on submissions, and — where required —
   * isolation it verified at its own boot.
   */
  async warmUp(): Promise<void> {
    const startedAt = Date.now();
    let lastError: unknown = null;
    while (Date.now() - startedAt < READY_WAIT_MS && !this.disposed) {
      try {
        const reply = await this.exchange(
          { type: "health", id: randomUUID() },
          HEALTH_TIMEOUT_MS,
        );
        if (reply.type !== "health") throw new Error("unexpected health reply");
        if (reply.engineVersion !== this.version) {
          throw new Error(
            `sandbox runs ${reply.engineVersion}, judge expects ${this.version}`,
          );
        }
        if (this.requireIsolation && !reply.isolated) {
          throw new Error("sandbox did not verify its isolation");
        }
        return;
      } catch (error) {
        lastError = error;
        // A version or isolation mismatch will not fix itself by waiting.
        if (error instanceof Error && /judge expects|isolation/.test(error.message)) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, READY_POLL_MS));
      }
    }
    throw new Error(`sandbox unavailable: ${String(lastError)}`);
  }

  async run(request: ExecutionRequest): Promise<ExecutionResult> {
    const reply = await this.exchange(
      {
        type: "run",
        id: randomUUID(),
        request: {
          code: request.code,
          stdin: request.stdin,
          timeLimitMs: request.timeLimitMs,
          memoryLimitMb: request.memoryLimitMb,
        },
      },
      request.timeLimitMs + SANDBOX_SLACK_MS,
    );
    if (reply.type === "error") {
      throw new Error(`sandbox could not run the case: ${reply.message}`);
    }
    if (reply.type !== "result") throw new Error("unexpected sandbox reply");
    return reply.result;
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
  }

  /**
   * One request, one validated reply for that request, within `timeoutMs`.
   * Settles exactly once; the connection is destroyed whatever happens.
   */
  private exchange(frame: SandboxRequest, timeoutMs: number): Promise<SandboxResponse> {
    if (this.disposed) return Promise.reject(new Error("sandbox engine disposed"));
    return new Promise<SandboxResponse>((resolve, reject) => {
      const socket = createConnection(this.socketPath);
      this.sockets.add(socket);
      let settled = false;
      const finish = (error: Error | null, reply?: SandboxResponse): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.sockets.delete(socket);
        socket.destroy();
        if (error) reject(error);
        else resolve(reply!);
      };
      const timer = setTimeout(
        () => finish(new Error("sandbox did not answer in time")),
        timeoutMs,
      );
      timer.unref();
      socket.on("error", (error) => finish(error));
      socket.once("connect", () => {
        writeFrame(socket, frame);
        readFrame(socket).then(
          (raw) => {
            const parsed = sandboxResponseSchema.safeParse(raw);
            if (!parsed.success) {
              finish(new Error("sandbox reply failed validation"));
              return;
            }
            if (parsed.data.id !== frame.id) {
              finish(new Error("sandbox reply is for a different request"));
              return;
            }
            finish(null, parsed.data);
          },
          (error: unknown) =>
            finish(error instanceof Error ? error : new Error(String(error))),
        );
      });
    });
  }
}
