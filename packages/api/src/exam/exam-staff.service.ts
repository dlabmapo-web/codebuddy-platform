import { randomUUID } from "node:crypto";

import { HttpStatus, Injectable } from "@nestjs/common";
import {
  attemptIsOpen,
  examGradableMaterialTypes,
  formatPoints,
  itemScore,
  periodState,
  type ExamResults,
  type ExamSchedule,
  type ExamSettings,
  type ExamStaffTest,
} from "@cove/shared";

import { AuditService } from "../academies/audit.service.js";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { assignedClassWhere, requireAssignedTeacherActor } from "../classes/assigned-class-access.js";
import { AppException } from "../common/app-exception.js";
import { bumpContentRevision, nextLecturePosition } from "../content/content-positions.js";
import { stableKeyFromUuid } from "@cove/shared";
import { PrismaService } from "../database/prisma.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import {
  itemTypeOf,
  readClassTests,
  readLastSubmissions,
  readResultsByClass,
  readStaffTest,
  toSchedule,
  type ExamSettingsRow,
  type LastSubmission,
  type ResultsRow,
} from "./exam-read.js";
import { defaultPoints, examItems } from "./exam.service.js";

type ClassTestInput = { academyId: string; classId: string; lectureId: string };
/** The entry deadline and exit time are optional: absent means none. */
type ScheduleInput = Omit<ExamSchedule, "entryClosesAt" | "exitOpensAt"> & Partial<Pick<ExamSchedule, "entryClosesAt" | "exitOpensAt">>;

/** Authoring a test, and running it for a class. */
@Injectable()
export class ExamStaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademyAccessService,
    private readonly audit: AuditService,
  ) {}

  // --- Authoring -------------------------------------------------------------

  async staffTest(identity: SupabaseIdentity, input: { academyId: string; courseId: string; lectureId: string }): Promise<ExamStaffTest> {
    await this.access.requirePermission(identity.authUserId, input.academyId, "curriculum.manage");
    return this.readStaff(input);
  }

  async createTest(
    identity: SupabaseIdentity,
    input: { academyId: string; courseId: string; moduleId: string; title: string },
    context: { requestId?: string } = {},
  ): Promise<{ lectureId: string }> {
    const actor = await this.access.requirePermission(identity.authUserId, input.academyId, "curriculum.manage");
    await this.requireFeature(input.academyId);
    const module = await this.prisma.courseModule.findFirst({
      where: { id: input.moduleId, courseId: input.courseId, course: { academyId: input.academyId } },
      select: { id: true },
    });
    if (!module) throw new AppException("CONTENT_PARENT_MISMATCH", HttpStatus.NOT_FOUND);
    const lectureId = await this.prisma.$transaction(async (tx) => {
      await lockCourse(tx, input.courseId);
      const position = await nextLecturePosition(tx, input.moduleId);
      // A test starts as a draft (비공개), as Elice's does: points and problems
      // are set before anyone can see it.
      const created = await tx.lecture.create({
        data: {
          courseModuleId: input.moduleId, externalKey: stableKeyFromUuid(randomUUID()),
          title: input.title.trim(), description: "", position, isVisible: false, kind: "TEST",
          test: { create: { timeLimitMinutes: 60 } },
        },
        select: { id: true },
      });
      await this.audit.write(tx, {
        actorUserId: actor.userId, academyId: input.academyId, action: "content.test.created",
        targetType: "Lecture", targetId: created.id, requestId: context.requestId,
        after: { title: input.title.trim(), position },
      });
      await bumpContentRevision(tx, input.courseId);
      return created.id;
    });
    return { lectureId };
  }

  async convertLecture(
    identity: SupabaseIdentity,
    input: { academyId: string; courseId: string; lectureId: string },
    context: { requestId?: string } = {},
  ): Promise<ExamStaffTest> {
    const actor = await this.access.requirePermission(identity.authUserId, input.academyId, "curriculum.manage");
    await this.requireFeature(input.academyId);
    const current = await readStaffTest(this.prisma, input);
    if (!current) throw new AppException("EXAM_NOT_FOUND", HttpStatus.NOT_FOUND);
    if (current.kind === "TEST") return this.readStaff(input);
    if (current.items.some((item) => !itemTypeOf(item))) throw new AppException("EXAM_INVALID_MATERIAL", HttpStatus.BAD_REQUEST);
    await this.prisma.$transaction(async (tx) => {
      await lockCourse(tx, input.courseId);
      await tx.lecture.update({ where: { id: input.lectureId }, data: { kind: "TEST" } });
      await tx.lectureTest.upsert({
        where: { lectureId: input.lectureId },
        create: { lectureId: input.lectureId, timeLimitMinutes: 60, points: defaultPoints(current.items.map((item) => item.materialId)) },
        update: {},
      });
      await this.audit.write(tx, {
        actorUserId: actor.userId, academyId: input.academyId, action: "content.test.converted",
        targetType: "Lecture", targetId: input.lectureId, requestId: context.requestId,
      });
      await bumpContentRevision(tx, input.courseId);
    });
    return this.readStaff(input);
  }

  async updateTest(
    identity: SupabaseIdentity,
    input: {
      academyId: string; courseId: string; lectureId: string; title?: string; isVisible?: boolean;
      settings?: Partial<ExamSettings>; points?: Record<string, number>;
    },
    context: { requestId?: string } = {},
  ): Promise<ExamStaffTest> {
    const actor = await this.access.requirePermission(identity.authUserId, input.academyId, "curriculum.manage");
    const current = await this.readStaff(input);
    if (input.points) {
      if (current.locked) throw new AppException("EXAM_LOCKED", HttpStatus.CONFLICT);
      const ids = new Set(current.items.map((item) => item.materialId));
      if (Object.keys(input.points).some((id) => !ids.has(id))) throw new AppException("CONTENT_PARENT_MISMATCH", HttpStatus.BAD_REQUEST);
    }
    if (input.isVisible && current.items.some((item) => !item.type))
      throw new AppException("EXAM_INVALID_MATERIAL", HttpStatus.BAD_REQUEST);
    await this.prisma.$transaction(async (tx) => {
      await lockCourse(tx, input.courseId);
      const settings = input.settings ?? {};
      await tx.lectureTest.update({
        where: { lectureId: input.lectureId },
        data: {
          ...(settings.guide !== undefined ? { guide: settings.guide } : {}),
          ...(settings.summary !== undefined ? { summary: settings.summary } : {}),
          ...(settings.testType !== undefined ? { testType: settings.testType } : {}),
          ...(settings.timeLimitMinutes !== undefined ? { timeLimitMinutes: settings.timeLimitMinutes } : {}),
          ...(settings.usePreparation !== undefined ? { usePreparation: settings.usePreparation } : {}),
          ...(settings.reviewAfterEnd !== undefined ? { reviewAfterEnd: settings.reviewAfterEnd } : {}),
          ...(settings.allowSelfRetake !== undefined ? { allowSelfRetake: settings.allowSelfRetake } : {}),
          ...(settings.showScoreOnFinish !== undefined ? { showScoreOnFinish: settings.showScoreOnFinish } : {}),
          ...(settings.languageReference !== undefined ? { languageReference: settings.languageReference } : {}),
          ...(settings.showExplanations !== undefined ? { showExplanations: settings.showExplanations } : {}),
          ...(input.points ? { points: { ...pointsOf(current), ...input.points } } : {}),
        },
      });
      if (input.title !== undefined || input.isVisible !== undefined) {
        await tx.lecture.update({
          where: { id: input.lectureId },
          data: {
            ...(input.title !== undefined ? { title: input.title.trim() } : {}),
            ...(input.isVisible !== undefined ? { isVisible: input.isVisible } : {}),
          },
        });
      }
      // Publishing a test publishes its problems: they are its pages.
      if (input.isVisible) await tx.material.updateMany({ where: { lectureId: input.lectureId }, data: { isVisible: true } });
      await this.audit.write(tx, {
        actorUserId: actor.userId, academyId: input.academyId, action: "content.test.updated",
        targetType: "Lecture", targetId: input.lectureId, requestId: context.requestId,
        before: { title: current.title, isVisible: current.isVisible },
        after: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.isVisible !== undefined ? { isVisible: input.isVisible } : {}),
          ...(input.settings ? { settings: input.settings as Prisma.InputJsonValue } : {}),
          ...(input.points ? { points: input.points } : {}),
        },
      });
      await bumpContentRevision(tx, input.courseId);
    });
    return this.readStaff(input);
  }

  private async readStaff(input: { academyId: string; courseId: string; lectureId: string }): Promise<ExamStaffTest> {
    const row = await readStaffTest(this.prisma, input);
    if (!row || row.kind !== "TEST" || !row.settings) throw new AppException("EXAM_NOT_FOUND", HttpStatus.NOT_FOUND);
    const items = row.items.map((item) => ({
      materialId: item.materialId, position: item.position, title: item.title, materialType: item.materialType,
      type: itemTypeOf(item), isVisible: item.isVisible, pointsHundredths: row.settings!.points[item.materialId] ?? 0,
    }));
    return {
      lectureId: row.lectureId, courseId: row.courseId, moduleId: row.moduleId, title: row.title, isVisible: row.isVisible,
      settings: settingsOf(row.settings),
      items,
      totalPointsHundredths: items.filter((item) => item.type).reduce((sum, item) => sum + item.pointsHundredths, 0),
      locked: row.isVisible || row.attemptCount > 0,
      attemptCount: row.attemptCount,
      classes: row.classes,
    };
  }

  // --- Class side ------------------------------------------------------------

  async classTests(identity: SupabaseIdentity, input: { academyId: string; classId: string }) {
    await this.requireClassTeacher(identity, input.academyId, input.classId);
    const rows = await readClassTests(this.prisma, input);
    return {
      tests: rows.map((row) => {
        const schedule = toSchedule(row.schedule as Record<string, unknown> | null);
        return {
          lectureId: row.id as string, courseId: row.course_id as string, courseTitle: row.course_title as string,
          title: row.title as string, itemCount: row.item_count as number,
          timeLimitMinutes: (row.time_limit_minutes as number | null) ?? null, schedule,
          periodState: periodState({ ...schedule, now: new Date(row.server_now as string) }),
          taken: row.taken as number, ended: row.ended as number, inProgress: row.in_progress as number,
        };
      }),
    };
  }

  async results(identity: SupabaseIdentity, input: ClassTestInput): Promise<ExamResults> {
    await this.requireClassTeacher(identity, input.academyId, input.classId);
    return this.readClassResults(input);
  }

  async exportResults(identity: SupabaseIdentity, input: ClassTestInput) {
    const results = await this.results(identity, input);
    return { filename: safeFilename(`${results.title}-${results.className}.csv`), csv: resultsCsv([results], false) };
  }

  /**
   * Every class's results for one test in a single CSV, for the people who
   * author the test (Elice's course report). Two statements for any number of
   * classes: the results read and the last submissions of every attempt.
   */
  async exportCourseReport(identity: SupabaseIdentity, input: { academyId: string; courseId: string; lectureId: string }) {
    await this.access.requirePermission(identity.authUserId, input.academyId, "curriculum.manage");
    const rows = (await readResultsByClass(this.prisma, { academyId: input.academyId, lectureId: input.lectureId, classIds: null }))
      .filter((row) => row.courseId === input.courseId);
    const last = await readLastSubmissions(this.prisma, rows.flatMap((row) => [...latestAttempts(row).values()].map((attempt) => attempt.id)));
    const results = rows.map((row) => buildResults(row, last));
    const title = results[0]?.title ?? "test";
    return { filename: safeFilename(`${title}-report.csv`), csv: resultsCsv(results, true) };
  }

  async updateSchedule(identity: SupabaseIdentity, input: ClassTestInput & { schedule: ScheduleInput }, context: { requestId?: string } = {}) {
    const actor = await this.requireClassTeacher(identity, input.academyId, input.classId);
    await this.readClassResults(input);
    await this.prisma.$transaction(async (tx) => {
      const data = {
        opensAt: input.schedule.opensAt, closesAt: input.schedule.closesAt,
        resultsReleasedAt: input.schedule.resultsReleasedAt,
        entryClosesAt: input.schedule.entryClosesAt ?? null, exitOpensAt: input.schedule.exitOpensAt ?? null,
        updatedByUserId: actor.userId,
      };
      await tx.classLectureTest.upsert({
        where: { classId_lectureId: { classId: input.classId, lectureId: input.lectureId } },
        create: { classId: input.classId, lectureId: input.lectureId, ...data },
        update: data,
      });
      // An open attempt never outlives a moved period end.
      if (input.schedule.closesAt) {
        await tx.$executeRaw`UPDATE test_attempts SET deadline_at = LEAST(COALESCE(deadline_at, ${input.schedule.closesAt}), ${input.schedule.closesAt})
          WHERE class_id = ${input.classId}::uuid AND lecture_id = ${input.lectureId}::uuid AND ended_at IS NULL`;
      }
      await this.audit.write(tx, {
        actorUserId: actor.userId, academyId: input.academyId, action: "exam.schedule.updated",
        targetType: "ClassLectureTest", targetId: `${input.classId}:${input.lectureId}`, requestId: context.requestId,
        after: {
          opensAt: input.schedule.opensAt?.toISOString() ?? null, closesAt: input.schedule.closesAt?.toISOString() ?? null,
          resultsReleasedAt: input.schedule.resultsReleasedAt?.toISOString() ?? null,
          entryClosesAt: input.schedule.entryClosesAt?.toISOString() ?? null,
          exitOpensAt: input.schedule.exitOpensAt?.toISOString() ?? null,
        },
      });
    });
    return this.readClassResults(input);
  }

  async endAttempt(identity: SupabaseIdentity, input: ClassTestInput & { userId: string }, context: { requestId?: string } = {}) {
    const actor = await this.requireClassTeacher(identity, input.academyId, input.classId);
    await this.prisma.$transaction(async (tx) => {
      const ended = await tx.testAttempt.updateMany({
        where: { classId: input.classId, lectureId: input.lectureId, userId: input.userId, endedAt: null },
        data: { endedAt: new Date(), endReason: "STAFF", endedByUserId: actor.userId },
      });
      if (ended.count) await this.audit.write(tx, {
        actorUserId: actor.userId, academyId: input.academyId, action: "exam.attempt.ended_by_staff",
        targetType: "TestAttempt", targetId: `${input.classId}:${input.lectureId}:${input.userId}`, requestId: context.requestId,
      });
    });
    return this.readClassResults(input);
  }

  async grantRetake(identity: SupabaseIdentity, input: ClassTestInput & { userId: string }, context: { requestId?: string } = {}) {
    const actor = await this.requireClassTeacher(identity, input.academyId, input.classId);
    await this.prisma.$transaction(async (tx) => {
      const latest = await tx.testAttempt.findFirst({
        where: { classId: input.classId, lectureId: input.lectureId, userId: input.userId },
        orderBy: { attemptNo: "desc" }, select: { id: true, endedAt: true, deadlineAt: true },
      });
      if (!latest || !(latest.endedAt || (latest.deadlineAt && latest.deadlineAt <= new Date())))
        throw new AppException("EXAM_NOT_STARTED", HttpStatus.CONFLICT);
      await tx.testAttempt.update({ where: { id: latest.id }, data: { retakeGrantedAt: new Date() } });
      await this.audit.write(tx, {
        actorUserId: actor.userId, academyId: input.academyId, action: "exam.retake.granted",
        targetType: "TestAttempt", targetId: latest.id, requestId: context.requestId,
      });
    });
    return this.readClassResults(input);
  }

  private async readClassResults(input: ClassTestInput): Promise<ExamResults> {
    const [row] = await readResultsByClass(this.prisma, { academyId: input.academyId, lectureId: input.lectureId, classIds: [input.classId] });
    if (!row) throw new AppException("EXAM_NOT_FOUND", HttpStatus.NOT_FOUND);
    const last = await readLastSubmissions(this.prisma, [...latestAttempts(row).values()].map((attempt) => attempt.id));
    return buildResults(row, last);
  }

  private async requireClassTeacher(identity: SupabaseIdentity, academyId: string, classId: string) {
    const actor = await requireAssignedTeacherActor({
      prisma: this.prisma, academyId, deniedCode: "PERMISSION_DENIED",
      resolveActor: () => this.access.requirePermission(identity.authUserId, academyId, "classes.assigned.manage"),
    });
    const found = await this.prisma.class.findFirst({ where: { id: classId, ...assignedClassWhere(actor) }, select: { id: true } });
    if (!found) throw new AppException("CLASS_NOT_FOUND", HttpStatus.NOT_FOUND);
    return actor;
  }

  private async requireFeature(academyId: string) {
    const flag = await this.prisma.academyFeatureFlag.findUnique({
      where: { academyId_feature: { academyId, feature: "EXAMS" } }, select: { isEnabled: true },
    });
    if (!flag?.isEnabled) throw new AppException("EXAM_FEATURE_OFF", HttpStatus.FORBIDDEN);
  }
}

async function lockCourse(tx: Prisma.TransactionClient, courseId: string) {
  await tx.$queryRaw`SELECT id FROM courses WHERE id = ${courseId}::uuid FOR UPDATE`;
}

/** Each student's latest attempt; attempts come ordered by user and attempt number. */
function latestAttempts(row: ResultsRow) {
  const latestByUser = new Map<string, ResultsRow["attempts"][number]>();
  for (const attempt of row.attempts) latestByUser.set(attempt.userId, attempt);
  return latestByUser;
}

/** One class's results grid from its row and the last submissions, in memory. */
function buildResults(row: ResultsRow, last: readonly LastSubmission[]): ExamResults {
  const now = row.serverNow;
  const latestByUser = latestAttempts(row);
  const lastByAttempt = new Map<string, Map<string, LastSubmission>>();
  for (const submission of last) {
    const map = lastByAttempt.get(submission.attemptId) ?? new Map();
    map.set(submission.materialId, submission);
    lastByAttempt.set(submission.attemptId, map);
  }
  // Columns: the current problems of the test; an attempt's own snapshot gives its points.
  const current = examItems(row.items, row.settings.points);
  const columns = current.map((item, position) => ({ ...item, position, type: itemTypeOf(item)! }));
  const students = row.students.map((student) => {
    const attempt = latestByUser.get(student.userId) ?? null;
    const submissions = attempt ? lastByAttempt.get(attempt.id) ?? new Map<string, LastSubmission>() : new Map<string, LastSubmission>();
    const snapshot = new Map((attempt?.itemsSnapshot ?? []).map((item) => [item.materialId, item.pointsHundredths]));
    const open = attempt ? attemptIsOpen({ ...attempt, now }) : false;
    let earned = 0;
    let pending = 0;
    const cells = columns.map((column) => {
      const submission = submissions.get(column.materialId);
      const points = snapshot.get(column.materialId) ?? column.pointsHundredths;
      const score = submission ? itemScore(submission.fraction, points) : attempt ? 0 : null;
      if (submission && score == null) pending += 1;
      else if (score != null) earned += score;
      return {
        materialId: column.materialId, submitted: Boolean(submission), submissionCount: submission?.count ?? 0,
        runCount: column.type === "CODE" ? Number(attempt?.runCounts[column.materialId] ?? 0) : 0,
        scoreHundredths: score, submissionId: submission?.submissionId ?? null, manual: submission?.manual ?? false,
      };
    });
    return {
      userId: student.userId, membershipId: student.membershipId, name: student.name, username: student.username,
      status: !attempt ? "NOT_STARTED" as const : open ? "IN_PROGRESS" as const : "ENDED" as const,
      attemptId: attempt?.id ?? null, attemptNo: attempt?.attemptNo ?? null,
      startedAt: attempt?.startedAt ?? null, deadlineAt: attempt?.deadlineAt ?? null,
      endedAt: attempt ? attempt.endedAt ?? (open ? null : attempt.deadlineAt) : null,
      endReason: attempt ? attempt.endReason ?? (open ? null : "TIME_UP" as const) : null,
      retakeGranted: Boolean(attempt?.retakeGrantedAt),
      earnedHundredths: attempt ? earned : null, pending, cells,
    };
  });
  const taken = students.filter((student) => student.status !== "NOT_STARTED");
  const ended = students.filter((student) => student.status === "ENDED");
  const items = columns.map((column, index) => {
    const cells = taken.map((student) => student.cells[index]!);
    const graded = cells.filter((cell) => cell.scoreHundredths != null);
    return {
      materialId: column.materialId, position: column.position, title: column.title,
      type: column.type, pointsHundredths: column.pointsHundredths,
      averageHundredths: graded.length ? graded.reduce((sum, cell) => sum + cell.scoreHundredths!, 0) / graded.length : null,
      fullScoreRate: graded.length ? graded.filter((cell) => cell.scoreHundredths! >= column.pointsHundredths && column.pointsHundredths > 0).length / graded.length : null,
      averageSubmissions: cells.length ? cells.reduce((sum, cell) => sum + cell.submissionCount, 0) / cells.length : null,
      // Elice's "Avg. runs": code only, over everyone who took the test.
      averageRuns: column.type === "CODE" && cells.length ? cells.reduce((sum, cell) => sum + cell.runCount, 0) / cells.length : null,
    };
  });
  const totals = ended.filter((student) => student.pending === 0).map((student) => student.earnedHundredths!);
  return {
    lectureId: row.lectureId, classId: row.classId, className: row.className, courseId: row.courseId, title: row.title,
    settings: settingsOf(row.settings), schedule: row.schedule,
    periodState: periodState({ ...row.schedule, now }),
    totalPointsHundredths: columns.reduce((sum, column) => sum + column.pointsHundredths, 0),
    items, students,
    tiles: {
      averageHundredths: totals.length ? totals.reduce((sum, value) => sum + value, 0) / totals.length : null,
      submitted: ended.length, taken: taken.length,
      inProgress: students.filter((student) => student.status === "IN_PROGRESS").length,
      enrolled: students.length,
    },
    serverNow: now,
  };
}

/** The results CSV: one row per student, with a class column for the course report. */
function resultsCsv(all: readonly ExamResults[], withClass: boolean): string {
  const first = all[0];
  const items = first?.items ?? [];
  const header = [...(withClass ? ["반"] : []), "이름", "아이디", "상태", "총점",
    `만점(${formatPoints(first?.totalPointsHundredths ?? 0)})`,
    ...items.map((item) => `${item.position + 1}. ${item.title} (${formatPoints(item.pointsHundredths)})`),
    ...items.filter((item) => item.type === "CODE").map((item) => `${item.position + 1}. 실행 횟수`)];
  const lines = all.flatMap((results) => results.students.map((student) => [
    ...(withClass ? [results.className] : []),
    student.name, student.username ?? "",
    student.status === "ENDED" ? "종료" : student.status === "IN_PROGRESS" ? "응시 중" : "미응시",
    student.earnedHundredths == null ? "" : formatPoints(student.earnedHundredths),
    formatPoints(results.totalPointsHundredths),
    ...student.cells.map((cell) => !cell.submitted ? "미제출" : cell.scoreHundredths == null ? "채점 중" : formatPoints(cell.scoreHundredths)),
    ...results.items.flatMap((item, index) => item.type === "CODE" ? [String(student.cells[index]?.runCount ?? 0)] : []),
  ]));
  return "\uFEFF" + [header, ...lines].map((line) => line.map(csvCell).join(",")).join("\r\n");
}

function safeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_");
}

function settingsOf(settings: ExamSettingsRow): ExamSettings {
  return {
    guide: settings.guide, summary: settings.summary, testType: settings.testType,
    timeLimitMinutes: settings.timeLimitMinutes, usePreparation: settings.usePreparation,
    reviewAfterEnd: settings.reviewAfterEnd, allowSelfRetake: settings.allowSelfRetake,
    showScoreOnFinish: settings.showScoreOnFinish, languageReference: settings.languageReference,
    showExplanations: settings.showExplanations,
  };
}

function pointsOf(test: ExamStaffTest): Record<string, number> {
  return Object.fromEntries(test.items.map((item) => [item.materialId, item.pointsHundredths]));
}

function csvCell(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export const examGradableTypes: readonly string[] = examGradableMaterialTypes;
