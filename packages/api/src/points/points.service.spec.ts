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

function createService(isSelf: boolean) {
  const members = Array.from({ length: 6 }, (_, index) => ({
    membershipId: `30000000-0000-4000-8000-00000000000${index + 1}`,
    displayName: `Student ${index + 1}`,
    avatar,
  }));
  const membershipId = isSelf
    ? members[5].membershipId
    : "40000000-0000-4000-8000-000000000007";
  const scope: PointsScope = {
    academyId,
    timeZone: "Asia/Seoul",
    membershipId,
    subjectName: "Student 6",
    isSelf,
    classes: [{ classId, name: "Python A" }],
    leaderboardEnabled: true,
  };
  const totals = new Map(
    members.map((member, index) => [
      member.membershipId,
      {
        points: 60 - index * 10,
        solvedProblems: 6 - index,
        breakdown: { ...emptyBreakdown(), solvePoints: 60 - index * 10 },
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
      new Map(members.map((member) => [member.membershipId, 1])),
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

    expect(result.period.kind).toBe("day");
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
