import type { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';

/** INSERT ON CONFLICT is atomic even when Prisma cannot use a native upsert. */
export async function createPracticeAttempt(db: PrismaService, data: Prisma.StaffPracticeAttemptCreateManyInput) {
  return db.$transaction(async tx => {
  await tx.staffPracticeAttempt.createMany({ data, skipDuplicates: true });
  const attempt = await tx.staffPracticeAttempt.findUniqueOrThrow({
    where: { academyId_userId_requestId: { academyId: data.academyId, userId: data.userId, requestId: data.requestId } },
  });
  await tx.gradingDispatchIntent.upsert({ where: { staffPracticeAttemptId: attempt.id }, create: { staffPracticeAttemptId: attempt.id }, update: {} });
  return attempt;
  });
}
