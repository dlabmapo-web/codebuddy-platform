import { HttpStatus } from "@nestjs/common";
import { AppException } from "../../common/app-exception.js";
import type { Prisma } from "../../generated/prisma/client.js";

/** Every library title writer takes this lock before checking draft and retired names. */
export async function lockLibraryTitles(
  tx: Prisma.TransactionClient,
  academyId: string,
): Promise<boolean> {
  // A physical row update also invalidates an older serializable snapshot after
  // waiting for a read-committed create/rename. SELECT FOR UPDATE alone does not.
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    UPDATE academies SET updated_at = updated_at
    WHERE id = ${academyId}::uuid AND kind = 'LIBRARY'
    RETURNING id
  `;
  return rows.length > 0;
}

export async function assertLibraryTitleAvailable(
  tx: Prisma.TransactionClient,
  academyId: string,
  title: string,
  exceptCourseId?: string,
) {
  const duplicate = await tx.course.findFirst({
    where: {
      academyId,
      title: { equals: title, mode: "insensitive" },
      ...(exceptCourseId ? { id: { not: exceptCourseId } } : {}),
    },
    select: { id: true },
  });
  if (duplicate)
    throw new AppException("COURSE_TITLE_CONFLICT", HttpStatus.CONFLICT);
}
