import 'dotenv/config';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { rollbackConversions } from '../src/migrations/course-turtle/cli.js';
if (new URL(process.env.SUPABASE_URL ?? '').hostname !== 'lnrmxjxsjxymgphgatwn.supabase.co') throw new Error('Course parity verification is development-only');
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
try {
  const artifact = JSON.parse(await readFile('/tmp/course-turtle-parity-conversion.json', 'utf8'));
  assert.equal(artifact.manifest.entries[0].materialId, 'ee430000-0000-4000-8000-000000000031');
  const materialId = artifact.manifest.entries[0].materialId;
  const actor = await db.user.findUniqueOrThrow({ where: { username: 'cove-teamlead' } });
  const row = await db.material.findUniqueOrThrow({ where: { id: materialId }, include: {
    programmingExercise: true, manualMaterial: true, manualSubmissions: { include: { reviews: true } },
  } });
  assert.equal(row.type, 'TURTLE_EXERCISE'); assert.ok(row.programmingExercise);
  assert.equal(row.isRequired, false); assert.equal(row.manualMaterial?.includeInScore, false);
  assert.equal(row.manualSubmissions.length, 1);
  assert.equal(row.manualSubmissions[0].reviews[0].scoreHundredths, 8750);
  const scored = await db.material.findUniqueOrThrow({ where: { id: 'ee430000-0000-4000-8000-000000000032' }, include: {
    manualMaterial: true, manualSubmissions: { include: { reviews: true } },
  } });
  assert.equal(scored.manualMaterial?.includeInScore, true);
  assert.equal(scored.manualSubmissions[0].reviews[0].scoreHundredths, 9000);
  assert.equal((await db.submission.findUniqueOrThrow({ where: { id: 'ee430000-0000-4000-8000-000000000090' } })).score, 75);
  await assert.rejects(db.$transaction(tx => rollbackConversions(tx, artifact.manifest, artifact.plan, artifact.fingerprint, actor.id), { isolationLevel: 'Serializable', timeout: 60000 }), /Rollback refused/);
  assert.equal((await db.material.findUniqueOrThrow({ where: { id: materialId } })).type, 'TURTLE_EXERCISE');
  console.log('Legacy grade and new manual review remain separate; rollback correctly refuses new learner work.');
} finally { await db.$disconnect(); }
