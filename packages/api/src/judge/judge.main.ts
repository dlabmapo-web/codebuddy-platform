import "reflect-metadata";
// The judge boots without Nest, so nothing else loads the env file for it.
import "dotenv/config";

import { createServer } from "node:http";

import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { validateEnvironment } from "../config/env.schema.js";
import { PrismaService } from "../database/prisma.service.js";
import { GradingService } from "./grading.service.js";
import { PointAwardService } from "../points/point-award.service.js";
import { JudgeQueue } from "./judge.queue.js";
import { RegradeRunner } from "./regrade.runner.js";
import { ComparatorPool } from "./comparator-pool.js";
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
  let engine: ExecutionEngine & { warmUp(): Promise<void> };
  if (environment.JUDGE_SANDBOX_SOCKET) {
    engine = new SandboxExecutionEngine(
      environment.JUDGE_SANDBOX_SOCKET,
      environment.PYODIDE_VERSION,
      environment.NODE_ENV === "production",
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
  const comparator = new ComparatorPool(environment.JUDGE_COMPARATOR_POOL_SIZE);
  const grading = new GradingService(
    prisma,
    engine,
    new PointAwardService(prisma),
    comparator,
  );
  const queue = new JudgeQueue(environment.REDIS_URL);

  // Paid once at startup rather than by the first student to submit.
  await Promise.all([engine.warmUp(), comparator.warmUp()]);
  logger.log(`python runtime ready (${engine.version})`);

  const worker = queue.createWorker(
    (job) => grading.grade(job.data.submissionId, job.updateProgress),
    environment.JUDGE_CONCURRENCY,
  );

  // Maintenance re-grading, on its own queue so a run cannot put a live
  // submission behind it. The same process and therefore the same interpreter
  // pool, which is what `REGRADE_CONCURRENCY` is sized against.
  const regrade = new RegradeRunner(prisma, grading);
  const regradeWorker = queue.createRegradeWorker(
    (job) => regrade.run(job.data),
    environment.REGRADE_CONCURRENCY,
  );
  const healthPort = Number(process.env.JUDGE_HEALTH_PORT ?? 0);
  const healthServer = healthPort > 0
    ? createServer((_request, response) => {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end('{"status":"ok"}');
      }).listen(healthPort, "127.0.0.1")
    : null;

  const sweeper = setInterval(() => {
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
    // Lets in-flight grading finish so a deploy does not strand submissions.
    await worker.close();
    // A repair left mid-run is picked up by the queue's own retry on the next
    // boot; the run's counters are advanced only after a verdict lands, so a
    // restart cannot make one report more work than it did.
    await regradeWorker.close();
    if (healthServer) {
      await new Promise<void>((resolve, reject) => {
        healthServer.close((error) => error ? reject(error) : resolve());
      });
    }
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
