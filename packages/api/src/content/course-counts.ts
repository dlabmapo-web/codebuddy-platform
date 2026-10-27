import type { CourseContentCounts } from "@cove/shared";
import { Prisma } from "../generated/prisma/client.js";
import type { PrismaService } from "../database/prisma.service.js";

export const emptyCourseCounts = (): CourseContentCounts => ({
  modules: 0, lectures: 0, exercises: 0, visibleExercises: 0,
  documents: 0, visibleDocuments: 0,
});

/** One row per course, never one row per material across the API boundary.
 * Course visibility is deliberately excluded: these counts describe what a
 * course would deliver if published. The list separately returns that flag.
 * Call only after authorization. Both tenant and displayed IDs bound the SQL.
 */
export async function courseCounts(
  prisma: Pick<PrismaService, "$queryRaw">,
  academyId: string,
  courseIds: readonly string[],
): Promise<Map<string, CourseContentCounts>> {
  if (courseIds.length === 0) return new Map();
  const ids = [...new Set(courseIds)].map((id) => Prisma.sql`${id}::uuid`);
  const rows = await prisma.$queryRaw<Array<CourseContentCounts & { id: string }>>(Prisma.sql`
    SELECT c.id,
      count(DISTINCT cm.id)::integer AS modules,
      count(DISTINCT l.id)::integer AS lectures,
      count(m.id) FILTER (WHERE m.type <> 'PDF_DOCUMENT')::integer AS exercises,
      count(m.id) FILTER (WHERE m.type <> 'PDF_DOCUMENT'
        AND cm.is_visible AND l.is_visible AND m.is_visible)::integer AS "visibleExercises",
      count(m.id) FILTER (WHERE m.type = 'PDF_DOCUMENT')::integer AS documents,
      count(m.id) FILTER (WHERE m.type = 'PDF_DOCUMENT'
        AND cm.is_visible AND l.is_visible AND m.is_visible)::integer AS "visibleDocuments"
    FROM courses c
    LEFT JOIN course_modules cm ON cm.course_id = c.id
    LEFT JOIN lectures l ON l.course_module_id = cm.id
    LEFT JOIN materials m ON m.lecture_id = l.id
    WHERE c.academy_id = ${academyId}::uuid AND c.id IN (${Prisma.join(ids)})
    GROUP BY c.id
  `);
  return new Map(rows.map(({ id, ...counts }) => [id, counts]));
}
