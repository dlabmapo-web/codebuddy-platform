import { admitRuntime } from "../judge/runtime-admission.js";
import { createPracticeAttempt } from "./staff-practice.repository.js";
import { HttpStatus, Injectable, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { quizDefinitionSchema, rolesHavePermission, submissionResultSchema, type SaveDraftResult } from "@cove/shared";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { learningScopeFor } from "../classes/assigned-course-access.js";
import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";
import { JudgeQueue } from "../judge/judge.queue.js";
import { gradingSnapshotFor, resolveGradingProfile } from "../judge/grading-profile.js";
import { practiceSnapshotSchema } from "../judge/practice-snapshot.js";
import { reachableMaterialWhere } from "./curriculum-visibility.js";
import { automaticLatestSubmission } from './latest-submission.js';
import { appliedScoreHundredthsFor } from '../judge/grading.js';

@Injectable()
export class StaffPracticeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademyAccessService,
    private readonly config: ConfigService,
    @Optional() private readonly queue?: JudgeQueue,
  ) {}

  async authorize(identity: SupabaseIdentity, input: { academyId: string; materialId: string; preview?: boolean; gradingRevision?: number }) {
    const actor = await this.access.requirePermission(identity.authUserId, input.academyId, "curriculum.read");
    // Platform inspection (and assumed support roles) never confers personal participation.
    if (actor.via !== "membership" || !rolesHavePermission(actor.roles, "practice.own.create")) {
      throw new AppException("PERMISSION_DENIED", HttpStatus.FORBIDDEN);
    }
    if (input.preview && !rolesHavePermission(actor.roles, "curriculum.review")) throw new AppException("PERMISSION_DENIED", HttpStatus.FORBIDDEN);
    const scope = learningScopeFor(input.academyId, actor);
    const material = await this.prisma.material.findFirst({
      where: { id: input.materialId, ...(input.preview ? { AND: [scope.material, { lecture: { courseModule: { course: { academyId: input.academyId } } } }] } : reachableMaterialWhere(input.academyId, scope)) },
      include: {
        programmingExercise: { include: { testCases: { orderBy: [{ position: "asc" }, { id: "asc" }] } } },
        lecture: { include: { courseModule: true } },
      },
    });
    if (!material?.programmingExercise) throw new AppException("EXERCISE_NOT_AVAILABLE", HttpStatus.NOT_FOUND);
    if (input.gradingRevision !== undefined && input.gradingRevision !== material.programmingExercise.gradingRevision) {
      throw new AppException("EXERCISE_NOT_AVAILABLE", HttpStatus.CONFLICT);
    }
    return { actor, material, exercise: material.programmingExercise };
  }

  async draft(identity: SupabaseIdentity, input: { academyId: string; materialId: string; preview?: boolean; gradingRevision?: number }) {
    const { actor, exercise } = await this.authorize(identity, input);
    const draft = await this.prisma.staffPracticeDraft.findUnique({
      where: { academyId_userId_materialId_context: { academyId: input.academyId, materialId: input.materialId, userId: actor.userId, context: input.preview ? `preview:${exercise.gradingRevision}` : "live" } },
    });
    return draft ? { code: draft.code, updatedAt: draft.updatedAt.toISOString(), gradingRevision: draft.gradingRevision } : null;
  }

  async saveDraft(identity: SupabaseIdentity, input: {
    academyId: string; materialId: string; code: string; preview?: boolean; gradingRevision?: number; baseUpdatedAt?: string | null;
  }): Promise<SaveDraftResult> {
    const { actor, exercise, material } = await this.authorize(identity, input);
    if (material.type !== 'PROGRAMMING_EXERCISE') throw new AppException('EXERCISE_NOT_AVAILABLE', HttpStatus.NOT_FOUND);
    const key = { academyId: input.academyId, userId: actor.userId, materialId: input.materialId, context: input.preview ? `preview:${exercise.gradingRevision}` : "live" };
    // Compare-and-swap, including first insert: a second tab must never silently replace work.
    return this.prisma.$transaction(async (tx) => {
      const inserted = await tx.staffPracticeDraft.createMany({ data: { ...key, code: input.code, gradingRevision: exercise.gradingRevision }, skipDuplicates: true });
      const current = await tx.staffPracticeDraft.findUniqueOrThrow({ where: { academyId_userId_materialId_context: key } });
      if (!inserted.count && current.code !== input.code && (!input.baseUpdatedAt || current.updatedAt.toISOString() !== input.baseUpdatedAt)) {
        return { outcome: "CONFLICT", serverCode: current.code, updatedAt: current.updatedAt.toISOString() };
      }
      const changed = await tx.staffPracticeDraft.updateMany({
        where: { id: current.id, updatedAt: current.updatedAt }, data: { code: input.code, gradingRevision: exercise.gradingRevision, updatedAt: new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1)) },
      });
      const saved = await tx.staffPracticeDraft.findUniqueOrThrow({ where: { id: current.id } });
      return { outcome: changed.count ? "SAVED" : "CONFLICT", serverCode: changed.count ? null : saved.code, updatedAt: saved.updatedAt.toISOString() };
    });
  }

  async submit(identity: SupabaseIdentity, input: {
    academyId: string; materialId: string; code: string; requestId: string; preview?: boolean; gradingRevision?: number;
  }) {
    const { actor, material, exercise } = await this.authorize(identity, input);
    if (material.type !== 'PROGRAMMING_EXERCISE') throw new AppException('EXERCISE_NOT_AVAILABLE', HttpStatus.NOT_FOUND);
    if (!this.queue) throw new AppException("GRADING_UNAVAILABLE", HttpStatus.SERVICE_UNAVAILABLE);
    const existing = await this.prisma.staffPracticeAttempt.findUnique({
      where: { academyId_userId_requestId: { academyId: input.academyId, userId: actor.userId, requestId: input.requestId } },
    });
    if (existing && (existing.materialId !== input.materialId || existing.code !== input.code || existing.context !== (input.preview ? `preview:${exercise.gradingRevision}` : "live"))) {
      throw new AppException("PERMISSION_DENIED", HttpStatus.CONFLICT);
    }
    // A retry observes its accepted frozen identity even if new admission is paused.
    if (existing) {
      if (existing.status === "QUEUED") void Promise.resolve().then(() => this.queue!.enqueuePractice(existing.id)).catch(() => undefined);
      const stored = practiceSnapshotSchema.parse(existing.snapshot);
      return { submissionId: existing.id, totalCount: stored.quizSnapshot ? 1 : stored.gradingCases.length };
    }
    if (!existing && !await this.queue.consumeSubmissionToken(actor.userId,
      Number(this.config.get("SUBMISSION_RATE_LIMIT") ?? 10), 60_000)) {
      throw new AppException("SUBMISSION_RATE_LIMITED", HttpStatus.TOO_MANY_REQUESTS);
    }
    if (exercise.submissionPolicy === "PRACTICE_ONLY") throw new AppException("EXERCISE_PRACTICE_ONLY", HttpStatus.BAD_REQUEST);
    const quiz = exercise.quiz == null ? null : quizDefinitionSchema.parse(exercise.quiz);
    if (quiz && !quiz.choices.some((choice) => choice.id === input.code)) {
      throw new AppException("EXERCISE_NOT_AVAILABLE", HttpStatus.BAD_REQUEST);
    }
    if (!quiz && (!exercise.testCases.length || resolveGradingProfile(exercise, exercise.testCases).kind === "unsupported")) {
      throw new AppException("GRADING_UNAVAILABLE", HttpStatus.SERVICE_UNAVAILABLE);
    }
    const descriptor = quiz ? undefined : await admitRuntime(this.config, this.prisma, { academyId: input.academyId, materialId: material.id, gradingRevision: exercise.gradingRevision, context: input.preview ? "preview" : "live", memoryLimitMb: exercise.memoryLimitMb, timeLimitMs: exercise.timeLimitMs }, () => this.queue!.redis());
    const grading = gradingSnapshotFor(exercise, { engineVersion: String(this.config.get("PYODIDE_VERSION")), descriptor });
    const snapshot = practiceSnapshotSchema.parse({
      version: descriptor ? 2 : 1, courseId: material.lecture.courseModule.courseId, gradingRevision: exercise.gradingRevision,
      timeLimitMs: exercise.timeLimitMs, memoryLimitMb: exercise.memoryLimitMb,
      ...grading.submission, gradingCases: quiz ? [] : grading.cases,
      quizSnapshot: quiz ? { version: 1, title: material.title, description: exercise.description, definition: quiz } : null,
    });
    const attempt = existing ?? await createPracticeAttempt(this.prisma, {
      academyId: input.academyId, userId: actor.userId, materialId: material.id,
      requestId: input.requestId, code: input.code, context: input.preview ? `preview:${exercise.gradingRevision}` : "live",
      snapshot: JSON.parse(JSON.stringify(snapshot)),
    });
    if (attempt.materialId !== input.materialId || attempt.code !== input.code) {
      throw new AppException("PERMISSION_DENIED", HttpStatus.CONFLICT);
    }
    if (attempt.status === "QUEUED") void Promise.resolve().then(() => this.queue!.enqueuePractice(attempt.id)).catch(() => undefined);
    const stored = practiceSnapshotSchema.parse(attempt.snapshot);
    return { submissionId: attempt.id, totalCount: stored.quizSnapshot ? 1 : stored.gradingCases.length };
  }

  async get(identity: SupabaseIdentity, input: { academyId: string; submissionId: string }) {
    const actor = await this.access.requirePermission(identity.authUserId, input.academyId, "practice.own.create");
    if (actor.via !== "membership") throw new AppException("PERMISSION_DENIED", HttpStatus.FORBIDDEN);
    const attempt = await this.prisma.staffPracticeAttempt.findFirst({
      where: { id: input.submissionId, academyId: input.academyId, userId: actor.userId },
    });
    if (!attempt) throw new AppException("SUBMISSION_NOT_FOUND", HttpStatus.NOT_FOUND);
    await this.authorize(identity, { academyId: input.academyId, materialId: attempt.materialId, preview: attempt.context.startsWith("preview:") });
    if (attempt.result) return submissionResultSchema.parse(attempt.result);
    const snapshot = practiceSnapshotSchema.parse(attempt.snapshot);
    return submissionResultSchema.parse({
      submissionId: attempt.id, materialId: attempt.materialId, status: attempt.status,
      passedCount: 0, totalCount: snapshot.quizSnapshot ? 1 : snapshot.gradingCases.length,
      score: 0, runtimeMs: null, failureReason: attempt.status === "ERRORED" ? "WORKER_LOST" : null,
      elapsedSec: 0, attemptCount: 0, createdAt: attempt.createdAt.toISOString(),
      gradedAt: attempt.gradedAt?.toISOString() ?? null, cases: [],
    });
  }

  async history(identity: SupabaseIdentity, input: { academyId: string; materialId: string; preview?: boolean; gradingRevision?: number }) {
    const { actor, exercise } = await this.authorize(identity, input);
    const attempts = await this.prisma.staffPracticeAttempt.findMany({
      where: { academyId: input.academyId, materialId: input.materialId, userId: actor.userId, context: input.preview ? `preview:${exercise.gradingRevision}` : "live" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50,
    });
    return { attempts: attempts.map((row) => ({ submissionId: row.id, code: row.code,
      createdAt: row.createdAt.toISOString(), status: row.status,
      score: row.result ? submissionResultSchema.parse(row.result).score : null })) };
  }

  async latest(identity: SupabaseIdentity, input: { academyId: string; materialId: string; preview?: boolean; gradingRevision?: number }) {
    const { actor, material, exercise } = await this.authorize(identity, input);
    if (material.type !== 'PROGRAMMING_EXERCISE') throw new AppException('EXERCISE_NOT_AVAILABLE', HttpStatus.NOT_FOUND);
    const row = await this.prisma.staffPracticeAttempt.findFirst({
      where: { academyId: input.academyId, materialId: input.materialId, userId: actor.userId, context: input.preview ? `preview:${exercise.gradingRevision}` : 'live' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    if (!row) return null;
    const snapshot = practiceSnapshotSchema.parse(row.snapshot);
    const result = row.result ? submissionResultSchema.parse(row.result) : null;
    const maximum = snapshot.materialMaximumHundredths;
    const applied = maximum !== null && snapshot.materialScorePolicy && result?.earnedWeight != null && result.possibleWeight != null
      ? appliedScoreHundredthsFor({ earnedWeight: result.earnedWeight, possibleWeight: result.possibleWeight, materialMaximumHundredths: maximum, policy: snapshot.materialScorePolicy }) : null;
    return automaticLatestSubmission({ ...row, score: result?.score ?? 0,
      materialMaximumHundredths: maximum, appliedScoreHundredths: applied,
      gradingAborted: Boolean(result?.failureReason) });
  }
}
