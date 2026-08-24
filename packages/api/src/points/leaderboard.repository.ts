import { Injectable } from "@nestjs/common";
import {
  LEADERBOARD_MAX_ROWS,
  academyLocalDate,
  previousPointsPeriod,
  rankEntries,
  type LeaderboardBreakdown,
  type MemberAvatarUrls,
  type PointsPeriod,
} from "@cove/shared";

import { PrismaService } from "../database/prisma.service.js";
import {
  memberAvatarSelect,
  noMemberAvatar,
  resolveMemberAvatars,
} from "../profile/member-avatars.js";
import { ProfileMediaService } from "../profile/profile-media.service.js";

/**
 * The grouped sums behind one class board.
 *
 * Everything here is period-scoped and recomputed per request. There is no
 * stored standing, no cached position, and no table a rank could persist in —
 * §10.2 requires that a position expire, and the cheapest way to guarantee it
 * is to have nowhere to keep one.
 *
 * `solvedProblems` is counted from the ledger rather than from submissions.
 * The ledger already holds exactly one `EXERCISE_SOLVED` row per first solve,
 * so reading it costs nothing extra and — more importantly — makes it
 * impossible for the board's problem count to disagree with the points beside
 * it.
 */

export type LeaderboardMember = {
  membershipId: string;
  displayName: string;
  avatar: MemberAvatarUrls;
};

/** A breakdown with every count at zero, for a student with no paid facts. */
export function emptyBreakdown(): LeaderboardBreakdown {
  return {
    solvedEasy: 0,
    solvedMedium: 0,
    solvedHard: 0,
    solvedEasyPoints: 0,
    solvedMediumPoints: 0,
    solvedHardPoints: 0,
    solvePoints: 0,
    lectures: 0,
    modules: 0,
    courses: 0,
    finishPoints: 0,
    attendance: 0,
    attendancePoints: 0,
    learningMinutes: 0,
    learningPoints: 0,
  };
}

export type LeaderboardTotals = {
  membershipId: string;
  points: number;
  solvedProblems: number;
  activeDays: number;
};

/** What one student earned in a period, and what it was made of. */
export type LeaderboardTally = {
  points: number;
  solvedProblems: number;
  breakdown: LeaderboardBreakdown;
};

@Injectable()
export class LeaderboardRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: ProfileMediaService,
  ) {}

  /**
   * The class roster, as the board ranks it.
   *
   * Only `ACTIVE` student memberships. A suspended or departed student keeps
   * their ledger — their points are theirs — and simply leaves a comparison
   * they are no longer part of. §10.6.
   */
  async roster(classId: string): Promise<LeaderboardMember[]> {
    const enrollments = await this.prisma.classEnrollment.findMany({
      where: {
        classId,
        membership: { status: "ACTIVE", role: "STUDENT" },
      },
      take: LEADERBOARD_MAX_ROWS,
      select: {
        membershipId: true,
        membership: {
          select: {
            memberProfile: {
              select: {
                academyDisplayName: true,
                ...memberAvatarSelect.memberProfile.select,
              },
            },
            user: {
              select: {
                displayName: true,
                ...memberAvatarSelect.user.select,
              },
            },
          },
        },
      },
    });

    // One signing round trip for the whole class. Signing per row is a
    // response-time problem at thirty members; the helper exists so no surface
    // has to remember that. A failure degrades to the placeholder rather than
    // taking the board down — a missing face is the one thing on this page
    // that can be missing without the page being wrong.
    const avatars = await resolveMemberAvatars(
      this.media,
      enrollments.map((enrollment) => ({
        key: enrollment.membershipId,
        user: enrollment.membership.user,
        memberProfile: enrollment.membership.memberProfile,
      })),
    );

    return enrollments.map((enrollment) => ({
      membershipId: enrollment.membershipId,
      avatar: avatars.get(enrollment.membershipId) ?? noMemberAvatar,
      // The academy-scoped name a manager set, falling back to the account's
      // own display name. Never an email, a username, or an id — §17, which is
      // why the last resort is a dash rather than the username the people
      // directory falls back to. An empty string is not an option: the row
      // schema requires a name, so a student who has neither would otherwise
      // fail validation for the whole class.
      displayName:
        enrollment.membership.memberProfile?.academyDisplayName?.trim() ||
        enrollment.membership.user.displayName?.trim() ||
        "—",
    }));
  }

  /**
   * Points, solves, and the composition behind them, per student, per period.
   *
   * One `GROUP BY` carries all three. Grouping by difficulty as well as reason
   * is what lets the board print *how* a total was made — §10.5 promises a
   * student can work out why somebody is above them, and a bare total leaves
   * them guessing between "solved more" and "solved harder". The extra grouping
   * column costs nothing: the same index already serves the sum.
   *
   * Counted minutes come from a separate projection and are folded in by
   * `withLearningMinutes`, because they are not in the ledger — a point is paid
   * for crossing a threshold, not per minute.
   */
  async totals(
    academyId: string,
    membershipIds: string[],
    period: PointsPeriod,
  ): Promise<Map<string, LeaderboardTally>> {
    if (membershipIds.length === 0) return new Map();

    const rows = await this.prisma.pointAward.groupBy({
      by: ["membershipId", "reason", "difficulty"],
      where: {
        academyId,
        membershipId: { in: membershipIds },
        voidedAt: null,
        createdAt: { gte: period.startsAt, lt: period.endsAt },
      },
      _sum: { amount: true },
      _count: { _all: true },
    });

    const totals = new Map<string, LeaderboardTally>();
    for (const membershipId of membershipIds) {
      totals.set(membershipId, {
        points: 0,
        solvedProblems: 0,
        breakdown: emptyBreakdown(),
      });
    }

    for (const row of rows) {
      const entry = totals.get(row.membershipId);
      if (!entry) continue;
      const count = row._count._all;
      // What was actually paid, not what the rate says it should have been:
      // the daily cap truncates an award, and a derived figure would disagree
      // with the ledger on exactly the days a student worked hardest.
      const amount = row._sum.amount ?? 0;
      entry.points += amount;

      // Every one of the seven reasons lands in exactly one point bucket, so
      // the four buckets sum back to `points` and the board can print a total
      // beside its parts. Adding a reason without a case here would break that
      // silently, which is why there is no `default` to absorb one.
      switch (row.reason) {
        case "EXERCISE_SOLVED": {
          entry.solvedProblems += count;
          entry.breakdown.solvePoints += amount;
          // A row written before difficulty was frozen onto it counts towards
          // the total and towards `solvedProblems`, and lands in no difficulty
          // bucket — the split is allowed to be smaller than the count, and is
          // never allowed to invent a difficulty that was not recorded.
          if (row.difficulty === "EASY") {
            entry.breakdown.solvedEasy += count;
            entry.breakdown.solvedEasyPoints += amount;
          }
          if (row.difficulty === "MEDIUM") {
            entry.breakdown.solvedMedium += count;
            entry.breakdown.solvedMediumPoints += amount;
          }
          if (row.difficulty === "HARD") {
            entry.breakdown.solvedHard += count;
            entry.breakdown.solvedHardPoints += amount;
          }
          break;
        }
        case "LECTURE_COMPLETED":
          entry.breakdown.lectures += count;
          entry.breakdown.finishPoints += amount;
          break;
        case "MODULE_COMPLETED":
          entry.breakdown.modules += count;
          entry.breakdown.finishPoints += amount;
          break;
        case "COURSE_COMPLETED":
          entry.breakdown.courses += count;
          entry.breakdown.finishPoints += amount;
          break;
        case "ATTENDANCE":
        case "ATTENDANCE_LATE":
          // One count for both. Lateness is a fact about a child's morning and
          // not a measurement of their work, and a board that separated them
          // would be publishing it to their classmates.
          entry.breakdown.attendance += count;
          entry.breakdown.attendancePoints += amount;
          break;
        case "LEARNING_TIME":
          entry.breakdown.learningPoints += amount;
          break;
      }
    }
    return totals;
  }

  /**
   * Counted active minutes in the period, folded into a tally already built.
   *
   * The same `StudentCourseLearningDay` projection the overviews report from,
   * so the minutes on this board and the minutes on a teacher's page are the
   * same measurement rather than two that drift.
   */
  async withLearningMinutes(
    totals: Map<string, LeaderboardTally>,
    membershipIds: string[],
    period: PointsPeriod,
  ): Promise<Map<string, LeaderboardTally>> {
    if (membershipIds.length === 0) return totals;

    const rows = await this.prisma.studentCourseLearningDay.groupBy({
      by: ["membershipId"],
      where: {
        membershipId: { in: membershipIds },
        localDate: {
          gte: new Date(`${period.startDate}T00:00:00.000Z`),
          lte: new Date(`${period.endDate}T00:00:00.000Z`),
        },
      },
      _sum: { activeSeconds: true },
    });

    for (const row of rows) {
      const entry = totals.get(row.membershipId);
      if (!entry) continue;
      // Floored: a board that rounds 89 seconds up to 2 minutes is a board
      // whose smallest number is the one nobody can check.
      entry.breakdown.learningMinutes = Math.floor(
        (row._sum.activeSeconds ?? 0) / 60,
      );
    }
    return totals;
  }

  /**
   * Academy-local days with any counted learning, per student.
   *
   * Read from `StudentCourseLearningDay`, the same projection the teacher's
   * and the student's overviews report, so the column on the board and the
   * column on those pages are the same measurement. Grouped by day rather than
   * summed, because a student working in three courses on one Tuesday was
   * present on one day.
   */
  async activeDays(
    membershipIds: string[],
    period: PointsPeriod,
  ): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    for (const membershipId of membershipIds) counts.set(membershipId, 0);
    if (membershipIds.length === 0) return counts;

    const rows = await this.prisma.studentCourseLearningDay.groupBy({
      by: ["membershipId", "localDate"],
      where: {
        membershipId: { in: membershipIds },
        localDate: {
          gte: new Date(`${period.startDate}T00:00:00.000Z`),
          lte: new Date(`${period.endDate}T00:00:00.000Z`),
        },
      },
    });

    for (const row of rows) {
      counts.set(row.membershipId, (counts.get(row.membershipId) ?? 0) + 1);
    }
    return counts;
  }

  /**
   * Which students stood higher in the previous period than they do now.
   *
   * Returns the set that **improved**, and deliberately nothing else. A
   * falling arrow beside a child's name, on a list their classmates are
   * reading, is a small public demotion that teaches nothing; a rising one is
   * information they can use. The asymmetry is the design. §11.5.
   */
  async improvedSince(
    academyId: string,
    members: LeaderboardMember[],
    period: PointsPeriod,
    current: Map<string, number>,
  ): Promise<Set<string>> {
    const membershipIds = members.map((member) => member.membershipId);
    if (membershipIds.length === 0) return new Set();

    const previous = previousPointsPeriod(period);
    const totals = await this.totals(academyId, membershipIds, previous);
    const previousDays = await this.activeDays(membershipIds, previous);

    const previousRanked = rankEntries(
      members.map((member) => ({
        membershipId: member.membershipId,
        points: totals.get(member.membershipId)?.points ?? 0,
        solvedProblems: totals.get(member.membershipId)?.solvedProblems ?? 0,
        activeDays: previousDays.get(member.membershipId) ?? 0,
      })),
    );

    const before = new Map<string, number>(
      previousRanked.map((row) => [row.membershipId, row.position] as const),
    );

    const improved = new Set<string>();
    for (const [membershipId, position] of current) {
      const was = before.get(membershipId);
      if (was !== undefined && position < was) improved.add(membershipId);
    }
    return improved;
  }

  /** The reader's own totals, whether or not any board is rendered. */
  async standingFor(
    academyId: string,
    membershipId: string,
    period: PointsPeriod,
  ): Promise<{ points: number; solvedProblems: number; activeDays: number }> {
    const totals = await this.totals(academyId, [membershipId], period);
    const days = await this.activeDays([membershipId], period);
    const mine = totals.get(membershipId);
    return {
      points: mine?.points ?? 0,
      solvedProblems: mine?.solvedProblems ?? 0,
      activeDays: days.get(membershipId) ?? 0,
    };
  }

  /** Today, as the academy counts it. Used for the ledger's date labels. */
  today(timeZone: string, now: Date): string {
    return academyLocalDate(now, timeZone);
  }
}
