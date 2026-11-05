import {
  Injectable,
  Logger,
  type OnModuleInit,
  type OnModuleDestroy,
  ForbiddenException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { shortAnswerSchema } from "@cove/shared";
import { PrismaService } from "../database/prisma.service.js";
import { PointAwardService } from "../points/point-award.service.js";
import { ShortAnswerEvaluator } from "./short-answer-evaluator.js";
@Injectable()
export class ShortAnswerService implements OnModuleInit, OnModuleDestroy {
  readonly evaluator = new ShortAnswerEvaluator();
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private requested = false;
  private readonly logger = new Logger(ShortAnswerService.name);
  constructor(
    private readonly db: PrismaService,
    private readonly config: ConfigService,
    private readonly points: PointAwardService,
  ) {}
  assertEnabled() {
    if (!this.config.get<boolean>("SHORT_ANSWER_ENABLED"))
      throw new ForbiddenException("Short-answer submissions are unavailable");
  }
  enabled() {
    return this.config.get<boolean>("SHORT_ANSWER_ENABLED") === true;
  }
  onModuleInit() {
    // Recovery only: queued work is drained as soon as it is queued
    // (requestDrain). The tick catches expired leases, work queued by another
    // process and any missed wake-up; it no longer gates every new answer.
    this.timer = setInterval(() => this.requestDrain(), RECOVERY_INTERVAL_MS);
    this.timer.unref();
  }
  /** Grade queued work now. A request made during a drain runs one more drain
   * right after it, so newly queued work never waits for the recovery tick. */
  requestDrain() {
    this.requested = true;
    if (this.running) return;
    void this.drain().catch(() =>
      this.logger.error("Short-answer evaluation recovery failed"),
    );
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async drain() {
    if (this.running || !this.enabled()) return;
    this.running = true;
    this.requested = false;
    let full = false;
    try {
      const now = new Date();
      const jobs = await this.db.shortAnswerAssessment.findMany({
        where: {
          OR: [
            { status: "PENDING" },
            { status: "EVALUATING", leaseUntil: { lt: now } },
          ],
        },
        orderBy: { submission: { createdAt: "asc" } },
        take: BATCH_SIZE,
        include: { submission: true },
      });
      full = jobs.length === BATCH_SIZE;
      await Promise.all(
        jobs.map(async (job) => {
          const lease = new Date(Date.now() + 30000);
          const claimed = await this.db.shortAnswerAssessment.updateMany({
            where: {
              submissionId: job.submissionId,
              OR: [
                { status: "PENDING" },
                { status: "EVALUATING", leaseUntil: { lt: now } },
              ],
            },
            data: { status: "EVALUATING", leaseUntil: lease },
          });
          if (!claimed.count) return;
          try {
            if (job.evaluatorVersion !== "short-answer-js-v1")
              throw new Error("Unsupported evaluator version");
            const correct = await this.evaluator.evaluate(
              shortAnswerSchema.parse(job.definition),
              job.submission.answer,
            );
            await this.db.$transaction(async (tx) => {
              const saved = await tx.shortAnswerAssessment.updateMany({
                where: {
                  submissionId: job.submissionId,
                  status: "EVALUATING",
                  leaseUntil: lease,
                },
                data: {
                  status: "GRADED",
                  verdict: correct ? "CORRECT" : "INCORRECT",
                  completed: correct,
                  scoreHundredths: correct
                    ? job.submission.maximumHundredths
                    : 0,
                  leaseUntil: null,
                  evaluatedAt: new Date(),
                },
              });
              if (saved.count)
                await this.points.awardManualCompletion(tx, {
                  materialId: job.submission.materialId,
                  userId: job.submission.userId,
                  classId: job.submission.classId,
                  now: new Date(),
                });
            });
          } catch {
            await this.db.shortAnswerAssessment.updateMany({
              where: {
                submissionId: job.submissionId,
                status: "EVALUATING",
                leaseUntil: lease,
              },
              data: { status: "ERROR", leaseUntil: null },
            });
          }
        }),
      );
    } finally {
      this.running = false;
    }
    // A full batch may have more behind it, and work may have been queued
    // meanwhile; either continues at once instead of waiting a tick.
    if (full || this.requested) this.requestDrain();
  }
}

const BATCH_SIZE = 4;
const RECOVERY_INTERVAL_MS = 5000;
