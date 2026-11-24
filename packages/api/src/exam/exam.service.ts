import { randomInt } from "node:crypto";

import { HttpStatus, Injectable } from "@nestjs/common";
import {
  attemptIsOpen,
  attemptTotal,
  computeDeadline,
  deadlineEndReason,
  entryOpen,
  EXAM_SUBMIT_GRACE_MS,
  exitAllowed,
  itemScore,
  multipleChoiceSchema,
  periodState,
  publicChoice,
  quizDefinitionSchema,
  resultsVisible,
  shortAnswerSchema,
  type ExamAttemptShell,
  type ExamItemContent,
  type ExamItemSnapshot,
  type ExamStudentTest,
  examSubmitAnswerSchema,
} from "@cove/shared";
import type { z } from "zod";

import { AuditService } from "../academies/audit.service.js";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";
import { Prisma } from "../generated/prisma/client.js";
import { SubmissionService } from "../learn/submission.service.js";
import { ManualService } from "../manual/manual.service.js";
import {
  itemTypeOf,
  readAttempt,
  readLastSubmissions,
  readStudentTest,
  type AttemptRow,
  type ExamLectureItem,
  type LastSubmission,
  type ScheduleRow,
} from "./exam-read.js";

type Answer = z.infer<typeof examSubmitAnswerSchema>;

/** Default points for problems that have none: the total split into whole points. */
export function defaultPoints(materialIds: readonly string[], totalPoints = 100): Record<string, number> {
  const count = materialIds.length;
  if (!count) return {};
  const base = Math.floor(totalPoints / count);
  const extra = totalPoints - base * count;
  // Later problems carry the remainder, as Elice's 5…8 split does.
  return Object.fromEntries(materialIds.map((id, index) => [id, (base + (index >= count - extra ? 1 : 0)) * 100]));
}

/** The gradable, published problems of a test, in order, with their points. */
export function examItems(items: readonly ExamLectureItem[], points: Record<string, number>): Array<ExamLectureItem & { pointsHundredths: number }> {
  return items
    .filter((item) => item.isVisible && itemTypeOf(item))
    .map((item) => ({ ...item, pointsHundredths: points[item.materialId] ?? 0 }));
}

/**
 * The student side of exams. Every rule that matters — the period, the
 * deadline, one open attempt, the problem being in the attempt — is checked
 * here on the server; the browser's clock is only a display.
 */
@Injectable()
export class ExamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademyAccessService,
    private readonly audit: AuditService,
    private readonly submissions: SubmissionService,
    private readonly manual: ManualService,
  ) {}

  serverTime() {
    return { now: new Date() };
  }

  async studentTest(identity: SupabaseIdentity, input: { academyId: string; classId: string; lectureId: string }): Promise<ExamStudentTest> {
    const { userId } = await this.access.requirePermission(identity.authUserId, input.academyId, "curriculum.read");
    const row = await this.requireStudentTest(input, userId);
    let latest = row.latest;
    if (latest) latest = await this.closeIfExpired(latest, row.schedule, row.serverNow);
    const now = row.serverNow;
    const items = examItems(row.items, row.settings.points);
    const period = periodState({ ...row.schedule, now });
    // Either the test shows scores on finish, or staff released this class's results.
    const released = row.settings.showScoreOnFinish || resultsVisible({ resultsReleasedAt: row.schedule.resultsReleasedAt, now });
    const latestOpen = latest ? attemptIsOpen({ ...latest, now }) : false;
    const latestEnded = Boolean(latest && !latestOpen);
    // A retake is a new start, so the entry deadline closes it too.
    const entry = entryOpen({ entryClosesAt: row.schedule.entryClosesAt, now });
    const canRetake = latestEnded && period === "OPEN" && entry && (row.settings.allowSelfRetake || Boolean(latest?.retakeGrantedAt));
    let score: ExamStudentTest["score"] = null;
    if (released && latest && latestEnded) {
      const last = await readLastSubmissions(this.prisma, [latest.id]);
      score = scoreAttempt(latest.itemsSnapshot, last);
    }
    return {
      lectureId: row.lectureId,
      courseId: row.courseId,
      classId: input.classId,
      title: row.title,
      settings: publicSettings(row.settings),
      schedule: row.schedule,
      periodState: period,
      itemCount: items.length,
      totalPointsHundredths: items.reduce((sum, item) => sum + item.pointsHundredths, 0),
      latestAttempt: latest ? {
        id: latest.id, attemptNo: latest.attemptNo, startedAt: latest.startedAt, deadlineAt: latest.deadlineAt,
        endedAt: latest.endedAt ?? (latestOpen ? null : latest.deadlineAt), endReason: latest.endReason, open: latestOpen,
      } : null,
      canStart: !latest && period === "OPEN" && entry && items.length > 0,
      canRetake,
      resultsVisible: released,
      score,
      serverNow: now,
    };
  }

  async start(
    identity: SupabaseIdentity,
    input: { academyId: string; classId: string; lectureId: string; consent: true; clockDriftMs: number | null },
    context: { requestId?: string } = {},
  ): Promise<{ attemptId: string }> {
    const { userId } = await this.access.requirePermission(identity.authUserId, input.academyId, "submissions.own.create");
    const row = await this.requireStudentTest(input, userId);
    const now = row.serverNow;
    let latest = row.latest;
    if (latest) latest = await this.closeIfExpired(latest, row.schedule, now);
    if (latest && attemptIsOpen({ ...latest, now })) return { attemptId: latest.id };
    const period = periodState({ ...row.schedule, now });
    if (period === "BEFORE") throw new AppException("EXAM_PERIOD_NOT_OPEN", HttpStatus.FORBIDDEN);
    if (period === "AFTER") throw new AppException("EXAM_PERIOD_CLOSED", HttpStatus.FORBIDDEN);
    if (!entryOpen({ entryClosesAt: row.schedule.entryClosesAt, now })) throw new AppException("EXAM_ENTRY_CLOSED", HttpStatus.FORBIDDEN);
    if (latest && !row.settings.allowSelfRetake && !latest.retakeGrantedAt)
      throw new AppException("EXAM_RETAKE_NOT_ALLOWED", HttpStatus.FORBIDDEN);
    const items = examItems(row.items, row.settings.points);
    if (!items.length) throw new AppException("EXAM_NOT_FOUND", HttpStatus.NOT_FOUND);
    const snapshot: ExamItemSnapshot[] = items.map((item, position) => ({
      materialId: item.materialId, pointsHundredths: item.pointsHundredths, position,
    }));
    const deadlineAt = computeDeadline({ startedAt: now, timeLimitMinutes: row.settings.timeLimitMinutes, closesAt: row.schedule.closesAt });
    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.testAttempt.create({
          data: {
            lectureId: input.lectureId, classId: input.classId, userId,
            attemptNo: (latest?.attemptNo ?? 0) + 1,
            consentedAt: now, clockDriftMs: input.clockDriftMs, startedAt: now, deadlineAt,
            itemsSnapshot: snapshot as unknown as Prisma.InputJsonValue,
          },
          select: { id: true, attemptNo: true },
        });
        await this.audit.write(tx, {
          actorUserId: userId, academyId: input.academyId, action: "exam.attempt.started",
          targetType: "TestAttempt", targetId: created.id, requestId: context.requestId,
          after: { lectureId: input.lectureId, classId: input.classId, attemptNo: created.attemptNo, deadlineAt: deadlineAt?.toISOString() ?? null },
        });
        return { attemptId: created.id };
      });
    } catch (error) {
      // Two tabs pressing start together: the open-attempt index lets one win.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const open = await this.prisma.testAttempt.findFirst({
          where: { classId: input.classId, lectureId: input.lectureId, userId, endedAt: null },
          select: { id: true },
        });
        if (open) return { attemptId: open.id };
      }
      throw error;
    }
  }

  async attempt(identity: SupabaseIdentity, input: { academyId: string; attemptId: string }): Promise<ExamAttemptShell> {
    const { userId } = await this.access.requirePermission(identity.authUserId, input.academyId, "curriculum.read");
    const read = await this.requireOwnAttempt(input, userId);
    const attempt = await this.closeIfExpired(read.attempt, read.schedule, read.serverNow);
    const last = await readLastSubmissions(this.prisma, [attempt.id]);
    return this.shell({ ...read, attempt }, last);
  }

  async item(identity: SupabaseIdentity, input: { academyId: string; attemptId: string; materialId: string }): Promise<ExamItemContent> {
    const { userId } = await this.access.requirePermission(identity.authUserId, input.academyId, "curriculum.read");
    const read = await this.requireOwnAttempt(input, userId);
    const open = attemptIsOpen({ ...read.attempt, now: read.serverNow });
    if (!open && !read.settings.reviewAfterEnd) throw new AppException("EXAM_ENDED", HttpStatus.FORBIDDEN);
    // Explanations only in review, once this student may see results, and only when the test says so.
    const explain = !open && read.settings.showExplanations && (read.settings.showScoreOnFinish
      || resultsVisible({ resultsReleasedAt: read.schedule.resultsReleasedAt, now: read.serverNow }));
    if (!read.attempt.itemsSnapshot.some((item) => item.materialId === input.materialId))
      throw new AppException("EXAM_ITEM_NOT_IN_ATTEMPT", HttpStatus.NOT_FOUND);
    const [material, last] = await Promise.all([
      this.prisma.material.findUnique({
        where: { id: input.materialId },
        select: {
          id: true, title: true, type: true,
          programmingExercise: {
            select: {
              description: true, inputFormat: true, outputFormat: true, constraints: true, starterCode: true, language: true, quiz: true,
              gradingMode: true, inputPromptPolicy: true,
              testCases: { orderBy: { position: "asc" }, select: { input: true, expectedOutput: true, visibility: true } },
            },
          },
          manualMaterial: { select: { description: true, multipleChoice: true, shortAnswer: true, revision: true } },
        },
      }),
      readLastSubmissions(this.prisma, [read.attempt.id]),
    ]);
    if (!material) throw new AppException("EXAM_ITEM_NOT_IN_ATTEMPT", HttpStatus.NOT_FOUND);
    const lastAnswer = last.find((row) => row.materialId === material.id)?.answer ?? null;
    const exercise = material.programmingExercise;
    if (exercise?.quiz) {
      const quiz = quizDefinitionSchema.parse(exercise.quiz);
      return { type: "QUIZ", materialId: material.id, title: material.title, description: exercise.description,
        choices: quiz.choices.map(({ id, text }) => ({ id, text })), lastAnswer };
    }
    if (exercise) {
      return { type: "CODE", materialId: material.id, title: material.title, description: exercise.description,
        inputFormat: exercise.inputFormat, outputFormat: exercise.outputFormat, constraints: exercise.constraints,
        // Hidden cases are counted, never sent.
        samples: exercise.testCases.filter((testCase) => testCase.visibility === "SAMPLE")
          .map((testCase) => ({ input: testCase.input, output: testCase.expectedOutput })),
        hiddenCount: exercise.testCases.filter((testCase) => testCase.visibility !== "SAMPLE").length,
        language: exercise.language, starterCode: exercise.starterCode,
        gradingMode: exercise.gradingMode, inputPromptPolicy: exercise.inputPromptPolicy, lastAnswer };
    }
    const manual = material.manualMaterial;
    if (manual?.multipleChoice) {
      const full = multipleChoiceSchema.parse(manual.multipleChoice);
      const choice = publicChoice(full);
      const options = [...choice.options];
      if (choice.shuffleOptions)
        for (let i = options.length - 1; i > 0; i--) {
          const j = randomInt(i + 1);
          [options[i], options[j]] = [options[j]!, options[i]!];
        }
      let selected: string[] | null = null;
      try { selected = lastAnswer ? (JSON.parse(lastAnswer) as string[]) : null; } catch { selected = null; }
      return { type: "MULTIPLE_CHOICE", materialId: material.id, title: material.title, question: choice.question,
        description: choice.problemDescription || manual.description, selectionMode: choice.selectionMode,
        options, contentRevision: manual.revision, lastAnswer: selected,
        explanation: explain && full.explanationEnabled && full.explanation ? full.explanation : null };
    }
    if (manual) {
      const short = manual.shortAnswer ? shortAnswerSchema.parse(manual.shortAnswer) : null;
      return { type: "SHORT_ANSWER", materialId: material.id, title: material.title,
        description: [short?.question, manual.description].filter(Boolean).join("\n\n"),
        placeholder: "", contentRevision: manual.revision, lastAnswer,
        explanation: explain && short?.explanationEnabled && short.explanation ? short.explanation : null };
    }
    throw new AppException("EXAM_INVALID_MATERIAL", HttpStatus.BAD_REQUEST);
  }

  async submit(
    identity: SupabaseIdentity,
    input: { academyId: string; attemptId: string; materialId: string; requestKey: string; answer: Answer },
  ): Promise<{ submittedAt: Date }> {
    const { userId } = await this.access.requirePermission(identity.authUserId, input.academyId, "submissions.own.create");
    const read = await this.requireOwnAttempt(input, userId);
    const now = read.serverNow;
    const attempt = read.attempt;
    const graceDeadline = attempt.deadlineAt ? attempt.deadlineAt.getTime() + EXAM_SUBMIT_GRACE_MS : null;
    if (attempt.endedAt || (graceDeadline != null && now.getTime() > graceDeadline)) {
      await this.closeIfExpired(attempt, read.schedule, now);
      throw new AppException("EXAM_ENDED", HttpStatus.FORBIDDEN);
    }
    const item = read.items.find((candidate) => candidate.materialId === input.materialId);
    if (!item || !attempt.itemsSnapshot.some((snap) => snap.materialId === input.materialId))
      throw new AppException("EXAM_ITEM_NOT_IN_ATTEMPT", HttpStatus.NOT_FOUND);
    const type = itemTypeOf(item);
    const answer = input.answer;
    const base = { academyId: input.academyId, materialId: input.materialId, classId: attempt.classId };
    if ((type === "CODE" && answer.kind === "code") || (type === "QUIZ" && answer.kind === "choice")) {
      await this.submissions.submit(identity, {
        ...base, code: answer.kind === "code" ? answer.code : answer.choiceId,
        requestId: input.requestKey, manualAssessmentVersion: 1, examAttemptId: attempt.id,
      });
    } else if ((type === "MULTIPLE_CHOICE" && answer.kind === "options") || (type === "SHORT_ANSWER" && answer.kind === "text")) {
      await this.manual.submit(identity, {
        ...base, requestKey: input.requestKey, files: {}, revision: 0,
        answer: answer.kind === "text" ? answer.text : "",
        contentRevision: answer.contentRevision,
        ...(answer.kind === "options" ? { selectedOptionIds: answer.optionIds, displayOrder: answer.displayOrder } : {}),
      }, { examAttemptId: attempt.id });
    } else {
      throw new AppException("EXAM_INVALID_MATERIAL", HttpStatus.BAD_REQUEST);
    }
    return { submittedAt: new Date() };
  }

  /**
   * Counts one run of a code problem in the caller's open attempt. One guarded
   * statement: a closed attempt, someone else's, or a problem outside the
   * attempt simply counts nothing.
   */
  async recordRun(identity: SupabaseIdentity, input: { academyId: string; attemptId: string; materialId: string }): Promise<{ ok: true }> {
    const { userId } = await this.access.requirePermission(identity.authUserId, input.academyId, "submissions.own.create");
    const item = JSON.stringify([{ materialId: input.materialId }]);
    await this.prisma.$executeRaw`
      UPDATE test_attempts SET run_counts = jsonb_set(run_counts, ARRAY[${input.materialId}::text],
        to_jsonb(COALESCE((run_counts->>${input.materialId}::text)::int, 0) + 1))
      WHERE id = ${input.attemptId}::uuid AND user_id = ${userId}::uuid AND ended_at IS NULL
        AND (deadline_at IS NULL OR deadline_at > now()) AND items_snapshot @> ${item}::jsonb`;
    return { ok: true };
  }

  async end(
    identity: SupabaseIdentity,
    input: { academyId: string; attemptId: string },
    context: { requestId?: string } = {},
  ): Promise<ExamAttemptShell> {
    const { userId } = await this.access.requirePermission(identity.authUserId, input.academyId, "curriculum.read");
    const read = await this.requireOwnAttempt(input, userId);
    let attempt = await this.closeIfExpired(read.attempt, read.schedule, read.serverNow);
    // 퇴실 시간: the student may not leave before the exit time. Time running out still ends it.
    if (!attempt.endedAt && !exitAllowed({ exitOpensAt: read.schedule.exitOpensAt, now: read.serverNow }))
      throw new AppException("EXAM_EXIT_NOT_YET", HttpStatus.FORBIDDEN);
    if (!attempt.endedAt) {
      attempt = await this.prisma.$transaction(async (tx) => {
        const ended = await tx.testAttempt.updateMany({
          where: { id: attempt.id, endedAt: null },
          data: { endedAt: read.serverNow, endReason: "STUDENT", endedByUserId: userId },
        });
        if (ended.count) await this.audit.write(tx, {
          actorUserId: userId, academyId: input.academyId, action: "exam.attempt.ended",
          targetType: "TestAttempt", targetId: attempt.id, requestId: context.requestId, after: { endReason: "STUDENT" },
        });
        return { ...attempt, endedAt: read.serverNow, endReason: "STUDENT" as const };
      });
    }
    const last = await readLastSubmissions(this.prisma, [attempt.id]);
    return this.shell({ ...read, attempt }, last);
  }

  // --- helpers ---------------------------------------------------------------

  private async requireStudentTest(input: { academyId: string; classId: string; lectureId: string }, userId: string) {
    const row = await readStudentTest(this.prisma, { ...input, userId });
    if (!row || !row.visible || !row.enrolled) throw new AppException("EXAM_NOT_FOUND", HttpStatus.NOT_FOUND);
    if (!row.featureOn) throw new AppException("EXAM_FEATURE_OFF", HttpStatus.FORBIDDEN);
    return row;
  }

  private async requireOwnAttempt(input: { academyId: string; attemptId: string }, userId: string) {
    const read = await readAttempt(this.prisma, input);
    if (!read || read.attempt.userId !== userId) throw new AppException("EXAM_NOT_FOUND", HttpStatus.NOT_FOUND);
    return read;
  }

  /** Writes the end of an attempt whose deadline passed while nobody was looking. */
  private async closeIfExpired(attempt: AttemptRow, schedule: ScheduleRow, now: Date): Promise<AttemptRow> {
    if (attempt.endedAt || !attempt.deadlineAt || now < attempt.deadlineAt) return attempt;
    const endReason = deadlineEndReason({ deadlineAt: attempt.deadlineAt, closesAt: schedule.closesAt });
    await this.prisma.testAttempt.updateMany({
      where: { id: attempt.id, endedAt: null },
      data: { endedAt: attempt.deadlineAt, endReason },
    });
    return { ...attempt, endedAt: attempt.deadlineAt, endReason };
  }

  private shell(
    read: NonNullable<Awaited<ReturnType<typeof readAttempt>>>,
    last: LastSubmission[],
  ): ExamAttemptShell {
    const { attempt, settings, schedule, serverNow: now } = read;
    const open = attemptIsOpen({ ...attempt, now });
    const released = settings.showScoreOnFinish || resultsVisible({ resultsReleasedAt: schedule.resultsReleasedAt, now });
    const byMaterial = new Map(read.items.map((item) => [item.materialId, item]));
    const lastByMaterial = new Map(last.map((row) => [row.materialId, row]));
    return {
      id: attempt.id,
      lectureId: attempt.lectureId,
      classId: attempt.classId,
      courseId: read.courseId,
      title: read.title,
      guide: settings.guide,
      startedAt: attempt.startedAt,
      deadlineAt: attempt.deadlineAt,
      endedAt: attempt.endedAt ?? (open ? null : attempt.deadlineAt),
      endReason: attempt.endReason,
      open,
      review: !open && settings.reviewAfterEnd,
      resultsVisible: released,
      exitOpensAt: schedule.exitOpensAt,
      languageReference: settings.languageReference,
      items: [...attempt.itemsSnapshot].sort((a, b) => a.position - b.position).map((snap) => {
        const material = byMaterial.get(snap.materialId);
        const submission = lastByMaterial.get(snap.materialId);
        return {
          materialId: snap.materialId,
          position: snap.position,
          title: material?.title ?? "",
          type: (material && itemTypeOf(material)) ?? "CODE",
          pointsHundredths: snap.pointsHundredths,
          submitted: Boolean(submission),
          lastSubmittedAt: submission?.createdAt ?? null,
          // No verdict while the test runs or before results are released.
          scoreHundredths: !open && released && submission ? itemScore(submission.fraction, snap.pointsHundredths) : null,
        };
      }),
      serverNow: now,
    };
  }
}

/** The guide stays; the points map is staff-only. */
function publicSettings(settings: ExamStudentTest["settings"]) {
  return {
    guide: settings.guide, summary: settings.summary, testType: settings.testType,
    timeLimitMinutes: settings.timeLimitMinutes, usePreparation: settings.usePreparation,
    reviewAfterEnd: settings.reviewAfterEnd, allowSelfRetake: settings.allowSelfRetake,
    showScoreOnFinish: settings.showScoreOnFinish, languageReference: settings.languageReference,
    showExplanations: settings.showExplanations,
  };
}

export function scoreAttempt(snapshot: readonly ExamItemSnapshot[], last: readonly LastSubmission[]) {
  const byMaterial = new Map(last.map((row) => [row.materialId, row]));
  return attemptTotal(snapshot.map((item) => {
    const submission = byMaterial.get(item.materialId);
    return {
      pointsHundredths: item.pointsHundredths,
      submitted: Boolean(submission),
      scoreHundredths: submission ? itemScore(submission.fraction, item.pointsHundredths) : 0,
    };
  }));
}
