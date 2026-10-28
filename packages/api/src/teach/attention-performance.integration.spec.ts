import { ConfigService } from "@nestjs/config";
import { LONG_SOLVE_SECONDS, REPEATED_FAILURE_ATTEMPTS, STALLED_AFTER_DAYS } from "@cove/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaService } from "../database/prisma.service.js";
import { TeacherProgressRepository } from "./teacher-progress.repository.js";
import type { OverviewAggregateScope } from "./teacher-overview.repository.js";

const databaseUrl = process.env.COVE_INTEGRATION_DATABASE_URL;
const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const now = new Date("2026-10-27T12:00:00Z");
const users = Array.from({ length: 8 }, (_, i) => id(i + 1));
const materials = Array.from({ length: 5 }, (_, i) => id(i + 101));
const scope: OverviewAggregateScope = {
  studentClasses: users.map((userId, i) => ({ userId, membershipId: id(i + 201), classId: id(i < 4 ? 301 : 302) })),
  materialClasses: materials.map((materialId, i) => ({ materialId, courseId: id(401), classId: id(i < 3 ? 301 : 302) })),
};
type Attempt = {
  id: string; user_id: string; material_id: string; source_material_id: string;
  status: string; solve_elapsed_sec: number | null; created_at: string; regrade_run_id: string | null;
};
const attempts: Attempt[] = users.flatMap((userId, u) => materials.flatMap((materialId, m) =>
  Array.from({ length: 16 }, (_, n) => ({
    id: id(1000 + (u * materials.length + m) * 16 + n), user_id: userId, material_id: materialId,
    source_material_id: n === 15 ? id(999) : materialId,
    status: u === 0 && m === 0 ? "FAILED" : u === 0 && m === 1 ? "PASSED" :
      ["FAILED", "PASSED", "QUEUED", "RUNNING", "GRADER_ERROR"][(n + u + m) % 5]!,
    solve_elapsed_sec: n % 2 ? LONG_SOLVE_SECONDS + 1 : null,
    // Shared timestamps exercise the existing descending UUID tie-break.
    created_at: new Date(now.getTime() - (u % 2 ? STALLED_AFTER_DAYS + 1 : 0) * 86_400_000 - Math.floor(n / 2) * 60_000).toISOString(),
    regrade_run_id: n === 1 ? id(501) : null,
  })),
));

function reference(pairPreserving: boolean) {
  return users.flatMap((userId, u) => materials.flatMap((materialId, m) => {
    if (pairPreserving && !scope.studentClasses.some(s => s.userId === userId &&
      scope.materialClasses.some(t => t.materialId === materialId && t.classId === s.classId))) return [];
    const rows = attempts.filter(a => a.user_id === userId && a.material_id === materialId &&
      a.source_material_id === materialId && ["PASSED", "FAILED"].includes(a.status) &&
      (pairPreserving || a.regrade_run_id === null))
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
    const latest = rows[0];
    if (!latest) return [];
    const passIndex = rows.findIndex(a => a.status === "PASSED");
    const consecutiveFailures = passIndex < 0 ? rows.length : passIndex;
    const lastAttemptAt = new Date(latest.created_at);
    const latestAccepted = latest.status === "PASSED";
    if (!(consecutiveFailures >= REPEATED_FAILURE_ATTEMPTS ||
      lastAttemptAt.getTime() <= now.getTime() - STALLED_AFTER_DAYS * 86_400_000 ||
      (!latestAccepted && latest.solve_elapsed_sec !== null && latest.solve_elapsed_sec >= LONG_SOLVE_SECONDS))) return [];
    const hasProgress = (u + m) % 3 !== 0;
    return [{ userId, materialId, consecutiveFailures, lastAttemptAt,
      latestSolveSec: latest.solve_elapsed_sec, latestAccepted,
      progressStatus: hasProgress ? "IN_PROGRESS" : null,
      revisionMatches: hasProgress && (u + m) % 2 === 0 }];
  }));
}
const sorted = <T extends { userId: string; materialId: string }>(rows: T[]) =>
  rows.sort((a, b) => a.userId.localeCompare(b.userId) || a.materialId.localeCompare(b.materialId));

describe.skipIf(!databaseUrl)("attention query against PostgreSQL", () => {
  let prisma: PrismaService;
  beforeAll(() => {
    const url = new URL(databaseUrl!);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Use a disposable loopback database");
    prisma = new PrismaService(new ConfigService({ DATABASE_URL: databaseUrl }));
  });
  afterAll(async () => { await prisma?.$disconnect(); });

  it.each([false, true])("preserves attention facts and pair authorization (overview=%s)", async pairPreserving => {
    // Temporary tables shadow the application tables only on this transaction's
    // connection. No application rows, accounts or migrations are touched.
    await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe("CREATE TEMP TABLE submissions (id uuid, user_id uuid, material_id uuid, source_material_id uuid, status text, solve_elapsed_sec int, created_at timestamptz, regrade_run_id uuid) ON COMMIT DROP");
      await tx.$executeRawUnsafe("CREATE TEMP TABLE programming_exercises (material_id uuid PRIMARY KEY, grading_revision int) ON COMMIT DROP");
      await tx.$executeRawUnsafe("CREATE TEMP TABLE student_exercise_progress (user_id uuid, material_id uuid, status text, grading_revision int, PRIMARY KEY (user_id, material_id)) ON COMMIT DROP");
      await tx.$executeRaw`INSERT INTO submissions SELECT * FROM jsonb_to_recordset(${JSON.stringify(attempts)}::jsonb) AS r(id uuid, user_id uuid, material_id uuid, source_material_id uuid, status text, solve_elapsed_sec int, created_at timestamptz, regrade_run_id uuid)`;
      await tx.$executeRaw`INSERT INTO programming_exercises SELECT material_id, 2 FROM unnest(${materials}::uuid[]) AS material_id`;
      const progress = users.flatMap((user_id, u) => materials.flatMap((material_id, m) =>
        (u + m) % 3 === 0 ? [] : [{ user_id, material_id, status: "IN_PROGRESS", grading_revision: (u + m) % 2 === 0 ? 2 : 1 }]));
      await tx.$executeRaw`INSERT INTO student_exercise_progress SELECT * FROM jsonb_to_recordset(${JSON.stringify(progress)}::jsonb) AS r(user_id uuid, material_id uuid, status text, grading_revision int)`;
      const repository = new TeacherProgressRepository(tx as unknown as PrismaService);
      const actual = await repository.attentionCandidates({ userIds: users, materialIds: materials, now,
        ...(pairPreserving ? { overviewScope: scope } : {}) });
      const expected = reference(pairPreserving);
      expect(expected.length).toBeGreaterThan(0);
      expect(sorted(actual)).toEqual(sorted(expected));
    }, { timeout: 15_000 });
  });
});
