import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { defaultEliceGradingProfile, legacyGradingProfile } from '@cove/shared';
import { exerciseProfileColumns } from '../src/judge/grading-profile.js';

config({ path: '.env', quiet: true });
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !['localhost', '127.0.0.1'].includes(new URL(databaseUrl).hostname)) {
  throw new Error('Input-prompt E2E fixtures require a local database');
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
const academyId = '20000000-0000-4000-8000-000000000001';
const actorId = '30000000-0000-4000-8000-000000000003';
const courseId = 'ee040000-0000-4000-8000-000000000001';
const moduleId = 'ee040000-0000-4000-8000-000000000010';
const lectureId = 'ee040000-0000-4000-8000-000000000020';
try {
  // Restored browser sessions need a lease in this local Redis too. Use the
  // same authenticated begin endpoint as sign-in; do not disable inactivity.
  if (process.env.E2E_AUTH_STATE_DIR) {
    const apiUrl = new URL(process.env.E2E_API_URL ?? 'http://localhost:4000/api/rpc');
    if (!['localhost', '127.0.0.1'].includes(apiUrl.hostname)) throw new Error('Local API required');
    const state = JSON.parse(readFileSync(join(process.env.E2E_AUTH_STATE_DIR, 'student@cove.test.json'), 'utf8')) as { cookies: { name: string; value: string }[] };
    let raw = decodeURIComponent(state.cookies.filter(c => /^sb-.+-auth-token(?:\.\d+)?$/.test(c.name))
      .sort((a,b) => Number(/\.(\d+)$/.exec(a.name)?.[1] ?? 0) - Number(/\.(\d+)$/.exec(b.name)?.[1] ?? 0))
      .map(c => c.value).join(''));
    if (raw.startsWith('base64-')) raw = Buffer.from(raw.slice(7), 'base64url').toString('utf8');
    const { access_token } = JSON.parse(raw) as { access_token: string };
    const response = await fetch(`${apiUrl.href}/studentSession/begin`, { method: 'POST',
      headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json',
        ...(process.env.BFF_SHARED_SECRET ? { 'X-Cove-Bff-Secret': process.env.BFF_SHARED_SECRET } : {}) },
      body: JSON.stringify({ json: {} }),
    });
    if (!response.ok) throw new Error(`Could not begin local test session: HTTP ${response.status}`);
  }
  const mode = process.argv[2] ?? 'seed';
  if (!['seed', 'samples-on', 'samples-off'].includes(mode)) throw new Error('Unknown fixture action');
  await prisma.academyFeatureFlag.upsert({
    where: { academyId_feature: { academyId, feature: 'SERVER_SAMPLE_CHECKS' } },
    create: { academyId, feature: 'SERVER_SAMPLE_CHECKS', isEnabled: mode !== 'samples-off' },
    update: { isEnabled: mode !== 'samples-off' },
  });
  if (mode === 'seed') {
    await prisma.course.upsert({ where: { id: courseId }, update: { isVisible: true },
      create: { id: courseId, academyId, createdByUserId: actorId, title: 'E2E input prompt policy', isVisible: true } });
    await prisma.courseModule.upsert({ where: { id: moduleId }, update: {},
      create: { id: moduleId, courseId, externalKey: 'E2E-INPUT-PROMPTS', title: 'Python input', position: 1, isVisible: true } });
    await prisma.lecture.upsert({ where: { id: lectureId }, update: {},
      create: { id: lectureId, courseModuleId: moduleId, externalKey: 'E2E-INPUT-PROMPTS', title: 'Input prompt grading', position: 1, isVisible: true } });
    for (const [index, weighted] of [false, true].entries()) {
      const materialId = `ee040000-0000-4000-8000-00000000003${index}`;
      await prisma.material.upsert({ where: { id: materialId }, update: { isVisible: true },
        create: { id: materialId, lectureId, title: weighted ? 'Weighted time input' : 'Standard time input', type: 'PROGRAMMING_EXERCISE', position: index + 1, isVisible: true } });
      const exercise = {
        externalKey: `e2e-input-prompts-${index}`, difficulty: 'EASY' as const,
        description: '<p>Read the hour and minute with input prompts, then print the formatted time.</p>',
        solutionCode: 'hour = input("Hour: ")\nminute = input("Minute: ")\nprint(f"Time: {hour}:{minute}")',
        ...exerciseProfileColumns(weighted ? defaultEliceGradingProfile : legacyGradingProfile),
        gradingSemanticVersion: weighted ? 'elice-v1' : 'legacy-v1',
      };
      await prisma.programmingExercise.upsert({ where: { materialId }, update: exercise, create: { materialId, ...exercise } });
      await prisma.exerciseTestCase.deleteMany({ where: { exerciseMaterialId: materialId } });
      await prisma.exerciseTestCase.createMany({ data: [
        { exerciseMaterialId: materialId, position: 1, input: '4\n30\n', expectedOutput: 'Time: 4:30', visibility: 'SAMPLE' },
        { exerciseMaterialId: materialId, position: 2, input: '9\n5\n', expectedOutput: 'Time: 9:5', visibility: 'HIDDEN' },
      ] });
    }
    await prisma.classCourse.createMany({ data: [{ classId: 'e0000000-0000-4000-8000-000000000040', courseId, assignedByUserId: actorId }], skipDuplicates: true });
  }
  console.log(`Input-prompt fixture: ${mode}`);
} finally { await prisma.$disconnect(); }
