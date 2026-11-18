import { HttpStatus } from "@nestjs/common";

import { AppException } from "../common/app-exception.js";
import type { Prisma } from "../generated/prisma/client.js";

/**
 * Archived library content on an academy's own paths (sync design §10).
 *
 * When head office removes something a copy's students have worked on, sync
 * archives it: the row is hidden and kept for that work, and its link says
 * `ARCHIVED`. Visibility alone would not keep it that way — the next "show",
 * a "show all content" or a move out of an archived lecture would publish it
 * again by accident. These guards make archival stick: nothing archived, and
 * nothing under an archived module or lecture, is shown again or moved by
 * hand. Hiding is always allowed, and staff keep reading and editing it, so
 * the students' history stays inspectable and restoration can keep edits.
 *
 * Only library sync restores archived content, when a later release brings
 * it back (`sync-run.ts`), with the visibility it had before archival.
 */

type Db = Pick<Prisma.TransactionClient, "$queryRaw">;

export type ArchiveTarget = {
  materialIds?: readonly string[];
  lectureIds?: readonly string[];
  moduleIds?: readonly string[];
};

/** Logged with the refusal; the person sees the code's text, and the builder says why before they try. */
export const ARCHIVED_CONTENT_MESSAGE =
  "Head office removed this content. It is kept, hidden, for student work, and cannot be shown again or moved.";

/** Whether a target, or a module or lecture above it, is archived. One statement, on the copy's link index. */
export async function hasArchivedAncestry(db: Db, courseId: string, target: ArchiveTarget): Promise<boolean> {
  const materials = [...(target.materialIds ?? [])];
  const lectures = [...(target.lectureIds ?? [])];
  const modules = [...(target.moduleIds ?? [])];
  if (!materials.length && !lectures.length && !modules.length) return false;
  const rows = await db.$queryRaw<Array<{ found: number }>>`
    SELECT 1 AS found FROM library_sync_links k
    WHERE k.copy_course_id = ${courseId}::uuid AND k.state = 'ARCHIVED' AND k.local_id IN (
      SELECT unnest(${materials}::uuid[])
      UNION ALL SELECT m.lecture_id FROM materials m WHERE m.id = ANY(${materials}::uuid[])
      UNION ALL SELECT l.course_module_id FROM materials m JOIN lectures l ON l.id = m.lecture_id WHERE m.id = ANY(${materials}::uuid[])
      UNION ALL SELECT unnest(${lectures}::uuid[])
      UNION ALL SELECT l.course_module_id FROM lectures l WHERE l.id = ANY(${lectures}::uuid[])
      UNION ALL SELECT unnest(${modules}::uuid[])
    )
    LIMIT 1`;
  return rows.length > 0;
}

/** Refuse showing or moving archived content, or content under an archived module or lecture. */
export async function assertNotArchived(db: Db, courseId: string, target: ArchiveTarget): Promise<void> {
  if (await hasArchivedAncestry(db, courseId, target))
    throw new AppException("CONTENT_VALIDATION_FAILED", HttpStatus.CONFLICT, ARCHIVED_CONTENT_MESSAGE);
}

/**
 * Every row of a course that is archived or sits under an archived module or
 * lecture, for an operation over the whole course. One statement.
 */
export async function archivedRows(db: Db, courseId: string): Promise<{ modules: string[]; lectures: string[]; materials: string[] }> {
  const rows = await db.$queryRaw<Array<{ kind: "MODULE" | "LECTURE" | "MATERIAL"; id: string }>>`
    WITH archived AS (
      SELECT local_id FROM library_sync_links
      WHERE copy_course_id = ${courseId}::uuid AND state = 'ARCHIVED' AND local_id IS NOT NULL
    )
    SELECT 'MODULE' AS kind, cm.id FROM course_modules cm
      WHERE cm.course_id = ${courseId}::uuid AND cm.id IN (SELECT local_id FROM archived)
    UNION ALL
    SELECT 'LECTURE', l.id FROM lectures l JOIN course_modules cm ON cm.id = l.course_module_id
      WHERE cm.course_id = ${courseId}::uuid AND (l.id IN (SELECT local_id FROM archived) OR cm.id IN (SELECT local_id FROM archived))
    UNION ALL
    SELECT 'MATERIAL', m.id FROM materials m JOIN lectures l ON l.id = m.lecture_id JOIN course_modules cm ON cm.id = l.course_module_id
      WHERE cm.course_id = ${courseId}::uuid
        AND (m.id IN (SELECT local_id FROM archived) OR l.id IN (SELECT local_id FROM archived) OR cm.id IN (SELECT local_id FROM archived))`;
  return {
    modules: rows.filter((row) => row.kind === "MODULE").map((row) => row.id),
    lectures: rows.filter((row) => row.kind === "LECTURE").map((row) => row.id),
    materials: rows.filter((row) => row.kind === "MATERIAL").map((row) => row.id),
  };
}
