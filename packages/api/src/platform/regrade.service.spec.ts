import { describe, expect, it, vi } from "vitest";

import { AppException } from "../common/app-exception.js";
import { STALE_PROBLEMS_MAX } from "@cove/shared";

import { RegradeService, REGRADE_MAX_SUBMISSIONS } from "./regrade.service.js";

const authUserId = "operator";
const identity = { authUserId } as never;
const academyId = "10000000-0000-4000-8000-000000000001";
const materialId = "20000000-0000-4000-8000-000000000001";
const context = { requestId: "req-1" };

const access = { requirePermission: vi.fn().mockResolvedValue({ userId: "op" }) };
// Never reached in these tests: `authorize` tries the platform axis first and
// only falls through on PLATFORM_ACCESS_DENIED, which the stub above never
// raises. Present so the constructor is honest about what the service needs.
const academyAccess = { requirePermission: vi.fn() };
const audit = { write: vi.fn().mockResolvedValue(undefined) };
const config = { get: vi.fn().mockReturnValue("0.27.5") };

/**
 * The plan is a raw query, so the interesting assertions are about the SQL this
 * service asks for rather than about rows a mock returns. `$queryRaw` is a
 * tagged template: the fragments arrive as the first argument and the
 * interpolated values follow, which is exactly what the rules need checking.
 */
function createPrisma(stale: { submissionId: string; userId: string }[] = []) {
  const queryRaw = vi.fn().mockResolvedValue(stale);
  return {
    queryRaw,
    prisma: {
      $queryRaw: queryRaw,
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
        typeof fn === "function" ? fn({ platformOperationRun: { create: vi.fn().mockResolvedValue({ id: "run-1" }) }, auditLog: { create: vi.fn() } }) : fn,
      ),
      material: {
        findFirst: vi.fn().mockResolvedValue({
          title: "Two Sum",
          programmingExercise: { gradingRevision: 3 },
        }),
      },
      platformOperationRun: {
        create: vi.fn().mockResolvedValue({ id: "run-1" }),
        // `planRegrade` frees an abandoned plan and a lost run before claiming.
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    } as never,
  };
}

const service = (prisma: never) =>
  new RegradeService(
    prisma,
    access as never,
    academyAccess as never,
    audit as never,
    config as never,
  );

/** The SQL text of a `$queryRaw` tagged-template call. */
function sqlOf(call: unknown[]): string {
  return (call[0] as string[]).join("?");
}

describe("staleFor, via planRegrade", () => {
  it("asks for one row per student, their most recent attempt", async () => {
    // Rule 4. Without DISTINCT ON, a student with six attempts contributes six
    // repairs and the run costs six times what it should.
    const { prisma, queryRaw } = createPrisma([
      { submissionId: "s1", userId: "u1" },
    ]);
    await service(prisma).planRegrade(identity, { academyId, materialId }, context);

    const sql = sqlOf(queryRaw.mock.calls[0]);
    expect(sql).toContain("DISTINCT ON (s.user_id)");
    expect(sql).toContain("ORDER BY s.user_id, s.created_at DESC");
  });

  it("takes both verdicts, because a wrong test case failed correct code", async () => {
    // Rule 3. PASSED alone would repair the students who lost a checkmark and
    // silently abandon the ones a wrong expected output marked down.
    const { prisma, queryRaw } = createPrisma([
      { submissionId: "s1", userId: "u1" },
    ]);
    await service(prisma).planRegrade(identity, { academyId, materialId }, context);

    expect(sqlOf(queryRaw.mock.calls[0])).toContain(
      "s.status IN ('PASSED', 'FAILED')",
    );
  });

  it("decides staleness after picking the latest, so a repaired student drops off", async () => {
    // The bug this replaces: filtering repairs out *before* `DISTINCT ON` left
    // a student's original submission as the newest row that matched, so they
    // came back stale after being repaired and every later run re-graded them
    // again. A repair has to be an ordinary row inside the window.
    const { prisma, queryRaw } = createPrisma([
      { submissionId: "s1", userId: "u1" },
    ]);
    await service(prisma).planRegrade(identity, { academyId, materialId }, context);

    const sql = sqlOf(queryRaw.mock.calls[0]);
    expect(sql).not.toContain("regrade_run_id");
    // The revision test sits outside the window, on its result.
    expect(sql).toContain("WHERE latest.revision <");
  });

  it("compares against the problem's current revision", async () => {
    const { prisma, queryRaw } = createPrisma([
      { submissionId: "s1", userId: "u1" },
    ]);
    await service(prisma).planRegrade(identity, { academyId, materialId }, context);

    // Rule 2, with the revision read from the exercise rather than assumed.
    expect(sqlOf(queryRaw.mock.calls[0])).toContain("latest.revision <");
    expect(queryRaw.mock.calls[0]).toContain(3);
  });
});

describe("planRegrade", () => {
  it("refuses a plan with nothing in it rather than offering a dead button", async () => {
    const { prisma } = createPrisma([]);
    await expect(
      service(prisma).planRegrade(identity, { academyId, materialId }, context),
    ).rejects.toMatchObject({ code: "OPERATION_PLAN_EMPTY" });
  });

  it("reports one repair per student, because that is what it will run", async () => {
    // The console's copy says "N students' most recent submissions". These two
    // numbers must agree, or the confirmation promises work that never happens.
    const stale = [
      { submissionId: "s1", userId: "u1" },
      { submissionId: "s2", userId: "u2" },
    ];
    const { prisma } = createPrisma(stale);
    const plan = await service(prisma).planRegrade(
      identity,
      { academyId, materialId },
      context,
    );

    expect(plan.plannedCount).toBe(2);
    expect(plan.studentCount).toBe(2);
    expect(plan.currentRevision).toBe(3);
    expect(plan.problemTitle).toBe("Two Sum");
  });

  it("refuses a plan larger than one run should ever be", async () => {
    const stale = Array.from({ length: REGRADE_MAX_SUBMISSIONS + 1 }, (_, i) => ({
      submissionId: `s${i}`,
      userId: `u${i}`,
    }));
    const { prisma } = createPrisma(stale);
    await expect(
      service(prisma).planRegrade(identity, { academyId, materialId }, context),
    ).rejects.toMatchObject({ code: "OPERATION_PLAN_TOO_LARGE" });
  });

  it("refuses a problem that is not this academy's", async () => {
    const { prisma } = createPrisma([]);
    (prisma as never as { material: { findFirst: ReturnType<typeof vi.fn> } })
      .material.findFirst.mockResolvedValue(null);
    await expect(
      service(prisma).planRegrade(identity, { academyId, materialId }, context),
    ).rejects.toMatchObject({ code: "EXERCISE_NOT_FOUND" });
  });
});

describe("authorization", () => {
  const denyPlatform = () => ({
    requirePermission: vi
      .fn()
      .mockRejectedValue(new AppException("PLATFORM_ACCESS_DENIED")),
  });

  it("falls through to the academy axis when the caller is not an operator", async () => {
    // A Team Lead is not a Cove operator. They still hold their own academy.
    const { prisma } = createPrisma([{ submissionId: "s1", userId: "u1" }]);
    const platform = denyPlatform();
    const academy = {
      requirePermission: vi.fn().mockResolvedValue({ userId: "lead" }),
    };
    const service = new RegradeService(
      prisma,
      platform as never,
      academy as never,
      audit as never,
      config as never,
    );

    await service.planRegrade(identity, { academyId, materialId }, context);

    expect(academy.requirePermission).toHaveBeenCalledWith(
      authUserId,
      academyId,
      "curriculum.regrade",
    );
  });

  it("does not reach the academy axis for a suspended account", async () => {
    // USER_SUSPENDED is true of the caller everywhere. Falling through would
    // ask the same question of a different service and answer it worse.
    const { prisma } = createPrisma([{ submissionId: "s1", userId: "u1" }]);
    const platform = {
      requirePermission: vi
        .fn()
        .mockRejectedValue(new AppException("USER_SUSPENDED")),
    };
    const academy = { requirePermission: vi.fn() };
    const service = new RegradeService(
      prisma,
      platform as never,
      academy as never,
      audit as never,
      config as never,
    );

    await expect(
      service.planRegrade(identity, { academyId, materialId }, context),
    ).rejects.toMatchObject({ code: "USER_SUSPENDED" });
    expect(academy.requirePermission).not.toHaveBeenCalled();
  });

  it("refuses an unscoped run list to anyone but an operator", async () => {
    // "Every run on Cove" would be one academy reading about other customers.
    const { prisma } = createPrisma();
    const platform = denyPlatform();
    const academy = { requirePermission: vi.fn() };
    const service = new RegradeService(
      prisma,
      platform as never,
      academy as never,
      audit as never,
      config as never,
    );

    await expect(
      service.runs(identity, { limit: 20 }),
    ).rejects.toMatchObject({ code: "PLATFORM_ACCESS_DENIED" });
    expect(academy.requirePermission).not.toHaveBeenCalled();
  });
});

describe("staleProblems truncation", () => {
  const inFlightFindMany = vi.fn().mockResolvedValue([]);
  /** The `where` the board used to decide which problems are already claimed. */
  const inFlightWhere = () =>
    inFlightFindMany.mock.calls.at(-1)![0].where as {
      OR: [
        { status: string; createdAt: { gte: Date } },
        { status: string; startedAt: { gte: Date } },
      ];
    };

  /** A board service whose raw query returns `count` stale problems. */
  function boardService(count: number) {
    const rows = Array.from({ length: count }, (_, i) => ({
      materialId: `m${i}`,
      currentRevision: 2,
      staleCount: 3,
      studentCount: 2,
    }));
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue(rows),
      material: {
        findMany: vi.fn().mockResolvedValue(
          rows.map((row) => ({
            id: row.materialId,
            title: `Problem ${row.materialId}`,
            lecture: {
              title: "Lecture",
              courseModule: {
                title: "Module",
                course: { id: "c1", title: "Course" },
              },
            },
          })),
        ),
      },
      platformOperationRun: { findMany: inFlightFindMany },
    } as never;
    return new RegradeService(
      prisma,
      access as never,
      academyAccess as never,
      audit as never,
      config as never,
    );
  }

  it("says so when more problems are stale than it can show", async () => {
    // An academy that bulk-imported a curriculum bumps every revision at once.
    // A board that quietly showed the first two hundred would let somebody
    // believe they had finished.
    const board = await boardService(STALE_PROBLEMS_MAX + 1).staleProblems(
      identity,
      { academyId },
    );

    expect(board.truncated).toBe(true);
    expect(board.rows).toHaveLength(STALE_PROBLEMS_MAX);
  });

  it("does not claim there are more when the page is merely full", async () => {
    // Exactly at the ceiling is not truncation. The query asks for one extra
    // row precisely so this is a fact rather than a guess.
    const board = await boardService(STALE_PROBLEMS_MAX).staleProblems(
      identity,
      { academyId },
    );

    expect(board.truncated).toBe(false);
    expect(board.rows).toHaveLength(STALE_PROBLEMS_MAX);
  });

  it("ignores a claim old enough to be abandoned, so the board is not deadlocked", async () => {
    // The deadlock this prevents: an abandoned plan marked the problem as
    // running, the running label replaced the button that selects it, and the
    // sweep that frees it only runs when somebody plans — which they no longer
    // could. The board applies the same cutoff as a filter.
    const service = boardService(1);
    await service.staleProblems(identity, { academyId });

    const where = inFlightWhere();
    expect(where.OR).toHaveLength(2);
    expect(where.OR[0]).toMatchObject({ status: "PLANNING" });
    expect(where.OR[0].createdAt.gte).toBeInstanceOf(Date);
    expect(where.OR[1]).toMatchObject({ status: "RUNNING" });
    expect(where.OR[1].startedAt.gte).toBeInstanceOf(Date);
  });

  it("reports an empty academy as finished, not truncated", async () => {
    const board = await boardService(0).staleProblems(identity, { academyId });

    expect(board).toEqual({ academyId, rows: [], truncated: false });
  });
});

describe("releasing a slot nobody is using", () => {
  /** A service whose run table records the `updateMany` calls made against it. */
  function releasingService() {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([{ submissionId: "s1", userId: "u1" }]),
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
        typeof fn === "function"
          ? fn({
              platformOperationRun: {
                create: vi.fn().mockResolvedValue({ id: "run-1" }),
              },
              auditLog: { create: vi.fn() },
            })
          : fn,
      ),
      material: {
        findFirst: vi.fn().mockResolvedValue({
          title: "Two Sum",
          programmingExercise: { gradingRevision: 3 },
        }),
      },
      platformOperationRun: {
        create: vi.fn().mockResolvedValue({ id: "run-1" }),
        findUnique: vi.fn().mockResolvedValue({ academyId }),
        updateMany,
      },
    } as never;
    return {
      updateMany,
      service: new RegradeService(
        prisma,
        access as never,
        academyAccess as never,
        audit as never,
        config as never,
      ),
    };
  }

  it("frees an abandoned plan and a lost run before claiming", async () => {
    // A plan claims its problem the moment it is counted. Without this, a
    // closed tab would hold that problem forever and the board would report it
    // as running while nothing ran.
    const { service, updateMany } = releasingService();

    await service.planRegrade(identity, { academyId, materialId }, context);

    const reasons = updateMany.mock.calls.map(
      ([call]) => call.data.failureReason,
    );
    expect(reasons).toEqual(["PLAN_ABANDONED", "RUN_LOST"]);
    // Only rows old enough to be abandoned, never a plan somebody is reading.
    expect(updateMany.mock.calls[0][0].where.createdAt.lt).toBeInstanceOf(Date);
    expect(updateMany.mock.calls[0][0].where.status).toBe("PLANNING");
    expect(updateMany.mock.calls[1][0].where.status).toBe("RUNNING");
  });

  it("cancels a plan the reader closed, and says it did", async () => {
    const { service, updateMany } = releasingService();

    await expect(service.cancelPlan(identity, { runId: "run-1" })).resolves
      .toEqual({ cancelled: true });
    const cancel = updateMany.mock.calls.at(-1)![0];
    expect(cancel.where).toMatchObject({ id: "run-1", status: "PLANNING" });
    expect(cancel.data.failureReason).toBe("PLAN_CANCELLED");
  });

  it("cannot cancel a run that already started", async () => {
    // Filtered on PLANNING, so a confirm that landed first wins the race and a
    // late cancel cannot stop work that is already dispatching.
    const { service, updateMany } = releasingService();
    updateMany.mockResolvedValue({ count: 0 });

    await expect(service.cancelPlan(identity, { runId: "run-1" })).resolves
      .toEqual({ cancelled: false });
  });
});
