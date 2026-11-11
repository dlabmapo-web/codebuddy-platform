import { connect, type Socket } from "node:net";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { nativeAnyRuntimeDescriptorSchema, sameNativeRuntime } from "@cove/shared";
import {
  wireResponseSchema,
  binaryRequestSchema,
  compileRequestSchema,
  requestSchema,
  nativeRuntimeVersion,
  NativeInfrastructureError,
  type NativeAnyRuntimeDescriptor,
  type NativeBinaryRequest,
  type NativeCompileRequest,
  type NativeCompileResult,
  type NativeExecutionRequest,
  type NativeExecutionResult,
  type NativeHealth,
  type WireRequest,
  type WireResponse,
} from "./contract.js";
import { FrameDecoder, encodeFrame } from "./framing.js";
import type { Lane } from "./resource-bank.js";
import { GCC_COMPILE_LIMITS } from "./policy.js";
type Body = Pick<WireRequest, "request" | "binary" | "compile" | "release">;
/**
 * A case for either runtime. CPython runs `code`; a GCC client runs the
 * artifact its compile leased and ignores `code`.
 */
export type NativeRunRequest = NativeExecutionRequest & {
  artifact?: string;
  lease?: string;
  /** An interactive C/C++ Run: see `binaryRequestSchema.holdStdin`. */
  holdStdin?: boolean;
};
export class NativeExecutionClient {
  readonly version: string;
  readonly descriptor: NativeAnyRuntimeDescriptor;
  private sockets = new Set<Socket>();
  private disposed = false;
  private shutdown = new AbortController();
  constructor(
    private readonly options: {
      socketPath: string;
      descriptor: NativeAnyRuntimeDescriptor;
      lane: Lane;
      acquisitionTimeoutMs?: number;
      requestTimeoutMs?: number;
    },
  ) {
    this.descriptor = nativeAnyRuntimeDescriptorSchema.parse(options.descriptor);
    const freeze = (x: object) => {
      Object.values(x).forEach((v) => {
        if (v && typeof v === "object") freeze(v);
      });
      Object.freeze(x);
    };
    freeze(this.descriptor);
    this.options = { ...options };
    this.version = nativeRuntimeVersion(this.descriptor);
  }
  private exchange(
    operation: WireRequest["operation"],
    body: Body,
    signal?: AbortSignal,
    budgetMs = 0,
  ): Promise<WireResponse> {
    if (this.disposed)
      return Promise.reject(
        new NativeInfrastructureError("Native client disposed"),
      );
    const combined = signal
      ? AbortSignal.any([signal, this.shutdown.signal])
      : this.shutdown.signal;
    return new Promise((resolve, reject) => {
      if (combined.aborted) {
        reject(combined.reason);
        return;
      }
      const id = randomUUID();
      const socket = connect(this.options.socketPath);
      this.sockets.add(socket);
      const decoder = new FrameDecoder();
      let done = false;
      const finish = (error?: unknown, response?: WireResponse) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        combined.removeEventListener("abort", abort);
        socket.destroy();
        this.sockets.delete(socket);
        if (error) reject(error);
        else resolve(response!);
      };
      const abort = () =>
        finish(
          new NativeInfrastructureError("Native request cancelled", {
            cause: combined.reason,
          }),
        );
      const timer = setTimeout(
        () =>
          finish(
            new NativeInfrastructureError("Native server deadline exceeded"),
          ),
        this.options.requestTimeoutMs ?? budgetMs + 20_000,
      );
      combined.addEventListener("abort", abort, { once: true });
      socket.once("connect", () => {
        try {
          socket.write(
            encodeFrame({
              protocol: 2,
              id,
              descriptor: this.descriptor,
              operation,
              lane: this.options.lane,
              ...body,
            }),
          );
        } catch (error) {
          finish(error);
        }
      });
      socket.on("error", (error) =>
        finish(
          new NativeInfrastructureError("Native socket failure", {
            cause: error,
          }),
        ),
      );
      socket.once("close", () => {
        if (!done)
          finish(
            new NativeInfrastructureError(
              "Native server disconnected before response",
            ),
          );
      });
      socket.on("data", (chunk) => {
        try {
          const raw = decoder.push(chunk);
          if (raw === undefined) return;
          const response = wireResponseSchema.parse(raw);
          if (
            response.id !== id ||
            !sameNativeRuntime(response.descriptor, this.descriptor)
          )
            throw new NativeInfrastructureError(
              "Native response identity mismatch",
            );
          if (
            response.health &&
            (operation !== "health" ||
              response.health.generation !== response.generation ||
              !sameNativeRuntime(response.health.descriptor, this.descriptor))
          )
            throw new NativeInfrastructureError(
              "Invalid native readiness identity",
            );
          if (
            (response.result && operation !== "run") ||
            (response.compiled && operation !== "compile") ||
            (response.released && operation !== "release")
          )
            throw new NativeInfrastructureError(
              "Unexpected native response body",
            );
          const limit = (body.request ?? body.binary)?.outputLimitBytes;
          if (
            response.result &&
            (Buffer.byteLength(response.result.stdout) >
              (limit ?? 8 * 1024 * 1024) ||
              Buffer.byteLength(response.result.stderr) > 256 * 1024)
          )
            throw new NativeInfrastructureError(
              "Native result exceeded byte limits",
            );
          finish(undefined, response);
        } catch (error) {
          finish(error);
        }
      });
    });
  }
  async health(): Promise<NativeHealth> {
    const response = await this.exchange("health", {});
    if (!response.health)
      throw new NativeInfrastructureError("Invalid health response");
    return response.health;
  }
  /**
   * Retries a healthy busy answer (a slot or the artifact store) within the
   * acquisition budget. A slot frees when a case exits, typically within
   * milliseconds: back off from a short first retry. Acquisition never extends
   * the learner's allowance and no ambiguous execution is retried.
   */
  private async acquire<T>(
    attempt: () => Promise<WireResponse>,
    take: (response: WireResponse) => T | undefined,
    signal?: AbortSignal,
  ): Promise<{ value: T; acquisitionMs: number }> {
    const acquisitionStarted = performance.now();
    const acquisitionEnd =
      performance.now() + (this.options.acquisitionTimeoutMs ?? 30_000);
    let retryMs = 5;
    for (;;) {
      const attemptStarted = performance.now();
      const response = await attempt();
      const value = take(response);
      if (value !== undefined)
        return { value, acquisitionMs: Math.max(0, attemptStarted - acquisitionStarted) };
      if (
        response.error !== "UNAVAILABLE" ||
        performance.now() >= acquisitionEnd
      )
        throw new NativeInfrastructureError(
          `Native execution ${response.error ?? "invalid response"}`,
        );
      await delay(
        Math.min(retryMs, Math.max(1, acquisitionEnd - performance.now())),
        undefined,
        {
          signal: signal
            ? AbortSignal.any([signal, this.shutdown.signal])
            : this.shutdown.signal,
        },
      );
      retryMs = Math.min(100, retryMs * 2);
    }
  }
  async run(request: NativeRunRequest): Promise<NativeExecutionResult> {
    const { signal } = request;
    const limits = {
      stdin: request.stdin,
      timeLimitMs: request.timeLimitMs,
      memoryLimitMb: request.memoryLimitMb,
      ...(request.outputLimitBytes === undefined ? {} : { outputLimitBytes: request.outputLimitBytes }),
    };
    const body: Body =
      this.descriptor.engine === "native-gcc"
        ? { binary: binaryRequestSchema.parse({ ...limits, artifact: request.artifact, lease: request.lease, ...(request.holdStdin ? { holdStdin: true } : {}) }) }
        : {
            request: requestSchema.parse({
              ...limits,
              code: request.code,
              ...(request.inputPromptPolicy === undefined ? {} : { inputPromptPolicy: request.inputPromptPolicy }),
            }),
          };
    const { value, acquisitionMs } = await this.acquire(
      () => this.exchange("run", body, signal, request.timeLimitMs),
      (response) => response.result,
      signal,
    );
    if (value.timings) value.timings.acquisitionMs = acquisitionMs;
    return value;
  }
  /** GCC only: compiles or reuses the cached build, leased for this attempt. */
  async compile(request: NativeCompileRequest): Promise<NativeCompileResult> {
    if (this.descriptor.engine !== "native-gcc")
      throw new NativeInfrastructureError("Only a GCC runtime compiles");
    const { signal, ...data } = request;
    const body: Body = { compile: compileRequestSchema.parse(data) };
    const { value } = await this.acquire(
      () => this.exchange("compile", body, signal, GCC_COMPILE_LIMITS.wallMs),
      (response) => response.compiled,
      signal,
    );
    return value;
  }
  /** Ends a lease early; an unknown or expired lease is already released. */
  async release(lease: string): Promise<void> {
    if (this.descriptor.engine !== "native-gcc") return;
    const response = await this.exchange("release", { release: { lease } });
    if (!response.released)
      throw new NativeInfrastructureError(
        `Native release ${response.error ?? "invalid response"}`,
      );
  }
  async dispose() {
    this.disposed = true;
    this.shutdown.abort();
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
  }
}
