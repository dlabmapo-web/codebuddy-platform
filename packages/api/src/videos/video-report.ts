import { Prisma } from "../generated/prisma/client.js";
import type { PrismaService } from "../database/prisma.service.js";
import { holdsRoleSql } from "../authorization/membership-roles.js";
import type { VideoClassReport, VideoReportQuery } from "@cove/shared";

type Summary = VideoClassReport["summary"] & { filteredCount: number };
type Record = Omit<VideoClassReport["rows"][number], "updatedAt"> & {
  updatedAt: Date | null;
};
const pageSize = 50;

/** Current roster/current asset only. Historical versions stay in the history endpoint. */
export async function readVideoClassReport(
  db: PrismaService,
  input: VideoReportQuery,
  assetId: string,
) {
  const roster = Prisma.sql`
    SELECT m.user_id AS "userId", COALESCE(NULLIF(u.display_name, ''), u.username, '') AS "learnerName",
      COALESCE(p.watched_ms, 0) AS "watchedMs", p.position_ms AS "positionMs",
      COALESCE(p.completed, false) AS completed, p.updated_at AS "updatedAt",
      CASE WHEN p.completed THEN 'COMPLETED' WHEN p.watched_ms > 0 THEN 'IN_PROGRESS' ELSE 'NOT_STARTED' END AS status
    FROM class_enrollments e
    JOIN academy_memberships m ON m.id = e.membership_id
    JOIN users u ON u.id = m.user_id
    LEFT JOIN video_watch_progress p ON p.user_id = m.user_id AND p.class_id = e.class_id
      AND p.material_id = ${input.materialId}::uuid AND p.asset_id = ${assetId}::uuid
    WHERE e.class_id = ${input.classId}::uuid AND m.academy_id = ${input.academyId}::uuid
      AND m.status = 'ACTIVE' AND ${holdsRoleSql(Prisma.sql`m.id`, Prisma.sql`m.role`, "STUDENT")}
  `;
  const filter = Prisma.sql`
    (${input.search} = '' OR strpos(lower("learnerName"), lower(${input.search})) > 0)
    AND (${input.status} = 'ALL' OR status = ${input.status})
  `;
  return db.$transaction(
    async (tx) => {
      const [counts] = await tx.$queryRaw<Summary[]>(Prisma.sql`
      WITH roster AS (${roster})
      SELECT count(*)::int AS students,
        count(*) FILTER (WHERE status = 'NOT_STARTED')::int AS "notStarted",
        count(*) FILTER (WHERE status = 'IN_PROGRESS')::int AS "inProgress",
        count(*) FILTER (WHERE status = 'COMPLETED')::int AS completed,
        (SELECT count(*)::int FROM roster WHERE ${filter}) AS "filteredCount"
      FROM roster
    `);
      const page = Math.min(
        input.page,
        Math.max(1, Math.ceil(counts.filteredCount / pageSize)),
      );
      const records = await tx.$queryRaw<Record[]>(Prisma.sql`
      WITH roster AS (${roster}) SELECT * FROM roster WHERE ${filter}
      ORDER BY lower("learnerName"), "userId" LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
    `);
      const { filteredCount, ...summary } = counts;
      return {
        summary,
        filteredCount,
        page,
        pageSize,
        rows: records.map((record) => ({
          ...record,
          updatedAt: record.updatedAt?.toISOString() ?? null,
        })),
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}
