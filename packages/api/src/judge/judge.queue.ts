import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { Queue, QueueEvents, Worker, type ConnectionOptions } from "bullmq";
import { Redis } from "ioredis";

export const GRADING_QUEUE = "cove-grading";

export type GradingJob = { submissionId: string };

/**
 * Progress pushed while a submission runs, mirroring the `job.updateProgress`
 * streaming already proven in the `docquery` worker.
 */
export type GradingProgress = {
  submissionId: string;
  position: number;
  of: number;
  outcome: string;
  isSample: boolean;
};

const TOKEN_BUCKET_SCRIPT = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local now_ms = tonumber(ARGV[3])
local values = redis.call('HMGET', key, 'tokens', 'updated_at')
local tokens = tonumber(values[1]) or capacity
local updated_at = tonumber(values[2]) or now_ms
local refill = math.max(0, now_ms - updated_at) * capacity / window_ms
tokens = math.min(capacity, tokens + refill)
if tokens < 1 then
  redis.call('HSET', key, 'tokens', tokens, 'updated_at', now_ms)
  redis.call('PEXPIRE', key, window_ms)
  return 0
end
tokens = tokens - 1
redis.call('HSET', key, 'tokens', tokens, 'updated_at', now_ms)
redis.call('PEXPIRE', key, window_ms)
return 1
`;

export function redisConnection(url: string): ConnectionOptions {
  return {
    url,
    // BullMQ blocks on Redis and reconnects itself; capping retries here makes
    // a blocking command throw instead of hanging a worker forever.
    maxRetriesPerRequest: null,
  } as ConnectionOptions;
}

/**
 * Owns the queue handle and its event stream.
 *
 * Producers (the API) and the consumer (the judge process) both build on this,
 * but only the judge ever constructs a `Worker`.
 */
@Injectable()
export class JudgeQueue implements OnModuleDestroy {
  private readonly logger = new Logger(JudgeQueue.name);
  private queueInstance: Queue<GradingJob> | null = null;
  private eventsInstance: QueueEvents | null = null;
  private rateLimitClient: Redis | null = null;
  private rateLimitConnection: Promise<void> | null = null;

  constructor(private readonly redisUrl: string) {}

  get queue(): Queue<GradingJob> {
    this.queueInstance ??= new Queue<GradingJob>(GRADING_QUEUE, {
      connection: redisConnection(this.redisUrl),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 2_000 },
        removeOnComplete: { age: 3_600, count: 1_000 },
        removeOnFail: { age: 86_400 },
      },
    });
    return this.queueInstance;
  }

  get events(): QueueEvents {
    this.eventsInstance ??= new QueueEvents(GRADING_QUEUE, {
      connection: redisConnection(this.redisUrl),
    });
    return this.eventsInstance;
  }

  /**
   * `jobId` is the submission id, so BullMQ deduplicates: a retried request or
   * a double-clicked button cannot enqueue the same grading twice.
   */
  async enqueue(submissionId: string): Promise<void> {
    await this.queue.add(
      "grade",
      { submissionId },
      { jobId: submissionId },
    );
  }

  /**
   * A Redis token bucket shared by every API replica. Keeping it beside the
   * queue means a Redis outage fails submission before a durable row is
   * created, avoiding a permanently in-flight record that blocks retries.
   */
  async consumeSubmissionToken(
    userId: string,
    capacity: number,
    windowMs: number,
  ): Promise<boolean> {
    if (!this.rateLimitClient || this.rateLimitClient.status === "end") {
      this.rateLimitClient = new Redis(this.redisUrl, {
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        lazyConnect: true,
      });
      this.rateLimitClient.on("error", (error) => {
        this.logger.warn(`submission rate limiter: ${error.message}`);
      });
      this.rateLimitConnection = this.rateLimitClient.connect();
    }
    await this.rateLimitConnection;
    const result = await this.rateLimitClient.eval(
      TOKEN_BUCKET_SCRIPT,
      1,
      `cove:submission-rate:${userId}`,
      String(capacity),
      String(windowMs),
      String(Date.now()),
    );
    return Number(result) === 1;
  }

  createWorker(
    handler: (job: {
      data: GradingJob;
      updateProgress: (progress: GradingProgress) => Promise<void>;
    }) => Promise<unknown>,
    concurrency: number,
  ): Worker<GradingJob> {
    const worker = new Worker<GradingJob>(
      GRADING_QUEUE,
      async (job) =>
        handler({
          data: job.data,
          updateProgress: (progress) => job.updateProgress(progress),
        }),
      { connection: redisConnection(this.redisUrl), concurrency },
    );

    worker.on("failed", (job, error) => {
      this.logger.error(
        `grading job ${job?.id ?? "unknown"} failed: ${error.message}`,
      );
    });
    return worker;
  }

  async close(): Promise<void> {
    await this.queueInstance?.close();
    await this.eventsInstance?.close();
    await this.rateLimitClient?.quit().catch(() => undefined);
    this.queueInstance = null;
    this.eventsInstance = null;
    this.rateLimitClient = null;
    this.rateLimitConnection = null;
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }
}
