import { HttpStatus, Injectable, Logger, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  isSolveSessionExpired,
  solveElapsedSeconds,
  type LearnSelectedSubmission,
  type SubmissionResult,
  type SubmissionSummary,
} from "@cove/shared";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import {
  learningScopeFor,
  type LearningScope,
} from "../classes/assigned-course-access.js";
import { AppException } from "../common/app-exception.js";
import type { ApiEnvironment } from "../config/env.schema.js";
import { PrismaService } from "../database/prisma.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import { JudgeQueue } from "../judge/judge.queue.js";
import { reachableMaterialWhere } from "./curriculum-visibility.js";

/** The grading data a student's own read may join. Never a hidden expectation. */
const ownedSubmissionInclude = {
  cases: { orderBy: { position: "asc" } },
  gradingCases: { orderBy: { position: "asc" } },
} as const satisfies Prisma.SubmissionInclude;

type OwnedSubmission = Prisma.SubmissionGetPayload<{
  include: typeof ownedSubmissionInclude;
}>;

/**
 * The one "this submission is mine, here, and still reachable" predicate.
 *
 * Ownership, academy, and current curriculum access in one place: a second
 * copy in a new endpoint is how a remembered submission id turns into a way
 * to read somebody else's code.
 */
function ownedSubmissionWhere(input: {
  academyId: string;
  userId: string;
  scope: LearningScope;
  submissionId: string;
}): Prisma.SubmissionWhereInput {
  return {
    id: input.submissionId,
    userId: input.userId,
    course: { academyId: input.academyId },
    material: { is: reachableMaterialWhere(input.academyId, input.scope) },
  };
}

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
    input: {
      academyId: string;
      materialId: string;
      code: string;
      solveSessionId?: string;
    },
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
            // The course title is joined because the record labels are frozen
            // here, in the transaction that owns the grading snapshot.
            lecture: {
              include: { courseModule: { include: { course: true } } },
            },
          },
        });
        const exercise = material?.programmingExercise;
        if (!material || !exercise || exercise.testCases.length === 0) {
          throw new AppException(
            "EXERCISE_NOT_AVAILABLE",
            HttpStatus.NOT_FOUND,
          );
        }

        // Read inside the same transaction as the snapshot, and against the
        // server clock. The browser names a session; it never reports how long
        // it took, so a patched client cannot post an impressive solve time.
        const solveSession = input.solveSessionId
          ? await this.requireSolveSession(tx, {
              solveSessionId: input.solveSessionId,
              userId,
              materialId: material.id,
            })
          : null;

        const courseModule = material.lecture.courseModule;
        const created = await tx.submission.create({
          data: {
            userId,
            materialId: material.id,
            sourceMaterialId: material.id,
            courseId: courseModule.courseId,
            gradingRevision: exercise.gradingRevision,
            language: exercise.language,
            timeLimitMs: exercise.timeLimitMs,
            memoryLimitMb: exercise.memoryLimitMb,
            code: input.code,
            totalCount: exercise.testCases.length,
            engineVersion: this.config.get("PYODIDE_VERSION", { infer: true }),
            solveSessionId: solveSession?.id ?? null,
            solveElapsedSec: solveSession
              ? solveElapsedSeconds(solveSession.startedAt, new Date())
              : null,
            // Written with the grading snapshot, not derived on read: a later
            // rename must not rewrite what this student's history says they
            // solved. See §9 of the answer records design.
            problemTitle: material.title,
            courseTitle: courseModule.course.title,
            moduleTitle: courseModule.title,
            lectureTitle: material.lecture.title,
            modulePosition: courseModule.position,
            lecturePosition: material.lecture.position,
            problemPosition: material.position,
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
      where: ownedSubmissionWhere({
        academyId: input.academyId,
        userId,
        scope,
        submissionId: input.submissionId,
      }),
      include: ownedSubmissionInclude,
    });
    if (!submission) {
      throw new AppException("SUBMISSION_NOT_FOUND", HttpStatus.NOT_FOUND);
    }
    return this.toResult(userId, submission);
  }

  /**
   * One of the student's own attempts, for reopening it in the workspace.
   *
   * Takes an already-authorized actor rather than an identity: the caller is
   * the exercise bootstrap, which has resolved the learner and their scope in
   * order to load the workspace this submission is being opened beside.
   *
   * Returns `null` for a submission that is not this student's, not this
   * academy's, or not this route's problem. All three are the same answer on
   * purpose — telling them apart would confirm that somebody else's submission
   * exists.
   */
  async findSelected(
    actor: { userId: string; academyId: string; scope: LearningScope },
    input: { materialId: string; submissionId: string },
  ): Promise<LearnSelectedSubmission | null> {
    const submission = await this.prisma.submission.findFirst({
      where: {
        ...ownedSubmissionWhere({
          academyId: actor.academyId,
          userId: actor.userId,
          scope: actor.scope,
          submissionId: input.submissionId,
        }),
        // The route decides which problem is open; a submission for a
        // different one would put somebody else's code under this statement.
        sourceMaterialId: input.materialId,
      },
      include: ownedSubmissionInclude,
    });
    if (!submission) return null;

    return {
      submissionId: submission.id,
      code: submission.code,
      createdAt: submission.createdAt.toISOString(),
      result: await this.toResult(actor.userId, submission),
    };
  }

  /** The one student-safe projection. Both reads above go through it. */
  private async toResult(
    userId: string,
    submission: OwnedSubmission,
  ): Promise<SubmissionResult> {
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

  /**
   * The sitting this attempt belongs to, or a refusal.
   *
   * A session someone else owns, one opened against a different problem, and
   * one older than the 24-hour bound are all rejected the same way. The
   * workspace answers by opening a fresh session and asking for the submission
   * again, which is cheaper than storing a duration nobody can justify.
   */
  private async requireSolveSession(
    tx: Prisma.TransactionClient,
    input: { solveSessionId: string; userId: string; materialId: string },
  ): Promise<{ id: string; startedAt: Date }> {
    const session = await tx.exerciseSolveSession.findFirst({
      where: {
        id: input.solveSessionId,
        userId: input.userId,
        materialId: input.materialId,
      },
      select: { id: true, startedAt: true },
    });
    if (!session || isSolveSessionExpired(session.startedAt, new Date())) {
      throw new AppException("SOLVE_SESSION_INVALID", HttpStatus.CONFLICT);
    }
    return session;
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
