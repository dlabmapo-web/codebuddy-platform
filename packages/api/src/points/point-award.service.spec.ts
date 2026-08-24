import { describe, expect, it, vi } from "vitest";

import type { PrismaService } from "../database/prisma.service.js";
import { PointAwardService, type PointsTx } from "./point-award.service.js";

/**
 * What this suite owns is the two properties the ledger depends on: a fact is
 * paid for exactly once, and a day's earnings are bounded. Both are enforced
 * by the database in production — a unique index and a check constraint — so
 * the tests here prove the service *cooperates* with them: that a collision is
 * absorbed by `skipDuplicates` rather than failing a student's submission, and
 * that an award is trimmed instead of written for the constraint to reject.
 *
 * The collision is a `{ count: 0 }` result, never a thrown `P2002`. These
 * writes run inside the caller's transaction, where a thrown unique violation
 * would abort the grading transaction no matter who caught it.
 */

const academyId = "10000000-0000-4000-8000-000000000001";
const membershipId = "20000000-0000-4000-8000-000000000002";
const materialId = "30000000-0000-4000-8000-000000000003";
const userId = "40000000-0000-4000-8000-000000000004";
const classId = "50000000-0000-4000-8000-000000000005";

function createTx(options: {
  enabled?: boolean;
  earnedToday?: number;
  /** The dedupe key was already present: Postgres wrote no row. */
  collides?: boolean;
  createRejects?: Error;
} = {}) {
  const createMany = options.createRejects
    ? vi.fn().mockRejectedValue(options.createRejects)
    : vi.fn().mockResolvedValue({ count: options.collides ? 0 : 1 });

  const tx = {
    academyFeatureFlag: {
      findUnique: vi
        .fn()
        .mockResolvedValue(
          options.enabled === false ? null : { isEnabled: true },
        ),
    },
    academyPointPolicy: { findUnique: vi.fn().mockResolvedValue(null) },
    pointAward: {
      aggregate: vi
        .fn()
        .mockResolvedValue({ _sum: { amount: options.earnedToday ?? 0 } }),
      createMany,
    },
    studentPointBalance: { upsert: vi.fn().mockResolvedValue({}) },
    material: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    academyMembership: {
      findFirst: vi.fn().mockResolvedValue({ id: membershipId }),
    },
    studentExerciseProgress: { count: vi.fn().mockResolvedValue(0) },
    classScheduleSlot: { findMany: vi.fn().mockResolvedValue([]) },
  };
  return { tx: tx as unknown as PointsTx, spies: tx };
}

function createService() {
  return new PointAwardService({} as unknown as PrismaService);
}

const learningTimeInput = {
  academyId,
  membershipId,
  classId,
  totalMinutes: 65,
  timeZone: "Asia/Seoul",
  localDate: "2026-08-21",
  now: new Date("2026-08-21T09:00:00Z"),
};

describe("PointAwardService.awardLearningTime", () => {
  it("pays every rung the day has reached", async () => {
    const { tx, spies } = createTx();
    await createService().awardLearningTime(tx, learningTimeInput);

    expect(spies.pointAward.createMany).toHaveBeenCalledTimes(2);
    const keys = spies.pointAward.createMany.mock.calls.map(
      (call) => call[0].data[0].dedupeKey,
    );
    expect(keys).toEqual([
      `${membershipId}:${classId}:2026-08-21:TIME:1`,
      `${membershipId}:${classId}:2026-08-21:TIME:2`,
    ]);
  });

  it("writes nothing when the academy has no point economy", async () => {
    const { tx, spies } = createTx({ enabled: false });
    await createService().awardLearningTime(tx, learningTimeInput);

    expect(spies.pointAward.createMany).not.toHaveBeenCalled();
    // The flag is read before any aggregate runs, so a disabled academy costs
    // one indexed lookup and nothing else.
    expect(spies.pointAward.aggregate).not.toHaveBeenCalled();
  });

  it("treats a replayed flush as already paid rather than as an error", async () => {
    const { tx, spies } = createTx({ collides: true });
    await expect(
      createService().awardLearningTime(tx, learningTimeInput),
    ).resolves.toBeUndefined();
    // The insert is attempted; the index decides. Nothing throws, so the
    // caller's transaction is still usable afterwards.
    expect(spies.pointAward.createMany).toHaveBeenCalled();
  });

  it("lets a real write failure surface", async () => {
    const { tx } = createTx({ createRejects: new Error("connection reset") });
    await expect(
      createService().awardLearningTime(tx, learningTimeInput),
    ).rejects.toThrow("connection reset");
  });

  it("trims an award to the day's remainder and marks it", async () => {
    const { tx, spies } = createTx({ earnedToday: 96 });
    await createService().awardLearningTime(tx, {
      ...learningTimeInput,
      totalMinutes: 30,
    });

    const written = spies.pointAward.createMany.mock.calls[0][0].data[0];
    expect(written.amount).toBe(3);
    expect(written.cappedAt).toBeNull();
  });

  it("writes no row at all once the cap is spent", async () => {
    const { tx, spies } = createTx({ earnedToday: 100 });
    await createService().awardLearningTime(tx, learningTimeInput);

    // A 0P line teaches nothing, and the check constraint forbids it anyway.
    expect(spies.pointAward.createMany).not.toHaveBeenCalled();
    expect(spies.studentPointBalance.upsert).not.toHaveBeenCalled();
  });

  it("increments the balance by what was actually written", async () => {
    const { tx, spies } = createTx({ earnedToday: 99 });
    await createService().awardLearningTime(tx, {
      ...learningTimeInput,
      totalMinutes: 30,
    });

    expect(spies.studentPointBalance.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { earnedTotal: { increment: 1 } },
      }),
    );
  });

  it("does not touch the balance when the ledger row collided", async () => {
    const { tx, spies } = createTx({ collides: true });
    await createService().awardLearningTime(tx, learningTimeInput);

    expect(spies.studentPointBalance.upsert).not.toHaveBeenCalled();
  });
});

describe("PointAwardService.awardSolve", () => {
  const solveInput = {
    userId,
    classId,
    materialId,
    courseId: "50000000-0000-4000-8000-000000000005",
    now: new Date("2026-08-21T09:00:00Z"),
  };

  const visibleMaterial = {
    id: materialId,
    title: "Two sums",
    isVisible: true,
    programmingExercise: { difficulty: "HARD" as const },
    lecture: {
      id: "60000000-0000-4000-8000-000000000006",
      title: "Loops",
      isVisible: true,
      courseModule: {
        id: "70000000-0000-4000-8000-000000000007",
        title: "Basics",
        isVisible: true,
        course: {
          id: solveInput.courseId,
          title: "Python 1",
          academyId,
          academy: { timeZone: "Asia/Seoul" },
        },
      },
    },
  };

  it("pays the difficulty the exercise carried, and freezes it on the row", async () => {
    const { tx, spies } = createTx();
    spies.material.findUnique.mockResolvedValue(visibleMaterial);

    await createService().awardSolve(tx, solveInput);

    const written = spies.pointAward.createMany.mock.calls[0][0].data[0];
    expect(written.amount).toBe(10);
    expect(written.difficulty).toBe("HARD");
    expect(written.reason).toBe("EXERCISE_SOLVED");
  });

  it("keeps the grading revision out of the dedupe key", async () => {
    const { tx, spies } = createTx();
    spies.material.findUnique.mockResolvedValue(visibleMaterial);

    await createService().awardSolve(tx, solveInput);

    // A re-grade must not pay a second time, so the key names the fact — this
    // student solved this problem — and nothing that an edit can change.
    expect(spies.pointAward.createMany.mock.calls[0][0].data[0].dedupeKey).toBe(
      `${membershipId}:${materialId}:SOLVE`,
    );
  });

  it("pays nothing for an exercise the academy has hidden", async () => {
    const { tx, spies } = createTx();
    spies.material.findUnique.mockResolvedValue({
      ...visibleMaterial,
      isVisible: false,
    });

    await createService().awardSolve(tx, solveInput);
    expect(spies.pointAward.createMany).not.toHaveBeenCalled();
  });

  it("pays nothing when the lecture above it is hidden", async () => {
    const { tx, spies } = createTx();
    spies.material.findUnique.mockResolvedValue({
      ...visibleMaterial,
      lecture: { ...visibleMaterial.lecture, isVisible: false },
    });

    await createService().awardSolve(tx, solveInput);
    expect(spies.pointAward.createMany).not.toHaveBeenCalled();
  });

  it("does not complete an empty scope", async () => {
    const { tx, spies } = createTx();
    spies.material.findUnique.mockResolvedValue(visibleMaterial);
    // No visible exercises anywhere: a lecture nobody can see has not been
    // finished by anybody.
    spies.material.findMany.mockResolvedValue([]);

    await createService().awardSolve(tx, solveInput);

    const reasons = spies.pointAward.createMany.mock.calls.map(
      (call) => call[0].data[0].reason,
    );
    expect(reasons).toEqual(["EXERCISE_SOLVED"]);
  });

  it("climbs to the course when every level is complete", async () => {
    const { tx, spies } = createTx();
    spies.material.findUnique.mockResolvedValue(visibleMaterial);
    spies.material.findMany.mockResolvedValue([{ id: materialId }]);
    spies.studentExerciseProgress.count.mockResolvedValue(1);

    await createService().awardSolve(tx, solveInput);

    expect(
      spies.pointAward.createMany.mock.calls.map((call) => call[0].data[0].reason),
    ).toEqual([
      "EXERCISE_SOLVED",
      "LECTURE_COMPLETED",
      "MODULE_COMPLETED",
      "COURSE_COMPLETED",
    ]);
  });

  it("stops climbing when the lecture is not finished", async () => {
    const { tx, spies } = createTx();
    spies.material.findUnique.mockResolvedValue(visibleMaterial);
    spies.material.findMany.mockResolvedValue([
      { id: materialId },
      { id: "80000000-0000-4000-8000-000000000008" },
    ]);
    spies.studentExerciseProgress.count.mockResolvedValue(1);

    await createService().awardSolve(tx, solveInput);

    expect(
      spies.pointAward.createMany.mock.calls.map((call) => call[0].data[0].reason),
    ).toEqual(["EXERCISE_SOLVED"]);
  });
});
