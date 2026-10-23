import 'dotenv/config';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { manualConfigSchema } from '@cove/shared';
import { applyConversions, inspectConversions, rollbackConversions } from '../src/migrations/course-turtle/cli.js';
import { conversionFingerprint, turtleConversionManifest } from '../src/migrations/course-turtle/core.js';
if (new URL(process.env.SUPABASE_URL ?? '').hostname !== 'lnrmxjxsjxymgphgatwn.supabase.co') throw new Error('Course Turtle fixtures are development-only');
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const academyId = '20000000-0000-4000-8000-000000000001';
const courseId = 'ee430000-0000-4000-8000-000000000001';
const moduleId = 'ee430000-0000-4000-8000-000000000010';
const lectureId = 'ee430000-0000-4000-8000-000000000020';
const materialId = 'ee430000-0000-4000-8000-000000000031';
const hiddenId = 'ee430000-0000-4000-8000-000000000032';
const nextId = 'ee430000-0000-4000-8000-000000000033';
const starter = "import turtle\nturtle.pencolor('red')\nturtle.pensize(4)\nturtle.forward(100)\nprint('DRAWING_COMPLETE', flush=True)\n";
try {
  const author = await db.user.findUniqueOrThrow({ where: { username: 'cove-teamlead' } });
  const student = await db.user.findUniqueOrThrow({ where: { username: 'cove-student' } });
  const existing = await db.course.findUnique({ where: { id: courseId } });
  if (existing && existing.title !== 'E2E Course Turtle Parity') throw new Error('Fixture ID belongs to another course; refusing to reset it');
  const health = await fetch((process.env.GUI_SERVICE_URL ?? 'http://127.0.0.1:4028') + '/health', { headers: { Authorization: `Bearer ${process.env.GUI_SERVICE_SECRET ?? 'local-course-regression-never-production'}` } });
  assert.ok(health.ok); const { runtimeVersion } = await health.json();
  await db.course.upsert({ where: { id: courseId }, create: { id: courseId, academyId, title: 'E2E Course Turtle Parity', createdByUserId: author.id, isVisible: true }, update: { isVisible: true } });
  await db.courseModule.upsert({ where: { id: moduleId }, create: { id: moduleId, courseId, externalKey: 'parity-module', title: 'Turtle', position: 1, isVisible: true }, update: {} });
  await db.lecture.upsert({ where: { id: lectureId }, create: { id: lectureId, courseModuleId: moduleId, externalKey: 'parity-lecture', title: 'Turtle drawing', position: 1, isVisible: true }, update: {} });
  const scope = { material: { lecture: { courseModule: { courseId } } } };
  await db.manualReview.deleteMany({ where: { submission: scope } });
  await db.manualSubmission.deleteMany({ where: scope });
  await db.submission.deleteMany({ where: { courseId } });
  await db.material.deleteMany({ where: { lectureId } });
  await db.material.create({ data: { id: materialId, lectureId, type: 'PROGRAMMING_EXERCISE', title: 'Converted Turtle introduction', position: 1, isVisible: true,
    programmingExercise: { create: { externalKey: 'parity-source-turtle-1', difficulty: 'EASY', starterCode: starter, description: '<p>Draw with standard Python Turtle. No done() is required for a static drawing.</p>', solutionCode: starter, solutions: { create: [{ position: 0, code: starter }] } } },
    drafts: { create: { userId: student.id, sourceMaterialId: materialId, courseId, code: starter } },
  } });
  const legacyId = 'ee430000-0000-4000-8000-000000000090';
  await db.submission.create({ data: {
    id: legacyId, userId: student.id, materialId, sourceMaterialId: materialId, courseId,
    classId: 'e0000000-0000-4000-8000-000000000040', gradingRevision: 1,
    language: 'PYTHON', timeLimitMs: 1000, memoryLimitMb: 128, code: 'print("LEGACY_RECORD")',
    status: 'FAILED', passedCount: 3, totalCount: 4, score: 75, engineVersion: 'legacy-fixture-v1', gradedAt: new Date(),
    problemTitle: 'Original programming activity', courseTitle: 'E2E Course Turtle Parity', moduleTitle: 'Turtle', lectureTitle: 'Turtle drawing',
    modulePosition: 1, lecturePosition: 1, problemPosition: 1,
  } });
  const config = manualConfigSchema.parse({ files: { 'main.py': starter }, solutionFiles: { 'main.py': starter }, description: '<p>Draw a red line.</p>', width: 640, height: 480, timeLimitSeconds: 60, memoryLimitMb: 128, includeInScore: false, submitEnabled: true });
  const manifest = turtleConversionManifest.parse({ version: 1, academyId, runtimeVersion, entries: [{ materialId, courseId, lectureId, externalKey: 'parity-source-turtle-1', sourceReference: 'https://example.test/turtle/introduction', reason: 'Disposable E2E fixture reproduces the audited ordinary Python route.', historyPolicy: 'retain-programming', assessment: { includeInScore: false, submitEnabled: true }, config }] });
  let plan = await inspectConversions(db, manifest);
  let fingerprint = conversionFingerprint({ manifest, plan });
  assert.deepEqual(plan[0].blockers, []);
  await db.$transaction(tx => applyConversions(tx, manifest, fingerprint, author.id), { isolationLevel: 'Serializable', timeout: 60000 });
  assert.ok(await db.programmingExercise.findUnique({ where: { materialId } }), 'legacy programming record retained');
  assert.equal(await db.exerciseDraft.count({ where: { materialId } }), 1, 'legacy draft retained');
  assert.equal(await db.manualDraft.count({ where: { materialId } }), 1, 'draft copied without creating a grade');
  assert.equal(await db.manualSubmission.count({ where: { materialId } }), 0);
  assert.equal((await db.submission.findUniqueOrThrow({ where: { id: legacyId } })).score, 75, 'legacy grade is retained without becoming a manual review');
  await db.$transaction(tx => rollbackConversions(tx, manifest, plan, fingerprint, author.id), { isolationLevel: 'Serializable', timeout: 60000 });
  assert.equal((await db.material.findUniqueOrThrow({ where: { id: materialId } })).type, 'PROGRAMMING_EXERCISE');
  assert.equal(await db.exerciseDraft.count({ where: { materialId } }), 1);
  plan = await inspectConversions(db, manifest);
  fingerprint = conversionFingerprint({ manifest, plan });
  await db.$transaction(tx => applyConversions(tx, manifest, fingerprint, author.id), { isolationLevel: 'Serializable', timeout: 60000 });
  await writeFile('/tmp/course-turtle-parity-conversion.json', JSON.stringify({ fingerprint, manifest, plan }, null, 2), { mode: 0o600 });
  const { multipleChoice: _choice, shortAnswer: _short, ...manual } = config;
  await db.material.create({ data: { id: hiddenId, lectureId, type: 'TURTLE_EXERCISE', title: 'Hidden Turtle preview', position: 2, isVisible: false, manualMaterial: { create: { ...manual, includeInScore: true, runtimeVersion } } } });
  await db.material.create({ data: { id: nextId, lectureId, type: 'PROGRAMMING_EXERCISE', title: 'Ordinary Python remains ordinary', position: 3, isVisible: true, programmingExercise: { create: { externalKey: 'parity-ordinary', difficulty: 'EASY', starterCode: 'print("hello")' } } } });
  const classId = 'e0000000-0000-4000-8000-000000000040';
  await db.classCourse.upsert({ where: { classId_courseId: { classId, courseId } }, create: { classId, courseId, assignedByUserId: author.id }, update: {} });
  console.log('Development-only course Turtle conversion fixture verified.');
} finally { await db.$disconnect(); }
