import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { SupabaseIdentity } from '../src/auth/auth.types.js';
import { AcademyAccessService } from '../src/authorization/academy-access.service.js';
import { SupportGrantResolver } from '../src/authorization/support-grant.resolver.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { JudgeQueue } from '../src/judge/judge.queue.js';
import { StaffPracticeService } from '../src/learn/staff-practice.service.js';
if (process.env.COVE_VERIFY_PRACTICE_QUEUE !== '1') throw new Error('Opt in with COVE_VERIFY_PRACTICE_QUEUE=1');
const database = new URL(process.env.DATABASE_URL ?? '');
const redis = new URL(process.env.REDIS_URL ?? '');
if (!(database.hostname.includes('lnrmxjxsjxymgphgatwn') || database.username.includes('lnrmxjxsjxymgphgatwn')) || !['localhost','127.0.0.1','[::1]'].includes(redis.hostname)) throw new Error('Development database and local queue only');
const config = new ConfigService({ ...process.env, PYODIDE_VERSION: process.env.PYODIDE_VERSION ?? '0.27.5' });
const db = new PrismaService(config), queue = new JudgeQueue(process.env.REDIS_URL!);
let attemptId: string | undefined;
try {
  const user = await db.user.findUniqueOrThrow({ where: { username: 'cove-teamlead' } });
  const target = { academyId: '20000000-0000-4000-8000-000000000001', materialId: 'ee070000-0000-4000-8000-000000000030' };
  const identity = { authUserId: user.authUserId! } as SupabaseIdentity;
  const service = new StaffPracticeService(db, new AcademyAccessService(db, new SupportGrantResolver(db)), config, queue);
  const before = await db.submission.count({ where: { userId: user.id, materialId: target.materialId } });
  const accepted = await service.submit(identity, { ...target, requestId: randomUUID(), code: 'print("hello")' });
  attemptId = accepted.submissionId;
  const deadline = Date.now() + 30_000;
  let result = await service.get(identity, { academyId: target.academyId, submissionId: attemptId });
  while (['QUEUED', 'RUNNING'].includes(result.status) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    result = await service.get(identity, { academyId: target.academyId, submissionId: attemptId });
  }
  if (result.status !== 'PASSED' || result.score !== 100) throw new Error(`Practice judge returned ${result.status}`);
  if (await db.submission.count({ where: { userId: user.id, materialId: target.materialId } }) !== before) throw new Error('Student submission count changed');
  console.log('Dedicated staff practice queue: PASSED, 100/100; student submissions unchanged.');
} finally {
  if (attemptId) await db.staffPracticeAttempt.deleteMany({ where: { id: attemptId } });
  await queue.close(); await db.$disconnect();
}
