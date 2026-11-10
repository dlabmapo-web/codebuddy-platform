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
  type NativeBinaryRequest,
  type NativeCompileRequest,
  type NativeCompileResult,
  type NativeExecutionRequest,
  type NativeExecutionResult,
  type WireResponse,
  NativeInfrastructureError,
} from "./contract.js";
import { ArtifactLeaseError, ArtifactStoreBusyError } from "./artifact-store.js";
import { GCC_COMPILE_LIMITS } from "./policy.js";
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
  /**
   * Resolves/rejects only after cleanup; uncertainty MUST throw CleanupUncertainError.
   * A backend may hand over a final result earlier through `deliver`, once
   * nothing can change it; the caller still holds capacity until this settles.
   */
  execute(
    request: NativeExecutionRequest,
    signal: AbortSignal,
    draining: () => void,
    deliver?: (result: NativeExecutionResult) => void,
  ): Promise<NativeExecutionResult>;
  /** The service leaf within its overhead, checked on every health probe. */
  withinServiceOverhead?(): boolean;
  /** native-gcc: absent on a CPython-only backend. */
  readonly gccAvailable?: boolean;
  withdrawGcc?(reason: string): void;
  cachedCompile?(request: NativeCompileRequest): NativeCompileResult | undefined;
  compile?(
    request: NativeCompileRequest,
    signal: AbortSignal,
    draining: () => void,
  ): Promise<NativeCompileResult>;
  executeBinary?(
    request: NativeBinaryRequest,
    signal: AbortSignal,
    draining: () => void,
    deliver?: (result: NativeExecutionResult) => void,
  ): Promise<NativeExecutionResult>;
  releaseLease?(lease: string): void;
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
    // Admission is the bank's decision, answered UNAVAILABLE so the client
    // retries. This cap only bounds descriptors: past it the kernel connection
    // is reset, which a worker sees as a judge failure. Leave room for one run
    // and one closing socket per slot plus health probes and busy retries.
    this.server.maxConnections = this.manifest.resources.cpuSlots * 4 + 8;
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
    const gcc = request.descriptor.engine === "native-gcc";
    const descriptor = gcc ? this.manifest.gcc : this.manifest.descriptor;
    const backend = this.options.backend;
    const respond = async (
      body: Pick<WireResponse, "result" | "health" | "compiled" | "released" | "error">,
    ) => {
      if (socket.destroyed) return;
      const frame = encodeFrame({
        protocol: 2,
        id: request.id,
        descriptor: descriptor ?? this.manifest.descriptor,
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
    if (!descriptor || !sameNativeRuntime(request.descriptor, descriptor)) {
      await respond({ error: "INVALID_REQUEST" });
      return;
    }
    // A cache grown past the service overhead withdraws readiness, not memory
    // that cases and standbys were promised.
    const ready =
      this.ready &&
      this.bank.ready &&
      (backend.withinServiceOverhead?.() ?? true) &&
      (!gcc || backend.gccAvailable === true);
    if (request.operation === "health") {
      const { active, draining, quarantined } = this.bank.snapshot();
      await respond({
        health: {
          ready,
          generation: this.generation,
          descriptor,
          active,
          draining,
          quarantined,
        },
      });
      return;
    }
    if (request.operation === "release") {
      backend.releaseLease?.(request.release!.lease);
      await respond({ released: true });
      return;
    }
    if (!ready) {
      await respond({ error: "UNAVAILABLE" });
      return;
    }
    if (request.operation === "compile") {
      // The same source already compiled: lease it, no slot needed.
      let cached: NativeCompileResult | undefined;
      try {
        cached = backend.cachedCompile?.(request.compile!);
      } catch {
        await respond({ error: "UNAVAILABLE" });
        return;
      }
      if (cached) {
        await respond({ compiled: cached });
        return;
      }
    }
    const memoryLimitMb =
      request.operation === "compile"
        ? this.manifest.resources.maxCaseMemoryMb
        : (request.binary ?? request.request)!.memoryLimitMb;
    const limitMs =
      request.operation === "compile"
        ? GCC_COMPILE_LIMITS.wallMs
        : (request.binary ?? request.request)!.timeLimitMs;
    let allocation;
    try {
      allocation = this.bank.acquire(memoryLimitMb, request.lane);
    } catch {
      await respond({
        error:
          memoryLimitMb > this.manifest.resources.maxCaseMemoryMb
            ? "INVALID_REQUEST"
            : "UNAVAILABLE",
      });
      return;
    }
    const timeout = setTimeout(
      () => controller.abort(),
      limitMs +
        (this.options.startupAllowanceMs ?? 10000) +
        (this.options.cleanupAllowanceMs ?? 5000),
    );
    // The worker waits on this reply for its next case; cleanup of the finished
    // one continues behind it while the allocation stays charged.
    let replied: Promise<void> | undefined;
    const deliver = (result: NativeExecutionResult) => {
      allocation.draining();
      replied ??= respond(
        controller.signal.aborted ? { error: "CANCELLED" } : { result },
      );
    };
    try {
      if (request.operation === "compile") {
        const compiled = await backend.compile!(
          request.compile!,
          controller.signal,
          allocation.draining,
        );
        replied = respond(
          controller.signal.aborted ? { error: "CANCELLED" } : { compiled },
        );
      } else if (gcc)
        deliver(
          await backend.executeBinary!(
            request.binary!,
            controller.signal,
            allocation.draining,
            deliver,
          ),
        );
      else
        deliver(
          await backend.execute(
            request.request!,
            controller.signal,
            allocation.draining,
            deliver,
          ),
        );
      await replied;
      allocation.cleaned();
    } catch (error) {
      if (error instanceof CleanupUncertainError) allocation.quarantine();
      else allocation.cleaned();
      // A full store or a lapsed lease is contention, not a broken runtime.
      const contention =
        error instanceof ArtifactStoreBusyError ||
        error instanceof ArtifactLeaseError;
      // Setup failures remove the runtime from admission; capacity contention
      // doesn't. GCC withdraws only itself unless cleanup is uncertain, which
      // leaves the shared envelope unaccounted.
      if (!controller.signal.aborted && !contention) {
        if (gcc && !(error instanceof CleanupUncertainError))
          backend.withdrawGcc?.(error instanceof Error ? error.message : String(error));
        else this.bank.quarantine();
      }
      await (replied ??
        respond({
          error: controller.signal.aborted
            ? "CANCELLED"
            : error instanceof ArtifactStoreBusyError
              ? "UNAVAILABLE"
              : contention
                ? "INVALID_REQUEST"
                : "INFRASTRUCTURE",
        }));
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
