import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { fixtureEnvironment } from './native-grading-e2e-env.mjs';
import { PrismaService } from '../dist/src/database/prisma.service.js';
import { seedFixture } from './native-grading-e2e-seed.mjs';
fixtureEnvironment();
test('paired fixture cohorts reuse certified material identities with new first-solve learners', async () => {
  const db = new PrismaService(
    new ConfigService({ DATABASE_URL: process.env.DATABASE_URL }),
  );
  try {
    for (const cases of [1, 5, 10]) {
      const ids = {
        organizationId: randomUUID(),
        academyId: randomUUID(),
        materialId: randomUUID(),
      };
      const first = await seedFixture(db, { cases, enhanced: true, ids });
      const second = await seedFixture(db, { cases, enhanced: true, ids });
      assert.equal(first.materialId, second.materialId);
      assert.equal(first.courseId, second.courseId);
      assert.equal(first.academy.id, second.academy.id);
      assert.notEqual(first.users.student.id, second.users.student.id);
      assert.notEqual(first.classId, second.classId);
      assert.equal(
        await db.exerciseTestCase.count({
          where: { exerciseMaterialId: first.materialId },
        }),
        cases,
      );
      await assert.rejects(
        () =>
          seedFixture(db, {
            cases,
            enhanced: true,
            ids: { ...ids, organizationId: randomUUID() },
          }),
        /organization mismatch/,
      );
    }
    assert.equal(await db.submission.count(), 0);
    assert.equal(await db.pointAward.count(), 0);
  } finally {
    await db.$disconnect();
  }
});
