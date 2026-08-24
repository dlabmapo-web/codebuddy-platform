import { ACTIVITY_FLUSH_INTERVAL_MS } from "@cove/shared";
import { describe, expect, it, vi } from "vitest";

import type { PrismaService } from "../database/prisma.service.js";
import type { PointAwardService } from "../points/point-award.service.js";
import { LearningActivityAccumulator } from "./learning-activity.accumulator.js";

/**
 * The accumulator's whole job is refusing to overstate. These tests are mostly
 * about what it does *not* count.
 */

const academyId = "20000000-0000-4000-8000-000000000001";
const membershipId = "80000000-0000-4000-8000-000000000001";
const courseId = "40000000-0000-4000-8000-000000000001";
const classId = "50000000-0000-4000-8000-000000000001";

type Applied = {
  flushId: string;
  seconds: number;
  intervals: number;
  localDate: string;
};

/** An in-memory stand-in for the transaction, receipts included. */
function createPrisma() {
  const receipts = new Set<string>();
  const days = new Map<string, { seconds: number; intervals: number }>();

  const tx = {
    // The award path reads both of these back inside the same transaction.
    // Stubbing them is not optional: `awardPoints` deliberately does not catch,
    // so a missing model here would abort the flush rather than be ignored.
    academy: {
      findUnique: vi.fn(async () => ({ timeZone: "Asia/Seoul" })),
    },
    learningActivityFlush: {
      createMany: vi.fn(async ({ data }: { data: { id: string } }) => {
        if (receipts.has(data.id)) return { count: 0 };
        receipts.add(data.id);
        return { count: 1 };
      }),
    },
    studentCourseLearningDay: {
      upsert: vi.fn(
        async (args: {
          where: {
            academyId_membershipId_courseId_localDate: { localDate: Date };
          };
          create: { activeSeconds: number; activeIntervals: number };
          update: {
            activeSeconds: { increment: number };
            activeIntervals: { increment: number };
          };
        }) => {
          const key =
            args.where.academyId_membershipId_courseId_localDate.localDate.toISOString();
          const existing = days.get(key);
          if (!existing) {
            days.set(key, {
              seconds: args.create.activeSeconds,
              intervals: args.create.activeIntervals,
            });
            return;
          }
          existing.seconds += args.update.activeSeconds.increment;
          existing.intervals += args.update.activeIntervals.increment;
        },
      ),
      aggregate: vi.fn(async () => ({
        _sum: { activeSeconds: 0 },
        _min: { firstActiveAt: new Date() },
      })),
    },
    studentClassCourseLearningDay: {
      upsert: vi.fn().mockResolvedValue(undefined),
      aggregate: vi.fn(async () => ({
        _sum: { activeSeconds: 0 },
        _min: { firstActiveAt: new Date() },
      })),
    },
  };

  const prisma = {
    $transaction: vi.fn(
      async (run: (client: typeof tx) => Promise<boolean>) => run(tx),
    ),
    learningActivityFlush: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
  } as unknown as PrismaService;

  return { prisma, tx, days, receipts };
}

/**
 * Points are stubbed here. What this suite owns is counted time; that the
 * flush transaction offers its day to the award service is asserted where the
 * awards themselves are tested.
 */
function createPoints() {
  return {
    awardLearningTime: vi.fn().mockResolvedValue(undefined),
    awardAttendance: vi.fn().mockResolvedValue(undefined),
  } as unknown as PointAwardService;
}

function createAccumulator() {
  const { prisma, tx, days, receipts } = createPrisma();
  // No Redis: the accumulator keeps its open interval in process memory, which
  // is the deployment every test and every single-node dev environment uses.
  const accumulator = new LearningActivityAccumulator(prisma, null, createPoints());
  return { accumulator, prisma, tx, days, receipts };
}

const signal = (now: number, active = true) => ({
  academyId,
  membershipId,
  classId,
  courseId,
  active,
  now,
});

/** Seconds written across every flush so far. */
function totalSeconds(days: Map<string, { seconds: number }>): number {
  return [...days.values()].reduce((sum, day) => sum + day.seconds, 0);
}

describe("LearningActivityAccumulator", () => {
  const start = Date.parse("2026-08-13T02:00:00Z"); // 11:00 in Seoul

  it("writes nothing for a single beat", async () => {
    const { accumulator, days } = createAccumulator();
    await accumulator.record(signal(start));
    expect(totalSeconds(days)).toBe(0);
  });

  it("flushes at most once a minute, with the seconds actually observed", async () => {
    const { accumulator, days, tx } = createAccumulator();
    // Four beats, fifteen seconds apart: the first opens the interval, the
    // next three buy fifteen seconds each. Still inside the minute.
    for (let index = 0; index <= 3; index += 1) {
      await accumulator.record(signal(start + index * 15_000));
    }
    expect(tx.studentCourseLearningDay.upsert).not.toHaveBeenCalled();

    await accumulator.record(signal(start + ACTIVITY_FLUSH_INTERVAL_MS));
    expect(tx.studentCourseLearningDay.upsert).toHaveBeenCalledTimes(1);
    expect(totalSeconds(days)).toBe(60);
  });

  it("will not buy time for a gap nobody observed", async () => {
    const { accumulator, days } = createAccumulator();
    await accumulator.record(signal(start));
    // Four hours later — a slept laptop. The interval closed; this beat opens
    // a new one and pays for nothing in between.
    await accumulator.record(signal(start + 4 * 3_600_000));
    await accumulator.record(signal(start + 4 * 3_600_000 + 15_000));
    await accumulator.record(
      signal(start + 4 * 3_600_000 + ACTIVITY_FLUSH_INTERVAL_MS + 15_000),
    );
    expect(totalSeconds(days)).toBe(15);
  });

  it("closes the interval on an inactive beat and keeps what was earned", async () => {
    const { accumulator, days } = createAccumulator();
    await accumulator.record(signal(start));
    await accumulator.record(signal(start + 15_000));
    // Idle: the tab is open, the student is not working.
    await accumulator.record(signal(start + 30_000, false));
    expect(totalSeconds(days)).toBe(15);

    // A later beat starts a fresh interval rather than resuming the old one.
    await accumulator.record(signal(start + 45_000));
    expect(totalSeconds(days)).toBe(15);
  });

  it("keeps a clean disconnect's final minute", async () => {
    const { accumulator, days } = createAccumulator();
    await accumulator.record(signal(start));
    await accumulator.record(signal(start + 15_000));
    await accumulator.close(membershipId, classId, courseId);
    expect(totalSeconds(days)).toBe(15);

    // The state is gone, so closing twice cannot write the same seconds again.
    await accumulator.close(membershipId, classId, courseId);
    expect(totalSeconds(days)).toBe(15);
  });

  it("splits a session across academy-local midnight", async () => {
    const { accumulator, days } = createAccumulator();
    const start2320 = Date.parse("2026-08-13T14:59:20Z"); // 23:59:20 Seoul
    for (const offset of [0, 15_000, 30_000, 45_000, 60_000]) {
      await accumulator.record(signal(start2320 + offset));
    }
    await accumulator.close(membershipId, classId, courseId);

    const dates = [...days.keys()].sort();
    expect(dates).toEqual([
      "2026-08-13T00:00:00.000Z",
      "2026-08-14T00:00:00.000Z",
    ]);
    // The two beats before midnight belong to the 13th; the ones after do not
    // get backdated into it, and the interval spanning midnight is not lost.
    expect(days.get("2026-08-13T00:00:00.000Z")?.seconds).toBe(30);
    expect(days.get("2026-08-14T00:00:00.000Z")?.seconds).toBe(30);
  });

  it("makes a retried flush a no-op", async () => {
    const { accumulator, days, tx } = createAccumulator();
    const increment: Applied & {
      academyId: string;
      membershipId: string;
      classId: string;
      courseId: string;
      firstActiveAt: Date;
      lastActiveAt: Date;
    } = {
      flushId: "10000000-0000-4000-8000-00000000000f",
      academyId,
      membershipId,
      classId,
      courseId,
      localDate: "2026-08-13",
      seconds: 45,
      intervals: 1,
      firstActiveAt: new Date(start),
      lastActiveAt: new Date(start + 45_000),
    };

    expect(await accumulator.apply(increment)).toBe(true);
    expect(await accumulator.apply(increment)).toBe(true);
    expect(totalSeconds(days)).toBe(45);
    expect(tx.studentCourseLearningDay.upsert).toHaveBeenCalledTimes(1);
  });

  it("reports a failed flush rather than pretending it landed", async () => {
    const prisma = {
      $transaction: vi.fn(async () => {
        throw new Error("connection reset");
      }),
    } as unknown as PrismaService;
    const accumulator = new LearningActivityAccumulator(prisma, null, createPoints());

    expect(
      await accumulator.apply({
        flushId: "10000000-0000-4000-8000-00000000000e",
        academyId,
        membershipId,
      classId,
        courseId,
        localDate: "2026-08-13",
        seconds: 30,
        intervals: 1,
        firstActiveAt: new Date(start),
        lastActiveAt: new Date(start + 30_000),
      }),
    ).toBe(false);
  });

  it("retries an ambiguous commit with the same flush ID", async () => {
    const { accumulator, prisma, tx, days } = createAccumulator();
    const transaction = vi.mocked(prisma.$transaction);
    transaction.mockImplementationOnce(async (run) => {
      await run(tx as never);
      throw new Error("connection lost after commit");
    });

    await accumulator.record(signal(start));
    await accumulator.record(signal(start + 15_000));
    await accumulator.close(membershipId, classId, courseId);
    expect(totalSeconds(days)).toBe(15);

    // The state survived close. Its second attempt finds the same receipt and
    // cannot add the already-committed seconds again.
    await accumulator.close(membershipId, classId, courseId);
    expect(totalSeconds(days)).toBe(15);
    expect(tx.studentCourseLearningDay.upsert).toHaveBeenCalledTimes(1);
  });

  it("retains a failed close until a later retry succeeds", async () => {
    const { accumulator, prisma, days } = createAccumulator();
    vi.mocked(prisma.$transaction).mockRejectedValueOnce(
      new Error("database unavailable"),
    );

    await accumulator.record(signal(start));
    await accumulator.record(signal(start + 15_000));
    await accumulator.close(membershipId, classId, courseId);
    expect(totalSeconds(days)).toBe(0);

    await accumulator.close(membershipId, classId, courseId);
    expect(totalSeconds(days)).toBe(15);
  });

  it("retries a disconnected student's frozen increment in the background", async () => {
    vi.useFakeTimers();
    const { accumulator, prisma, days } = createAccumulator();
    vi.mocked(prisma.$transaction).mockRejectedValueOnce(
      new Error("database unavailable"),
    );
    accumulator.onModuleInit();

    await accumulator.record(signal(start));
    await accumulator.record(signal(start + 15_000));
    await accumulator.close(membershipId, classId, courseId);
    expect(totalSeconds(days)).toBe(0);

    await vi.advanceTimersByTimeAsync(ACTIVITY_FLUSH_INTERVAL_MS);
    expect(totalSeconds(days)).toBe(15);
    accumulator.onModuleDestroy();
    vi.useRealTimers();
  });
});
