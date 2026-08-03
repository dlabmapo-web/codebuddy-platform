import "reflect-metadata";
// The judge boots without Nest, so nothing else loads the env file for it.
import "dotenv/config";

import { createServer } from "node:http";

import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { validateEnvironment } from "../config/env.schema.js";
import { PrismaService } from "../database/prisma.service.js";
import { GradingService } from "./grading.service.js";
import { JudgeQueue } from "./judge.queue.js";
import { PyodideExecutionEngine } from "./pyodide-engine.js";

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
  const engine = new PyodideExecutionEngine(
    environment.PYODIDE_VERSION,
    environment.JUDGE_CONCURRENCY,
  );
  const grading = new GradingService(prisma, engine);
  const queue = new JudgeQueue(environment.REDIS_URL);

  // Paid once at startup rather than by the first student to submit.
  await engine.warmUp();
  logger.log(`python runtime ready (${engine.version})`);

  const worker = queue.createWorker(
    (job) => grading.grade(job.data.submissionId, job.updateProgress),
    environment.JUDGE_CONCURRENCY,
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
    `judge listening, concurrency ${environment.JUDGE_CONCURRENCY}`,
  );

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.log(`${signal} received, draining`);
    clearInterval(sweeper);
    // Lets in-flight grading finish so a deploy does not strand submissions.
    await worker.close();
    if (healthServer) {
      await new Promise<void>((resolve, reject) => {
        healthServer.close((error) => error ? reject(error) : resolve());
      });
    }
    await queue.close();
    await engine.dispose();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

void bootstrap();
