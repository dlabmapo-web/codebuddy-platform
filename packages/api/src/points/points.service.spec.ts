import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import type { PrismaService } from "../database/prisma.service.js";
import { emptyBreakdown, type LeaderboardRepository } from "./leaderboard.repository.js";
import type { PointAwardService } from "./point-award.service.js";
import type { PointsAccessService, PointsScope } from "./points-access.service.js";
import { PointsService } from "./points.service.js";

const academyId = "10000000-0000-4000-8000-000000000001";
const classId = "20000000-0000-4000-8000-000000000002";
const identity: SupabaseIdentity = {
  authUserId: "auth-user",
  email: null,
  emailIsPlaceholder: false,
  emailVerified: true,
  username: null,
  displayName: null,
  avatarUrl: null,
  provider: null,
  requestedAcademyId: null,
};

const avatar = {
  academyImageUrl: null,
  globalImageUrl: null,
  externalAvatarUrl: null,
};

function createService(isSelf: boolean, options: { size?: number; points?: (index: number) => number } = {}) {
  const size = options.size ?? 6;
  const pointsFor = options.points ?? ((index: number) => 60 - index * 10);
  const members = Array.from({ length: size }, (_, index) => ({
    membershipId: `30000000-0000-4000-8000-00000000000${index + 1}`,
    displayName: `Student ${index + 1}`,
    avatar,
  }));
  const membershipId = isSelf
    ? members[members.length - 1]!.membershipId
    : "40000000-0000-4000-8000-000000000007";
  const scope: PointsScope = {
    academyId,
    timeZone: "Asia/Seoul",
    membershipId,
    subjectName: `Student ${size}`,
    isSelf,
    classes: [{ classId, name: "Python A" }],
    leaderboardEnabled: true,
  };
  const totals = new Map(
    members.map((member, index) => [
      member.membershipId,
      {
        points: pointsFor(index),
        // Derived from the points rather than the index: a student on nothing
        // has solved nothing, and the board's second ordering key must not be
        // able to separate two students the first one could not.
        solvedProblems: pointsFor(index) > 0 ? Math.max(1, size - index) : 0,
        breakdown: { ...emptyBreakdown(), solvePoints: pointsFor(index) },
      },
    ]),
  );
  const access = {
    resolveOverviewBoard: vi.fn().mockResolvedValue(scope),
  };
  const leaderboard = {
    roster: vi.fn().mockResolvedValue(members),
    totals: vi.fn().mockResolvedValue(totals),
    withLearningMinutes: vi.fn(async (value) => value),
    activeDays: vi.fn().mockResolvedValue(
      new Map(
        members.map((member, index) => [
          member.membershipId,
          pointsFor(index) > 0 ? 1 : 0,
        ]),
      ),
    ),
    improvedSince: vi.fn(),
  };

  return new PointsService(
    {} as PrismaService,
    access as unknown as PointsAccessService,
    {} as PointAwardService,
    leaderboard as unknown as LeaderboardRepository,
  );
}

describe("PointsService.getOverviewBoard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T03:00:00.000Z"));
  });

  afterEach(() => vi.useRealTimers());

  it("returns five child-safe rows and the student's own row below them", async () => {
    const result = await createService(true).getOverviewBoard(identity, {
      academyId,
    });

    // It follows `DEFAULT_POINTS_PERIOD` rather than holding a period of its
    // own, so the overview card and the ranking page cannot drift apart.
    expect(result.period.kind).toBe("all");
    expect(result.leaderboard.eligible).toBe(true);
    if (!result.leaderboard.eligible) return;
    expect(result.leaderboard.rows).toHaveLength(5);
    expect(result.leaderboard.rows.map((row) => row.position)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect(result.leaderboard.viewer).toMatchObject({
      displayName: "Student 6",
      isYou: true,
      position: 6,
    });
    expect(result.leaderboard.rows[0]).not.toHaveProperty("membershipId");
    expect(result.leaderboard.viewer).not.toHaveProperty("membershipId");
  });

  it("never returns a viewer row for staff", async () => {
    const result = await createService(false).getOverviewBoard(identity, {
      academyId,
      classId,
    });

    expect(result.leaderboard.eligible).toBe(true);
    if (!result.leaderboard.eligible) return;
    expect(result.leaderboard.viewer).toBeNull();
    expect(result.leaderboard.rows.every((row) => !row.isYou)).toBe(true);
  });
});

/*
 * The floor that used to sit in front of these.
 *
 * Three enrolled students and three of them active, or the board refused. The
 * cases below are the ones it refused, and an academy opening its first class
 * is every one of them in turn.
 */
describe("PointsService, on a class too small for the old floor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T03:00:00.000Z"));
  });

  afterEach(() => vi.useRealTimers());

  it("ranks a class of one", async () => {
    const result = await createService(true, { size: 1 }).getOverviewBoard(
      identity,
      { academyId },
    );

    expect(result.leaderboard.eligible).toBe(true);
    if (!result.leaderboard.eligible) return;
    expect(result.leaderboard.rows).toHaveLength(1);
    expect(result.leaderboard.rows[0]).toMatchObject({ points: 60 });
  });

  it("ranks a class of two, and orders it", async () => {
    const result = await createService(true, { size: 2 }).getOverviewBoard(
      identity,
      { academyId },
    );

    expect(result.leaderboard.eligible).toBe(true);
    if (!result.leaderboard.eligible) return;
    expect(result.leaderboard.rows.map((row) => row.position)).toEqual([1, 2]);
    expect(result.leaderboard.rows.map((row) => row.points)).toEqual([60, 50]);
  });

  it("ranks a class of three where only one of them has earned anything", async () => {
    // The second half of the old floor: three students, but two of them quiet.
    const result = await createService(true, {
      size: 3,
      points: (index) => (index === 0 ? 40 : 0),
    }).getOverviewBoard(identity, { academyId });

    expect(result.leaderboard.eligible).toBe(true);
    if (!result.leaderboard.eligible) return;
    expect(result.leaderboard.rows).toHaveLength(3);
    // The two on nothing tie, which is what a dead heat at zero is.
    expect(result.leaderboard.rows.map((row) => row.position)).toEqual([1, 2, 2]);
  });

  it("still calls a board with nothing on it quiet", async () => {
    // Not the same statement as "too small". A roster of any size that has
    // earned nothing is not a ranking of anything.
    const result = await createService(true, {
      size: 4,
      points: () => 0,
    }).getOverviewBoard(identity, { academyId });

    expect(result.leaderboard.eligible).toBe(false);
    if (result.leaderboard.eligible) return;
    expect(result.leaderboard.reason).toBe("NO_ACTIVITY_YET");
  });

  it("never asks for a period before all time", async () => {
    // `previousPointsPeriod` throws on `all`, so a board that reached for the
    // rising marker here would take the whole page down.
    const service = createService(true, { size: 2 });
    await expect(
      service.getOverviewBoard(identity, { academyId }),
    ).resolves.toBeDefined();
  });
});
