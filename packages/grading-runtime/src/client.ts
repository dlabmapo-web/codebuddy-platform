import { connect, type Socket } from "node:net";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { nativeRuntimeDescriptorSchema, sameNativeRuntime } from "@cove/shared";
import {
  wireResponseSchema,
  requestSchema,
  nativeRuntimeVersion,
  NativeInfrastructureError,
  type NativeRuntimeDescriptor,
  type NativeExecutionRequest,
  type NativeExecutionResult,
  type NativeHealth,
  type WireRequest,
  type WireResponse,
} from "./contract.js";
import { FrameDecoder, encodeFrame } from "./framing.js";
import type { Lane } from "./resource-bank.js";
export class NativeExecutionClient {
  readonly version: string;
  readonly descriptor: NativeRuntimeDescriptor;
  private sockets = new Set<Socket>();
  private disposed = false;
  private shutdown = new AbortController();
  constructor(
    private readonly options: {
      socketPath: string;
      descriptor: NativeRuntimeDescriptor;
      lane: Lane;
      acquisitionTimeoutMs?: number;
      requestTimeoutMs?: number;
    },
  ) {
    this.descriptor = nativeRuntimeDescriptorSchema.parse(options.descriptor);
    Object.freeze(this.descriptor.comparator);
    Object.freeze(this.descriptor);
    this.options = { ...options };
    this.version = nativeRuntimeVersion(this.descriptor);
  }
  private exchange(
    operation: "health" | "run",
    request?: WireRequest["request"],
    signal?: AbortSignal,
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
        this.options.requestTimeoutMs ?? (request?.timeLimitMs ?? 0) + 20_000,
      );
      combined.addEventListener("abort", abort, { once: true });
      socket.once("connect", () => {
        try {
          socket.write(
            encodeFrame({
              protocol: 1,
              id,
              descriptor: this.descriptor,
              operation,
              lane: this.options.lane,
              ...(request ? { request } : {}),
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
          if (response.result && operation !== "run")
            throw new NativeInfrastructureError(
              "Unexpected native execution result",
            );
          if (
            response.result &&
            (Buffer.byteLength(response.result.stdout) >
              (request?.outputLimitBytes ?? 8 * 1024 * 1024) ||
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
    const response = await this.exchange("health");
    if (!response.health)
      throw new NativeInfrastructureError("Invalid health response");
    return response.health;
  }
  async run(request: NativeExecutionRequest): Promise<NativeExecutionResult> {
    const { signal, ...data } = request;
    const parsed = requestSchema.parse(data);
    const acquisitionStarted = performance.now();
    const acquisitionEnd =
      performance.now() + (this.options.acquisitionTimeoutMs ?? 30_000);
    for (;;) {
      const attemptStarted = performance.now();
      const response = await this.exchange("run", parsed, signal);
      if (response.result) {
        if (response.result.timings)
          response.result.timings.acquisitionMs = Math.max(
            0,
            attemptStarted - acquisitionStarted,
          );
        return response.result;
      }
      if (
        response.error !== "UNAVAILABLE" ||
        performance.now() >= acquisitionEnd
      )
        throw new NativeInfrastructureError(
          `Native execution ${response.error ?? "invalid response"}`,
        );
      await delay(
        Math.min(100, Math.max(1, acquisitionEnd - performance.now())),
        undefined,
        {
          signal: signal
            ? AbortSignal.any([signal, this.shutdown.signal])
            : this.shutdown.signal,
        },
      );
    }
  }
  async dispose() {
    this.disposed = true;
    this.shutdown.abort();
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
  }
}
