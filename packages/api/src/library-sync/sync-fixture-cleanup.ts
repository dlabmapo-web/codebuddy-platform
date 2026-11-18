import type { PrismaClient } from "../generated/prisma/client.js";

/**
 * Removes everything a library-sync integration spec created under one
 * organization, in foreign-key order, so specs sharing one disposable
 * database do not see each other's libraries. The platform resolves "the"
 * library academy without an organization in some reads, so a leftover one
 * would change what another spec reads.
 */
export async function deleteSyncFixture(
  db: PrismaClient,
  input: { organizationId: string; userIds: string[] },
) {
  const academies = (
    await db.academy.findMany({
      where: { organizationId: input.organizationId },
      select: { id: true },
    })
  ).map((row) => row.id);
  const courses = (
    await db.course.findMany({
      where: { academyId: { in: academies } },
      select: { id: true },
    })
  ).map((row) => row.id);
  const classes = (
    await db.class.findMany({
      where: { academyId: { in: academies } },
      select: { id: true },
    })
  ).map((row) => row.id);
  await db.manualSubmission.deleteMany({ where: { classId: { in: classes } } });
  await db.submission.deleteMany({ where: { courseId: { in: courses } } });
  await db.exerciseDraft.deleteMany({ where: { courseId: { in: courses } } });
  await db.videoWatchProgress.deleteMany({
    where: { classId: { in: classes } },
  });
  await db.course.updateMany({
    where: { id: { in: courses } },
    data: { sourceCourseId: null },
  });
  // Copies before masters: a copy's sync state names its master, and within
  // one statement the order of the foreign-key checks is not guaranteed.
  await db.course.deleteMany({
    where: { id: { in: courses }, syncState: { isNot: null } },
  });
  await db.course.deleteMany({ where: { id: { in: courses } } });
  await db.videoCaption.deleteMany({
    where: { asset: { academyId: { in: academies } } },
  });
  await db.videoAsset.deleteMany({ where: { academyId: { in: academies } } });
  await db.pdfAsset.deleteMany({ where: { academyId: { in: academies } } });
  await db.class.deleteMany({ where: { id: { in: classes } } });
  await db.academyMembership.deleteMany({
    where: { academyId: { in: academies } },
  });
  await db.academy.deleteMany({ where: { id: { in: academies } } });
  await db.organization.deleteMany({ where: { id: input.organizationId } });
  await db.user.deleteMany({ where: { id: { in: input.userIds } } });
}
