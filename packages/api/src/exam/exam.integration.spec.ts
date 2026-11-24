import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { AuditService } from "../academies/audit.service.js";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { SupportGrantResolver } from "../authorization/support-grant.resolver.js";
import type { PrismaService } from "../database/prisma.service.js";
import { PrismaClient } from "../generated/prisma/client.js";
import { ExamStaffService } from "./exam-staff.service.js";
import { ExamService } from "./exam.service.js";
import { ClassesService } from "../classes/classes.service.js";
import { TeacherProgressRepository } from "../teach/teacher-progress.repository.js";

/**
 * Exams against a disposable PostgreSQL (COVE_INTEGRATION_DATABASE_URL), never
 * a shared database: attempts, the deadline, scores and statement counts.
 */
const databaseUrl = process.env.COVE_INTEGRATION_DATABASE_URL;

describe.skipIf(!databaseUrl)("exams against PostgreSQL", () => {
  const createClient = (url: string) => new PrismaClient({ adapter: new PrismaPg({ connectionString: url }), log: [{ emit: "event", level: "query" }] });
  let client: ReturnType<typeof createClient>;
  let prisma: PrismaService;
  let exams: ExamService;
  let staff: ExamStaffService;
  let statements = 0;
  const submit = vi.fn().mockResolvedValue({ submissionId: randomUUID(), totalCount: 1 });
  const manualSubmit = vi.fn().mockResolvedValue({ submissionId: randomUUID() });

  const organizationId = randomUUID();
  const academyId = randomUUID();
  const courseId = randomUUID();
  const classId = randomUUID();
  const managerId = randomUUID();
  const managerAuth = randomUUID();
  const lectureId = randomUUID();
  const students = Array.from({ length: 40 }, () => ({ id: randomUUID(), auth: randomUUID(), membership: randomUUID() }));
  const materials = Array.from({ length: 15 }, (_, index) => ({ id: randomUUID(), kind: index % 3 === 0 ? "MC" : index % 3 === 1 ? "CODE" : "SHORT" }));
  const identity = (auth: string) => ({ authUserId: auth }) as SupabaseIdentity;
  const base = { academyId, classId, lectureId };

  beforeAll(async () => {
    client = createClient(databaseUrl!);
    client.$on("query", () => { statements += 1; });
    prisma = client as unknown as PrismaService;
    const access = new AcademyAccessService(prisma, new SupportGrantResolver(prisma));
    exams = new ExamService(prisma, access, new AuditService(), { submit } as never, { submit: manualSubmit } as never);
    staff = new ExamStaffService(prisma, access, new AuditService());

    await client.organization.create({ data: { id: organizationId, name: "Exam fixture", slug: `exam-${organizationId}` } });
    await client.academy.create({ data: { id: academyId, organizationId, name: "Exam academy", slug: `exam-${academyId}`, status: "ACTIVE" } });
    await client.user.create({ data: { id: managerId, authUserId: managerAuth, status: "ACTIVE", displayName: "Manager" } });
    await client.academyMembership.create({ data: { academyId, userId: managerId, role: "MANAGER", status: "ACTIVE" } });
    await client.academyFeatureFlag.create({ data: { academyId, feature: "EXAMS", isEnabled: true } });
    await client.user.createMany({ data: students.map((s, i) => ({ id: s.id, authUserId: s.auth, status: "ACTIVE" as const, displayName: `Student ${String(i).padStart(2, "0")}` })) });
    await client.academyMembership.createMany({ data: students.map((s) => ({ id: s.membership, academyId, userId: s.id, role: "STUDENT" as const, status: "ACTIVE" as const })) });
    await client.course.create({ data: { id: courseId, academyId, createdByUserId: managerId, title: "Python", isVisible: true } });
    await client.class.create({ data: { id: classId, academyId, name: "Class A", createdByUserId: managerId } });
    await client.classCourse.create({ data: { classId, courseId, assignedByUserId: managerId } });
    await client.classEnrollment.createMany({ data: students.map((s) => ({ classId, membershipId: s.membership, enrolledByUserId: managerId })) });
    const module = await client.courseModule.create({ data: { courseId, title: "Week 6", externalKey: randomUUID(), position: 1, isVisible: true } });
    await client.lecture.create({ data: { id: lectureId, courseModuleId: module.id, title: "[중간 평가]", externalKey: randomUUID(), position: 1, isVisible: false, kind: "TEST",
      test: { create: { timeLimitMinutes: 50 } } } });
    await client.material.createMany({ data: materials.map((m, i) => ({
      id: m.id, lectureId, title: `[문제${i + 1}]`, position: i + 1, isVisible: false,
      type: m.kind === "MC" ? "MULTIPLE_CHOICE" as const : m.kind === "CODE" ? "PROGRAMMING_EXERCISE" as const : "WRITTEN_RESPONSE" as const,
    })) });
    await client.programmingExercise.createMany({ data: materials.filter((m) => m.kind === "CODE").map((m) => ({
      materialId: m.id, externalKey: randomUUID(), difficulty: "EASY" as const, description: "print", starterCode: "",
    })) });
    const optionA = randomUUID();
    const optionB = randomUUID();
    await client.manualMaterial.createMany({ data: materials.filter((m) => m.kind !== "CODE").map((m) => ({
      materialId: m.id,
      ...(m.kind === "MC" ? { multipleChoice: { version: 1, question: "Q", problemDescription: "", selectionMode: "SINGLE", shuffleOptions: false,
        explanationEnabled: false, explanation: "", options: [{ id: optionA, content: "type()" }, { id: optionB, content: "print()" }], correctOptionIds: [optionA] } }
        : { shortAnswer: { version: 1, question: "Why?", gradingMode: "MANUAL", expectedAnswer: "", pattern: "", explanationEnabled: false, explanation: "" } }),
    })) });
  });

  afterAll(async () => { await client?.$disconnect(); });

  it("refuses publishing without points, then keeps points editable until an attempt", async () => {
    const before = await staff.staffTest(identity(managerAuth), { academyId, courseId, lectureId });
    expect(before.locked).toBe(false);
    await expect(staff.updateTest(identity(managerAuth), { academyId, courseId, lectureId, isVisible: true }))
      .rejects.toMatchObject({ code: "EXAM_NO_POINTS" });
    const points = Object.fromEntries(materials.map((m, i) => [m.id, (i < 5 ? 6 : 7) * 100]));
    const updated = await staff.updateTest(identity(managerAuth), { academyId, courseId, lectureId, points });
    expect(updated.totalPointsHundredths).toBe(5 * 600 + 10 * 700);
    const published = await staff.updateTest(identity(managerAuth), { academyId, courseId, lectureId, isVisible: true });
    expect(published.locked).toBe(false);
    expect(published.items.every((item) => item.isVisible)).toBe(true);
    // Published but untaken: points still change, though never to a total of zero.
    const zero = Object.fromEntries(materials.map((m) => [m.id, 0]));
    await expect(staff.updateTest(identity(managerAuth), { academyId, courseId, lectureId, points: zero }))
      .rejects.toMatchObject({ code: "EXAM_NO_POINTS" });
    const repointed = await staff.updateTest(identity(managerAuth), { academyId, courseId, lectureId, points });
    expect(repointed.totalPointsHundredths).toBe(5 * 600 + 10 * 700);
  });

  it("shows the test card in one test statement and starts one attempt", async () => {
    const student = students[0]!;
    statements = 0;
    const card = await exams.studentTest(identity(student.auth), base);
    const cardStatements = statements;
    expect(card).toMatchObject({ canStart: true, itemCount: 15, totalPointsHundredths: 10000, periodState: "OPEN", latestAttempt: null });
    // Access (shared reader) + the one test-card statement.
    expect(cardStatements).toBeLessThanOrEqual(3);

    const { attemptId } = await exams.start(identity(student.auth), { ...base, consent: true, clockDriftMs: 12 });
    const again = await exams.start(identity(student.auth), { ...base, consent: true, clockDriftMs: 12 });
    expect(again.attemptId).toBe(attemptId);
    const shell = await exams.attempt(identity(student.auth), { academyId, attemptId });
    expect(shell.open).toBe(true);
    expect(shell.items).toHaveLength(15);
    expect(shell.deadlineAt!.getTime() - shell.startedAt.getTime()).toBe(50 * 60_000);
    expect(shell.items.every((item) => !item.submitted && item.scoreHundredths === null)).toBe(true);
    // A student has started: points change only knowingly, and reach the attempt.
    const taken = await staff.staffTest(identity(managerAuth), { academyId, courseId, lectureId });
    expect(taken.locked).toBe(true);
    await expect(staff.updateTest(identity(managerAuth), { academyId, courseId, lectureId,
      points: { [taken.items[0]!.materialId]: 100 } })).rejects.toMatchObject({ code: "EXAM_LOCKED" });
    const original = Object.fromEntries(taken.items.map((item) => [item.materialId, item.pointsHundredths]));
    const rescored = await staff.updateTest(identity(managerAuth), { academyId, courseId, lectureId,
      points: { [taken.items[0]!.materialId]: 1600 }, rescoreAttempts: true });
    expect(rescored.items[0]!.pointsHundredths).toBe(1600);
    const after = await exams.attempt(identity(student.auth), { academyId, attemptId });
    expect(after.items.map((item) => item.pointsHundredths)).toEqual(shell.items.map((item, i) => (i === 0 ? 1600 : item.pointsHundredths)));
    expect(after.items.map((item) => item.materialId)).toEqual(shell.items.map((item) => item.materialId));
    await staff.updateTest(identity(managerAuth), { academyId, courseId, lectureId, points: original, rescoreAttempts: true });
  });

  it("refuses another student's attempt and a problem outside the attempt", async () => {
    const [owner, other] = students;
    const { attemptId } = await exams.start(identity(owner!.auth), { ...base, consent: true, clockDriftMs: null });
    await expect(exams.attempt(identity(other!.auth), { academyId, attemptId })).rejects.toMatchObject({ code: "EXAM_NOT_FOUND" });
    await expect(exams.submit(identity(owner!.auth), { academyId, attemptId, materialId: randomUUID(), requestKey: randomUUID(),
      answer: { kind: "code", code: "print(1)" } })).rejects.toMatchObject({ code: "EXAM_ITEM_NOT_IN_ATTEMPT" });
  });

  it("delegates a submit and refuses once the deadline has passed", async () => {
    const student = students[2]!;
    const { attemptId } = await exams.start(identity(student.auth), { ...base, consent: true, clockDriftMs: null });
    const code = materials.find((m) => m.kind === "CODE")!;
    await exams.submit(identity(student.auth), { academyId, attemptId, materialId: code.id, requestKey: randomUUID(), answer: { kind: "code", code: "print(1)" } });
    expect(submit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ examAttemptId: attemptId, classId, code: "print(1)" }));
    await client.testAttempt.update({ where: { id: attemptId }, data: { deadlineAt: new Date(Date.now() - 60_000) } });
    await expect(exams.submit(identity(student.auth), { academyId, attemptId, materialId: code.id, requestKey: randomUUID(),
      answer: { kind: "code", code: "print(2)" } })).rejects.toMatchObject({ code: "EXAM_ENDED" });
    const closed = await client.testAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(closed.endReason).toBe("TIME_UP");
    const card = await exams.studentTest(identity(student.auth), base);
    expect(card).toMatchObject({ canStart: false, canRetake: false, resultsVisible: false, score: null });
  });

  it("scores the last submission per problem and builds the 40 × 15 grid in bounded statements", async () => {
    // Every student starts; each submits every problem twice, the last one counting.
    const attempts = new Map<string, string>();
    for (const student of students) {
      // Student 2 already timed out above and may not start again.
      const started = await exams.start(identity(student.auth), { ...base, consent: true, clockDriftMs: null })
        .catch(async () => client.testAttempt.findFirstOrThrow({ where: { userId: student.id }, select: { id: true } }).then((a) => ({ attemptId: a.id })));
      attempts.set(student.id, started.attemptId);
    }
    const now = Date.now();
    const code = materials.filter((m) => m.kind === "CODE");
    const manual = materials.filter((m) => m.kind !== "CODE");
    const programmingRows = students.flatMap((student) => code.flatMap((m) => [0, 1].map((n) => ({
      id: randomUUID(), userId: student.id, materialId: m.id, sourceMaterialId: m.id, courseId, classId, gradingRevision: 1,
      language: "PYTHON" as const, timeLimitMs: 1000, memoryLimitMb: 128, code: `v${n}`, totalCount: 1, engineVersion: "fixture",
      status: "PASSED" as const, score: n === 1 ? 100 : 0, testAttemptId: attempts.get(student.id)!, createdAt: new Date(now + n * 1000),
      problemTitle: "p", courseTitle: "c", moduleTitle: "m", lectureTitle: "l", modulePosition: 1, lecturePosition: 1, problemPosition: 1,
    }))));
    await client.submission.createMany({ data: programmingRows });
    for (const student of students) {
      for (const m of manual) {
        const id = randomUUID();
        await client.manualSubmission.create({ data: {
          id, materialId: m.id, userId: student.id, classId, files: {}, answer: m.kind === "SHORT" ? "because" : "", profile: {}, revision: 1,
          maximumHundredths: 10000, includeInScore: false, requestKey: randomUUID(), testAttemptId: attempts.get(student.id)!,
          ...(m.kind === "MC" ? { multipleChoiceAssessment: { create: { definition: {}, selectedOptionIds: [], displayOrder: [], verdict: "CORRECT", scoreHundredths: 10000, completed: true } } }
            : { shortAnswerAssessment: { create: { definition: {}, status: "MANUAL" } } }),
        } });
      }
    }
    statements = 0;
    const results = await staff.results(identity(managerAuth), base);
    const resultStatements = statements;
    expect(results.students).toHaveLength(40);
    expect(results.items).toHaveLength(15);
    // Code (7 each, last submission 100%) + MC (6 or 7, correct) earned; short answers pending review.
    const first = results.students.find((s) => s.userId === students[5]!.id)!;
    expect(first.status).toBe("IN_PROGRESS");
    expect(first.pending).toBe(manual.filter((m) => m.kind === "SHORT").length);
    expect(first.cells.filter((cell) => cell.submissionCount === 2)).toHaveLength(code.length);
    // Access and class checks, then the grid read and one last-submission read,
    // whatever the number of students or problems.
    expect(resultStatements).toBeLessThanOrEqual(6);

    // The teacher's submission page reads the same points: the counted (last)
    // submission earns the item's points; the earlier one is not counted.
    const reviewer = new TeacherProgressRepository(client as unknown as PrismaService);
    const attemptId = attempts.get(students[5]!.id)!;
    const [earlier, later] = programmingRows.filter((row) => row.testAttemptId === attemptId && row.materialId === code[0]!.id)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const worth = results.items.find((item) => item.materialId === code[0]!.id)!.pointsHundredths;
    statements = 0;
    const counted = await reviewer.testPointsForSubmission({ testAttemptId: attemptId, materialId: code[0]!.id, submissionId: later!.id });
    expect(statements).toBe(2);
    expect(counted).toMatchObject({ pointsHundredths: worth, counted: { submissionId: later!.id, fraction: 1 } });
    expect(await reviewer.testPointsForSubmission({ testAttemptId: attemptId, materialId: code[0]!.id, submissionId: earlier!.id }))
      .toMatchObject({ pointsHundredths: worth, counted: null });

    // Grading a short answer moves it from pending to scored.
    const short = await client.manualSubmission.findFirstOrThrow({ where: { userId: students[5]!.id, testAttemptId: attempts.get(students[5]!.id)!, shortAnswerAssessment: { isNot: null } } });
    await client.manualReview.create({ data: { submissionId: short.id, reviewerId: managerId, scoreHundredths: 5000, completed: true, feedback: "", version: 1 } });
    const regraded = await staff.results(identity(managerAuth), base);
    expect(regraded.students.find((s) => s.userId === students[5]!.id)!.pending).toBe(first.pending - 1);

    // The student sees no score until the class releases results.
    await exams.end(identity(students[5]!.auth), { academyId, attemptId: attempts.get(students[5]!.id)! });
    expect((await exams.studentTest(identity(students[5]!.auth), base)).score).toBeNull();
    await staff.updateSchedule(identity(managerAuth), { ...base, schedule: { opensAt: null, closesAt: null, resultsReleasedAt: new Date(Date.now() - 1000) } });
    const released = await exams.studentTest(identity(students[5]!.auth), base);
    expect(released.resultsVisible).toBe(true);
    expect(released.score).toMatchObject({ possibleHundredths: 10000 });
    expect(released.score!.earnedHundredths).toBeGreaterThan(0);

    const csv = await staff.exportResults(identity(managerAuth), base);
    expect(csv.csv.split("\r\n")).toHaveLength(41);
  });

  it("shows a finished student's score on finish when the test says so, without a release", async () => {
    const student = students[6]!;
    const attempt = await client.testAttempt.findFirstOrThrow({ where: { userId: student.id }, orderBy: { attemptNo: "desc" } });
    await exams.end(identity(student.auth), { academyId, attemptId: attempt.id });
    await staff.updateSchedule(identity(managerAuth), { ...base, schedule: { opensAt: null, closesAt: null, resultsReleasedAt: null } });
    expect((await exams.studentTest(identity(student.auth), base)).score).toBeNull();
    await staff.updateTest(identity(managerAuth), { academyId, courseId, lectureId, settings: { showScoreOnFinish: true } });
    const card = await exams.studentTest(identity(student.auth), base);
    expect(card.resultsVisible).toBe(true);
    expect(card.score).toMatchObject({ possibleHundredths: 10000 });
    await staff.updateTest(identity(managerAuth), { academyId, courseId, lectureId, settings: { showScoreOnFinish: false } });
  });

  it("lets a teacher end an attempt and grant one retake", async () => {
    const student = students[10]!;
    await staff.endAttempt(identity(managerAuth), { ...base, userId: student.id });
    expect((await exams.studentTest(identity(student.auth), base)).canRetake).toBe(false);
    await staff.grantRetake(identity(managerAuth), { ...base, userId: student.id });
    const card = await exams.studentTest(identity(student.auth), base);
    expect(card.canRetake).toBe(true);
    const { attemptId } = await exams.start(identity(student.auth), { ...base, consent: true, clockDriftMs: null });
    const attempt = await client.testAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(attempt.attemptNo).toBe(2);
  });

  it("refuses a start before the class's period opens", async () => {
    await staff.updateSchedule(identity(managerAuth), { ...base, schedule: { opensAt: new Date(Date.now() + 3_600_000), closesAt: null, resultsReleasedAt: null } });
    const late = { id: randomUUID(), auth: randomUUID(), membership: randomUUID() };
    await client.user.create({ data: { id: late.id, authUserId: late.auth, status: "ACTIVE", displayName: "Late" } });
    await client.academyMembership.create({ data: { id: late.membership, academyId, userId: late.id, role: "STUDENT", status: "ACTIVE" } });
    await client.classEnrollment.create({ data: { classId, membershipId: late.membership, enrolledByUserId: managerId } });
    const card = await exams.studentTest(identity(late.auth), base);
    expect(card).toMatchObject({ periodState: "BEFORE", canStart: false });
    await expect(exams.start(identity(late.auth), { ...base, consent: true, clockDriftMs: null })).rejects.toMatchObject({ code: "EXAM_PERIOD_NOT_OPEN" });
  });

  /** A new student in a class, for the tests below that need a fresh attempt. */
  async function enrol(name: string, inClass = classId) {
    const student = { id: randomUUID(), auth: randomUUID(), membership: randomUUID() };
    await client.user.create({ data: { id: student.id, authUserId: student.auth, status: "ACTIVE", displayName: name } });
    await client.academyMembership.create({ data: { id: student.membership, academyId, userId: student.id, role: "STUDENT", status: "ACTIVE" } });
    await client.classEnrollment.create({ data: { classId: inClass, membershipId: student.membership, enrolledByUserId: managerId } });
    return student;
  }
  const open = { opensAt: null, closesAt: null, resultsReleasedAt: null };

  it("closes entry after the entry deadline and holds a student in until the exit time", async () => {
    const student = await enrol("Entrant");
    await staff.updateSchedule(identity(managerAuth), { ...base, schedule: { ...open, entryClosesAt: new Date(Date.now() - 60_000) } });
    expect(await exams.studentTest(identity(student.auth), base)).toMatchObject({ periodState: "OPEN", canStart: false });
    await expect(exams.start(identity(student.auth), { ...base, consent: true, clockDriftMs: null })).rejects.toMatchObject({ code: "EXAM_ENTRY_CLOSED" });

    const exitOpensAt = new Date(Date.now() + 3_600_000);
    await staff.updateSchedule(identity(managerAuth), { ...base, schedule: { ...open, entryClosesAt: new Date(Date.now() + 3_600_000), exitOpensAt } });
    const { attemptId } = await exams.start(identity(student.auth), { ...base, consent: true, clockDriftMs: null });
    expect((await exams.attempt(identity(student.auth), { academyId, attemptId })).exitOpensAt).toEqual(exitOpensAt);
    await expect(exams.end(identity(student.auth), { academyId, attemptId })).rejects.toMatchObject({ code: "EXAM_EXIT_NOT_YET" });

    await staff.updateSchedule(identity(managerAuth), { ...base, schedule: { ...open, exitOpensAt: new Date(Date.now() - 1000) } });
    expect((await exams.end(identity(student.auth), { academyId, attemptId })).open).toBe(false);
  });

  it("counts runs of code problems in one statement and averages them in the results", async () => {
    await staff.updateSchedule(identity(managerAuth), { ...base, schedule: open });
    const student = await enrol("Runner");
    const { attemptId } = await exams.start(identity(student.auth), { ...base, consent: true, clockDriftMs: null });
    const code = materials.find((m) => m.kind === "CODE")!;
    statements = 0;
    await exams.recordRun(identity(student.auth), { academyId, attemptId, materialId: code.id });
    // Access, then the one guarded update.
    expect(statements).toBeLessThanOrEqual(3);
    await exams.recordRun(identity(student.auth), { academyId, attemptId, materialId: code.id });
    await exams.recordRun(identity(student.auth), { academyId, attemptId, materialId: code.id });
    // Another student's attempt and a problem outside the test count nothing.
    await exams.recordRun(identity(students[0]!.auth), { academyId, attemptId, materialId: code.id });
    await exams.recordRun(identity(student.auth), { academyId, attemptId, materialId: randomUUID() });
    const stored = await client.testAttempt.findUniqueOrThrow({ where: { id: attemptId }, select: { runCounts: true } });
    expect(stored.runCounts).toEqual({ [code.id]: 3 });

    const results = await staff.results(identity(managerAuth), base);
    const column = results.items.findIndex((item) => item.materialId === code.id);
    expect(results.students.find((s) => s.userId === student.id)!.cells[column]!.runCount).toBe(3);
    expect(results.items[column]!.averageRuns).toBeGreaterThan(0);
    expect(results.items.find((item) => item.type !== "CODE")!.averageRuns).toBeNull();

    // A closed attempt counts nothing more.
    await exams.end(identity(student.auth), { academyId, attemptId });
    await exams.recordRun(identity(student.auth), { academyId, attemptId, materialId: code.id });
    expect((await client.testAttempt.findUniqueOrThrow({ where: { id: attemptId }, select: { runCounts: true } })).runCounts).toEqual({ [code.id]: 3 });
  });

  it("shows an explanation only in review, once results are visible, when the test shows them", async () => {
    const mc = materials.find((m) => m.kind === "MC")!;
    const row = await client.manualMaterial.findUniqueOrThrow({ where: { materialId: mc.id } });
    await client.manualMaterial.update({ where: { materialId: mc.id }, data: {
      multipleChoice: { ...(row.multipleChoice as object), explanationEnabled: true, explanation: "<p>type() returns the type.</p>" } } });
    await staff.updateTest(identity(managerAuth), { academyId, courseId, lectureId, settings: { reviewAfterEnd: true, showExplanations: true } });
    const student = await enrol("Reviewer");
    const { attemptId } = await exams.start(identity(student.auth), { ...base, consent: true, clockDriftMs: null });
    const during = await exams.item(identity(student.auth), { academyId, attemptId, materialId: mc.id });
    expect(during).toMatchObject({ type: "MULTIPLE_CHOICE", explanation: null });

    await staff.updateTest(identity(managerAuth), { academyId, courseId, lectureId, settings: { allowSelfRetake: false } });
    await exams.end(identity(student.auth), { academyId, attemptId });
    // Ended, but results are hidden: still no explanation.
    expect(await exams.item(identity(student.auth), { academyId, attemptId, materialId: mc.id })).toMatchObject({ explanation: null });
    await staff.updateSchedule(identity(managerAuth), { ...base, schedule: { ...open, resultsReleasedAt: new Date(Date.now() - 1000) } });
    expect(await exams.item(identity(student.auth), { academyId, attemptId, materialId: mc.id }))
      .toMatchObject({ explanation: "<p>type() returns the type.</p>" });
    await staff.updateTest(identity(managerAuth), { academyId, courseId, lectureId, settings: { showExplanations: false } });
    expect(await exams.item(identity(student.auth), { academyId, attemptId, materialId: mc.id })).toMatchObject({ explanation: null });
  });

  it("exports one course report for every class in a fixed number of statements", async () => {
    const otherClass = randomUUID();
    await client.class.create({ data: { id: otherClass, academyId, name: "Class B", createdByUserId: managerId } });
    await client.classCourse.create({ data: { classId: otherClass, courseId, assignedByUserId: managerId } });
    const b = await enrol("B student", otherClass);
    await exams.start(identity(b.auth), { academyId, classId: otherClass, lectureId, consent: true, clockDriftMs: null });
    const enrolledA = await client.classEnrollment.count({ where: { classId } });

    statements = 0;
    const report = await staff.exportCourseReport(identity(managerAuth), { academyId, courseId, lectureId });
    // Access, then the results of every class and the last submissions of every attempt.
    expect(statements).toBeLessThanOrEqual(4);
    const lines = report.csv.split("\r\n");
    expect(lines[0]!.startsWith("﻿반,이름")).toBe(true);
    expect(lines).toHaveLength(1 + enrolledA + 1);
    expect(lines.filter((line) => line.startsWith("Class B,"))).toHaveLength(1);
    expect(lines[0]).toContain("실행 횟수");
  });

  it("deletes a class with students' work: practice kept and detached, test work removed", async () => {
    const access = new AcademyAccessService(prisma, new SupportGrantResolver(prisma));
    const revocation = { revokeClass: vi.fn().mockResolvedValue(undefined) };
    const classes = new ClassesService(prisma, access, new AuditService(), revocation as never, { signMany: vi.fn().mockResolvedValue([]) } as never);
    const code = materials.find((m) => m.kind === "CODE")!;
    const student = students[0]!;
    // One ordinary practice submission in the class, outside any test.
    const practice = await client.submission.create({ data: {
      userId: student.id, materialId: code.id, sourceMaterialId: code.id, courseId, classId, gradingRevision: 1,
      language: "PYTHON", timeLimitMs: 1000, memoryLimitMb: 128, code: "print(3)", totalCount: 1, engineVersion: "fixture",
      status: "PASSED", score: 100, problemTitle: "p", courseTitle: "c", moduleTitle: "m", lectureTitle: "l",
      modulePosition: 1, lecturePosition: 1, problemPosition: 1,
    } });
    const attempts = await client.testAttempt.count({ where: { classId } });
    const answers = await client.manualSubmission.count({ where: { classId } });
    expect(attempts).toBeGreaterThan(0);
    expect(answers).toBeGreaterThan(0);

    const impact = await classes.deleteImpact(identity(managerAuth), { academyId, classId });
    expect(impact).toMatchObject({ keptSubmissions: 1, deletedAnswers: answers, deletedTestAttempts: attempts });
    expect(impact.students).toBeGreaterThan(0);

    const name = (await client.class.findUniqueOrThrow({ where: { id: classId } })).name;
    await classes.deleteClass(identity(managerAuth), { academyId, classId, confirmName: name });

    expect(await client.class.count({ where: { id: classId } })).toBe(0);
    expect(await client.testAttempt.count({ where: { classId } })).toBe(0);
    expect(await client.manualSubmission.count({ where: { classId } })).toBe(0);
    // Test submissions went with their attempts; the practice one stays, detached.
    expect(await client.submission.findUniqueOrThrow({ where: { id: practice.id } })).toMatchObject({ classId: null, score: 100 });
    expect(await client.submission.count({ where: { classId } })).toBe(0);
    expect(revocation.revokeClass).toHaveBeenCalledWith(classId, "CLASS_ARCHIVED");
    expect(await client.auditLog.count({ where: { academyId, action: "class.deleted", targetId: classId } })).toBe(1);
  });
});
