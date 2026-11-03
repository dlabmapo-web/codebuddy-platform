import { createServer, type Server, type Socket } from "node:net";
import { chmod, lstat, mkdir, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import {
  nativeReleaseManifestSchema,
  sameNativeRuntime,
  type NativeReleaseManifest,
} from "@cove/shared";
import {
  wireRequestSchema,
  type NativeExecutionRequest,
  type NativeExecutionResult,
  type WireResponse,
  NativeInfrastructureError,
} from "./contract.js";
import { ResourceBank } from "./resource-bank.js";
import { FrameDecoder, encodeFrame } from "./framing.js";
export class CleanupUncertainError extends NativeInfrastructureError {}
export interface NativeBackend {
  /** Must verify identity and exercise the actual kernel boundary before returning. */
  prepare(): Promise<void>;
  /** Shares the service's capacity accounting, for prewarmed standby work. */
  attach?(bank: ResourceBank): void;
  /** Releases idle prewarmed work; called after every request has settled. */
  close?(): Promise<void>;
  /** Resolves/rejects only after cleanup; uncertainty MUST throw CleanupUncertainError. */
  execute(
    request: NativeExecutionRequest,
    signal: AbortSignal,
    draining: () => void,
  ): Promise<NativeExecutionResult>;
}
export class NativeExecutionService {
  readonly generation = randomUUID();
  readonly manifest: NativeReleaseManifest;
  readonly bank: ResourceBank;
  private server?: Server;
  private sockets = new Set<Socket>();
  private runs = new Set<Promise<void>>();
  private ready = false;
  private pendingFrameBytes = 0;
  constructor(
    private readonly options: {
      socketPath: string;
      manifest: NativeReleaseManifest;
      backend: NativeBackend;
      frameTimeoutMs?: number;
      startupAllowanceMs?: number;
      cleanupAllowanceMs?: number;
    },
  ) {
    this.manifest = nativeReleaseManifestSchema.parse(options.manifest);
    this.bank = new ResourceBank(this.manifest.resources);
    this.options = Object.freeze({ ...options, manifest: this.manifest });
    // Freeze the full service generation, including nested descriptor objects.
    const freeze = (x: object) => {
      Object.values(x).forEach((v) => {
        if (v && typeof v === "object") freeze(v);
      });
      Object.freeze(x);
    };
    freeze(this.manifest);
  }
  async listen() {
    if (this.server)
      throw new NativeInfrastructureError("Service already started");
    this.options.backend.attach?.(this.bank);
    await this.options.backend.prepare();
    const directory = dirname(this.options.socketPath);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const stat = await lstat(directory);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      (stat.mode & 0o077) !== 0 ||
      stat.uid !== process.getuid?.()
    )
      throw new NativeInfrastructureError(
        "Socket directory must be owned and private (0700)",
      );
    // Never unlink an unknown/live socket on startup.
    this.server = createServer((socket) => this.accept(socket));
    this.server.maxConnections = this.manifest.resources.cpuSlots + 2;
    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(this.options.socketPath, () => {
        this.server!.off("error", reject);
        resolve();
      });
    });
    await chmod(this.options.socketPath, 0o600);
    this.ready = true;
  }
  private accept(socket: Socket) {
    this.sockets.add(socket);
    const controller = new AbortController();
    let reserved = 0;
    const releaseFrame = () => {
      this.pendingFrameBytes -= reserved;
      reserved = 0;
    };
    const decoder = new FrameDecoder(undefined, (bytes) => {
      // Leave room for UTF-8 decode, JSON strings and service baseline inside overhead.
      if (
        this.pendingFrameBytes + bytes >
        (this.manifest.resources.serviceOverheadMb * 1024 * 1024) / 4
      )
        throw new NativeInfrastructureError("Pending frame budget full");
      this.pendingFrameBytes += bytes;
      reserved = bytes;
    });
    let received = false;
    const timer = setTimeout(
      () => socket.destroy(),
      this.options.frameTimeoutMs ?? 5000,
    );
    socket.on("error", () => controller.abort());
    socket.once("close", () => {
      clearTimeout(timer);
      releaseFrame();
      this.sockets.delete(socket);
      controller.abort();
    });
    socket.on("data", (chunk) => {
      try {
        if (received) throw new Error("Only one request per connection");
        const parsed = decoder.push(chunk);
        if (parsed === undefined) return;
        received = true;
        clearTimeout(timer);
        releaseFrame();
        const operation = this.handle(parsed, socket, controller);
        this.runs.add(operation);
        void operation.finally(() => this.runs.delete(operation));
      } catch {
        socket.destroy();
      }
    });
  }
  private async handle(
    raw: unknown,
    socket: Socket,
    controller: AbortController,
  ) {
    const parsed = wireRequestSchema.safeParse(raw);
    if (!parsed.success) {
      socket.destroy();
      return;
    }
    const request = parsed.data;
    const respond = async (
      body: Pick<WireResponse, "result" | "health" | "error">,
    ) => {
      if (socket.destroyed) return;
      const frame = encodeFrame({
        protocol: 1,
        id: request.id,
        descriptor: this.manifest.descriptor,
        generation: this.generation,
        ...body,
      });
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          socket.destroy();
          finish();
        }, 5000);
        const finish = () => {
          clearTimeout(timeout);
          socket.off("close", finish);
          resolve();
        };
        socket.once("close", finish);
        socket.end(frame, finish);
      });
    };
    if (!sameNativeRuntime(request.descriptor, this.manifest.descriptor)) {
      await respond({ error: "INVALID_REQUEST" });
      return;
    }
    if (request.operation === "health") {
      const { active, draining, quarantined } = this.bank.snapshot();
      await respond({
        health: {
          ready: this.ready && this.bank.ready,
          generation: this.generation,
          descriptor: this.manifest.descriptor,
          active,
          draining,
          quarantined,
        },
      });
      return;
    }
    if (!this.ready || !this.bank.ready) {
      await respond({ error: "UNAVAILABLE" });
      return;
    }
    let allocation;
    try {
      allocation = this.bank.acquire(
        request.request!.memoryLimitMb,
        request.lane,
      );
    } catch {
      await respond({
        error:
          request.request!.memoryLimitMb >
          this.manifest.resources.maxCaseMemoryMb
            ? "INVALID_REQUEST"
            : "UNAVAILABLE",
      });
      return;
    }
    const timeout = setTimeout(
      () => controller.abort(),
      request.request!.timeLimitMs +
        (this.options.startupAllowanceMs ?? 10000) +
        (this.options.cleanupAllowanceMs ?? 5000),
    );
    try {
      const result = await this.options.backend.execute(
        request.request!,
        controller.signal,
        allocation.draining,
      );
      allocation.draining();
      await respond(
        controller.signal.aborted ? { error: "CANCELLED" } : { result },
      );
      allocation.cleaned();
    } catch (error) {
      if (error instanceof CleanupUncertainError) allocation.quarantine();
      else allocation.cleaned();
      // Setup failures remove the generation from admission; capacity contention above doesn't.
      if (!controller.signal.aborted) this.bank.quarantine();
      await respond({
        error: controller.signal.aborted ? "CANCELLED" : "INFRASTRUCTURE",
      });
    } finally {
      clearTimeout(timeout);
    }
  }
  async close() {
    this.ready = false;
    for (const socket of this.sockets) socket.destroy();
    await Promise.allSettled(this.runs);
    await this.options.backend.close?.();
    if (this.server)
      await new Promise<void>((resolve) => this.server!.close(() => resolve()));
    if (this.server) await unlink(this.options.socketPath).catch(() => {});
  }
}
