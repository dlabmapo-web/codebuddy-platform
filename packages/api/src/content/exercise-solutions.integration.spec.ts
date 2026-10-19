import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../database/prisma.service.js';
import { replaceExerciseSolutions, solutionOrder } from './exercise-solutions.js';

describe.skipIf(process.env.COVE_SOLUTIONS_INTEGRATION !== '1')('solution collection database integrity', () => {
  const courseId = randomUUID(), lectureId = randomUUID(), materialId = randomUUID();
  let prisma: PrismaService;
  const solutions = [{ title: 'Loop', code: '\n# method 1\nprint(2)\n' }, { title: 'Formula', code: '# method 2\nprint(4 // 2)\n' }];
  beforeAll(async () => {
    const database = new URL(process.env.DATABASE_URL ?? '');
    if (new URL(process.env.SUPABASE_URL ?? '').hostname !== 'lnrmxjxsjxymgphgatwn.supabase.co' || !(database.hostname.includes('lnrmxjxsjxymgphgatwn') || database.username.includes('lnrmxjxsjxymgphgatwn'))) throw new Error('Development database only');
    prisma = new PrismaService(new ConfigService({ DATABASE_URL: process.env.DATABASE_URL }));
    const author = await prisma.user.findUniqueOrThrow({ where: { username: 'cove-teamlead' } });
    await prisma.course.create({ data: { id: courseId, academyId: '20000000-0000-4000-8000-000000000001', title: 'Solutions integration ' + courseId, createdByUserId: author.id,
      modules: { create: { title: 'Chapter', externalKey: 'chapter', position: 1,
        lectures: { create: { id: lectureId, title: 'Lecture', externalKey: 'lecture', position: 1,
          materials: { create: { id: materialId, title: 'Practice', type: 'PROGRAMMING_EXERCISE', position: 1,
            programmingExercise: { create: { externalKey: 'practice', difficulty: 'EASY', inputPromptPolicy: 'IGNORE', gradingRevision: 7 } } } } } } } } } });
  }, 30_000);
  afterAll(async () => { if (prisma) { await prisma.course.deleteMany({ where: { id: courseId } }); await prisma.$disconnect(); } });
  it('backfills exact legacy code without changing timestamps or revisions', async () => {
    const schema = 'solution_migration_' + randomUUID().replaceAll('-', '');
    const migration = readFileSync(new URL('../../prisma/migrations/20261019073000_multiple_reference_solutions/migration.sql', import.meta.url), 'utf8');
    await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      try {
        await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
        await tx.$executeRawUnsafe("CREATE TABLE programming_exercises (material_id UUID PRIMARY KEY, solution_code TEXT, quiz JSONB, updated_at TIMESTAMP DEFAULT '2000-01-01', grading_revision INTEGER DEFAULT 7)");
        for (const code of [null, ' \n\t', solutions[0].code, '# 방법 1\nprint(1)\n# 방법 2\nprint(2)']) {
          await tx.$executeRaw`INSERT INTO programming_exercises (material_id, solution_code) VALUES (${randomUUID()}::uuid, ${code})`;
        }
        for (const statement of migration.split(';').filter(statement => statement.trim())) await tx.$executeRawUnsafe(statement);
        const rows = await tx.$queryRawUnsafe<{ code: string }[]>('SELECT code FROM programming_exercise_solutions ORDER BY code');
        expect(rows.map(row => row.code).sort()).toEqual([solutions[0].code, '# 방법 1\nprint(1)\n# 방법 2\nprint(2)'].sort());
        const changed = await tx.$queryRawUnsafe<{ count: bigint }[]>("SELECT count(*) FROM programming_exercises WHERE updated_at <> '2000-01-01' OR grading_revision <> 7");
        expect(Number(changed[0].count)).toBe(0);
      } finally { await tx.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`); }
    });
  });
  it('writes all entries and first-entry projection atomically, preserving grading', async () => {
    await prisma.$transaction(tx => replaceExerciseSolutions(tx, materialId, solutions));
    const result = await prisma.programmingExercise.findUniqueOrThrow({ where: { materialId }, include: { solutions: solutionOrder } });
    expect(result.solutions.map(({ title, code }) => ({ title, code }))).toEqual(solutions);
    expect(result.solutionCode).toBe(solutions[0].code);
    expect(result.gradingRevision).toBe(7);
    expect(result.inputPromptPolicy).toBe('IGNORE');
  });
  it('rolls back deletion and replacement if the transaction fails', async () => {
    await expect(prisma.$transaction(async tx => { await replaceExerciseSolutions(tx, materialId, [solutions[1]]); throw new Error('abort'); })).rejects.toThrow('abort');
    expect(await prisma.programmingExerciseSolution.count({ where: { materialId } })).toBe(2);
    expect((await prisma.programmingExercise.findUniqueOrThrow({ where: { materialId } })).solutionCode).toBe(solutions[0].code);
  });
  it('reorders and removes entries without leaving old rows or projection', async () => {
    await prisma.$transaction(tx => replaceExerciseSolutions(tx, materialId, [solutions[1], solutions[0]]));
    expect((await prisma.programmingExercise.findUniqueOrThrow({ where: { materialId } })).solutionCode).toBe(solutions[1].code);
    await prisma.$transaction(tx => replaceExerciseSolutions(tx, materialId, [solutions[1]]));
    expect(await prisma.programmingExerciseSolution.count({ where: { materialId } })).toBe(1);
  });
  it('cascades solution rows with the exercise', async () => {
    await prisma.material.delete({ where: { id: materialId } });
    expect(await prisma.programmingExerciseSolution.count({ where: { materialId } })).toBe(0);
  });
});
