import { ManualPracticeService } from '../manual/manual-practice.service.js';
import { ShortAnswerService } from '../manual/short-answer.service.js';
import { MultipleChoiceService } from '../manual/multiple-choice.service.js';
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SupabaseIdentity } from '../auth/auth.types.js';
import { AcademyAccessService } from '../authorization/academy-access.service.js';
import { SupportGrantResolver } from '../authorization/support-grant.resolver.js';
import { PrismaService } from '../database/prisma.service.js';
import { GradingService } from '../judge/grading.service.js';
import { PracticeRunner } from '../judge/practice.runner.js';
import type { JudgeQueue } from '../judge/judge.queue.js';
import { PointAwardService } from '../points/point-award.service.js';
import { StaffPracticeService } from './staff-practice.service.js';

const academyId = '20000000-0000-4000-8000-000000000001';
describe.skipIf(process.env.COVE_PRACTICE_INTEGRATION !== '1')('staff practice database isolation', () => {
  const courseId = randomUUID(), lectureId = randomUUID(), materialId = randomUUID(), classId = randomUUID();
  let db: PrismaService, service: StaffPracticeService, runner: PracticeRunner, access: AcademyAccessService;
  const people: Record<string, SupabaseIdentity> = {};
  const queue = { enqueuePractice: vi.fn(), consumeSubmissionToken: vi.fn().mockResolvedValue(true) };
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    if (!(url.hostname.includes('lnrmxjxsjxymgphgatwn') || url.username.includes('lnrmxjxsjxymgphgatwn'))) throw new Error('Development database only');
    db = new PrismaService(new ConfigService({ DATABASE_URL: process.env.DATABASE_URL }));
    access = new AcademyAccessService(db, new SupportGrantResolver(db));
    service = new StaffPracticeService(db, access, new ConfigService({ PYODIDE_VERSION: '0.27.5', SUBMISSION_RATE_LIMIT: 10 }), queue as unknown as JudgeQueue);
    const users = await db.user.findMany({ where: { username: { in: ['cove-teamlead', 'cove-manager', 'cove-teacher', 'cove-teacher2', 'cove-student'] } } });
    for (const user of users) people[user.username!] = { authUserId: user.authUserId! } as SupabaseIdentity;
    const author = users.find((u) => u.username === 'cove-teamlead')!;
    const teacher = await db.academyMembership.findFirstOrThrow({ where: { academyId, user: { username: 'cove-teacher' } } });
    await db.course.create({ data: { id: courseId, academyId, createdByUserId: author.id, title: `Staff practice integration ${courseId}`, isVisible: true,
      modules: { create: { externalKey: 'practice-integration', title: 'Module', position: 1, isVisible: true,
        lectures: { create: { id: lectureId, externalKey: 'practice-integration', title: 'Lecture', position: 1, isVisible: true,
          materials: { create: { id: materialId, title: 'Independent practice', type: 'PROGRAMMING_EXERCISE', position: 1, isVisible: true,
            programmingExercise: { create: { externalKey: 'practice', difficulty: 'EASY', starterCode: 'print("hello")',
              testCases: { create: [{ position: 1, input: '', expectedOutput: 'hello', visibility: 'SAMPLE' }, { position: 2, input: 'secret input', expectedOutput: 'hello', visibility: 'HIDDEN' }] } } } } } } } } } } });
    await db.class.create({ data: { id: classId, academyId, name: `Staff practice ${classId}`, createdByUserId: author.id, teacherMembershipId: teacher.id,
      courseAssignments: { create: { courseId, assignedByUserId: author.id } } } });
    const engine = { version: '0.27.5', run: vi.fn().mockResolvedValue({ outcome: 'PASSED' as const, stdout: 'hello\n', stderr: '', runtimeMs: 1 }), dispose: vi.fn() };
    const comparator = { version: '0.27.5', compare: vi.fn().mockResolvedValue({ kind: 'match' as const }) };
    runner = new PracticeRunner(db, new GradingService(db, engine, new PointAwardService(db), comparator));
  }, 30_000);
  afterAll(async () => {
    if (!db) return;
    await db.class.deleteMany({ where: { id: classId } });
    await db.course.deleteMany({ where: { id: courseId } });
    await db.$disconnect();
  });
  const input = () => ({ academyId, materialId, code: 'print("hello")', requestId: randomUUID() });
  it('keeps hidden snapshots and private buffers inaccessible to browser database roles', async () => {
    const tables = await db.$queryRaw<Array<{ relname: string; relrowsecurity: boolean }>>`SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('staff_practice_drafts', 'staff_practice_attempts')`;
    expect(tables).toHaveLength(2);
    expect(tables.every((table) => table.relrowsecurity)).toBe(true);
    const grants = await db.$queryRaw<Array<{ table_name: string }>>`SELECT table_name FROM information_schema.role_table_grants WHERE table_name IN ('staff_practice_drafts', 'staff_practice_attempts') AND grantee IN ('anon', 'authenticated')`;
    expect(grants).toEqual([]);
  });
  it('all staff roles practice without student enrollments; students and unassigned teachers cannot', async () => {
    for (const name of ['cove-manager', 'cove-teamlead', 'cove-teacher']) {
      expect(await service.authorize(people[name]!, { academyId, materialId })).toMatchObject({ material: { id: materialId } });
      const accepted = await service.submit(people[name]!, input());
      await runner.run(accepted.submissionId);
      expect(await service.get(people[name]!, { academyId, submissionId: accepted.submissionId })).toMatchObject({ status: 'PASSED' });
    }
    await expect(service.authorize(people['cove-student']!, { academyId, materialId })).rejects.toThrow();
    await expect(service.authorize(people['cove-teacher2']!, { academyId, materialId })).rejects.toThrow();
  });
  it('grades an immutable snapshot, redacts hidden cases and writes no student data, even on duplicate delivery', async () => {
    const identity = people['cove-teacher']!;
    const before = await Promise.all([db.submission.count({ where: { materialId } }), db.studentExerciseProgress.count({ where: { materialId } }), db.exerciseSolveSession.count({ where: { materialId } }), db.pointAward.count()]);
    const request = input();
    const [a, b] = await Promise.all([service.submit(identity, request), service.submit(identity, request)]);
    expect(a.submissionId).toBe(b.submissionId);
    await runner.run(a.submissionId); await runner.run(a.submissionId);
    const result = await service.get(identity, { academyId, submissionId: a.submissionId });
    expect(result).toMatchObject({ status: 'PASSED', score: 100, totalCount: 2 });
    expect(result.cases[1]).toMatchObject({ isSample: false, input: null, expectedOutput: null, actualOutput: null });
    expect(await db.staffPracticeAttempt.count({ where: { requestId: request.requestId } })).toBe(1);
    const after = await Promise.all([db.submission.count({ where: { materialId } }), db.studentExerciseProgress.count({ where: { materialId } }), db.exerciseSolveSession.count({ where: { materialId } }), db.pointAward.count()]);
    expect(after).toEqual(before);
    await expect(service.get(people['cove-manager']!, { academyId, submissionId: a.submissionId })).rejects.toThrow();
  });
  it('keeps drafts private and refuses stale/null-base overwrites', async () => {
    const teacher = people['cove-teacher']!, target = { academyId, materialId };
    const first = await service.saveDraft(teacher, { ...target, code: 'first' });
    expect(first.outcome).toBe('SAVED');
    const second = await service.saveDraft(teacher, { ...target, code: 'second', baseUpdatedAt: first.updatedAt });
    expect(second.outcome).toBe('SAVED');
    expect(await service.saveDraft(teacher, { ...target, code: 'stale', baseUpdatedAt: first.updatedAt })).toMatchObject({ outcome: 'CONFLICT', serverCode: 'second' });
    expect(await service.saveDraft(teacher, { ...target, code: 'stale' })).toMatchObject({ outcome: 'CONFLICT' });
    expect(await service.draft(people['cove-manager']!, target)).toBeNull();
    expect(await db.exerciseDraft.count({ where: { materialId } })).toBe(0);
  });
  it('records short-answer and turtle practice without manual submissions or teacher review queues', async () => {
    const actor = await access.requirePermission(people['cove-teacher']!.authUserId, academyId, 'practice.own.create');
    const shortId = randomUUID(), turtleId = randomUUID();
    await db.material.create({ data: { id: shortId, lectureId, title: 'Short practice', type: 'WRITTEN_RESPONSE', position: 2, isVisible: true,
      manualMaterial: { create: { shortAnswer: { version: 1, question: 'Name the language', gradingMode: 'EXACT', expectedAnswer: 'Python', pattern: '', explanationEnabled: false, explanation: '' } } } } });
    await db.material.create({ data: { id: turtleId, lectureId, title: 'Turtle practice', type: 'TURTLE_EXERCISE', position: 3, isVisible: true, manualMaterial: { create: {} } } });
    const config = new ConfigService({ SHORT_ANSWER_ENABLED: true, MULTIPLE_CHOICE_ENABLED: true });
    const practice = new ManualPracticeService(db, new ShortAnswerService(db, config, new PointAwardService(db)), new MultipleChoiceService(config));
    const definition = await db.manualMaterial.findUniqueOrThrow({ where: { materialId: shortId } });
    const request = { academyId, materialId: shortId, files: {}, answer: 'Python', revision: 0, contentRevision: 1, requestKey: randomUUID() };
    const [a, b] = await Promise.all([practice.submit(actor, request, definition), practice.submit(actor, request, definition)]);
    expect(a.submissionId).toBe(b.submissionId);
    const history = await practice.read(academyId, actor.userId, shortId);
    expect(history.attempts).toHaveLength(1);
    expect(history.attempts[0]).toMatchObject({ includeInScore: false, shortAnswerAssessment: { completed: true, status: 'GRADED' } });
    const saved = await practice.draft(actor, { academyId, materialId: turtleId, files: { 'main.py': 'import turtle' }, answer: '', revision: 0 });
    expect(saved.revision).toBeGreaterThan(0);
    await expect(practice.draft(actor, { academyId, materialId: turtleId, files: {}, answer: '', revision: 0 })).rejects.toThrow();
    expect(await db.manualSubmission.count({ where: { materialId: { in: [shortId, turtleId] } } })).toBe(0);
    expect(await db.manualDraft.count({ where: { materialId: turtleId } })).toBe(0);
  });
  it('hiding an ancestor revokes normal reads and writes; explicit review preview has its own draft', async () => {
    const teacher = people['cove-teacher']!;
    await db.lecture.update({ where: { id: lectureId }, data: { isVisible: false } });
    await expect(service.draft(teacher, { academyId, materialId })).rejects.toThrow();
    await expect(service.submit(teacher, input())).rejects.toThrow();
    await service.saveDraft(teacher, { academyId, materialId, preview: true, code: 'preview' });
    expect(await service.draft(teacher, { academyId, materialId, preview: true })).toMatchObject({ code: 'preview' });
    await db.lecture.update({ where: { id: lectureId }, data: { isVisible: true } });
    expect(await service.draft(teacher, { academyId, materialId })).toMatchObject({ code: 'second' });
  });
});
