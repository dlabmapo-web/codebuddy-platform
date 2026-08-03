import { HttpStatus, Injectable, Logger, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { SubmissionResult, SubmissionSummary } from "@cove/shared";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { learningScopeFor } from "../classes/assigned-course-access.js";
import { AppException } from "../common/app-exception.js";
import type { ApiEnvironment } from "../config/env.schema.js";
import { PrismaService } from "../database/prisma.service.js";
import { JudgeQueue } from "../judge/judge.queue.js";
import { reachableMaterialWhere } from "./curriculum-visibility.js";

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
    const actor = await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      "submissions.own.create",
    );
    const { userId } = actor;
    const scope = learningScopeFor(input.academyId, actor);
    if (!this.queue) {
      throw new AppException("GRADING_UNAVAILABLE", HttpStatus.SERVICE_UNAVAILABLE);
    }
    await this.consumeRateLimit(userId);

    let createdSubmission: { id: string; totalCount: number };
    try {
      createdSubmission = await this.prisma.$transaction(async (tx) => {
        // Visibility and grading inputs are read in the same transaction that
        // owns the snapshot. A concurrent hide or test edit therefore cannot
        // create a submission from a mixed curriculum state.
        const material = await tx.material.findFirst({
          where: {
            id: input.materialId,
            ...reachableMaterialWhere(input.academyId, scope),
          },
          include: {
            programmingExercise: {
              include: {
                testCases: {
                  orderBy: [{ position: "asc" }, { id: "asc" }],
                },
              },
            },
            lecture: { include: { courseModule: true } },
          },
        });
        const exercise = material?.programmingExercise;
        if (!material || !exercise || exercise.testCases.length === 0) {
          throw new AppException(
            "EXERCISE_NOT_AVAILABLE",
            HttpStatus.NOT_FOUND,
          );
        }
        const created = await tx.submission.create({
          data: {
            userId,
            materialId: material.id,
            sourceMaterialId: material.id,
            courseId: material.lecture.courseModule.courseId,
            gradingRevision: exercise.gradingRevision,
            language: exercise.language,
            timeLimitMs: exercise.timeLimitMs,
            memoryLimitMb: exercise.memoryLimitMb,
            code: input.code,
            totalCount: exercise.testCases.length,
            engineVersion: this.config.get("PYODIDE_VERSION", { infer: true }),
            gradingCases: {
              create: exercise.testCases.map((testCase, index) => ({
                position: index + 1,
                input: testCase.input,
                expectedOutput: testCase.expectedOutput,
                isSample: testCase.visibility === "SAMPLE",
              })),
            },
          },
          select: { id: true },
        });
        return { id: created.id, totalCount: exercise.testCases.length };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppException("SUBMISSION_IN_FLIGHT", HttpStatus.CONFLICT);
      }
      throw error;
    }

    const submissionId = createdSubmission.id;
    try {
      await this.queue.enqueue(submissionId);
    } catch (error) {
      this.logger.error(`enqueue failed for ${submissionId}: ${String(error)}`);
    }
    return { submissionId, totalCount: createdSubmission.totalCount };
  }

  async get(
    identity: SupabaseIdentity,
    input: { academyId: string; submissionId: string },
  ): Promise<SubmissionResult> {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      "curriculum.read",
    );
    const { userId } = actor;
    const scope = learningScopeFor(input.academyId, actor);
    const submission = await this.prisma.submission.findFirst({
      where: {
        id: input.submissionId,
        userId,
        course: { academyId: input.academyId },
        material: {
          is: reachableMaterialWhere(input.academyId, scope),
        },
      },
      include: {
        cases: { orderBy: { position: "asc" } },
        gradingCases: { orderBy: { position: "asc" } },
      },
    });
    if (!submission) {
      throw new AppException("SUBMISSION_NOT_FOUND", HttpStatus.NOT_FOUND);
    }
    const progress = submission.materialId
      ? await this.prisma.studentExerciseProgress.findUnique({
          where: {
            userId_materialId: { userId, materialId: submission.materialId },
          },
          select: { attemptCount: true, gradingRevision: true },
        })
      : null;
    const sampleByPosition = new Map(
      submission.gradingCases
        .filter((testCase) => testCase.isSample)
        .map((testCase) => [testCase.position, testCase]),
    );

    return {
      submissionId: submission.id,
      materialId: submission.sourceMaterialId,
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
            submission.createdAt.getTime()) / 1000,
        ),
      ),
      attemptCount:
        progress?.gradingRevision === submission.gradingRevision
          ? progress.attemptCount
          : 0,
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
    const actor = await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      "curriculum.read",
    );
    const { userId } = actor;
    const scope = learningScopeFor(input.academyId, actor);
    const submissions = await this.prisma.submission.findMany({
      where: {
        userId,
        materialId: input.materialId,
        course: { academyId: input.academyId },
        material: {
          is: reachableMaterialWhere(input.academyId, scope),
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

  async assertOwnership(
    authUserId: string,
    academyId: string,
    submissionId: string,
  ): Promise<void> {
    const actor = await this.access.requirePermission(
      authUserId,
      academyId,
      "curriculum.read",
    );
    const { userId } = actor;
    const scope = learningScopeFor(academyId, actor);
    const owned = await this.prisma.submission.findFirst({
      where: {
        id: submissionId,
        userId,
        course: { academyId },
        material: { is: reachableMaterialWhere(academyId, scope) },
      },
      select: { id: true },
    });
    if (!owned) {
      throw new AppException("SUBMISSION_NOT_FOUND", HttpStatus.NOT_FOUND);
    }
  }

  private async consumeRateLimit(userId: string) {
    try {
      const allowed = await this.queue!.consumeSubmissionToken(
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
      throw new AppException("GRADING_UNAVAILABLE", HttpStatus.SERVICE_UNAVAILABLE);
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error &&
    (error as { code?: string }).code === "P2002";
}
