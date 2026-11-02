import { measuredNativeClient } from "./native-telemetry.js";
import { startNativeMonitor } from "./native-monitor.js";
import { ExecutionTelemetry, withExecutionKind } from "./execution-telemetry.js";
import { randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";
import { NativeExecutionClient } from "@cove/grading-runtime";
import { PrismaService } from "../database/prisma.service.js";
import { PointAwardService } from "../points/point-award.service.js";
import { ComparatorPool } from "./comparator-pool.js";
import { actualComparatorIdentity } from "./comparator-identity.js";
import { NativeJobGate, nativeBackgroundCapable } from "./native-job-gate.js";
import { loadNativeManifest, frozenNativeDescriptor, nativeReadinessKey, NATIVE_READINESS_HEARTBEAT } from "./native-admission.js";
import { JudgeQueue, runtimeQueueName } from "./judge.queue.js";
import { GradingService } from "./grading.service.js";
import { PracticeRunner } from "./practice.runner.js";
import { RegradeRunner } from "./regrade.runner.js";
import { SampleCheckRunner } from "./sample-check.runner.js";
import { SampleCheckStore } from "./sample-check.store.js";
import { ExecutionCapacity } from "./execution-capacity.js";
import { practiceSnapshotSchema } from "./practice-snapshot.js";
import { RuntimeRecovery } from "./runtime-recovery.js";
import type { Worker } from "bullmq";

/** Execution nodes need no API/Supabase/BFF credentials. Pool arithmetic is an explicit fleet budget. */
export const nativeWorkerEnvironmentSchema = z.object({
  JUDGE_RUNTIME_FAMILY: z.literal("native"),
  NATIVE_GRADING_MANIFEST: z.string().startsWith("/"),
  NATIVE_GRADING_SOCKET: z.string().startsWith("/"),
  DATABASE_URL: z.string().url().refine(v => ["postgres:", "postgresql:"].includes(new URL(v).protocol)),
  REDIS_URL: z.string().url().refine(v => ["redis:", "rediss:"].includes(new URL(v).protocol)),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(16).default(2),
  DATABASE_CONNECTION_BUDGET: z.coerce.number().int().positive(),
  DATABASE_API_POOL_BUDGET: z.coerce.number().int().nonnegative(),
  DATABASE_OPERATIONAL_RESERVE: z.coerce.number().int().min(1),
  JUDGE_FLEET_WORKER_COUNT: z.coerce.number().int().positive(),
  JUDGE_HEALTH_PORT: z.coerce.number().int().min(0).max(65535).default(0),
  JUDGE_COMPARATOR_POOL_SIZE: z.coerce.number().int().min(1).max(8).default(1),
}).superRefine((e, ctx) => {
  if (e.DATABASE_API_POOL_BUDGET + e.DATABASE_OPERATIONAL_RESERVE + e.DATABASE_POOL_MAX * e.JUDGE_FLEET_WORKER_COUNT > e.DATABASE_CONNECTION_BUDGET)
    ctx.addIssue({ code: "custom", message: "Fleet database pools exceed connection budget" });
});

export async function bootstrapNativeWorker(configuration: Record<string, unknown>) {
  const env = nativeWorkerEnvironmentSchema.parse(configuration);
  const manifest = await loadNativeManifest(env.NATIVE_GRADING_MANIFEST);
  const gate = new NativeJobGate(manifest.resources);
  const prisma = new PrismaService(new ConfigService(env) as never);
  const queue = new JudgeQueue(env.REDIS_URL, manifest.descriptor);
  const telemetry = new ExecutionTelemetry();
  const comparator = new ComparatorPool(env.JUDGE_COMPARATOR_POOL_SIZE, {}, telemetry);
  let monitor: ReturnType<typeof startNativeMonitor> | undefined;
  const probe = new NativeExecutionClient({ socketPath: env.NATIVE_GRADING_SOCKET, descriptor: manifest.descriptor, lane: "official" });
  const workers: Worker[] = [];
  const nodeId = randomUUID();
  const background = nativeBackgroundCapable(manifest.resources);
  const lanes = background ? ["official", "background"] as const : ["official"] as const;
  const store = new SampleCheckStore(() => queue.redis());
  let pulse: NodeJS.Timeout | undefined;
  let sweep: NodeJS.Timeout | undefined;
  let pulseBusy = false;
  let stopped = false;
  let consumerState: Promise<void> = Promise.resolve();
  const setConsumersReady = (healthy: boolean) => {
    consumerState = consumerState.catch(() => undefined).then(async () => {
      if (stopped) return;
      await Promise.all(workers.map(w => healthy ? w.resume() : w.pause(true)));
    });
    return consumerState;
  };
  let readinessWork: Promise<void> = Promise.resolve();
  let recoveryWork: Promise<void> = Promise.resolve();
  const onSignal = () => { void close(); };
  const withdraw = async () => {
    const redis = await queue.redis();
    await Promise.all(lanes.map(lane => redis.zrem(nativeReadinessKey(manifest.descriptor, lane), nodeId)));
  };
  const close = async () => {
    if (stopped) return;
    stopped = true;
    clearInterval(pulse); clearInterval(sweep); gate.stop();
    await Promise.all([readinessWork, recoveryWork]);
    await withdraw().catch(() => undefined);
    process.off("SIGTERM", onSignal); process.off("SIGINT", onSignal);
    await Promise.all(workers.map(w => w.close()));
    await monitor?.close();
    await probe.dispose(); await comparator.dispose(); await queue.close(); await prisma.$disconnect();
  };
  try {
    await comparator.warmUp();
    const actual = await actualComparatorIdentity();
    const expected = manifest.descriptor.comparator;
    if (comparator.version !== `pyodide-${expected.version}` || Object.keys(actual).some(key => actual[key as keyof typeof actual] !== expected[key as keyof typeof expected]))
      throw new Error("Native comparator artifacts differ from certified descriptor");
    const ready = async () => {
      if (pulseBusy || stopped) return;
      pulseBusy = true;
      try {
        const health = await probe.health();
        if (stopped) return;
        if (!health.ready) { await setConsumersReady(false); await withdraw(); return; }
        await setConsumersReady(true);
        const redis = await queue.redis();
        await Promise.all(lanes.map(async lane => {
          const key = nativeReadinessKey(manifest.descriptor, lane);
          await redis.eval(NATIVE_READINESS_HEARTBEAT, 1, key, nodeId);
        }));
      } catch { await setConsumersReady(false).catch(() => undefined); await withdraw().catch(() => undefined); }
      finally { pulseBusy = false; }
    };
    if (!(await probe.health()).ready) throw new Error("Native launcher is not ready");
    const grading = new GradingService(prisma, probe, new PointAwardService(prisma), comparator, telemetry);
    const execute = async <T>(memory: number, descriptor: unknown, lane: "official" | "background", action: (grading: GradingService, client: NativeExecutionClient) => Promise<T>) => {
      const frozen = frozenNativeDescriptor(descriptor);
      if (!frozen || runtimeQueueName("official", frozen) !== runtimeQueueName("official", manifest.descriptor)) throw new Error("Native queue/descriptor mismatch");
      return gate.run(memory, lane, async () => {
        const client = new NativeExecutionClient({ socketPath: env.NATIVE_GRADING_SOCKET, descriptor: frozen, lane });
        try {
          try {
            if (!(await client.health()).ready) throw new Error("Native launcher unavailable before claim");
          } catch (error) {
            await setConsumersReady(false); await withdraw().catch(() => undefined); throw error;
          }
          const result = await action(grading.withEngine(measuredNativeClient(client, telemetry)), client);
          await ready();
          return result;
        } finally { await client.dispose(); }
      });
    };
    workers.push(queue.createWorker(async job => {
      const row = await prisma.submission.findUniqueOrThrow({ where: { id: job.data.submissionId }, select: { memoryLimitMb: true, executionRuntimeSnapshot: true } });
      return execute(row.memoryLimitMb, row.executionRuntimeSnapshot, "official", g => withExecutionKind("official", () => telemetry.time("service", () => g.grade(job.data.submissionId, job.updateProgress)), job.data.submissionId));
    }, manifest.resources.cpuSlots));
    if (background) {
      workers.push(queue.createPracticeWorker(async job => {
        const row = await prisma.staffPracticeAttempt.findUniqueOrThrow({ where: { id: job.attemptId }, select: { snapshot: true } });
        const snapshot = practiceSnapshotSchema.parse(row.snapshot);
        await execute(snapshot.memoryLimitMb, snapshot.executionRuntimeSnapshot, "background", g => withExecutionKind("practice", () => telemetry.time("service", () => new PracticeRunner(prisma, g).run(job.attemptId)), job.attemptId));
      }, 1));
      workers.push(queue.createRegradeWorker(async job => {
        const row = await prisma.submission.findUniqueOrThrow({ where: { id: job.data.submissionId }, select: { memoryLimitMb: true, executionRuntimeSnapshot: true } });
        await execute(row.memoryLimitMb, row.executionRuntimeSnapshot, "background", g => withExecutionKind("regrade", () => telemetry.time("service", () => new RegradeRunner(prisma, g).run(job.data)), job.data.submissionId));
      }, 1));
      workers.push(queue.createSampleWorker(async job => {
        const record = await store.get(job.data.checkId);
        if (!record) return;
        await execute(record.snapshot.memoryLimitMb, record.snapshot.executionRuntimeSnapshot, "background", async (_, client) => {
          // Native gate already reserves background capacity for the entire job.
          await withExecutionKind("sample", () => telemetry.time("service", () => new SampleCheckRunner(store, measuredNativeClient(client, telemetry), comparator, new ExecutionCapacity(2)).run(job.data.checkId)), job.data.checkId);
        });
      }, 1, id => { void new SampleCheckRunner(store, probe, comparator, new ExecutionCapacity(2)).markFailed(id); }));
    }
    await Promise.all(workers.map(w => w.waitUntilReady()));
    await ready();
    pulse = setInterval(() => { if (!pulseBusy) readinessWork = ready(); }, 5_000);
    const recovery = new RuntimeRecovery(prisma, queue);
    let recovering = false;
    sweep = setInterval(() => {
      if (recovering) return;
      recovering = true;
      recoveryWork = recovery.sweep().catch(error => console.error("native recovery failed", String(error))).finally(() => { recovering = false; });
    }, 30_000);
    process.once("SIGTERM", onSignal); process.once("SIGINT", onSignal);
    const health = async () => !stopped && (await probe.health()).ready && (await queue.redis()).status === "ready";
    monitor = startNativeMonitor(env.JUDGE_HEALTH_PORT, telemetry, health);
    return { close, queue, prisma, health, metrics: () => telemetry.snapshot() };
  } catch (error) { await close(); throw error; }
}
