import type { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';

/** INSERT ON CONFLICT is atomic even when Prisma cannot use a native upsert. */
export async function createPracticeAttempt(db: PrismaService, data: Prisma.StaffPracticeAttemptCreateManyInput) {
  await db.staffPracticeAttempt.createMany({ data, skipDuplicates: true });
  return db.staffPracticeAttempt.findUniqueOrThrow({
    where: { academyId_userId_requestId: { academyId: data.academyId, userId: data.userId, requestId: data.requestId } },
  });
}
