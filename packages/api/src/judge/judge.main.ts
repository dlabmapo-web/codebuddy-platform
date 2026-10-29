import { BrokerClient } from "@cove/grading-runtime";
import { RuntimeCoordinator } from "./runtime-coordinator.js";
import { loadRuntimeManifest } from "./runtime-registry.js";
import { SampleExecution } from "./sample-execution.js";
import { DispatchIntentService } from "./dispatch-intent.js";
import { RuntimeReadinessPublisher } from "./runtime-readiness.js";
import { PracticeRunner } from "./practice.runner.js";
import "reflect-metadata";
// The judge boots without Nest, so nothing else loads the env file for it.
import "dotenv/config";

import { startJudgeMonitor } from "./judge-monitor.js";
import { ExecutionTelemetry, withExecutionKind, type ExecutionKind } from "./execution-telemetry.js";

import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { validateEnvironment } from "../config/env.schema.js";
import { PrismaService } from "../database/prisma.service.js";
import { GradingService } from "./grading.service.js";
import { PointAwardService } from "../points/point-award.service.js";
import { JudgeQueue } from "./judge.queue.js";
import { RegradeRunner } from "./regrade.runner.js";
import { ComparatorPool } from "./comparator-pool.js";
import { ExecutionCapacity } from "./execution-capacity.js";
import { SampleCheckRunner } from "./sample-check.runner.js";
import { SampleCheckStore } from "./sample-check.store.js";
import type { ExecutionEngine } from "./execution-engine.js";
import { PyodideExecutionEngine } from "./pyodide-engine.js";
import { SandboxExecutionEngine } from "./sandbox-engine.js";

/**
 * The judge is its own process, not a thread inside the API.
 *
 * It loads untrusted student code, so a runaway program must not be able to pin
 * a request thread or take request serving down with it. The two also scale on
 * completely different signals: queue depth here, request rate there.
 *
 * Started with `pnpm --filter @cove/api start:judge`.
 */
const SWEEP_INTERVAL_MS = 60_000;
const QUEUED_STALE_AFTER_MS = 30_000;
/** Longer than any legitimate submission: 50 cases at the 60s ceiling. */
const STALE_AFTER_MS = 10 * 60_000;

async function bootstrap(): Promise<void> {
  const logger = new Logger("Judge");
  const environment = validateEnvironment(process.env);
  if (environment.JUDGE_METRICS_SECRET && Object.entries(environment).some(([key, value]) => key !== "JUDGE_METRICS_SECRET" && /SECRET|TOKEN|PASSWORD|_KEY$/.test(key) && value === environment.JUDGE_METRICS_SECRET)) {
    throw new Error("Judge metrics credential must be independent");
  }

  if (!environment.REDIS_URL) {
    logger.error("REDIS_URL is required to run the judge");
    process.exitCode = 1;
    return;
  }

  // The judge boots without the Nest container: it serves no requests, so a
  // full application context would only add startup cost and surface area.
  const prisma = new PrismaService(
    new ConfigService(environment) as ConstructorParameters<
      typeof PrismaService
    >[0],
  );
  // Student code runs in the sandbox container whenever one is configured,
  // and production refuses to run without it: the judge holds the database and
  // Redis credentials and needs the network, so a runner beside it — however
  // locked down from inside — shares everything the boundary exists to keep
  // from it. In-process runners remain for development only.
  const telemetry = new ExecutionTelemetry();
  const manifest = environment.GRADING_RUNTIME_MANIFEST_PATH ? await loadRuntimeManifest(environment.GRADING_RUNTIME_MANIFEST_PATH) : undefined;
  if (manifest && (!environment.JUDGE_SANDBOX_SOCKET || !environment.GRADING_WORKER_GENERATION)) throw new Error("Manifest-aware judge requires broker socket and GRADING_WORKER_GENERATION");
  const coordinator = manifest ? new RuntimeCoordinator(prisma, new BrokerClient(environment.JUDGE_SANDBOX_SOCKET!), environment.GRADING_WORKER_GENERATION!, manifest, telemetry) : undefined;
  let engine: ExecutionEngine & { warmUp(): Promise<void> };
  if (coordinator) {
    engine = { version: 'descriptor-bound', warmUp: async () => { await coordinator.health(); },
      run: async () => { throw new Error('Per-job frozen execution session required'); }, dispose: async () => undefined };
  } else if (environment.JUDGE_SANDBOX_SOCKET) {
    engine = new SandboxExecutionEngine(
      environment.JUDGE_SANDBOX_SOCKET,
      environment.PYODIDE_VERSION,
      environment.NODE_ENV === "production",
      environment.JUDGE_TRACE_TIMINGS,
    );
  } else if (environment.NODE_ENV === "production") {
    logger.error(
      "JUDGE_SANDBOX_SOCKET is required in production: student code must not run inside the judge's container",
    );
    process.exitCode = 1;
    await prisma.$disconnect();
    return;
  } else {
    logger.warn(
      "no JUDGE_SANDBOX_SOCKET: running student code in local child processes (development only)",
    );
    engine = new PyodideExecutionEngine(
      environment.PYODIDE_VERSION,
      environment.JUDGE_CONCURRENCY,
    );
  }
  const comparator = new ComparatorPool(environment.JUDGE_COMPARATOR_POOL_SIZE, {}, telemetry);
  const grading = new GradingService(
    prisma,
    engine,
    new PointAwardService(prisma),
    comparator,
    telemetry,
    coordinator,
  );
  const queue = new JudgeQueue(environment.REDIS_URL);

  // Paid once at startup rather than by the first student to submit.
  await Promise.all([engine.warmUp(), comparator.warmUp()]);
  logger.log(`python runtime ready (${engine.version})`);

  // One gate for every consumer of the runners: official grading is never
  // delayed by it, and background work — regrades and sample checks together
  // — can never take the slot it reserves for submissions.
  const capacity = new ExecutionCapacity(coordinator ? 2 : environment.JUDGE_CONCURRENCY, Boolean(coordinator));
  const measured = <T>(kind: ExecutionKind, action: () => Promise<T>, jobId: string) => withExecutionKind(kind, () => grading.telemetry.time("service", action), jobId);

  const regrade = new RegradeRunner(prisma, grading);
  const practice = new PracticeRunner(prisma, grading, coordinator);
  const sampleStore = new SampleCheckStore(() => queue.redis());
  const brokerSamples = coordinator ? new SampleExecution(() => queue.redis(), coordinator) : undefined;
  const samples = new SampleCheckRunner(
    sampleStore,
    engine,
    comparator,
    capacity,
    brokerSamples,
  );
  const dispatcher = new DispatchIntentService(prisma, queue);
  if (coordinator) {
    await coordinator.initialize();
    // Recover before queue consumers start. Each job keeps its original wall deadline.
    for (;;) {
      const submissions = await prisma.submission.findMany({ where: { status: 'RUNNING', executionGeneration: { not: null } }, select: { id: true, regradeRunId: true }, take: 100 });
      const attempts = await prisma.staffPracticeAttempt.findMany({ where: { status: 'RUNNING', executionGeneration: { not: null } }, select: { id: true }, take: 100 });
      if (!submissions.length && !attempts.length) break;
      for (const row of submissions) {
        if (row.regradeRunId) await regrade.run({ submissionId: row.id, runId: row.regradeRunId, requestId: null });
        else await grading.grade(row.id, async () => undefined, true);
      }
      for (const row of attempts) await practice.run(row.id, true);
    }
    await coordinator.reconcile();
  }
  await dispatcher.flush();
  const worker = queue.createWorker(
    (job) => {
      if (job.queuedAtMs !== undefined) telemetry.observe("queue", Math.max(0, Date.now() - job.queuedAtMs), "official");
      return measured("official", () =>
      capacity.runOfficial(() =>
        grading.grade(job.data.submissionId, job.updateProgress),
      ), job.data.submissionId);
    },
    environment.JUDGE_CONCURRENCY,
  );

  // Separate queue: older judge processes can never consume a staff attempt
  // as a student submission during a rolling deployment.
  const practiceWorker = queue.createPracticeWorker(
    (job, queuedAtMs) => {
      if (queuedAtMs !== undefined) telemetry.observe("queue", Math.max(0, Date.now() - queuedAtMs), "practice");
      return measured("practice", () => capacity.runBackground(() => practice.run(job.attemptId)), job.attemptId);
    },
    environment.REGRADE_CONCURRENCY,
  );

  // Maintenance re-grading, on its own queue so a run cannot put a live
  // submission behind it. The same process and therefore the same interpreter
  // pool, which is what `REGRADE_CONCURRENCY` is sized against.
  const regradeWorker = queue.createRegradeWorker(
    (job) => {
      if (job.queuedAtMs !== undefined) telemetry.observe("queue", Math.max(0, Date.now() - job.queuedAtMs), "regrade");
      return measured("regrade", () => capacity.runBackground(() => regrade.run(job.data)), job.data.submissionId);
    },
    environment.REGRADE_CONCURRENCY,
  );

  // Public sample checks: practice runs of one public case, judged by the
  // same evaluator as official grading and written only to their own
  // short-lived records.
  const sampleWorker = queue.createSampleWorker(
    (job) => {
      if (job.queuedAtMs !== undefined) telemetry.observe("queue", Math.max(0, Date.now() - job.queuedAtMs), "sample");
      return measured("sample", () => samples.run(job.data.checkId), job.data.checkId);
    },
    environment.SAMPLE_CHECK_CONCURRENCY,
    (checkId) => void samples.markFailed(checkId),
  );
  const healthPort = Number(process.env.JUDGE_HEALTH_PORT ?? 0);
  const runtimeReadiness = coordinator ? new RuntimeReadinessPublisher(coordinator.registry.manifest,
    environment.GRADING_WORKER_GENERATION!, () => queue.redis(), signal => coordinator.health(signal)) : undefined;
  const monitor = startJudgeMonitor({ port: healthPort, bind: environment.JUDGE_HEALTH_BIND,
    secret: environment.JUDGE_METRICS_SECRET, guard: environment.JUDGE_READINESS_GUARD,
    telemetry: grading.telemetry, workers: [worker, practiceWorker, regradeWorker, sampleWorker],
    diagnostics: () => engine instanceof SandboxExecutionEngine ? engine.readDiagnostics() : Promise.resolve(undefined),
    brokerHealth: runtimeReadiness ? ready => runtimeReadiness.poll(ready) : undefined,
    queues: () => queue.diagnostics() });
  logger.log(JSON.stringify({ event: "judge.config", concurrency: environment.JUDGE_CONCURRENCY,
    comparatorPool: environment.JUDGE_COMPARATOR_POOL_SIZE, backgroundConcurrency: environment.REGRADE_CONCURRENCY,
    sampleConcurrency: environment.SAMPLE_CHECK_CONCURRENCY, readinessGuard: environment.JUDGE_READINESS_GUARD, traceTimings: environment.JUDGE_TRACE_TIMINGS }));

  const sweeper = setInterval(() => {
    void telemetry.time('dispatch', () => dispatcher.flush()).catch(error => logger.error(`dispatch recovery failed: ${String(error)}`));
    void coordinator?.reconcile().catch(error => logger.error(`execution recovery failed: ${String(error)}`));
    if (coordinator) void dispatcher.recoverLeased(coordinator.ownedAttempts).catch(error => logger.error(`leased dispatch recovery failed: ${String(error)}`));
    void prisma.submission.findMany({ where: { status: 'QUEUED', regradeRunId: { not: null }, createdAt: { lt: new Date(Date.now() - QUEUED_STALE_AFTER_MS) } },
      select: { id: true, regradeRunId: true }, take: 100,
    }).then(rows => Promise.all(rows.map(row => queue.enqueueRegrade({ submissionId: row.id, runId: row.regradeRunId!, requestId: null }))))
      .catch(error => logger.error(`maintenance dispatch recovery failed: ${String(error)}`));
    void sampleStore.pendingDispatch().then(async ids => {
      for (const id of ids) {
        const record = await sampleStore.get(id);
        if (record?.status === 'QUEUED') await queue.enqueueSampleCheck(id);
        await sampleStore.acknowledgeDispatch(id);
      }
    }).catch(error => logger.error(`sample dispatch recovery failed: ${String(error)}`));
    void prisma.staffPracticeAttempt.findMany({
      where: { status: "QUEUED", createdAt: { lt: new Date(Date.now() - QUEUED_STALE_AFTER_MS) } },
      select: { id: true }, take: 100,
    }).then((rows) => Promise.all(rows.map((row) => queue.enqueuePractice(row.id))))
      .catch((error) => logger.error(`practice sweeper failed: ${String(error)}`));
    void prisma.staffPracticeAttempt.updateMany({
      where: { status: "RUNNING", executionGeneration: null, startedAt: { lt: new Date(Date.now() - STALE_AFTER_MS) } },
      data: { status: "ERRORED", gradedAt: new Date() },
    }).catch((error) => logger.error(`practice recovery failed: ${String(error)}`));

    void grading
      .sweepStale({
        queuedOlderThanMs: QUEUED_STALE_AFTER_MS,
        runningOlderThanMs: STALE_AFTER_MS,
      })
      .then(({ requeue }) =>
        Promise.all(requeue.map((submissionId) => queue.enqueue(submissionId))),
      )
      .catch((error) => logger.error(`sweeper failed: ${String(error)}`));
  }, SWEEP_INTERVAL_MS);

  logger.log(
    `judge listening, concurrency ${environment.JUDGE_CONCURRENCY}, regrade ${environment.REGRADE_CONCURRENCY}`,
  );

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.log(`${signal} received, draining`);
    clearInterval(sweeper);
    await monitor.close();
    // Lets in-flight grading finish so a deploy does not strand submissions.
    await worker.close();
    await practiceWorker.close();
    // A repair left mid-run is picked up by the queue's own retry on the next
    // boot; the run's counters are advanced only after a verdict lands, so a
    // restart cannot make one report more work than it did.
    await regradeWorker.close();
    await sampleWorker.close();
    await queue.close();
    await engine.dispose();
    await comparator.dispose();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

void bootstrap();
