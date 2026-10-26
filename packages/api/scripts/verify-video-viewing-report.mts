import "dotenv/config";
import assert from "node:assert/strict";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "../src/generated/prisma/client.js";
import type { PrismaService } from "../src/database/prisma.service.js";
import { readVideoClassReport } from "../src/videos/video-report.js";
import { videoReportQuerySchema } from "@cove/shared";

const project = "lnrmxjxsjxymgphgatwn";
assert.equal(
  new URL(process.env.SUPABASE_URL ?? "").hostname,
  `${project}.supabase.co`,
  "Development only",
);
const databaseUrl = new URL(process.env.DATABASE_URL ?? "");
assert.ok(
  databaseUrl.hostname === `db.${project}.supabase.co` ||
    decodeURIComponent(databaseUrl.username) === `postgres.${project}`,
  "Development database only",
);
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const id = (value: number) =>
  `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const input = videoReportQuerySchema.parse({
  academyId: id(100),
  classId: id(200),
  materialId: id(300),
});
const assetId = id(400);
try {
  await db.$transaction(
    async (tx) => {
      // Temporary tables shadow these names for this connection only. No persistent data is changed.
      for (const ddl of [
        "CREATE TEMP TABLE users (id uuid PRIMARY KEY, display_name text, username text) ON COMMIT DROP",
        'CREATE TEMP TABLE academy_memberships (id uuid PRIMARY KEY, user_id uuid, academy_id uuid, status text, role "AcademyRole") ON COMMIT DROP',
        'CREATE TEMP TABLE academy_membership_roles (membership_id uuid, role "AcademyRole") ON COMMIT DROP',
        "CREATE TEMP TABLE class_enrollments (class_id uuid, membership_id uuid) ON COMMIT DROP",
        "CREATE TEMP TABLE video_watch_progress (user_id uuid, class_id uuid, material_id uuid, asset_id uuid, watched_ms int, position_ms int, completed boolean, updated_at timestamptz) ON COMMIT DROP",
      ])
        await tx.$executeRawUnsafe(ddl);
      const users = Array.from(
        { length: 57 },
        (_, index) =>
          Prisma.sql`(${id(index + 1)}::uuid, ${index === 52 ? "100%_literal" : `Student ${String(index).padStart(3, "0")}`}, NULL)`,
      );
      const memberships = Array.from(
        { length: 57 },
        (_, index) =>
          Prisma.sql`(${id(index + 1000)}::uuid, ${id(index + 1)}::uuid, ${index === 55 ? id(999) : input.academyId}::uuid, ${index === 54 ? "SUSPENDED" : "ACTIVE"}, ${index === 53 || index === 56 ? "TEACHER" : "STUDENT"}::"AcademyRole")`,
      );
      const enrollments = Array.from(
        { length: 57 },
        (_, index) =>
          Prisma.sql`(${input.classId}::uuid, ${id(index + 1000)}::uuid)`,
      );
      await tx.$executeRaw(
        Prisma.sql`INSERT INTO users VALUES ${Prisma.join(users)}`,
      );
      await tx.$executeRaw(
        Prisma.sql`INSERT INTO academy_memberships VALUES ${Prisma.join(memberships)}`,
      );
      await tx.$executeRaw(
        Prisma.sql`INSERT INTO class_enrollments VALUES ${Prisma.join(enrollments)}`,
      );
      await tx.$executeRaw(
        Prisma.sql`INSERT INTO academy_membership_roles VALUES (${id(1053)}::uuid, 'STUDENT'::"AcademyRole")`,
      );
      await tx.$executeRaw(Prisma.sql`INSERT INTO video_watch_progress VALUES
      (${id(1)}::uuid, ${input.classId}::uuid, ${input.materialId}::uuid, ${assetId}::uuid, 90000, 95000, true, now()),
      (${id(2)}::uuid, ${input.classId}::uuid, ${input.materialId}::uuid, ${assetId}::uuid, 60000, 80000, false, now()),
      (${id(3)}::uuid, ${input.classId}::uuid, ${input.materialId}::uuid, ${id(401)}::uuid, 100000, 100000, true, now()),
      (${id(4)}::uuid, ${id(201)}::uuid, ${input.materialId}::uuid, ${assetId}::uuid, 100000, 100000, true, now())`);
      const adapter = {
        $transaction: async (run: (client: typeof tx) => unknown) => run(tx),
      } as unknown as PrismaService;
      const all = await readVideoClassReport(adapter, input, assetId);
      assert.deepEqual(all.summary, {
        students: 54,
        notStarted: 52,
        inProgress: 1,
        completed: 1,
      });
      assert.equal(all.rows.length, 50);
      assert.equal(all.filteredCount, 54);
      const second = await readVideoClassReport(
        adapter,
        { ...input, page: 100 },
        assetId,
      );
      assert.equal(second.page, 2);
      assert.equal(second.rows.length, 4);
      const partial = await readVideoClassReport(
        adapter,
        { ...input, status: "IN_PROGRESS" },
        assetId,
      );
      assert.equal(partial.filteredCount, 1);
      assert.equal(partial.rows[0].watchedMs, 60000);
      assert.equal(partial.rows[0].positionMs, 80000);
      const complete = await readVideoClassReport(
        adapter,
        { ...input, status: "COMPLETED" },
        assetId,
      );
      assert.equal(complete.filteredCount, 1);
      assert.equal(complete.rows[0].watchedMs, 90000);
      assert.equal(typeof complete.rows[0].updatedAt, "string");
      const empty = await readVideoClassReport(
        adapter,
        { ...input, classId: id(202), page: 50 },
        assetId,
      );
      assert.deepEqual(empty.summary, {
        students: 0,
        notStarted: 0,
        inProgress: 0,
        completed: 0,
      });
      assert.equal(empty.page, 1);
      assert.equal(empty.rows.length, 0);
      const replaced = await readVideoClassReport(
        adapter,
        { ...input, search: "Student 002" },
        assetId,
      );
      assert.equal(replaced.rows[0].status, "NOT_STARTED");
      assert.equal(replaced.rows[0].updatedAt, null);
      const literal = await readVideoClassReport(
        adapter,
        { ...input, search: "100%_" },
        assetId,
      );
      assert.equal(literal.filteredCount, 1);
      const injection = await readVideoClassReport(
        adapter,
        { ...input, search: "' OR 1=1 --" },
        assetId,
      );
      assert.equal(injection.filteredCount, 0);
      assert.equal(injection.rows.length, 0);
      console.log(
        "Video report SQL verified: active roster, extra roles, missing history, current asset/class scope, summaries, pagination, filtering and literal search. Temporary tables only.",
      );
    },
    { timeout: 30000 },
  );
} finally {
  await db.$disconnect();
}
