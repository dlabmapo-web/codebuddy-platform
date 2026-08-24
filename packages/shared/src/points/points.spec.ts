import { describe, expect, it } from "vitest";

import {
  DEFAULT_POINT_POLICY,
  applyDailyCap,
  learningTiersReached,
  pointsForSolve,
} from "./policy.js";
import {
  isoWeekday,
  previousPointsPeriod,
  resolvePointsPeriod,
} from "./period.js";
import {
  overviewPointsBoardInputSchema,
  overviewPointsBoardSchema,
  resolveComparisonSurface,
} from "./points.js";
import { rankEntries, rankGap } from "./ranking.js";

const seoul = "Asia/Seoul";

describe("pointsForSolve", () => {
  it("pays more for a harder problem", () => {
    expect(pointsForSolve("EASY")).toBe(3);
    expect(pointsForSolve("MEDIUM")).toBe(5);
    expect(pointsForSolve("HARD")).toBe(10);
  });

  it("keeps HARD worth more than three EASY solves", () => {
    // The whole point of the multiplier: grinding must not beat attempting.
    expect(pointsForSolve("HARD")).toBeGreaterThan(3 * pointsForSolve("EASY"));
  });

  it("reads an academy's own policy", () => {
    const policy = { ...DEFAULT_POINT_POLICY, solveHard: 25 };
    expect(pointsForSolve("HARD", policy)).toBe(25);
  });
});

describe("learningTiersReached", () => {
  it("pays nothing below the first rung", () => {
    expect(learningTiersReached(29)).toEqual([]);
  });

  it("pays every rung at or below the total, so a jump pays both", () => {
    expect(learningTiersReached(75).map((tier) => tier.tier)).toEqual([1, 2]);
  });

  it("pays the exact boundary", () => {
    expect(learningTiersReached(30).map((tier) => tier.tier)).toEqual([1]);
  });

  it("stops at the top rung", () => {
    expect(learningTiersReached(600).map((tier) => tier.tier)).toEqual([1, 2, 3]);
  });
});

describe("applyDailyCap", () => {
  it("passes an award through under the cap", () => {
    expect(applyDailyCap(10, 20)).toEqual({ amount: 10, capped: false });
  });

  it("truncates rather than skipping, so the ledger can say why", () => {
    expect(applyDailyCap(10, 95)).toEqual({ amount: 5, capped: true });
  });

  it("never returns a negative amount", () => {
    expect(applyDailyCap(10, 500)).toEqual({ amount: 0, capped: true });
  });
});

describe("resolvePointsPeriod", () => {
  // 2026-08-21 is a Friday. 22:00 UTC is already Saturday in Seoul.
  const fridayEvening = new Date("2026-08-21T09:00:00Z");

  it("gives one academy-local day", () => {
    const period = resolvePointsPeriod("day", fridayEvening, seoul);
    expect(period.startDate).toBe("2026-08-21");
    expect(period.endDate).toBe("2026-08-21");
  });

  it("does not split an evening class across two dates", () => {
    // 20:00 Seoul on the 21st, which is 11:00 UTC — still the 21st locally.
    const period = resolvePointsPeriod("day", new Date("2026-08-21T11:00:00Z"), seoul);
    expect(period.startDate).toBe("2026-08-21");
  });

  it("starts the week on Monday", () => {
    const period = resolvePointsPeriod("week", fridayEvening, seoul);
    expect(period.startDate).toBe("2026-08-17");
    expect(period.endDate).toBe("2026-08-23");
    expect(isoWeekday(period.startDate)).toBe(1);
  });

  it("keeps a Sunday inside the week it ends", () => {
    const sunday = new Date("2026-08-23T03:00:00Z");
    const period = resolvePointsPeriod("week", sunday, seoul);
    expect(period.startDate).toBe("2026-08-17");
  });

  it("runs a month from the 1st to the last day", () => {
    const period = resolvePointsPeriod("month", fridayEvening, seoul);
    expect(period.startDate).toBe("2026-08-01");
    expect(period.endDate).toBe("2026-08-31");
  });

  it("ends February on the 28th in a common year", () => {
    const period = resolvePointsPeriod("month", new Date("2026-02-10T03:00:00Z"), seoul);
    expect(period.endDate).toBe("2026-02-28");
  });

  it("closes the period at the start of the following day", () => {
    const period = resolvePointsPeriod("day", fridayEvening, seoul);
    expect(period.endsAt.getTime()).toBeGreaterThan(period.startsAt.getTime());
    expect(period.endsAt.getTime() - period.startsAt.getTime()).toBe(86_400_000);
  });

  it("survives a zone that observes daylight saving", () => {
    // 2026-03-08 is the US spring-forward. The day is 23 hours long and must
    // still be exactly one calendar day.
    const period = resolvePointsPeriod(
      "day",
      new Date("2026-03-08T18:00:00Z"),
      "America/New_York",
    );
    expect(period.startDate).toBe("2026-03-08");
    expect(period.endDate).toBe("2026-03-08");
    expect(period.endsAt.getTime() - period.startsAt.getTime()).toBe(23 * 3_600_000);
  });
});

describe("previousPointsPeriod", () => {
  it("steps back one day", () => {
    const period = resolvePointsPeriod("day", new Date("2026-08-21T03:00:00Z"), seoul);
    expect(previousPointsPeriod(period).startDate).toBe("2026-08-20");
  });

  it("steps back one week", () => {
    const period = resolvePointsPeriod("week", new Date("2026-08-21T03:00:00Z"), seoul);
    const previous = previousPointsPeriod(period);
    expect(previous.startDate).toBe("2026-08-10");
    expect(previous.endDate).toBe("2026-08-16");
  });

  it("steps back one month across a year boundary", () => {
    const period = resolvePointsPeriod("month", new Date("2026-01-15T03:00:00Z"), seoul);
    const previous = previousPointsPeriod(period);
    expect(previous.startDate).toBe("2025-12-01");
    expect(previous.endDate).toBe("2025-12-31");
  });
});

describe("rankEntries", () => {
  const entry = (
    membershipId: string,
    points: number,
    solvedProblems = 0,
    activeDays = 0,
  ) => ({ membershipId, points, solvedProblems, activeDays });

  it("orders by points descending", () => {
    const ranked = rankEntries([entry("a", 10), entry("b", 30), entry("c", 20)]);
    expect(ranked.map((row) => row.membershipId)).toEqual(["b", "c", "a"]);
    expect(ranked.map((row) => row.position)).toEqual([1, 2, 3]);
  });

  it("shares a position on a tie and skips the next", () => {
    const ranked = rankEntries([entry("a", 30), entry("b", 30), entry("c", 10)]);
    expect(ranked.map((row) => row.position)).toEqual([1, 1, 3]);
  });

  it("breaks a points tie on problems solved", () => {
    const ranked = rankEntries([entry("a", 30, 2), entry("b", 30, 5)]);
    expect(ranked.map((row) => row.membershipId)).toEqual(["b", "a"]);
    expect(ranked.map((row) => row.position)).toEqual([1, 2]);
  });

  it("breaks a full tie stably without letting the id decide a position", () => {
    const ranked = rankEntries([entry("z", 30), entry("a", 30)]);
    expect(ranked.map((row) => row.membershipId)).toEqual(["a", "z"]);
    expect(ranked.map((row) => row.position)).toEqual([1, 1]);
  });

  it("does not order on active days above points", () => {
    const ranked = rankEntries([entry("a", 10, 0, 30), entry("b", 20, 0, 1)]);
    expect(ranked[0].membershipId).toBe("b");
  });
});

describe("rankGap", () => {
  const rows = rankEntries([
    { membershipId: "a", points: 50, solvedProblems: 5, activeDays: 1 },
    { membershipId: "b", points: 38, solvedProblems: 4, activeDays: 1 },
    { membershipId: "c", points: 12, solvedProblems: 1, activeDays: 1 },
  ]);

  it("points one row up for anyone who is not first", () => {
    expect(rankGap(rows, "b")).toEqual({ kind: "chase", points: 12 });
    expect(rankGap(rows, "c")).toEqual({ kind: "chase", points: 26 });
  });

  it("inverts into a lead for the leader", () => {
    expect(rankGap(rows, "a")).toEqual({ kind: "lead", points: 12 });
  });

  it("treats a tie as level rather than behind", () => {
    const tied = rankEntries([
      { membershipId: "a", points: 20, solvedProblems: 1, activeDays: 1 },
      { membershipId: "b", points: 20, solvedProblems: 1, activeDays: 1 },
    ]);
    expect(rankGap(tied, "a")).toEqual({ kind: "alone" });
  });

  it("says nothing about a student who is not on the board", () => {
    expect(rankGap(rows, "missing")).toEqual({ kind: "alone" });
  });
});

describe("resolveComparisonSurface", () => {
  it("lets the leaderboard supersede the standing when both are on", () => {
    // §18.2 — two comparison surfaces computed differently will eventually
    // disagree, and neither a student nor their teacher could say which is
    // right. So the newer one wins and the older one goes dark.
    expect(
      resolveComparisonSurface([
        "STUDENT_CLASS_STANDING",
        "STUDENT_POINTS",
        "STUDENT_CLASS_LEADERBOARD",
      ]),
    ).toEqual({ standing: false, points: true });
  });

  it("leaves the standing alone when the leaderboard is off", () => {
    expect(resolveComparisonSurface(["STUDENT_CLASS_STANDING"])).toEqual({
      standing: true,
      points: false,
    });
  });

  it("shows no card for a leaderboard flag without points", () => {
    // §5.2 calls that combination a configuration error. A card that linked to
    // a page the flag cannot open would be a dead link on a child's overview.
    expect(
      resolveComparisonSurface([
        "STUDENT_CLASS_LEADERBOARD",
        "STUDENT_CLASS_STANDING",
      ]),
    ).toEqual({ standing: true, points: false });
  });

  it("shows nothing at all when no flag is on", () => {
    expect(resolveComparisonSurface([])).toEqual({
      standing: false,
      points: false,
    });
  });

  it("never returns both", () => {
    for (const flags of [
      [],
      ["STUDENT_CLASS_STANDING"],
      ["STUDENT_POINTS"],
      ["STUDENT_POINTS", "STUDENT_CLASS_LEADERBOARD"],
      ["STUDENT_CLASS_STANDING", "STUDENT_POINTS"],
      ["STUDENT_CLASS_STANDING", "STUDENT_POINTS", "STUDENT_CLASS_LEADERBOARD"],
    ]) {
      const resolved = resolveComparisonSurface(flags);
      expect(resolved.standing && resolved.points).toBe(false);
    }
  });
});

describe("overview points board contract", () => {
  const row = (position: number) => ({
    position,
    displayName: `Student ${position}`,
    avatar: {
      academyImageUrl: null,
      globalImageUrl: null,
      externalAvatarUrl: null,
    },
    points: 100 - position,
    solvedProblems: 0,
    activeDays: 1,
    breakdown: {
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
    },
    improved: false,
    isYou: false,
  });
  const period = {
    kind: "day" as const,
    timeZone: seoul,
    startDate: "2026-08-24",
    endDate: "2026-08-24",
    startsAt: "2026-08-23T15:00:00.000Z",
    endsAt: "2026-08-24T15:00:00.000Z",
  };
  const classId = "10000000-0000-4000-8000-000000000001";

  it("does not accept a period input", () => {
    expect(
      overviewPointsBoardInputSchema.safeParse({
        academyId: classId,
        period: "week",
      }).success,
    ).toBe(false);
  });

  it("bounds the preview at five rows", () => {
    expect(
      overviewPointsBoardSchema.safeParse({
        period,
        leaderboard: {
          eligible: true,
          classId,
          className: "Python A",
          classes: [{ classId, name: "Python A" }],
          participants: 6,
          rows: Array.from({ length: 6 }, (_, index) => row(index + 1)),
          viewer: null,
        },
      }).success,
    ).toBe(false);
  });

  it("rejects a membership id on the child-safe row", () => {
    expect(
      overviewPointsBoardSchema.safeParse({
        period,
        leaderboard: {
          eligible: true,
          classId,
          className: "Python A",
          classes: [{ classId, name: "Python A" }],
          participants: 1,
          rows: [{ ...row(1), membershipId: classId }],
          viewer: null,
        },
      }).success,
    ).toBe(false);
  });
});
