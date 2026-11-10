import { open, stat } from "node:fs/promises";
import { Logger } from "@nestjs/common";
import { nativeAnyRuntimeDescriptorSchema, nativeReleaseManifestSchema, type NativeAnyRuntimeDescriptor, type NativeReleaseManifest } from "@cove/shared";
import type { Prisma } from "../generated/prisma/client.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { ExerciseGradingSource } from "./grading-profile.js";
import { runtimeQueueName, type JudgeQueue } from "./judge.queue.js";

function freeze<T>(value: T): T {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
/** Bounded startup input, never a source-controlled claim that a node is ready. */
export async function loadNativeManifest(path: string): Promise<NativeReleaseManifest> {
  if (!path.startsWith("/")) throw new Error("Native manifest path must be absolute");
  const file = await open(path, "r");
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > 4 * 1024 * 1024) throw new Error("Native manifest exceeds limit");
    const bytes = Buffer.alloc(info.size + 1);
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    if (bytesRead > info.size) throw new Error("Native manifest changed while reading");
    return freeze(nativeReleaseManifestSchema.parse(JSON.parse(bytes.subarray(0, bytesRead).toString("utf8"))));
  } finally { await file.close(); }
}
/** A present malformed descriptor is an error, never implicit Pyodide routing. */
export function frozenNativeDescriptor(value: unknown): NativeAnyRuntimeDescriptor | null {
  return value == null ? null : nativeAnyRuntimeDescriptorSchema.parse(value);
}
export function nativeReadinessKey(descriptor: NativeAnyRuntimeDescriptor, lane: "official" | "background") {
  return `cove:native-ready:${runtimeQueueName("official", descriptor)}:${lane}`;
}
export const NATIVE_READINESS_HEARTBEAT = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
redis.call('ZADD', KEYS[1], now + 15000, ARGV[1])
redis.call('PEXPIRE', KEYS[1], 30000)
return 1
`;
const READ_READY = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
return redis.call('ZCARD', KEYS[1])
`;
export type NativeAdmissionContext = {
  academyId: string; materialId: string; gradingRevision: number;
  context: "live" | "preview"; kind: "official" | "staff-practice" | "sample" | "regrade" | "run";
};
export class NativeAdmission {
  private readonly logger = new Logger(NativeAdmission.name);
  private manifest?: Promise<NativeReleaseManifest>;
  /** The manifest file's identity when `manifest` was read; a new node release rewrites it. */
  private loaded?: { path: string; mtimeMs: number; size: number; ino: number };
  private lastFailureLog = 0;
  constructor(private readonly config: { get(key: string): unknown }, private readonly prisma: PrismaService, private readonly queue?: JudgeQueue) {}
  /**
   * The runtime new work goes to, or null. For Python, null means compatibility
   * grading. For C and C++ there is no compatibility runtime: callers refuse
   * the work as unavailable, never route it to Pyodide.
   */
  async select(context: NativeAdmissionContext, exercise: ExerciseGradingSource, reader: Pick<Prisma.TransactionClient, "academy"> = this.prisma): Promise<NativeAnyRuntimeDescriptor | null> {
    if (this.config.get("NATIVE_GRADING_ENABLED") !== true || !this.queue) return null;
    if (this.config.get("NATIVE_GRADING_BRIDGE_ACK") !== "filtered-compatibility-workers-v1") throw new Error("Native admission requires completed filtered compatibility worker rollout");
    const path = this.config.get("NATIVE_GRADING_MANIFEST") as string | undefined;
    if (!path) throw new Error("Enabled native admission requires a manifest");
    // The node publishes its manifest when it starts. Until it has, or while it
    // is unreadable, new work goes to compatibility grading rather than failing.
    let manifest: NativeReleaseManifest;
    try { manifest = await this.current(path); } catch (error) {
      if (Date.now() - this.lastFailureLog > 60_000) {
        this.lastFailureLog = Date.now();
        this.logger.warn(`native manifest unavailable, using compatibility grading: ${String(error)}`);
      }
      return null;
    }
    return this.certified(manifest, context, exercise, reader, true);
  }
  /** One stat per admission; the file is re-read only when a node release replaced it. */
  private async current(path: string): Promise<NativeReleaseManifest> {
    const info = await stat(path);
    const loaded = this.loaded;
    if (!this.manifest || !loaded || loaded.path !== path || loaded.mtimeMs !== info.mtimeMs || loaded.size !== info.size || loaded.ino !== info.ino) {
      this.loaded = { path, mtimeMs: info.mtimeMs, size: info.size, ino: info.ino };
      const reading = loadNativeManifest(path);
      // A failed read is retried on the next admission, never cached.
      reading.catch(() => { if (this.manifest === reading) { this.manifest = undefined; this.loaded = undefined; } });
      this.manifest = reading;
    }
    return this.manifest;
  }
  /** Repairs retain their original family. A new native revision needs explicit certification. */
  async retain(descriptor: NativeAnyRuntimeDescriptor, context: NativeAdmissionContext, exercise: ExerciseGradingSource, reader: Pick<Prisma.TransactionClient, "academy"> = this.prisma) {
    const path = this.config.get("NATIVE_GRADING_MANIFEST") as string | undefined;
    if (!path || !this.queue) throw new Error("Native repair requires retained certification");
    const manifest = await this.current(path);
    // Accepted repairs wait for their recorded capacity; Redis availability cannot change their durable intent.
    const selected = await this.certified(manifest, context, exercise, reader, false);
    if (!selected || runtimeQueueName("official", descriptor) !== runtimeQueueName("official", selected)) throw new Error("Native repair is not certified for its retained runtime");
    return selected;
  }
  private async certified(manifest: NativeReleaseManifest, context: NativeAdmissionContext, exercise: ExerciseGradingSource, reader: Pick<Prisma.TransactionClient, "academy">, requireReady: boolean) {
    const language = exercise.language ?? "PYTHON";
    // Each language has one native family: CPython, or GCC for C and C++.
    const descriptor = language === "PYTHON" ? manifest.descriptor : manifest.gcc;
    if (!descriptor) return null;
    // The node's certified class bounds every entry; the job gate refuses larger work.
    if (exercise.memoryLimitMb > Math.min(512, manifest.resources.maxCaseMemoryMb) || !exercise.testCases.length) return null;
    const longestCaseMs = Math.max(...exercise.testCases.map(c => c.timeLimitMsOverride ?? exercise.timeLimitMs));
    // A classroom certificate was qualified within these benchmark bounds; a scope is not.
    const benchmarkSized = exercise.testCases.length <= 10 &&
      Buffer.byteLength(exercise.testCases.map(c => c.input).join(""), "utf8") <= 65536;
    const academy = await reader.academy.findUnique({ where: { id: context.academyId }, select: { organizationId: true } });
    if (!academy || !manifest.eligibility.some(e => e.kinds.includes(context.kind) &&
      // An entry written before C/C++ lists no languages and admits Python only.
      (e.languages ?? ["PYTHON"]).includes(language) &&
      ("materialId" in e
        ? benchmarkSized && e.organizationId === academy.organizationId && e.academyId === context.academyId && e.materialId === context.materialId &&
          e.gradingRevision === context.gradingRevision && e.context === context.context &&
          e.memoryLimitMb === exercise.memoryLimitMb && e.timeLimitMs === exercise.timeLimitMs &&
          longestCaseMs <= (e.maxCaseTimeLimitMs ?? e.timeLimitMs)
        : (e.organizationId === undefined || e.organizationId === academy.organizationId) &&
          (e.academyId === undefined || e.academyId === context.academyId) &&
          e.contexts.includes(context.context) && longestCaseMs <= e.maxCaseTimeLimitMs))) return null;
    if (!requireReady) return descriptor;
    const redis = await this.queue!.redis();
    const count = Number(await redis.eval(READ_READY, 1, nativeReadinessKey(descriptor, context.kind === "official" ? "official" : "background")));
    return count > 0 ? descriptor : null;
  }
}
