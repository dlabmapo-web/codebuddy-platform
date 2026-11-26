import { createHash } from "node:crypto";
import { HttpStatus, Injectable, Logger, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  academyDayStart,
  academyLocalDate,
  aiAnalysisSchema,
  AI_HELP_REPLY_MAX,
  isOutputCorrect,
  normalizeGradedOutput,
  type AiAnalysis,
  type AiHelpFallback,
  type AiHelpReply,
  type AiHelpResponse,
  type AiHelpState,
  type AiHelpView,
  type RequestAiHelpForCodeInput,
  type RequestAiHelpInput,
} from "@cove/shared";
import type { QueueEvents } from "bullmq";
import { z } from "zod";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AcademyAccessService, type AcademyAccess } from "../authorization/academy-access.service.js";
import { learningScopeFor } from "../classes/assigned-course-access.js";
import { AppException } from "../common/app-exception.js";
import type { ApiEnvironment } from "../config/env.schema.js";
import { PrismaService } from "../database/prisma.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import { AI_HELP_CHECK_WAIT_MS } from "../judge/ai-help-check.runner.js";
import { JudgeQueue, runtimeQueueName } from "../judge/judge.queue.js";
import { NativeAdmission } from "../judge/native-admission.js";
import { examplesSnapshotFor } from "../judge/sample-check-snapshot.js";
import { reachableMaterialWhere } from "../learn/curriculum-visibility.js";
import { LearningClassContextService } from "../learn/learning-class-context.service.js";
import { ownedSubmissionWhere } from "../learn/submission.service.js";
import {
  finishReply, PENDING_SECONDS, readCheckHelpContext, readHelpContext, reserveReply, type CheckRow, type HelpContext, type ReplyOutcome, type StoredReply,
} from "./ai-help-read.js";
import { AiModelClient, AiModelError, withDeadline } from "./ai-model.js";
import { aiSettings, type AiSettings } from "./ai-settings.js";
import { differenceKinds, type DifferenceKind } from "../judge/output-difference.js";
import { fingerprintOf, matchFingerprint } from "./fingerprint.js";
import {
  analysisAnswerSchema, buildAnalysisPrompt, differenceOf, fallbackFor, HELP_CODE_MAX, HELP_LIBRARY_MAX, HELP_PROMPT_VERSION, problemText,
  type AnalysisEvidence, type ExampleEvidence, type KnownMistake,
} from "./help-prompt.js";
import { checkReply, hiddenValueIn, hiddenValues, newCode, plainText } from "./text-check.js";
import { readLibraryExercise } from "./library/library-read.js";
import { costMicros } from "./usage.js";

const answerSchema = z.object({
  item: z.string().nullable(),
  result: z.string(), line: z.number().int().nullable(), why: z.string(), think: z.string(),
  tryIt: z.string().nullable(), alsoCheck: z.string().nullable(),
});
/** A failing model must not be called without end by one student. */
const REQUESTS_PER_WINDOW = 20;
const REQUEST_WINDOW_MS = 10 * 60_000;
/** Example checks one student may start, so the grader is not a free Run button. */
const CHECKS_PER_WINDOW = 30;
/** Waiting for a slot, then the run itself, then a margin. */
const CHECK_RESULT_WAIT_MS = AI_HELP_CHECK_WAIT_MS + 8_000;

/** What an answer is about: a failed submission, or an example check of the editor's code. */
type Subject = { submissionId: string | null; checkId: string | null; source: "SUBMIT" | "TEST_RUN" | "RUN" };
type Ask = { academyId: string; requestId: string; locale: RequestAiHelpInput["locale"]; mode: RequestAiHelpInput["mode"]; subject: Subject };

/**
 * The AI teacher's analysis of a student's own wrong code: a failed submission
 * (the Analyze design), or the code in the editor after Run or Test run, which
 * the server first runs on the examples (the campus courses design, §6).
 *
 * Every request decides again, from one statement: the browser's copy of
 * `aiAssistant` is a convenience and never an authority. A reservation is
 * committed before the model is called and no transaction is open during it.
 * A submission has at most one analysis and one simpler explanation; asking
 * again shows the saved one, free.
 */
@Injectable()
export class AiHelpService {
  private readonly logger = new Logger(AiHelpService.name);
  private active = 0;
  private nativeAdmission?: NativeAdmission;

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademyAccessService,
    private readonly config: ConfigService<ApiEnvironment, true>,
    private readonly model: AiModelClient,
    private readonly classContext: LearningClassContextService,
    @Optional() private readonly queue?: JudgeQueue,
  ) {}

  private native() { return this.nativeAdmission ??= new NativeAdmission(this.config, this.prisma, this.queue); }

  async get(identity: SupabaseIdentity, input: { academyId: string; submissionId: string }): Promise<AiHelpView> {
    const actor = await this.access.requirePermission(identity.authUserId, input.academyId, "curriculum.read");
    const settings = aiSettings(this.config).help;
    const context = await this.context(actor, input, false);
    const state = this.stateOf(context, settings);
    return { ...this.remaining(context, settings, state), replies: state === "OFF" ? [] : context.replies.map(toReply) };
  }

  async request(identity: SupabaseIdentity, input: RequestAiHelpInput): Promise<AiHelpResponse> {
    const actor = await this.access.requirePermission(identity.authUserId, input.academyId, "submissions.own.create");
    const settings = aiSettings(this.config).help;
    const context = await this.context(actor, input, true);
    return this.explain(actor, context, settings, {
      academyId: input.academyId, requestId: input.requestId, locale: input.locale, mode: input.mode,
      subject: { submissionId: input.submissionId, checkId: null, source: "SUBMIT" },
    }, () => this.context(actor, input, false));
  }

  /**
   * AI help on the code in the editor, after Run or Test run (the campus
   * courses design, §6). The server runs that code on every example, waiting
   * in the grader's interactive line, and never trusts the browser's results.
   * All examples passing is said for free; a failure is explained exactly as a
   * failed submission is, from the examples only. The same code again reuses
   * its check and its answer.
   */
  async requestForCode(identity: SupabaseIdentity, input: RequestAiHelpForCodeInput): Promise<AiHelpResponse> {
    const actor = await this.access.requirePermission(identity.authUserId, input.academyId, "submissions.own.create");
    const settings = aiSettings(this.config).help;
    // Reach first, as Test run decides it; the exercise itself is read with
    // everything else, and its tests only when a new check must run.
    const reachable = await this.prisma.material.findFirst({
      where: { id: input.materialId, type: "PROGRAMMING_EXERCISE", ...reachableMaterialWhere(input.academyId, learningScopeFor(input.academyId, actor)) },
      select: { id: true },
    });
    if (!reachable) throw new AppException("SAMPLE_CHECK_NOT_FOUND", HttpStatus.NOT_FOUND);
    const codeHash = createHash("sha256").update(input.code).digest("hex");
    const read = async (checkId: string | null) => {
      const found = await readCheckHelpContext(this.prisma, {
        academyId: input.academyId, userId: actor.userId, materialId: reachable.id, codeHash, checkId, dayStart: today(), full: true,
      });
      if (!found?.context.exercise) throw new AppException("SAMPLE_CHECK_NOT_FOUND", HttpStatus.NOT_FOUND);
      return found;
    };

    let { context, check, courseId } = await read(null);
    // An authorized class context, exactly as Submit and Test run require one.
    await this.classContext.resolve({ academyId: input.academyId, userId: actor.userId, courseId, requestedClassId: input.classId });
    if (context.exercise!.gradingRevision !== input.workspaceRevision) throw new AppException("SAMPLE_CHECK_STALE", HttpStatus.CONFLICT);
    const answer = (context: HelpContext, fallback: AiHelpFallback | null, examplesPassed = false): AiHelpResponse => ({
      ...this.remaining(context, settings, this.stateOf(context, settings)), reply: null, fallback, ...(examplesPassed ? { examplesPassed } : {}),
    });

    const state = this.stateOf(context, settings);
    if (state !== "AVAILABLE" && state !== "LIMIT_PROBLEM" && state !== "LIMIT_DAY") return answer(context, null);
    const level = input.mode === "simpler" && context.replies.some((item) => item.level === 1) ? 2 : 1;
    const saved = context.replies.find((item) => item.level === level);
    // Shown again even at a limit: it was already paid for.
    if (saved) return { ...answer(context, null), reply: toReply(saved) };
    if (check?.status === "PASSED") return answer(context, null, true);
    if (!check) {
      // Past a limit nothing new is started: the grader is not a free Run button.
      if (state !== "AVAILABLE") return answer(context, null);
      if (input.code.length > HELP_CODE_MAX) return answer(context, "try_small");
      if (!(await this.withinRate(`ai-help-check:${actor.userId}`, CHECKS_PER_WINDOW))) return answer(context, "busy");
      const started = await this.startCheck(actor.userId, input, codeHash);
      if (!started) return answer(context, "trace_public");
      ({ context, check } = await read(started));
    } else if (check.status === "QUEUED" || check.status === "RUNNING") {
      // Another tab started this very check: wait for it rather than run it twice.
      ({ context, check } = await this.waitFor(check, () => read(check!.id)));
    }
    if (!check || check.status !== "FAILED") return check?.status === "PASSED" ? answer(context, null, true) : answer(context, "busy");
    return this.explain(actor, context, settings, {
      academyId: input.academyId, requestId: input.requestId, locale: input.locale, mode: input.mode,
      subject: { submissionId: null, checkId: check.id, source: input.source },
    }, async () => (await read(check!.id)).context);
  }

  /**
   * From a context whose code failed to an answer: the saved one, free; else
   * one reservation and at most one model call. Shared by Submit and by the
   * example checks of Run and Test run.
   */
  private async explain(
    actor: AcademyAccess, context: HelpContext, settings: AiSettings["help"], ask: Ask, reread: () => Promise<HelpContext>,
  ): Promise<AiHelpResponse> {
    const evidence = evidenceOf(context);
    const answer = (reply: AiHelpReply | null, fallback: AiHelpFallback | null, spent = 0): AiHelpResponse => ({
      ...this.remaining(context, settings, this.stateOf(context, settings), spent), reply, fallback,
    });

    const state = this.stateOf(context, settings);
    if (state !== "AVAILABLE" && state !== "LIMIT_PROBLEM" && state !== "LIMIT_DAY") return answer(null, null);
    const analysis = context.replies.find((item) => item.level === 1);
    // A simpler explanation is of an analysis; without one, this is the analysis.
    const level = ask.mode === "simpler" && analysis ? 2 : 1;
    const saved = context.replies.find((item) => item.level === level);
    // Shown again even at a limit: it was already paid for.
    if (saved) return answer(toReply(saved), null);
    // Nothing the model could use: no reservation, no call, nothing counted.
    if (context.submission.code.length > HELP_CODE_MAX || (!evidence.examples.failed.length && !problemText(context.exercise!)))
      return answer(null, fallbackFor(evidence));
    const reserved = await this.reserve(actor, context, ask, settings, today(), level, state === "AVAILABLE");
    if (reserved.kind === "done") return answer(reserved.reply, null);
    if (reserved.kind !== "reserved") {
      if (reserved.kind === "conflict") throw new AppException("CONTENT_EDIT_CONFLICT", HttpStatus.CONFLICT);
      if (reserved.kind === "failed") return answer(null, fallbackFor(evidence));
      if (reserved.kind !== "limited") return answer(null, "busy");
      // Another tab took the last one, or wrote this answer, between the read and the reservation.
      const again = await reread();
      const written = again.replies.find((item) => item.level === level);
      const now = this.stateOf(again, settings);
      // Still allowed and still unwritten: another click on this submission is writing it.
      return { ...this.remaining(again, settings, now), reply: written ? toReply(written) : null, fallback: written || now !== "AVAILABLE" ? null : "busy" };
    }

    const outcome = await this.ask(context, evidence, ask, reserved, analysis, settings);
    await finishReply(this.prisma, outcome);
    if (outcome.status === "FAILED") {
      this.logger.warn(`AI help ${outcome.failureCode} after ${outcome.latencyMs} ms`);
      return answer(null, fallbackFor(evidence));
    }
    return answer({
      id: outcome.id, level: reserved.level, text: outcome.reply!, analysis: outcome.analysis as AiAnalysis,
      createdAt: new Date().toISOString(), reported: false,
    }, null, 1);
  }

  /** A student says an answer is wrong. The library mistake it used is reported with it. */
  async report(identity: SupabaseIdentity, input: { academyId: string; replyId: string }): Promise<{ reported: true }> {
    const actor = await this.access.requirePermission(identity.authUserId, input.academyId, "curriculum.read");
    const [row] = await this.prisma.$queryRaw<{ library_item_id: string | null }[]>`
      UPDATE ai_help_replies SET reported_at = COALESCE(reported_at, now())
      WHERE id = ${input.replyId}::uuid AND user_id = ${actor.userId}::uuid AND academy_id = ${input.academyId}::uuid AND status = 'DONE'
      RETURNING library_item_id`;
    if (!row) throw new AppException("SUBMISSION_NOT_FOUND", HttpStatus.NOT_FOUND);
    if (row.library_item_id) await this.reportItem(row.library_item_id, actor.userId);
    return { reported: true };
  }

  /** One report per student; a second student's hides the item until staff look. */
  private async reportItem(itemId: string, userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO ai_library_reports (item_id, user_id) VALUES (${itemId}::uuid, ${userId}::uuid) ON CONFLICT DO NOTHING`;
      await tx.$executeRaw`
        UPDATE ai_library_items SET state = 'HIDDEN', reject_reason = 'REPORTED', updated_at = now()
        WHERE id = ${itemId}::uuid AND state = 'ACTIVE' AND (SELECT count(*) FROM ai_library_reports r WHERE r.item_id = ${itemId}::uuid) >= 2`;
    });
  }

  /* ----------------------------------------------------------------- inside */

  /** Ownership and reach first, exactly as reading the result decides them. */
  private async context(actor: AcademyAccess, input: { academyId: string; submissionId: string }, full: boolean): Promise<HelpContext> {
    const owned = await this.prisma.submission.findFirst({
      where: ownedSubmissionWhere({
        academyId: input.academyId, userId: actor.userId, scope: learningScopeFor(input.academyId, actor), submissionId: input.submissionId,
      }),
      select: { id: true },
    });
    const context = owned
      ? await readHelpContext(this.prisma, { academyId: input.academyId, userId: actor.userId, submissionId: input.submissionId, dayStart: today(), full })
      : null;
    if (!context) throw new AppException("SUBMISSION_NOT_FOUND", HttpStatus.NOT_FOUND);
    return context;
  }

  private stateOf(context: HelpContext, settings: AiSettings["help"]): AiHelpState {
    const { submission, exercise } = context;
    if (!settings.enabled || !this.model.available || !context.featureOn || !exercise?.aiFeedbackEnabled || !exercise.courseOn) return "OFF";
    if (exercise.submissionPolicy !== "AUTOMATIC" || exercise.language !== "PYTHON" || !exercise.plain || exercise.lectureKind !== "STANDARD") return "OFF";
    // An example check is decided by its own status: see `requestForCode`.
    if (!context.examplesOnly) {
      if (submission.status !== "FAILED" || submission.submissionPolicy !== "AUTOMATIC" || submission.language !== "PYTHON") return "OFF";
      if (submission.inExam || submission.quiz || submission.repair || submission.aborted) return "OFF";
    }
    if (context.monthCostMicros >= settings.budgetMicros) return "OFF";
    if (context.examOpen) return "EXAM_OPEN";
    if (submission.gradingRevision !== exercise.gradingRevision) return "STALE";
    if (context.usedForProblem >= settings.problemLimit) return "LIMIT_PROBLEM";
    if (context.usedToday >= settings.dailyLimit) return "LIMIT_DAY";
    return "AVAILABLE";
  }

  private remaining(context: HelpContext, settings: AiSettings["help"], state: AiHelpState, spent = 0) {
    const problem = Math.max(0, settings.problemLimit - context.usedForProblem - spent);
    const today = Math.max(0, settings.dailyLimit - context.usedToday - spent);
    const after: AiHelpState = state !== "AVAILABLE" ? state : problem === 0 ? "LIMIT_PROBLEM" : today === 0 ? "LIMIT_DAY" : state;
    return { state: after, remainingForProblem: Math.min(problem, today), remainingToday: today };
  }

  private async reserve(
    actor: AcademyAccess, context: HelpContext, input: Ask, settings: AiSettings["help"], dayStart: Date, level: number, allowed: boolean,
  ): Promise<
    | { kind: "reserved"; id: string; level: number }
    | { kind: "done"; reply: AiHelpReply }
    | { kind: "pending" | "failed" | "conflict" | "limited" | "busy" }
  > {
    const existing = await this.prisma.aiHelpReply.findUnique({
      where: { userId_requestId: { userId: actor.userId, requestId: input.requestId } },
      select: { id: true, submissionId: true, checkId: true, status: true, reply: true, analysis: true, level: true, createdAt: true, reportedAt: true },
    });
    if (existing) {
      if (existing.submissionId !== input.subject.submissionId || existing.checkId !== input.subject.checkId) return { kind: "conflict" };
      if (existing.status === "DONE") {
        return { kind: "done", reply: toReply({ ...existing, reply: existing.reply!, createdAt: existing.createdAt.toISOString(), reported: existing.reportedAt !== null }) };
      }
      const stale = Date.now() - existing.createdAt.getTime() > PENDING_SECONDS * 1_000;
      return { kind: existing.status === "PENDING" && !stale ? "pending" : "failed" };
    }
    if (!allowed) return { kind: "limited" };
    if (this.active >= settings.concurrency || !(await this.withinRate(`ai-help:${actor.userId}`, REQUESTS_PER_WINDOW))) return { kind: "busy" };
    try {
      const reservation = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`ai-help:${actor.userId}`}, 0))`;
        return reserveReply(tx, {
          requestId: input.requestId, userId: actor.userId, academyId: input.academyId, classId: context.submission.classId,
          ...input.subject, materialId: context.submission.sourceMaterialId, gradingRevision: context.submission.gradingRevision,
          level, locale: input.locale, promptVersion: HELP_PROMPT_VERSION, dayStart, problemLimit: settings.problemLimit, dailyLimit: settings.dailyLimit,
        });
      });
      return reservation ? { kind: "reserved", ...reservation } : { kind: "limited" };
    } catch (error) {
      // The same click twice at once: the other request holds the reservation.
      if (typeof error === "object" && error !== null && JSON.stringify(error).includes("23505")) return { kind: "pending" };
      throw error;
    }
  }

  private async withinRate(key: string, limit: number): Promise<boolean> {
    if (!this.queue) return true;
    try {
      return await this.queue.consumeSubmissionToken(key, limit, REQUEST_WINDOW_MS);
    } catch {
      return false;
    }
  }

  /**
   * Stores an example check and sends it to the grader's sample lane. Returns
   * its id, or null when the problem cannot be checked here (no examples, or a
   * grading profile the judge would refuse). Waits for the result.
   */
  private async startCheck(userId: string, input: RequestAiHelpForCodeInput, codeHash: string): Promise<string | null> {
    if (!this.queue) return null;
    // One statement, the same read the AI library's checks are built from.
    const exercise = await readLibraryExercise(this.prisma, input.materialId);
    if (!exercise) return null;
    const courseId = exercise.courseId;
    const descriptor = await this.native().select({
      academyId: input.academyId, materialId: exercise.materialId, gradingRevision: exercise.gradingRevision, context: "live", kind: "sample",
    }, exercise);
    const snapshot = examplesSnapshotFor(exercise, courseId, this.config.get("PYODIDE_VERSION", { infer: true }), descriptor);
    if (!snapshot) return null;
    const check = await this.prisma.aiHelpCheck.create({
      data: {
        userId, academyId: input.academyId, classId: input.classId, materialId: exercise.materialId, gradingRevision: exercise.gradingRevision,
        source: input.source, code: input.code, codeHash, snapshot: JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonObject,
        executionQueue: descriptor ? runtimeQueueName("sample", descriptor) : null,
      },
      select: { id: true },
    });
    const queue = descriptor ? this.queue.forRuntime(descriptor) : this.queue;
    const finished = await this.finished(queue.sampleEvents, check.id);
    try {
      await queue.enqueueAiHelpCheck(check.id);
    } catch {
      finished.cancel();
      return check.id;
    }
    await finished.done;
    return check.id;
  }

  /** A check another request started: its result, once it is there. */
  private async waitFor(check: CheckRow, read: () => Promise<{ context: HelpContext; check: CheckRow | null }>) {
    if (this.queue) {
      const finished = await this.finished(this.queue.sampleEvents, check.id);
      // It may have ended between the first read and listening.
      const now = await read();
      if (now.check?.status !== "QUEUED" && now.check?.status !== "RUNNING") {
        finished.cancel();
        return now;
      }
      await finished.done;
    }
    return read();
  }

  /** Resolves when the job ends in the grader, or after the longest a check may take. */
  private async finished(events: QueueEvents, jobId: string): Promise<{ done: Promise<void>; cancel: () => void }> {
    await events.waitUntilReady().catch(() => undefined);
    let cancel = () => {};
    const done = new Promise<void>((resolve) => {
      const onEnd = (event: { jobId: string }) => { if (event.jobId === jobId) end(); };
      const timer = setTimeout(() => end(), CHECK_RESULT_WAIT_MS);
      timer.unref();
      const end = () => {
        clearTimeout(timer);
        events.off("completed", onEnd);
        events.off("failed", onEnd);
        resolve();
      };
      events.on("completed", onEnd);
      events.on("failed", onEnd);
      cancel = end;
    });
    return { done, cancel: () => cancel() };
  }

  private async ask(
    context: HelpContext, evidence: AnalysisEvidence, input: Ask, reserved: { id: string; level: number },
    analysis: StoredReply | undefined, settings: AiSettings["help"],
  ): Promise<ReplyOutcome> {
    const started = Date.now();
    const exercise = context.exercise!;
    const { locale } = input;
    const outcome = (over: Partial<ReplyOutcome>): ReplyOutcome => ({
      id: reserved.id, status: "FAILED", reply: null, analysis: null, failureCode: null, libraryItemId: null, model: settings.model,
      inputTokens: 0, outputTokens: 0, costMicros: 0, latencyMs: Date.now() - started, ...over,
    });
    const earlier = reserved.level === 2 ? aiAnalysisSchema.safeParse(analysis?.analysis) : null;
    const prompt = buildAnalysisPrompt({
      locale, mode: reserved.level === 2 ? "simpler" : "analyze", earlier: earlier?.success ? earlier.data : null, examplesOnly: context.examplesOnly === true,
      problem: exercise, evidence, code: context.submission.code, mistakes: knownMistakes(context, locale),
      hints: context.hints.map((hint) => locale === "ko" ? hint.ko : hint.en),
    });
    this.active += 1;
    try {
      const answer = await withDeadline(settings.timeoutMs, (signal) => this.model.complete({
        model: settings.model, effort: settings.effort, serviceTier: settings.serviceTier, instructions: prompt.instructions, content: prompt.content,
        schema: analysisAnswerSchema, maxOutputTokens: settings.maxOutputTokens,
      }, signal));
      const paid = { inputTokens: answer.inputTokens, outputTokens: answer.outputTokens, costMicros: costMicros(answer, settings.price), model: answer.model };
      // Every refusal names the check that made it, for the operator and the evaluation.
      const refuse = (reason: string) => outcome({ ...paid, failureCode: `REJECTED:${reason}` });
      const parsed = answerSchema.safeParse(answer.json);
      if (!parsed.success) return refuse("SHAPE");
      const reply = parsed.data;
      const visible = [context.submission.code, problemText(exercise), ...publicText(context)].join("\n");
      const sections = [reply.result, reply.why, reply.think, reply.tryIt, reply.alsoCheck];
      // Words only: a quote of the student's own code is allowed, new code is not.
      if (sections.some((text) => text !== null && newCode(text, visible, context.submission.code))) return refuse("NEW_CODE");
      const shown = aiAnalysisSchema.safeParse({
        result: plainText(reply.result), why: plainText(reply.why), think: plainText(reply.think),
        tryIt: reply.tryIt === null ? null : plainText(reply.tryIt) || null, alsoCheck: reply.alsoCheck === null ? null : plainText(reply.alsoCheck) || null,
        // A line the code does not have points nowhere; the words still stand.
        line: reply.line !== null && reply.line >= 1 && reply.line <= context.submission.code.split("\n").length ? reply.line : null,
      });
      if (!shown.success) return refuse("SIZE");
      const text = [shown.data.result, shown.data.why, shown.data.think, shown.data.tryIt, shown.data.alsoCheck].filter(Boolean).join("\n");
      const problem = checkReply({ text, locale, max: AI_HELP_REPLY_MAX, solutions: context.solutions, visible: `${visible}\n${prompt.content}` });
      if (problem) return refuse(problem);
      if (hiddenValueIn(text, hiddenValues(hiddenData(context), visible))) return refuse("HIDDEN");
      // An id the prompt never gave names no mistake; the analysis still stands.
      const itemId = reply.item === null ? null : prompt.itemIds.get(reply.item) ?? null;
      return outcome({ ...paid, status: "DONE", reply: text, analysis: shown.data, libraryItemId: itemId });
    } catch (error) {
      if (!(error instanceof AiModelError)) throw error;
      return outcome({
        failureCode: error.code, inputTokens: error.usage.inputTokens, outputTokens: error.usage.outputTokens, costMicros: costMicros(error.usage, settings.price),
      });
    } finally {
      this.active -= 1;
    }
  }
}

function today(): Date {
  return academyDayStart(academyLocalDate(new Date()));
}

function toReply(row: { id: string; level: number; reply: string; analysis: unknown; createdAt: string; reported: boolean }): AiHelpReply {
  const analysis = aiAnalysisSchema.safeParse(row.analysis);
  return { id: row.id, level: row.level, text: row.reply, analysis: analysis.success ? analysis.data : null, createdAt: row.createdAt, reported: row.reported };
}

/**
 * Known mistakes for this submission, those it matches first. A match compares
 * which tests fail (the fingerprint) on the server; the prompt only learns
 * whether one matched.
 */
function knownMistakes(context: HelpContext, locale: RequestAiHelpInput["locale"]): KnownMistake[] {
  const student = fingerprintOf(context.cases);
  const rank = { exact: 0, likely: 1 } as const;
  // After Run or Test run only the examples ran: a mistake is compared on
  // those same tests, picked out of its whole-test fingerprint by position.
  const positions = [...context.cases].sort((a, b) => a.position - b.position).map((item) => item.position);
  const known = (fingerprint: string | null) => !context.examplesOnly || fingerprint === null ? fingerprint
    : positions.map((position) => fingerprint[position - 1] ?? "?").join("");
  return context.library
    .map((item) => ({ id: item.id, label: item.label, text: locale === "ko" ? item.textKo : item.textEn, match: matchFingerprint(student, known(item.fingerprint)) }))
    .sort((a, b) => (a.match ? rank[a.match] : 2) - (b.match ? rank[b.match] : 2))
    .slice(0, HELP_LIBRARY_MAX);
}

/** What the student already sees of the tests: the examples, in full. */
function publicText(context: HelpContext): string[] {
  return context.cases.filter((item) => item.is_sample).flatMap((item) => [item.input ?? "", item.expected_output ?? "", item.actual_output ?? ""]);
}

/** Hidden inputs and outputs, for the leak check only. */
function hiddenData(context: HelpContext): string[] {
  return context.cases.filter((item) => !item.is_sample).flatMap((item) => [item.input ?? "", item.expected_output ?? ""]);
}

/**
 * How a wrong output differs: the grader's word, else worked out from an
 * output the student can see. A hidden test graded before the word existed
 * stored nothing to compare, so it differs in a way nobody can say.
 */
function differenceFor(item: HelpContext["cases"][number]): DifferenceKind {
  const stored = differenceKinds.find((kind) => kind === item.output_difference);
  if (stored) return stored;
  return item.is_sample && item.actual_output !== null ? differenceOf(item.expected_output ?? "", item.actual_output, item.comparator) : "different";
}

/**
 * Every test result, as the model may read it (the Analyze design, §5): a
 * public test in full, a hidden one as its kind of failure only.
 */
export function evidenceOf(context: HelpContext): AnalysisEvidence {
  const ran = context.cases.filter((item) => item.outcome !== "SKIPPED");
  const passed = (item: HelpContext["cases"][number]) => isOutputCorrect(item.outcome);
  const failure = (item: HelpContext["cases"][number]) => {
    if (item.outcome === "WRONG_OUTPUT") return { outcome: "WRONG_OUTPUT" as const, difference: differenceFor(item) };
    if (item.outcome === "RUNTIME_ERROR") return { outcome: "RUNTIME_ERROR" as const, error: item.error_type ? { type: item.error_type, line: item.error_line } : null };
    return { outcome: item.outcome as Exclude<typeof item.outcome, "WRONG_OUTPUT" | "RUNTIME_ERROR"> };
  };
  const example = (item: HelpContext["cases"][number]): ExampleEvidence => ({
    position: item.position, input: item.input ?? "", expected: item.expected_output ?? "",
    ...(item.comparator && item.comparator !== "STDOUT" ? { rule: item.comparator } : {}),
    printed: item.actual_output === null ? null : normalizeGradedOutput(item.actual_output),
    failure: passed(item) ? null : { ...failure(item), ...(item.error_message ? { message: item.error_message } : {}) },
  });
  const examples = ran.filter((item) => item.is_sample);
  const hidden = context.cases.filter((item) => !item.is_sample);
  return {
    total: context.cases.length,
    passed: context.cases.filter(passed).length,
    examples: {
      total: context.cases.filter((item) => item.is_sample).length,
      passed: examples.filter(passed).length,
      failed: examples.filter((item) => !passed(item)).map(example),
      firstPassed: examples.find(passed) ? example(examples.find(passed)!) : null,
    },
    hidden: { total: hidden.length, failed: hidden.filter((item) => item.outcome !== "SKIPPED" && !passed(item)).map(failure) },
  };
}
