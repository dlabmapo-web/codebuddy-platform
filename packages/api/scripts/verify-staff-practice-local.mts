import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
const url = new URL(process.env.DATABASE_URL ?? '');
if (!(url.hostname.includes('lnrmxjxsjxymgphgatwn') || url.username.includes('lnrmxjxsjxymgphgatwn'))) throw new Error('Development database only');
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
try {
  const user = await db.user.findUniqueOrThrow({ where: { username: 'cove-teamlead' } });
  const materialId = 'ee070000-0000-4000-8000-000000000030';
  console.log({
    practiceAttempts: await db.staffPracticeAttempt.count({ where: { userId: user.id, materialId } }),
    studentSubmissions: await db.submission.count({ where: { userId: user.id, materialId } }),
    studentProgress: await db.studentExerciseProgress.count({ where: { userId: user.id, materialId } }),
    studentSolveSessions: await db.exerciseSolveSession.count({ where: { userId: user.id, materialId } }),
  });
} finally { await db.$disconnect(); }
