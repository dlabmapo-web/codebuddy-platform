import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { QueueEvents, Worker } from "bullmq";
import { Redis } from "ioredis";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseAuthService } from "../auth/supabase-auth.service.js";
import type { PrismaService } from "../database/prisma.service.js";
import { SubmissionController } from "./submission.controller.js";
import type { SubmissionService } from "./submission.service.js";
import { JudgeQueue, redisConnection } from "../judge/judge.queue.js";
import { PracticeSubmissionController } from "./practice-submission.controller.js";
import type { StaffPracticeService } from "./staff-practice.service.js";

const redisUrl = process.env.COVE_PRACTICE_STREAM_TEST_REDIS_URL;
const fixtureId = process.env.COVE_PRACTICE_STREAM_FIXTURE_ID;
const academyId = "20000000-0000-4000-8000-000000000001";
const materialId = "70000000-0000-4000-8000-000000000001";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Retained completion was not delivered")),
          2_000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// Only the uniquely labelled, loopback Redis created by the companion script is
// permitted. No dotenv/default Redis URL or database is consulted by this test.
describe.skipIf(!redisUrl || !fixtureId)(
  "real BullMQ stream startup ordering",
  () => {
    it.each(["practice", "official"] as const)(
      "replays a %s completion retained before the first XREAD",
      async (kind) => {
        const endpoint = new URL(redisUrl!);
        expect(endpoint.protocol).toBe("redis:");
        expect(endpoint.hostname).toBe("127.0.0.1");
        expect(Number(endpoint.port)).toBeGreaterThan(0);
        expect(endpoint.pathname).toBe("/0");
        expect(fixtureId).toMatch(/^\d+-\d+$/);
        const id = randomUUID();
        const startConsumer = deferred<void>();
        const originalRun = QueueEvents.prototype.run;
        // Delay the installed consumer itself, including its clientSetName/first
        // XREAD, rather than replacing transport with an already-listening emitter.
        const runSpy = vi
          .spyOn(QueueEvents.prototype, "run")
          .mockImplementation(async function (this: QueueEvents) {
            await startConsumer.promise;
            return originalRun.call(this);
          });
        const judge = new JudgeQueue(redisUrl!);
        const producer =
          kind === "practice" ? judge.practiceQueue : judge.queue;
        const observer = new Redis(redisUrl!, {
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
        });
        let status = "RUNNING";
        const read = vi.fn(async () => ({
          submissionId: id,
          materialId,
          status,
          passedCount: status === "PASSED" ? 1 : 0,
          totalCount: 1,
          score: status === "PASSED" ? 100 : 0,
          runtimeMs: null,
          failureReason: null,
          elapsedSec: 0,
          attemptCount: 0,
          createdAt: new Date(0).toISOString(),
          gradedAt: null,
          cases: [],
        }));
        const auth = {
          verifyAccessToken: vi
            .fn()
            .mockResolvedValue({ authUserId: "synthetic-owner" }),
        } as unknown as SupabaseAuthService;
        const worker = new Worker(
          producer.name,
          async () => {
            // Synthetic committed result store; actual BullMQ completion/XADD happens
            // only after this handler returns. No real database is used or claimed.
            status = "PASSED";
            return null;
          },
          { connection: redisConnection(redisUrl!), autorun: false },
        );
        const workerErrors: Error[] = [];
        worker.on("error", (error) => workerErrors.push(error));
        let workerRun: Promise<void> | undefined;
        let subscription: { unsubscribe(): void } | undefined;
        try {
          await Promise.all([
            producer.waitUntilReady(),
            worker.waitUntilReady(),
            once(observer, "ready"),
          ]);
          const controller =
            kind === "practice"
              ? new PracticeSubmissionController(
                  { get: read } as unknown as StaffPracticeService,
                  auth,
                  judge,
                )
              : new SubmissionController(
                  {
                    assertOwnership: vi.fn().mockResolvedValue(undefined),
                  } as unknown as SubmissionService,
                  {
                    submission: { findUnique: read },
                  } as unknown as PrismaService,
                  auth,
                  judge,
                );
          const running = deferred<void>(),
            terminal = deferred<void>();
          const stream = await controller.stream(
            id,
            academyId,
            "Bearer synthetic-token",
          );
          subscription = stream.subscribe((event) => {
            if (event.type !== "result") return;
            const value = JSON.parse(event.data);
            if (value.status === "RUNNING") running.resolve();
            if (value.status === "PASSED") terminal.resolve();
          });
          await bounded(running.promise);
          // Client readiness alone is deliberately satisfied while run() is still
          // blocked: it does not prove that the first XREAD boundary exists.
          const events =
            kind === "practice" ? judge.practiceEvents : judge.events;
          const eventClient = await events.waitUntilReady();
          const xread = vi.spyOn(eventClient, "xread");
          expect(xread).not.toHaveBeenCalled();
          const completed = once(worker, "completed");
          if (kind === "practice") {
            await judge.practiceQueue.add(
              "startup-regression",
              { attemptId: id },
              { jobId: id },
            );
          } else {
            await judge.queue.add(
              "startup-regression",
              { submissionId: id },
              { jobId: id },
            );
          }
          workerRun = worker.run();
          await bounded(completed);
          const retained = await observer.xrange(
            producer.toKey("events"),
            "-",
            "+",
          );
          expect(
            retained.some(([, fields]) => {
              const eventIndex = fields.indexOf("event"),
                jobIndex = fields.indexOf("jobId");
              return (
                fields[eventIndex + 1] === "completed" &&
                fields[jobIndex + 1] === id
              );
            }),
          ).toBe(true);
          expect(xread).not.toHaveBeenCalled();
          // The authoritative read returned RUNNING and completion is now retained
          // in real Redis before QueueEvents can consume anything.
          startConsumer.resolve();
          await bounded(terminal.promise);
          expect(xread.mock.calls[0]).toContain("0-0");
          expect(workerErrors).toEqual([]);
        } finally {
          startConsumer.resolve();
          subscription?.unsubscribe();
          await worker.close();
          await workerRun;
          await judge.close();
          await observer.quit();
          runSpy.mockRestore();
        }
      },
    );
  },
);
