import { describe, expect, it, vi } from "vitest";

import type { PrismaService } from "../database/prisma.service.js";
import type { ProfileMediaService } from "../profile/profile-media.service.js";
import { LeaderboardRepository } from "./leaderboard.repository.js";

const academyId = "10000000-0000-4000-8000-000000000001";
const membershipId = "20000000-0000-4000-8000-000000000002";
const classA = "30000000-0000-4000-8000-000000000003";
const classB = "40000000-0000-4000-8000-000000000004";
const period = {
  kind: "day" as const,
  startDate: "2026-08-24",
  endDate: "2026-08-24",
  startsAt: new Date("2026-08-23T15:00:00Z"),
  endsAt: new Date("2026-08-24T15:00:00Z"),
  timeZone: "Asia/Seoul",
};

describe("LeaderboardRepository class isolation", () => {
  it("filters point totals by the selected class", async () => {
    const groupBy = vi.fn().mockImplementation(({ where }) =>
      Promise.resolve([
        {
          membershipId,
          reason: "EXERCISE_SOLVED",
          difficulty: "EASY",
          _sum: { amount: where.classId === classA ? 3 : 9 },
          _count: { _all: where.classId === classA ? 1 : 3 },
        },
      ]),
    );
    const repository = new LeaderboardRepository(
      { pointAward: { groupBy } } as unknown as PrismaService,
      {} as ProfileMediaService,
    );

    const a = await repository.totals(academyId, classA, [membershipId], period);
    const b = await repository.totals(academyId, classB, [membershipId], period);

    expect(a.get(membershipId)).toMatchObject({ points: 3, solvedProblems: 1 });
    expect(b.get(membershipId)).toMatchObject({ points: 9, solvedProblems: 3 });
    expect(groupBy.mock.calls.map(([args]) => args.where.classId)).toEqual([
      classA,
      classB,
    ]);
  });

  it("reads minutes and active days from the class-aware projection", async () => {
    const groupBy = vi
      .fn()
      .mockResolvedValueOnce([
        { membershipId, _sum: { activeSeconds: 480 } },
      ])
      .mockResolvedValueOnce([
        { membershipId, localDate: new Date("2026-08-24T00:00:00Z") },
      ]);
    const repository = new LeaderboardRepository(
      { studentClassCourseLearningDay: { groupBy } } as unknown as PrismaService,
      {} as ProfileMediaService,
    );
    const totals = new Map([
      [membershipId, { points: 0, solvedProblems: 0, breakdown: {
        solvedEasy: 0, solvedMedium: 0, solvedHard: 0,
        solvedEasyPoints: 0, solvedMediumPoints: 0, solvedHardPoints: 0,
        solvePoints: 0, lectures: 0, modules: 0, courses: 0,
        finishPoints: 0, attendance: 0, attendancePoints: 0,
        learningMinutes: 0, learningPoints: 0,
      } }],
    ]);

    await repository.withLearningMinutes(totals, classA, [membershipId], period);
    const days = await repository.activeDays(classA, [membershipId], period);

    expect(totals.get(membershipId)?.breakdown.learningMinutes).toBe(8);
    expect(days.get(membershipId)).toBe(1);
    expect(groupBy.mock.calls.every(([args]) => args.where.classId === classA)).toBe(true);
  });
});
