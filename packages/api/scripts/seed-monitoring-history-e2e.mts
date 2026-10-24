import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const project = 'lnrmxjxsjxymgphgatwn';
if (new URL(process.env.SUPABASE_URL ?? '').hostname !== `${project}.supabase.co`) throw new Error('Development project only');
const database = new URL(process.env.DATABASE_URL ?? '');
if (!database.hostname.includes(project) && !database.username.includes(project)) throw new Error('Development database only');
const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const academyId = '20000000-0000-4000-8000-000000000001';
const classId = 'e0000000-0000-4000-8000-000000000040';
const courseId = randomUUID(), lectureId = randomUUID();
const ids = Object.fromEntries(['previous', 'current', 'submitted', 'untouched', 'empty'].map(key => [key, randomUUID()]));
try {
 await client.$transaction(async db => {
  const author = await db.user.findUniqueOrThrow({ where: { username: 'cove-teamlead' } });
  const student = await db.academyMembership.findFirstOrThrow({ where: { academyId, user: { email: 'student2@cove.test' } }, select: { id: true, userId: true } });
  const other = await db.academyMembership.findFirstOrThrow({ where: { academyId, user: { email: 'student3@cove.test' } }, select: { id: true, userId: true } });
  await db.classEnrollment.findUniqueOrThrow({ where: { classId_membershipId: { classId, membershipId: student.id } } });
  await db.course.create({ data: { id: courseId, academyId, title: 'Monitoring History QA ' + courseId.slice(0, 8), createdByUserId: author.id, isVisible: true,
    modules: { create: { title: 'Saved work', externalKey: 'history', position: 1, isVisible: true,
      lectures: { create: { id: lectureId, title: 'Previous problems', externalKey: 'history', position: 1, isVisible: true } } } } } });
  for (const [index, [key, id]] of Object.entries(ids).entries()) {
    await db.material.create({ data: { id, lectureId, title: 'History ' + key, type: 'PROGRAMMING_EXERCISE', position: index + 1, isVisible: true,
      programmingExercise: { create: { externalKey: key, difficulty: 'EASY', starterCode: key === 'previous' ? '' : '# STARTER_' + key } } } });
  }
  await db.classCourse.create({ data: { classId, courseId, assignedByUserId: author.id } });
  await db.exerciseDraft.createMany({ data: [
    { userId: other.userId, materialId: ids.previous, sourceMaterialId: ids.previous, courseId, code: '# OTHER_STUDENT_PRIVATE' },
    { userId: student.userId, materialId: ids.empty, sourceMaterialId: ids.empty, courseId, code: '' },
  ] });
  const submission = { userId: student.userId, materialId: ids.submitted, sourceMaterialId: ids.submitted, courseId, classId,
    gradingRevision: 1, language: 'PYTHON' as const, timeLimitMs: 3000, memoryLimitMb: 256, status: 'FAILED' as const, totalCount: 0, engineVersion: 'history-test-fixture',
    problemTitle: 'History submitted', courseTitle: 'Monitoring History QA', moduleTitle: 'Saved work', lectureTitle: 'Previous problems',
    modulePosition: 1, lecturePosition: 1, problemPosition: 3 };
  await db.submission.create({ data: { ...submission, code: '# OLDER_SUBMISSION', createdAt: new Date('2026-01-01T00:00:00Z') } });
  await db.submission.create({ data: { ...submission, classId: null, code: '# LATEST_SUBMITTED_WORK', createdAt: new Date('2026-01-02T00:00:00Z') } });
  await writeFile('/tmp/monitoring-history-fixture.json', JSON.stringify({ academyId, classId, courseId, ids, membershipId: student.id, otherMembershipId: other.id }), { mode: 0o600 });
  console.log('Created separate monitoring history QA course:', courseId);
 }, { timeout: 60000 });
} finally { await client.$disconnect(); }
