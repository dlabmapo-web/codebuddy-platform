import { randomUUID } from "node:crypto";
import { Injectable, Logger, Optional, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AI_LIBRARY_TEXT_MAX } from "@cove/shared";

import type { ApiEnvironment } from "../../config/env.schema.js";
import { PrismaService } from "../../database/prisma.service.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { gradingSnapshotFor, resolveGradingProfile } from "../../judge/grading-profile.js";
import { JudgeQueue, runtimeQueueName } from "../../judge/judge.queue.js";
import { frozenNativeDescriptor, NativeAdmission } from "../../judge/native-admission.js";
import { practiceSnapshotSchema } from "../../judge/practice-snapshot.js";
import { aiSettings, withinHours } from "../ai-settings.js";
import { AiModelClient, AiModelError, withDeadline, type AiModelRequest, type AiUsage } from "../ai-model.js";
import { checkLibraryText, plainText } from "../text-check.js";
import { costMicros, readMonthCost, recordUsage } from "../usage.js";
import {
  buildGrowPrompt, buildReviewPrompt, buildWritePrompt, grownSchema, growSchema, LIBRARY_PROMPT_VERSION,
  reviewSchema, reviewsSchema, writeSchema, writtenLibrarySchema, type PublicCase, type ReviewItem,
} from "./library-prompt.js";
import {
  checkedLibraries, claimGrowth, claimLibrary, FEEDBACK_MAX, queueChangedLibraries, readLibraryExercise,
  type ClaimedGrowth, type ClaimedLibrary, type LibraryExercise,
} from "./library-read.js";
import { onLibraryWake } from "./library-wake.js";

const TICK_MS = 60_000;
/** A save wakes the job this soon: long enough for several quick saves to share one pass. */
const WAKE_MS = 1_000;
/** While work is under way, the next pass comes this soon instead of at the next minute. */
const FOLLOW_UP_MS = 10_000;
const MODEL_TIMEOUT_MS = 150_000;
const MAX_ATTEMPTS = 3;
/** One pass starts at most this many; the next tick carries on. */
const MAX_PER_PASS = 25;
/**
 * Libraries written or reviewed at the same moment. Four calls at once took as
 * long as one (November 26, 2026); OpenAI allows 5,000 a minute.
 */
const PARALLEL = 5;
/** Libraries whose programs may wait in the grader at once, so its night lane stays short. */
const MAX_CHECKING = 5;
const MIN_HINTS = 3;
const MIN_FEEDBACK = 2;
const FEEDBACK_KEPT = 5;
/**
 * A wrong program's whole run, at most: one that hangs on every test must not
 * hold the grader's background slot for the problem's full budget. Over it,
 * the program has still failed, which is all a wrong program must prove.
 */
const WRONG_PROGRAM_BUDGET_MS = 10_000;

type CheckSeed = { itemId: string | null; role: "SOLUTION" | "CORRECT" | "WRONG"; label: string; code: string };
type ItemVerdict = { id: string; state: "CHECKING" | "REJECTED" | "HIDDEN"; reason: string | null; outputs: unknown; fingerprint?: string | null };

/**
 * Writes and tests each exercise's library (§10 of the data document).
 *
 * WAITING → WRITING → CHECKING → REVIEWING → READY, or FAILED. Every commit is
 * fenced by a lease, so a worker that lost its turn changes nothing. Checks run
 * in the judge's background lane; this process only asks and reads.
 */
@Injectable()
export class AiLibraryJobService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiLibraryJobService.name);
  private timer?: ReturnType<typeof setInterval>;
  private soon?: ReturnType<typeof setTimeout>;
  private stopped = false;
  private running = false;
  /** A wake that came while a pass ran: one more pass follows it. */
  private again = false;
  private unwake?: () => void;
  private nativeAdmission?: NativeAdmission;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<ApiEnvironment, true>,
    private readonly model: AiModelClient,
    @Optional() private readonly queue?: JudgeQueue,
  ) {}

  private native() { return this.nativeAdmission ??= new NativeAdmission(this.config, this.prisma, this.queue); }
  private settings() { return aiSettings(this.config).library; }

  enabled(): boolean {
    return this.settings().enabled && this.model.available && Boolean(this.queue);
  }

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref();
    this.unwake = onLibraryWake(() => this.kick());
  }

  onModuleDestroy() {
    this.stopped = true;
    this.unwake?.();
    if (this.timer) clearInterval(this.timer);
    if (this.soon) clearTimeout(this.soon);
  }

  /** A problem was just queued: a pass in a moment, or right after the one running. */
  kick(): void {
    if (this.stopped) return;
    if (this.running) {
      this.again = true;
      return;
    }
    this.later(WAKE_MS);
  }

  async tick(): Promise<void> {
    if (this.running || !this.enabled()) {
      if (this.running) this.again = true;
      return;
    }
    this.running = true;
    let busy = false;
    try {
      busy = await this.pass();
    } catch (error) {
      this.logger.error(`AI library pass failed: ${error instanceof Error ? error.message.slice(0, 200) : "unknown"}`);
    } finally {
      this.running = false;
    }
    // Libraries are moving (written, reviewed, or programs in the grader): look
    // again in seconds, not at the next minute. An idle job keeps the minute.
    if (this.again) {
      this.again = false;
      this.later(WAKE_MS);
    } else if (busy) this.later(FOLLOW_UP_MS);
  }

  private later(ms: number): void {
    if (this.stopped) return;
    clearTimeout(this.soon);
    this.soon = setTimeout(() => void this.tick(), ms);
    this.soon.unref();
  }

  /** One pass over everything due. Exposed for tests. True while work is under way. */
  async pass(): Promise<boolean> {
    await this.recoverChecks();
    for (const id of await checkedLibraries(this.prisma)) await this.judge(id);
    const reviewed = await this.claimAndRun("REVIEWING", MAX_PER_PASS, (claim) => this.review(claim));
    if (!withinHours(this.settings().hours)) return reviewed.count > 0;
    await queueChangedLibraries(this.prisma, this.settings().quietMinutes);
    const [checking] = await this.prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM ai_libraries WHERE state = 'CHECKING'`;
    const inGrader = checking?.n ?? 0;
    const written = await this.claimAndRun("WAITING", Math.min(MAX_PER_PASS, MAX_CHECKING - inGrader), (claim) => this.write(claim));
    const busy = reviewed.count > 0 || written.count > 0 || inGrader > 0;
    if (written.overBudget) return busy;
    // Every new mistake, soon after the answer that showed it: a few problems at once.
    const growing: ClaimedGrowth[] = [];
    while (growing.length < PARALLEL && !(await this.overBudget())) {
      const claim = await claimGrowth(this.prisma, randomUUID(), FEEDBACK_MAX);
      if (!claim) break;
      growing.push(claim);
    }
    await Promise.all(growing.map((claim) => this.grow(claim)));
    return busy || growing.length > 0;
  }

  /**
   * Claims up to `limit` due libraries, `PARALLEL` at a time, and works on each
   * batch at once, so their model calls overlap instead of following each
   * other. A batch can pass the monthly limit by at most its own calls.
   */
  private async claimAndRun(
    from: "WAITING" | "REVIEWING", limit: number, work: (claim: ClaimedLibrary) => Promise<void>,
  ): Promise<{ count: number; overBudget: boolean }> {
    let count = 0;
    let overBudget = false;
    let exhausted = false;
    while (count < limit && !overBudget && !exhausted) {
      const batch: ClaimedLibrary[] = [];
      while (batch.length < PARALLEL && count + batch.length < limit) {
        if (await this.overBudget()) { overBudget = true; break; }
        const claim = await claimLibrary(this.prisma, from, randomUUID());
        if (!claim) { exhausted = true; break; }
        batch.push(claim);
      }
      count += batch.length;
      // Every claim finishes before the pass goes on; the first failure is then reported.
      const failed = (await Promise.allSettled(batch.map(work))).find((result) => result.status === "rejected");
      if (failed) throw failed.reason;
    }
    return { count, overBudget };
  }

  /* ---------------------------------------------------------------- writing */

  private async write(claim: ClaimedLibrary): Promise<void> {
    try {
      const exercise = await readLibraryExercise(this.prisma, claim.materialId);
      if (!exercise?.eligible) return await this.postpone(claim, "OFF");
      if (exercise.digest !== claim.digest) return await this.postpone(claim, "CHANGED", 0);
      if (resolveGradingProfile(exercise, exercise.testCases).kind === "unsupported") return await this.fail(claim, "UNSUPPORTED", true);
      if (await this.copy(claim, exercise)) return;

      const settings = this.settings();
      const prompt = buildWritePrompt({
        problem: exercise, publicCases: publicCases(exercise),
        solutions: settings.sendSolutions ? exercise.solutions : [],
      });
      const answer = await this.ask({ ...prompt, schema: writeSchema, maxOutputTokens: 12_000 });
      const written = writtenLibrarySchema.safeParse(answer.json);
      if (!written.success) return await this.fail(claim, "MALFORMED");

      const items: (Prisma.AiLibraryItemCreateManyInput & { id: string })[] = [];
      written.data.hints.forEach((hint, index) => items.push({
        id: randomUUID(), materialId: claim.materialId, kind: "HINT", position: index + 1,
        textKo: cut(hint.ko), textEn: cut(hint.en),
      }));
      const programs = new Set<string>();
      written.data.mistakes.forEach((mistake, index) => {
        const key = squash(mistake.wrongProgram);
        // Two mistakes with one program are one mistake.
        if (programs.has(key)) return;
        programs.add(key);
        items.push({
          id: randomUUID(), materialId: claim.materialId, kind: "FEEDBACK", position: index + 1, label: clean(mistake.label),
          textKo: cut(mistake.ko), textEn: cut(mistake.en), wrongProgram: clean(mistake.wrongProgram),
        });
      });
      const checks: CheckSeed[] = [
        ...exercise.solutions.map((code, index): CheckSeed => ({ itemId: null, role: "SOLUTION", label: `solution ${index + 1}`, code })),
        ...written.data.correctPrograms.map((item): CheckSeed => ({ itemId: null, role: "CORRECT", label: clean(item.approach), code: clean(item.code) })),
        ...items.flatMap((item): CheckSeed[] => item.wrongProgram ? [{ itemId: item.id, role: "WRONG", label: item.label ?? "", code: item.wrongProgram }] : []),
      ];
      await this.startChecks(claim, exercise, items, checks, { model: answer.model, replace: true });
    } catch (error) {
      await this.fail(claim, error instanceof AiModelError ? error.code : "INTERNAL");
      if (!(error instanceof AiModelError)) this.logger.error(`AI library ${claim.materialId}: ${error instanceof Error ? error.message.slice(0, 200) : "unknown"}`);
    }
  }

  /** The same content already has a tested library: copy it, with no call. */
  private async copy(claim: ClaimedLibrary, exercise: LibraryExercise): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const [source] = await tx.$queryRaw<{ material_id: string }[]>`
        SELECT lib.material_id FROM ai_libraries lib
        WHERE lib.content_digest = ${claim.digest} AND lib.state = 'READY' AND lib.material_id <> ${claim.materialId}::uuid
          AND (SELECT count(*) FROM ai_library_items i WHERE i.material_id = lib.material_id AND i.state = 'ACTIVE' AND i.origin IN ('AI', 'COPY') AND i.kind = 'HINT') >= ${MIN_HINTS}
          AND (SELECT count(*) FROM ai_library_items i WHERE i.material_id = lib.material_id AND i.state = 'ACTIVE' AND i.origin IN ('AI', 'COPY') AND i.kind = 'FEEDBACK') >= ${MIN_FEEDBACK}
        ORDER BY lib.ready_at LIMIT 1`;
      if (!source) return false;
      const fenced = await tx.$executeRaw`
        UPDATE ai_libraries SET state = 'READY', ready_at = now(), lease_id = NULL, lease_until = NULL, last_error_code = NULL, updated_at = now(),
          grading_revision = ${exercise.gradingRevision},
          correct_programs = s.correct_programs, model = s.model, prompt_version = s.prompt_version
        FROM (SELECT correct_programs, model, prompt_version FROM ai_libraries WHERE material_id = ${source.material_id}::uuid) s
        WHERE material_id = ${claim.materialId}::uuid AND lease_id = ${claim.leaseId}::uuid`;
      if (!fenced) return true;
      await replaceOldItems(tx, claim.materialId);
      await tx.$executeRaw`
        INSERT INTO ai_library_items (id, material_id, kind, position, label, text_ko, text_en, wrong_program, public_outputs, fingerprint, origin, state, updated_at)
        SELECT gen_random_uuid(), ${claim.materialId}::uuid, kind, position, label, text_ko, text_en, wrong_program, public_outputs, fingerprint, 'COPY', 'ACTIVE', now()
        FROM ai_library_items WHERE material_id = ${source.material_id}::uuid AND state = 'ACTIVE' AND origin IN ('AI', 'COPY')`;
      return true;
    });
  }

  /** Stores a batch and sends every program to the grader. */
  private async startChecks(
    claim: ClaimedLibrary,
    exercise: LibraryExercise,
    items: (Prisma.AiLibraryItemCreateManyInput & { id: string })[],
    seeds: CheckSeed[],
    options: { model: string; replace: boolean },
  ): Promise<void> {
    const descriptor = await this.native().select({
      academyId: exercise.academyId, materialId: exercise.materialId, gradingRevision: exercise.gradingRevision,
      context: "live", kind: "staff-practice",
    }, exercise);
    const grading = gradingSnapshotFor(exercise, { engineVersion: this.config.get("PYODIDE_VERSION", { infer: true }), descriptor });
    const snapshot = JSON.parse(JSON.stringify(practiceSnapshotSchema.parse({
      version: 1, courseId: exercise.courseId, gradingRevision: exercise.gradingRevision, language: exercise.language,
      timeLimitMs: exercise.timeLimitMs, memoryLimitMb: exercise.memoryLimitMb,
      ...grading.submission, gradingCases: grading.cases, quizSnapshot: null,
    }))) as Prisma.InputJsonObject;
    // A wrong program needs only to fail: its whole run is capped. Legacy
    // grading already stops at the first case over its limit.
    const total = grading.submission.totalTimeLimitMs;
    const wrongSnapshot = total !== null && total > WRONG_PROGRAM_BUDGET_MS
      ? { ...snapshot, totalTimeLimitMs: WRONG_PROGRAM_BUDGET_MS } : snapshot;

    const checks = await this.prisma.$transaction(async (tx) => {
      const fenced = await tx.$executeRaw`
        UPDATE ai_libraries SET state = 'CHECKING', lease_id = NULL, lease_until = NULL, last_error_code = NULL, updated_at = now(),
          model = ${options.model.slice(0, 80)}, prompt_version = ${LIBRARY_PROMPT_VERSION}
        WHERE material_id = ${claim.materialId}::uuid AND lease_id = ${claim.leaseId}::uuid`;
      if (!fenced) return [];
      await tx.aiLibraryCheck.deleteMany({ where: { materialId: claim.materialId } });
      // An abandoned batch never became anybody's hint.
      await tx.aiLibraryItem.deleteMany({ where: { materialId: claim.materialId, state: "CHECKING" } });
      await tx.aiLibraryItem.createMany({ data: items });
      // What staff wrote is kept, and proven again against the new tests.
      const staff = options.replace
        ? await tx.aiLibraryItem.findMany({
            where: { materialId: claim.materialId, origin: "STAFF", kind: "FEEDBACK", state: "ACTIVE", wrongProgram: { not: null } },
            select: { id: true, label: true, wrongProgram: true },
          })
        : [];
      const rows = [...seeds, ...staff.map((item): CheckSeed => ({ itemId: item.id, role: "WRONG", label: item.label, code: item.wrongProgram! }))]
        .map((seed) => ({
          id: randomUUID(), materialId: claim.materialId, itemId: seed.itemId, role: seed.role, label: seed.label.slice(0, 120), code: seed.code,
          snapshot: seed.role === "WRONG" ? wrongSnapshot : snapshot,
          executionQueue: descriptor ? runtimeQueueName("practice", descriptor) : null,
        }));
      await tx.aiLibraryCheck.createMany({ data: rows });
      return rows;
    });
    // The rows are durable: a lost dispatch is sent again by `recoverChecks`.
    await Promise.all(checks.map((check) => this.queue!.enqueueLibraryCheck(check.id, descriptor).catch(() => undefined)));
  }

  /* --------------------------------------------------------------- checking */

  /** Sends lost checks again, and ends those that can no longer finish. */
  private async recoverChecks(): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE ai_library_checks SET status = 'ERRORED', finished_at = now()
      WHERE (status = 'RUNNING' AND started_at < now() - interval '10 minutes')
         OR (status = 'QUEUED' AND created_at < now() - interval '2 hours')`;
    const lost = await this.prisma.aiLibraryCheck.findMany({
      where: { status: "QUEUED", createdAt: { lt: new Date(Date.now() - 2 * 60_000) } },
      orderBy: { createdAt: "asc" }, take: 100, select: { id: true, snapshot: true },
    });
    await Promise.all(lost.map(async (check) => {
      const snapshot = practiceSnapshotSchema.safeParse(check.snapshot);
      if (snapshot.success) await this.queue!.redispatchLibraryCheck(check.id, frozenNativeDescriptor(snapshot.data.executionRuntimeSnapshot)).catch(() => undefined);
    }));
  }

  /** Reads a finished batch: wrong programs must fail, correct ones must pass, texts must hold no code. */
  private async judge(materialId: string): Promise<void> {
    const [checks, items] = await Promise.all([
      this.prisma.aiLibraryCheck.findMany({ where: { materialId }, select: { itemId: true, role: true, label: true, code: true, status: true, publicOutputs: true, fingerprint: true } }),
      this.prisma.aiLibraryItem.findMany({
        where: { materialId, OR: [{ state: "CHECKING" }, { state: "ACTIVE", origin: "STAFF", kind: "FEEDBACK" }] },
        select: { id: true, kind: true, textKo: true, textEn: true, origin: true, state: true },
      }),
    ]);
    const solutions = checks.filter((item) => item.role === "SOLUTION");
    const growth = items.some((item) => item.state === "CHECKING" && item.origin === "GROWN");
    if (solutions.some((item) => item.status === "FAILED")) return this.stopChecking(materialId, "SOLUTION_FAILS", growth);
    const errored = checks.filter((item) => item.status === "ERRORED").length;
    if (solutions.some((item) => item.status === "ERRORED") || errored * 2 > checks.length) return this.stopChecking(materialId, "CHECKS_LOST", growth);

    const correct = checks.filter((item) => item.role === "CORRECT" && item.status === "PASSED");
    const distinct = new Set(correct.map((item) => squash(item.code)));
    // Without a teacher's solution the tests are trusted only when two
    // different programs agree with them.
    if (!growth && solutions.length === 0 && distinct.size < 2) return this.stopChecking(materialId, "NO_CORRECT", growth);

    const answers = [...solutions, ...correct].map((item) => item.code);
    const wrong = new Map(checks.filter((item) => item.role === "WRONG").map((item) => [item.itemId, item]));
    const verdicts = items.flatMap((item): ItemVerdict[] => {
      const check = wrong.get(item.id);
      if (item.state === "ACTIVE") {
        // A staff item: only its program is judged, and only hidden, never lost.
        return check?.status === "PASSED" ? [{ id: item.id, state: "HIDDEN", reason: "WRONG_PASSES", outputs: null }]
          : check?.status === "FAILED" ? [{ id: item.id, state: "CHECKING", reason: null, outputs: check.publicOutputs, fingerprint: check.fingerprint }] : [];
      }
      if (item.kind === "FEEDBACK") {
        if (check?.status === "PASSED") return [{ id: item.id, state: "REJECTED", reason: "WRONG_PASSES", outputs: null }];
        if (check?.status !== "FAILED") return [{ id: item.id, state: "REJECTED", reason: "NOT_RUN", outputs: null }];
      }
      const problem = (["ko", "en"] as const)
        .map((locale) => checkLibraryText({ text: locale === "ko" ? item.textKo : item.textEn, locale, max: AI_LIBRARY_TEXT_MAX, solutions: answers }))
        .find((found) => found !== null) ?? null;
      return [problem
        ? { id: item.id, state: "REJECTED", reason: problem, outputs: null }
        : { id: item.id, state: "CHECKING", reason: null, outputs: check?.publicOutputs ?? null, fingerprint: check?.fingerprint ?? null }];
    });
    await this.prisma.$transaction(async (tx) => {
      const moved = growth
        ? await tx.$executeRaw`UPDATE ai_libraries SET state = 'REVIEWING', updated_at = now() WHERE material_id = ${materialId}::uuid AND state = 'CHECKING'`
        : await tx.$executeRaw`
            UPDATE ai_libraries SET state = 'REVIEWING', updated_at = now(),
              correct_programs = ${JSON.stringify(correct.map((item) => ({ approach: item.label, code: item.code })))}::jsonb
            WHERE material_id = ${materialId}::uuid AND state = 'CHECKING'`;
      if (moved) await applyVerdicts(tx, verdicts);
    });
  }

  private async stopChecking(materialId: string, code: string, growth: boolean): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE ai_libraries SET last_error_code = ${code}, updated_at = now(), lease_id = NULL, lease_until = NULL,
          state = (CASE WHEN ${growth} THEN 'READY' WHEN ${code} = 'SOLUTION_FAILS' OR attempts >= ${MAX_ATTEMPTS} THEN 'FAILED' ELSE 'WAITING' END)::"AiLibraryState",
          next_attempt_at = now() + make_interval(mins => 10 * (2 ^ LEAST(attempts, 6))::int)
        WHERE material_id = ${materialId}::uuid AND state = 'CHECKING'`;
      await tx.aiLibraryItem.deleteMany({ where: { materialId, state: "CHECKING" } });
    });
  }

  /* -------------------------------------------------------------- reviewing */

  private async review(claim: ClaimedLibrary): Promise<void> {
    try {
      const [exercise, items, snapshotRow] = await Promise.all([
        readLibraryExercise(this.prisma, claim.materialId),
        this.prisma.aiLibraryItem.findMany({
          where: { materialId: claim.materialId, state: "CHECKING" }, orderBy: [{ kind: "asc" }, { position: "asc" }],
          select: { id: true, kind: true, textKo: true, textEn: true, wrongProgram: true, publicOutputs: true, origin: true },
        }),
        this.prisma.aiLibraryCheck.findFirst({ where: { materialId: claim.materialId }, select: { snapshot: true } }),
      ]);
      if (!exercise) return;
      const growth = items.some((item) => item.origin === "GROWN");
      const review: ReviewItem[] = items.map((item, index) => ({
        id: `${item.kind === "HINT" ? "H" : "F"}${index + 1}`, kind: item.kind, textKo: item.textKo, textEn: item.textEn,
        wrongProgram: item.wrongProgram, publicOutputs: item.publicOutputs as Record<string, string> | null,
      }));
      let verdicts: ItemVerdict[] = [];
      if (items.length) {
        const prompt = buildReviewPrompt({ problem: exercise, publicCases: publicCases(exercise) }, review);
        const answer = await this.ask({ ...prompt, schema: reviewSchema, maxOutputTokens: 6_000 });
        const parsed = reviewsSchema.safeParse(answer.json);
        if (!parsed.success) return await this.fail(claim, "MALFORMED");
        const byId = new Map(parsed.data.reviews.map((item) => [item.id, item]));
        verdicts = items.flatMap((item, index): ItemVerdict[] => {
          const verdict = byId.get(review[index]!.id);
          return verdict?.ok ? [] : [{ id: item.id, state: "REJECTED", reason: verdict ? `REVIEW: ${verdict.reason}`.slice(0, 300) : "NO_REVIEW", outputs: null }];
        });
      }
      const revision = practiceSnapshotSchema.safeParse(snapshotRow?.snapshot);
      await this.finish(claim, verdicts, growth, revision.success ? revision.data.gradingRevision : exercise.gradingRevision);
    } catch (error) {
      await this.fail(claim, error instanceof AiModelError ? error.code : "INTERNAL");
      if (!(error instanceof AiModelError)) this.logger.error(`AI library review ${claim.materialId}: ${error instanceof Error ? error.message.slice(0, 200) : "unknown"}`);
    }
  }

  /** Puts the surviving items in front of students, in one transaction. */
  private async finish(claim: ClaimedLibrary, verdicts: ItemVerdict[], growth: boolean, revision: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const [held] = await tx.$queryRaw<{ attempts: number }[]>`
        SELECT attempts FROM ai_libraries WHERE material_id = ${claim.materialId}::uuid AND lease_id = ${claim.leaseId}::uuid FOR UPDATE`;
      if (!held) return;
      await applyVerdicts(tx, verdicts);
      const [counts] = await tx.$queryRaw<{ hints: bigint; feedback: bigint }[]>`
        SELECT count(*) FILTER (WHERE kind = 'HINT') AS hints, count(*) FILTER (WHERE kind = 'FEEDBACK') AS feedback
        FROM ai_library_items WHERE material_id = ${claim.materialId}::uuid
          AND (state = 'CHECKING' OR (state = 'ACTIVE' AND origin = 'STAFF'))`;
      const enough = growth || (Number(counts?.hints ?? 0) >= MIN_HINTS && Number(counts?.feedback ?? 0) >= MIN_FEEDBACK);
      if (!enough) {
        await tx.aiLibraryItem.updateMany({ where: { materialId: claim.materialId, state: "CHECKING" }, data: { state: "REJECTED", rejectReason: "TOO_FEW" } });
        const last = held.attempts >= MAX_ATTEMPTS;
        await tx.$executeRaw`
          UPDATE ai_libraries SET state = ${last ? "FAILED" : "WAITING"}::"AiLibraryState", last_error_code = 'TOO_FEW', lease_id = NULL, lease_until = NULL,
            next_attempt_at = now() + interval '30 minutes', updated_at = now()
          WHERE material_id = ${claim.materialId}::uuid`;
        return;
      }
      if (!growth) await replaceOldItems(tx, claim.materialId);
      // New feedback beyond what a library keeps is dropped, oldest position first kept.
      await tx.$executeRaw`
        UPDATE ai_library_items i SET position = n.position, updated_at = now(),
          state = (CASE WHEN n.kind = 'FEEDBACK' AND n.position > n.room THEN 'REJECTED' ELSE 'ACTIVE' END)::"AiLibraryItemState",
          reject_reason = CASE WHEN n.kind = 'FEEDBACK' AND n.position > n.room THEN 'EXTRA' END
        FROM (
          SELECT f.id, f.kind, row_number() OVER (PARTITION BY f.kind ORDER BY f.position, f.id)
              + CASE WHEN f.kind = 'FEEDBACK' THEN kept.feedback ELSE 0 END AS position,
            CASE WHEN ${growth} THEN ${FEEDBACK_MAX} ELSE LEAST(${FEEDBACK_MAX}, kept.feedback + ${FEEDBACK_KEPT}) END AS room
          FROM ai_library_items f
          CROSS JOIN (SELECT count(*) AS feedback FROM ai_library_items k WHERE k.material_id = ${claim.materialId}::uuid AND k.state = 'ACTIVE' AND k.kind = 'FEEDBACK') kept
          WHERE f.material_id = ${claim.materialId}::uuid AND f.state = 'CHECKING') n
        WHERE i.id = n.id`;
      await tx.$executeRaw`
        UPDATE ai_libraries SET state = 'READY', ready_at = now(), attempts = 0, last_error_code = NULL, lease_id = NULL, lease_until = NULL,
          grading_revision = ${revision}, updated_at = now()
        WHERE material_id = ${claim.materialId}::uuid`;
    });
  }

  /* ---------------------------------------------------------------- growing */

  /**
   * New items from the answers that matched none since the last growth (the
   * campus courses design, §7). Only AI text is read, never a student's code.
   * Each new mistake must still be proven by the grader and pass the review.
   */
  private async grow(claim: ClaimedGrowth): Promise<void> {
    try {
      const since = new Date(Math.max(claim.since?.getTime() ?? 0, Date.now() - 30 * 86_400_000));
      const [exercise, replies, known] = await Promise.all([
        readLibraryExercise(this.prisma, claim.materialId),
        this.prisma.aiHelpReply.findMany({
          where: { materialId: claim.materialId, status: "DONE", libraryItemId: null, completedAt: { gt: since } },
          orderBy: { completedAt: "desc" }, take: 30, select: { reply: true },
        }),
        this.prisma.aiLibraryItem.findMany({ where: { materialId: claim.materialId, kind: "FEEDBACK", state: "ACTIVE" }, select: { label: true, wrongProgram: true } }),
      ]);
      if (!exercise?.eligible || !replies.length) return await this.release(claim);
      const prompt = buildGrowPrompt({
        problem: exercise, publicCases: publicCases(exercise), solutions: this.settings().sendSolutions ? exercise.solutions : [],
      }, known.map((item) => item.label), replies.flatMap((item) => item.reply ?? []));
      const answer = await this.ask({ ...prompt, schema: growSchema, maxOutputTokens: 6_000 });
      const grown = grownSchema.safeParse(answer.json);
      // A program already known, or given twice, is one mistake.
      const programs = new Set(known.flatMap((item) => item.wrongProgram ? [squash(item.wrongProgram)] : []));
      const room = Math.max(0, FEEDBACK_MAX - known.length);
      const mistakes = (grown.success ? grown.data.mistakes : []).filter((mistake) => {
        const key = squash(mistake.wrongProgram);
        if (programs.has(key)) return false;
        programs.add(key);
        return true;
      }).slice(0, room);
      if (!mistakes.length) return await this.release(claim);
      const items = mistakes.map((mistake, index) => ({
        id: randomUUID(), materialId: claim.materialId, kind: "FEEDBACK" as const, position: index + 1, label: clean(mistake.label), origin: "GROWN" as const,
        textKo: cut(mistake.ko), textEn: cut(mistake.en), wrongProgram: clean(mistake.wrongProgram),
      }));
      await this.startChecks(claim, exercise, items, [
        ...exercise.solutions.slice(0, 1).map((code): CheckSeed => ({ itemId: null, role: "SOLUTION", label: "solution 1", code })),
        ...items.map((item): CheckSeed => ({ itemId: item.id, role: "WRONG", label: item.label, code: item.wrongProgram })),
      ], { model: answer.model, replace: false });
    } catch (error) {
      await this.release(claim);
      this.logger.warn(`AI library growth ${claim.materialId}: ${error instanceof AiModelError ? error.code : "failed"}`);
    }
  }

  /* ----------------------------------------------------------------- shared */

  private async overBudget(): Promise<boolean> {
    return (await readMonthCost(this.prisma, "LIBRARY")) >= this.settings().budgetMicros;
  }

  /** One paid call, always counted, even when its answer is unusable. */
  private async ask(request: Pick<AiModelRequest, "instructions" | "content" | "schema" | "maxOutputTokens">) {
    const settings = this.settings();
    const pay = (usage: AiUsage) =>
      recordUsage(this.prisma, "LIBRARY", { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, costMicros: costMicros(usage, settings.price) });
    try {
      const answer = await withDeadline(MODEL_TIMEOUT_MS, (signal) =>
        this.model.complete({ ...request, model: settings.model, effort: settings.effort, serviceTier: settings.serviceTier }, signal));
      await pay(answer);
      return answer;
    } catch (error) {
      if (error instanceof AiModelError && error.usage.inputTokens > 0) await pay(error.usage);
      throw error;
    }
  }

  private async fail(claim: ClaimedLibrary, code: string, final = false): Promise<void> {
    const last = final || claim.attempts >= MAX_ATTEMPTS;
    await this.prisma.$transaction(async (tx) => {
      const held = await tx.$executeRaw`
        UPDATE ai_libraries SET state = ${last ? "FAILED" : "WAITING"}::"AiLibraryState",
          last_error_code = ${code}, lease_id = NULL, lease_until = NULL, updated_at = now(),
          next_attempt_at = now() + make_interval(mins => 10 * (2 ^ LEAST(attempts, 6))::int)
        WHERE material_id = ${claim.materialId}::uuid AND lease_id = ${claim.leaseId}::uuid`;
      if (held) await tx.aiLibraryItem.deleteMany({ where: { materialId: claim.materialId, state: "CHECKING" } });
    });
  }

  private async postpone(claim: ClaimedLibrary, code: string, minutes = 60): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE ai_libraries SET state = 'WAITING', attempts = GREATEST(attempts - 1, 0), last_error_code = ${code}, lease_id = NULL, lease_until = NULL,
        next_attempt_at = now() + make_interval(mins => ${minutes}::int), compared_at = CASE WHEN ${code} = 'CHANGED' THEN to_timestamp(0) ELSE compared_at END, updated_at = now()
      WHERE material_id = ${claim.materialId}::uuid AND lease_id = ${claim.leaseId}::uuid`;
  }

  private async release(claim: ClaimedLibrary): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE ai_libraries SET lease_id = NULL, lease_until = NULL, updated_at = now()
      WHERE material_id = ${claim.materialId}::uuid AND lease_id = ${claim.leaseId}::uuid`;
  }
}

/** What the last version of a problem used. Staff items stay. */
async function replaceOldItems(tx: Prisma.TransactionClient, materialId: string): Promise<void> {
  await tx.aiLibraryItem.updateMany({
    where: { materialId, state: { in: ["ACTIVE", "HIDDEN"] }, origin: { in: ["AI", "COPY", "GROWN"] } },
    data: { state: "REJECTED", rejectReason: "REPLACED" },
  });
}

/** Every item's verdict in one statement. `CHECKING` on a staff item only records its outputs. */
async function applyVerdicts(tx: Prisma.TransactionClient, verdicts: ItemVerdict[]): Promise<void> {
  if (!verdicts.length) return;
  await tx.$executeRaw`
    UPDATE ai_library_items i SET
      state = CASE WHEN i.state = 'ACTIVE' AND v.state = 'CHECKING' THEN i.state ELSE v.state::"AiLibraryItemState" END,
      reject_reason = v.reason, public_outputs = COALESCE(v.outputs, i.public_outputs), fingerprint = COALESCE(v.fingerprint, i.fingerprint), updated_at = now()
    FROM jsonb_to_recordset(${JSON.stringify(verdicts)}::jsonb) AS v(id uuid, state text, reason text, outputs jsonb, fingerprint text)
    WHERE i.id = v.id`;
}

function publicCases(exercise: LibraryExercise): PublicCase[] {
  // A grading snapshot numbers cases by their place, so results do too.
  return exercise.testCases.flatMap((item, index) => item.visibility === "SAMPLE"
    ? [{ position: index + 1, input: item.input, expectedOutput: item.expectedOutput }] : []);
}

const squash = (code: string) => code.replace(/\s+/g, "");
/** PostgreSQL text cannot hold a NUL. */
const clean = (value: string) => value.replaceAll("\u0000", "");
/** Longer than this fails the size check anyway; the column needs it bounded. */
const cut = (value: string) => plainText(value).slice(0, AI_LIBRARY_TEXT_MAX);
