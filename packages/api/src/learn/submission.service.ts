import { HttpStatus, Injectable, Logger, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  SubmissionResult,
  SubmissionSummary,
} from "@cove/shared";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { AppException } from "../common/app-exception.js";
import type { ApiEnvironment } from "../config/env.schema.js";
import { PrismaService } from "../database/prisma.service.js";
import { JudgeQueue } from "../judge/judge.queue.js";

/**
 * The submit side of the student experience.
 *
 * This process never executes student code — it records the submission and
 * hands it to the judge. Reading the code path here should make it obvious that
 * nothing untrusted runs in a request handler.
 */
@Injectable()
export class SubmissionService {
  private readonly logger = new Logger(SubmissionService.name);
  private readonly rateLimit: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademyAccessService,
    private readonly config: ConfigService<ApiEnvironment, true>,
    @Optional() private readonly queue?: JudgeQueue,
  ) {
    this.rateLimit = this.config.get("SUBMISSION_RATE_LIMIT", { infer: true });
  }

  async submit(
    identity: SupabaseIdentity,
    input: { academyId: string; materialId: string; code: string },
  ): Promise<{ submissionId: string; totalCount: number }> {
    const { userId } = await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      "submissions.own.create",
    );

    if (!this.queue) {
      // Reading and solving keep working; only the verdict is unavailable.
      throw new AppException("GRADING_UNAVAILABLE", HttpStatus.SERVICE_UNAVAILABLE);
    }

    try {
      const allowed = await this.queue.consumeSubmissionToken(
        userId,
        this.rateLimit,
        60_000,
      );
      if (!allowed) {
        throw new AppException(
          "SUBMISSION_RATE_LIMITED",
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    } catch (error) {
      if (
        error instanceof AppException &&
        error.code === "SUBMISSION_RATE_LIMITED"
      ) {
        throw error;
      }
      this.logger.error(`submission limiter unavailable: ${String(error)}`);
      throw new AppException(
        "GRADING_UNAVAILABLE",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const material = await this.prisma.material.findFirst({
      where: {
        id: input.materialId,
        isPublished: true,
        lecture: {
          isPublished: true,
          courseModule: {
            isPublished: true,
            courseVersion: {
              status: "PUBLISHED",
              course: { academyId: input.academyId, status: "ACTIVE" },
            },
          },
        },
      },
      include: {
        programmingExercise: { include: { testCases: true } },
        lecture: {
          include: { courseModule: { select: { courseVersionId: true } } },
        },
      },
    });

    const exercise = material?.programmingExercise;
    if (!material || !exercise || exercise.testCases.length === 0) {
      throw new AppException("EXERCISE_NOT_AVAILABLE", HttpStatus.NOT_FOUND);
    }

    let submissionId: string;
    try {
      // Written to Postgres before the job is enqueued: if Redis is
      // unreachable the record still exists and the sweeper can recover it.
      const created = await this.prisma.submission.create({
        data: {
          userId,
          materialId: material.id,
          courseVersionId: material.lecture.courseModule.courseVersionId,
          code: input.code,
          totalCount: exercise.testCases.length,
          engineVersion: this.config.get("PYODIDE_VERSION", { infer: true }),
        },
        select: { id: true },
      });
      submissionId = created.id;
    } catch (error) {
      // The partial unique index rejects a second in-flight submission for the
      // same problem. A database constraint, not a read-then-write check that
      // two concurrent submits could race past.
      if (isUniqueViolation(error)) {
        throw new AppException("SUBMISSION_IN_FLIGHT", HttpStatus.CONFLICT);
      }
      throw error;
    }

    try {
      await this.queue.enqueue(submissionId);
    } catch (error) {
      this.logger.error(`enqueue failed for ${submissionId}: ${String(error)}`);
      // Left QUEUED on purpose: a sweeper re-enqueues rather than losing it.
    }

    return { submissionId, totalCount: exercise.testCases.length };
  }

  async get(
    identity: SupabaseIdentity,
    input: { academyId: string; submissionId: string },
  ): Promise<SubmissionResult> {
    const { userId } = await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      "curriculum.read",
    );

    const submission = await this.prisma.submission.findFirst({
      // Scoped by userId, so a guessed id reveals nothing about another
      // student's attempt.
      where: {
        id: input.submissionId,
        userId,
        material: {
          lecture: {
            courseModule: {
              courseVersion: { course: { academyId: input.academyId } },
            },
          },
        },
      },
      include: {
        cases: { orderBy: { position: "asc" } },
        material: {
          include: {
            programmingExercise: {
              include: {
                testCases: { orderBy: [{ position: "asc" }, { id: "asc" }] },
              },
            },
          },
        },
      },
    });
    if (!submission) {
      throw new AppException("SUBMISSION_NOT_FOUND", HttpStatus.NOT_FOUND);
    }

    const progress = await this.prisma.studentExerciseProgress.findUnique({
      where: {
        userId_materialId: { userId, materialId: submission.materialId },
      },
      select: { attemptCount: true },
    });

    const sampleByPosition = new Map(
      (submission.material.programmingExercise?.testCases ?? [])
        .map((testCase, index) => [index + 1, testCase] as const)
        .filter(([, testCase]) => testCase.visibility === "SAMPLE"),
    );

    return {
      submissionId: submission.id,
      materialId: submission.materialId,
      status: submission.status,
      passedCount: submission.passedCount,
      totalCount: submission.totalCount,
      score: submission.score,
      runtimeMs: submission.runtimeMs,
      failureReason: submission.failureReason,
      elapsedSec: Math.max(
        0,
        Math.round(
          ((submission.gradedAt ?? new Date()).getTime() -
            submission.createdAt.getTime()) /
            1000,
        ),
      ),
      attemptCount: progress?.attemptCount ?? 0,
      createdAt: submission.createdAt.toISOString(),
      gradedAt: submission.gradedAt?.toISOString() ?? null,
      cases: submission.cases.map((item) => {
        const sample = item.isSample
          ? sampleByPosition.get(item.position)
          : undefined;
        return {
          position: item.position,
          isSample: item.isSample,
          outcome: item.outcome,
          runtimeMs: item.runtimeMs,
          // A hidden case discloses position and outcome only — otherwise a
          // student reconstructs hidden expectations by submitting probes.
          input: sample?.input ?? null,
          expectedOutput: sample?.expectedOutput ?? null,
          actualOutput: item.isSample ? item.actualOutput : null,
        };
      }),
    };
  }

  async list(
    identity: SupabaseIdentity,
    input: { academyId: string; materialId: string },
  ): Promise<{ submissions: SubmissionSummary[] }> {
    const { userId } = await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      "curriculum.read",
    );

    const submissions = await this.prisma.submission.findMany({
      where: {
        userId,
        materialId: input.materialId,
        material: {
          lecture: {
            courseModule: {
              courseVersion: { course: { academyId: input.academyId } },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        status: true,
        passedCount: true,
        totalCount: true,
        runtimeMs: true,
        createdAt: true,
      },
    });

    return {
      submissions: submissions.map((item) => ({
        submissionId: item.id,
        status: item.status,
        passedCount: item.passedCount,
        totalCount: item.totalCount,
        runtimeMs: item.runtimeMs,
        createdAt: item.createdAt.toISOString(),
      })),
    };
  }

  /** Used by the SSE stream to authorise a subscriber before attaching. */
  async assertOwnership(
    authUserId: string,
    academyId: string,
    submissionId: string,
  ): Promise<void> {
    const { userId } = await this.access.requirePermission(
      authUserId,
      academyId,
      "curriculum.read",
    );
    const owned = await this.prisma.submission.findFirst({
      where: {
        id: submissionId,
        userId,
        material: {
          lecture: {
            courseModule: {
              courseVersion: { course: { academyId } },
            },
          },
        },
      },
      select: { id: true },
    });
    if (!owned) {
      throw new AppException("SUBMISSION_NOT_FOUND", HttpStatus.NOT_FOUND);
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}
