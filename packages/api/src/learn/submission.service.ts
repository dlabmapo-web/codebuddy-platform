import { manualProgrammingResult } from "./programming-assessment.js";
import { readSubmissionAdmission } from "./submission-admission-read.js";
import { nativeRuntimeVersion } from "@cove/grading-runtime";
import type { NativeAnyRuntimeDescriptor } from "@cove/shared";
import { programExit } from "../judge/program-exit.js";
import { NativeAdmission, frozenNativeDescriptor } from "../judge/native-admission.js";
import { snapshotTransaction } from "../judge/snapshot-transaction.js";
import { runtimeQueueName } from "../judge/judge.queue.js";
import { isCompiledLanguage, quizDefinitionSchema, quizFeedback } from "@cove/shared";
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
import {
  gradingSnapshotFor,
  resolveGradingProfile,
} from "../judge/grading-profile.js";
import { JudgeQueue } from "../judge/judge.queue.js";
import { reachableMaterialWhere } from "./curriculum-visibility.js";
import { LearningClassContextService } from "./learning-class-context.service.js";

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
  private nativeAdmission?: NativeAdmission;
  private native() { return this.nativeAdmission ??= new NativeAdmission(this.config, this.prisma, this.queue); }
  private readonly logger = new Logger(SubmissionService.name);
  private readonly rateLimit: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademyAccessService,
    private readonly config: ConfigService<ApiEnvironment, true>,
    private readonly classContext: LearningClassContextService,
    @Optional() private readonly queue?: JudgeQueue,
  ) {
    this.rateLimit = this.config.get("SUBMISSION_RATE_LIMIT", { infer: true });
  }

  async submit(
    identity: SupabaseIdentity,
    input: {
      academyId: string;
      materialId: string;
      classId: string;
      code: string;
      solveSessionId?: string;
      requestId?: string;
      manualAssessmentVersion?: 1;
    },
  ): Promise<{ submissionId: string; totalCount: number; result?: SubmissionResult }> {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      "submissions.own.create",
    );
    const { userId } = actor;
    const scope = learningScopeFor(input.academyId, actor);


    let createdSubmission: { id: string; totalCount: number; descriptor: NativeAnyRuntimeDescriptor | null; result?: SubmissionResult };
    try {
      // A joined admission read freezes the whole definition in one statement.
      // READ COMMITTED lets a same-key waiter see the receipt committed by the lock holder.
      const transact = input.requestId
        ? <T>(action: (tx: Prisma.TransactionClient) => Promise<T>) => this.prisma.$transaction(action, {isolationLevel: 'ReadCommitted', timeout: 10000})
        : <T>(action: (tx: Prisma.TransactionClient) => Promise<T>) => snapshotTransaction(this.prisma, action);
      createdSubmission = await transact(async (tx) => {
        // Serialize admission against typed runtime conversion. A conversion
        // takes FOR UPDATE; an earlier admission must commit before its pending
        // work inventory, and a later admission must read the converted type.
        await tx.$queryRaw`SELECT id FROM materials WHERE id = ${input.materialId}::uuid FOR SHARE`;
        // Visibility and grading inputs are read in the same transaction that
        // owns the snapshot. A concurrent hide or test edit therefore cannot
        // create a submission from a mixed curriculum state.
        const material = await readSubmissionAdmission(tx, input.materialId, input.academyId);
        const exercise = material?.programmingExercise;
        if (!material || material.type !== "PROGRAMMING_EXERCISE" || !exercise) throw new AppException("EXERCISE_NOT_AVAILABLE", HttpStatus.NOT_FOUND);
        if (material && exercise) {
          await this.classContext.resolveWith(tx, { academyId: input.academyId, userId,
            courseId: material.lecture.courseModule.courseId, requestedClassId: input.classId });
          if (input.requestId) {
            await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${userId + ':' + input.requestId}, 0))`;
            const existing = await tx.submission.findUnique({ where: { userId_requestId: { userId, requestId: input.requestId } } });
            if (existing) {
              if (existing.sourceMaterialId !== input.materialId || existing.classId !== input.classId || existing.code !== input.code)
                throw new AppException("CONTENT_EDIT_CONFLICT", HttpStatus.CONFLICT);
              return { id: existing.id, totalCount: existing.totalCount, descriptor: frozenNativeDescriptor(existing.executionRuntimeSnapshot),
                ...(existing.submissionPolicy === 'MANUAL_REVIEW' ? {result: manualProgrammingResult(existing)} : {}) };
            }
          }
          if (exercise.submissionPolicy === 'PRACTICE_ONLY') throw new AppException('EXERCISE_PRACTICE_ONLY', HttpStatus.BAD_REQUEST);
          if (exercise.submissionPolicy === 'MANUAL_REVIEW') {
            if (!input.requestId || input.manualAssessmentVersion !== 1) throw new AppException('SAMPLE_CHECK_STALE', HttpStatus.CONFLICT);
            await this.consumeRateLimit(userId);
            const solveSession = input.solveSessionId ? await this.requireSolveSession(tx, {
              solveSessionId: input.solveSessionId, userId, materialId: material.id, classId: input.classId,
            }) : null;
            const cm = material.lecture.courseModule;
            const receipt = await tx.submission.create({data: {
              userId, materialId: material.id, sourceMaterialId: material.id, courseId: cm.courseId,
              classId: input.classId, requestId: input.requestId, code: input.code, language: exercise.language,
              gradingRevision: exercise.gradingRevision, timeLimitMs: exercise.timeLimitMs, memoryLimitMb: exercise.memoryLimitMb,
              submissionPolicy: 'MANUAL_REVIEW', status: 'RECORDED', score: null, totalCount: 0,
              engineVersion: 'manual-record-v1', manualAssessmentSnapshot: {
                version: 1, messageVersion: 1, maximumHundredths: exercise.manualMaximumHundredths,
                includeInScore: exercise.manualIncludeInScore,
              },
              solveSessionId: solveSession?.id, solveElapsedSec: solveSession ? solveElapsedSeconds(solveSession.startedAt, new Date()) : null,
              problemTitle: material.title, courseTitle: cm.course.title, moduleTitle: cm.title,
              lectureTitle: material.lecture.title, modulePosition: cm.position,
              lecturePosition: material.lecture.position, problemPosition: material.position,
            }});
            return {id: receipt.id, totalCount: 0, descriptor: null, result: manualProgrammingResult(receipt)};
          }
        }
        if (!this.queue) throw new AppException('GRADING_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE);
        await this.consumeRateLimit(userId);
        if (!material || material.type !== 'PROGRAMMING_EXERCISE' || !exercise || (!exercise.quiz && exercise.testCases.length === 0)) {
          throw new AppException(
            "EXERCISE_NOT_AVAILABLE",
            HttpStatus.NOT_FOUND,
          );
        }
        const quiz = exercise.quiz == null ? null : quizDefinitionSchema.parse(exercise.quiz);
        if (quiz && !quiz.choices.some((choice) => choice.id === input.code)) {
          throw new AppException("EXERCISE_NOT_AVAILABLE", HttpStatus.BAD_REQUEST);
        }
        // Admitted only if a grader exists for it. Refusing here, before an
        // attempt is recorded, beats a submission that can only ever fail as
        // a judge error.
        const profile = resolveGradingProfile(exercise, exercise.testCases);
        if (!quiz && profile.kind === "unsupported") {
          this.logger.error(
            `material ${material.id} has an ungradable profile: ${profile.reason}`,
          );
          throw new AppException(
            "GRADING_UNAVAILABLE",
            HttpStatus.SERVICE_UNAVAILABLE,
          );
        }
        const engineVersion = this.config.get("PYODIDE_VERSION", { infer: true });
        const compiled = !quiz && isCompiledLanguage(exercise.language);
        if (compiled && profile.kind !== "elice") {
          this.logger.error(`material ${material.id} is ${exercise.language} without weighted grading`);
          throw new AppException("GRADING_UNAVAILABLE", HttpStatus.SERVICE_UNAVAILABLE);
        }
        const descriptor = quiz ? null : await this.native().select({
          academyId: input.academyId, materialId: material.id, gradingRevision: exercise.gradingRevision,
          context: "live", kind: "official",
        }, exercise, tx);
        // C and C++ run only on the native GCC runtime: no attempt is recorded
        // while it is unavailable, and nothing falls back to Pyodide.
        if (compiled && descriptor?.engine !== "native-gcc")
          throw new AppException("GRADING_UNAVAILABLE", HttpStatus.SERVICE_UNAVAILABLE);
        const snapshot = gradingSnapshotFor(exercise, { engineVersion, descriptor });

        // Read inside the same transaction as the snapshot, and against the
        // server clock. The browser names a session; it never reports how long
        // it took, so a patched client cannot post an impressive solve time.
        const solveSession = input.solveSessionId
          ? await this.requireSolveSession(tx, {
              solveSessionId: input.solveSessionId,
              userId,
              materialId: material.id,
              classId: input.classId,
            })
          : null;

        const courseModule = material.lecture.courseModule;
        const created = await tx.submission.create({
          data: {
            userId,
            materialId: material.id,
            sourceMaterialId: material.id,
            courseId: courseModule.courseId,
            classId: input.classId,
            gradingRevision: exercise.gradingRevision,
            language: exercise.language,
            timeLimitMs: exercise.timeLimitMs,
            memoryLimitMb: exercise.memoryLimitMb,
            // The whole profile, frozen: grading never reads the exercise.
            ...snapshot.submission,
            ...(quiz ? { quizSnapshot: { version: 1, title: material.title, description: exercise.description, definition: quiz } } : {}),
            code: input.code,
            requestId: input.requestId,
            totalCount: quiz ? 1 : exercise.testCases.length,
            engineVersion: descriptor ? nativeRuntimeVersion(descriptor) : engineVersion,
            ...(descriptor ? { executionQueue: runtimeQueueName("official", descriptor) } : {}),
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
            gradingCases: { create: quiz ? [] : snapshot.cases },
          },
          select: { id: true },
        });
        return { id: created.id, totalCount: quiz ? 1 : exercise.testCases.length, descriptor };
      });
    } catch (error) {
      if (isUniqueViolation(error) && input.requestId) {
        const existing = await this.prisma.submission.findUnique({where: {userId_requestId: {userId, requestId: input.requestId}}});
        if (existing) return this.submit(identity, input);
      }
      if (isUniqueViolation(error)) {
        throw new AppException("SUBMISSION_IN_FLIGHT", HttpStatus.CONFLICT);
      }
      throw error;
    }

    if (createdSubmission.result) return { submissionId: createdSubmission.id, totalCount: 0, result: createdSubmission.result };
    const submissionId = createdSubmission.id;
    try {
      if (createdSubmission.descriptor) await this.queue!.enqueue(submissionId, createdSubmission.descriptor);
      else await this.queue!.enqueue(submissionId);
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
    if (submission.submissionPolicy === "MANUAL_REVIEW") return manualProgrammingResult(submission);
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
    const weighted = submission.gradingMode !== "LEGACY_STDIO";
    const weightByPosition = new Map(
      submission.gradingCases.map((testCase) => [testCase.position, testCase.weight]),
    );

    return {
      quiz: quizFeedback(submission.quizSnapshot, submission.code, submission.status),
      submissionId: submission.id,
      materialId: submission.sourceMaterialId,
      status: submission.status,
      passedCount: submission.passedCount,
      totalCount: submission.totalCount,
      score: submission.score,
      // An aborted run's partial weights are diagnostics, not a grade: shown
      // beside a judge error they would read as a score the student earned.
      earnedWeight: submission.gradingAborted ? null : submission.earnedWeight,
      possibleWeight: submission.gradingAborted ? null : submission.possibleWeight,
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
          weight: weighted ? (weightByPosition.get(item.position) ?? null) : null,
          awardedWeight: weighted ? item.awardedWeight : null,
          // A program chooses its own ending (`return getchar();`), so a
          // hidden case's would disclose hidden input: public cases only.
          ...(item.isSample ? programExit(item) : { exitCode: null, exitSignal: null }),
        };
      }),
      compileFailed: submission.compileFailed,
      compileDiagnostics: submission.compileDiagnostics,
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
        // The student's own attempts at this problem. A platform repair would
        // take one of these twenty slots and push a real attempt off the end.
        regradeRunId: null,
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
        compileFailed: true,
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
        compileFailed: item.compileFailed,
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
    input: {
      solveSessionId: string;
      userId: string;
      materialId: string;
      classId: string;
    },
  ): Promise<{ id: string; startedAt: Date }> {
    const session = await tx.exerciseSolveSession.findFirst({
      where: {
        id: input.solveSessionId,
        userId: input.userId,
        materialId: input.materialId,
        classId: input.classId,
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
