import { open } from "node:fs/promises";
import { nativeReleaseManifestSchema, nativeRuntimeDescriptorSchema, type NativeReleaseManifest, type NativeRuntimeDescriptor } from "@cove/shared";
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
export function frozenNativeDescriptor(value: unknown): NativeRuntimeDescriptor | null {
  return value == null ? null : nativeRuntimeDescriptorSchema.parse(value);
}
export function nativeReadinessKey(descriptor: NativeRuntimeDescriptor, lane: "official" | "background") {
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
  context: "live" | "preview"; kind: "official" | "staff-practice" | "sample" | "regrade";
};
export class NativeAdmission {
  private manifest?: Promise<NativeReleaseManifest>;
  constructor(private readonly config: { get(key: string): unknown }, private readonly prisma: PrismaService, private readonly queue?: JudgeQueue) {}
  async select(context: NativeAdmissionContext, exercise: ExerciseGradingSource, reader: Pick<Prisma.TransactionClient, "academy"> = this.prisma): Promise<NativeRuntimeDescriptor | null> {
    if (this.config.get("NATIVE_GRADING_ENABLED") !== true || !this.queue) return null;
    if (this.config.get("NATIVE_GRADING_BRIDGE_ACK") !== "filtered-compatibility-workers-v1") throw new Error("Native admission requires completed filtered compatibility worker rollout");
    const path = this.config.get("NATIVE_GRADING_MANIFEST") as string | undefined;
    if (!path) throw new Error("Enabled native admission requires a manifest");
    const manifest = await (this.manifest ??= loadNativeManifest(path));
    return this.certified(manifest, context, exercise, reader, true);
  }
  /** Repairs retain their original family. A new native revision needs explicit certification. */
  async retain(descriptor: NativeRuntimeDescriptor, context: NativeAdmissionContext, exercise: ExerciseGradingSource, reader: Pick<Prisma.TransactionClient, "academy"> = this.prisma) {
    const path = this.config.get("NATIVE_GRADING_MANIFEST") as string | undefined;
    if (!path || !this.queue) throw new Error("Native repair requires retained certification");
    const manifest = await (this.manifest ??= loadNativeManifest(path));
    // Accepted repairs wait for their recorded capacity; Redis availability cannot change their durable intent.
    const selected = await this.certified(manifest, context, exercise, reader, false);
    if (!selected || runtimeQueueName("official", descriptor) !== runtimeQueueName("official", selected)) throw new Error("Native repair is not certified for its retained runtime");
    return selected;
  }
  private async certified(manifest: NativeReleaseManifest, context: NativeAdmissionContext, exercise: ExerciseGradingSource, reader: Pick<Prisma.TransactionClient, "academy">, requireReady: boolean) {
    // The node's certified class bounds every entry; the job gate refuses larger work.
    if (exercise.memoryLimitMb > Math.min(512, manifest.resources.maxCaseMemoryMb) || !exercise.testCases.length) return null;
    const longestCaseMs = Math.max(...exercise.testCases.map(c => c.timeLimitMsOverride ?? exercise.timeLimitMs));
    // A classroom certificate was qualified within these benchmark bounds; a scope is not.
    const benchmarkSized = exercise.testCases.length <= 10 &&
      Buffer.byteLength(exercise.testCases.map(c => c.input).join(""), "utf8") <= 65536;
    const academy = await reader.academy.findUnique({ where: { id: context.academyId }, select: { organizationId: true } });
    if (!academy || !manifest.eligibility.some(e => e.organizationId === academy.organizationId && e.kinds.includes(context.kind) &&
      ("materialId" in e
        ? benchmarkSized && e.academyId === context.academyId && e.materialId === context.materialId &&
          e.gradingRevision === context.gradingRevision && e.context === context.context &&
          e.memoryLimitMb === exercise.memoryLimitMb && e.timeLimitMs === exercise.timeLimitMs &&
          longestCaseMs <= (e.maxCaseTimeLimitMs ?? e.timeLimitMs)
        : (e.academyId === undefined || e.academyId === context.academyId) &&
          e.contexts.includes(context.context) && longestCaseMs <= e.maxCaseTimeLimitMs))) return null;
    if (!requireReady) return manifest.descriptor;
    const redis = await this.queue!.redis();
    const count = Number(await redis.eval(READ_READY, 1, nativeReadinessKey(manifest.descriptor, context.kind === "official" ? "official" : "background")));
    return count > 0 ? manifest.descriptor : null;
  }
}
