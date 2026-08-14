import { describe, expect, it } from "vitest";

import {
  ACADEMY_TIME_ZONE,
  academyDayStart,
  academyLocalDate,
  addLocalDays,
  localDateRange,
  localDaysBetween,
} from "./academy-time.js";
import {
  attentionRank,
  averageBestScore,
  compareCurriculumReadiness,
  compareDifficultProblems,
  compareTeachingQueue,
  heartbeatActiveSeconds,
  lectureReadiness,
  localDaysSince,
  lowParticipationFloorSeconds,
  meanOfScores,
  medianOf,
  orderAttentionReasons,
  participationAttentionReasons,
  resolveOverviewPeriod,
  sharePercent,
  type CurriculumReadinessRow,
  type DifficultProblem,
  type TeachingQueueStudent,
} from "./teacher-overview.js";

/* ------------------------------------------------------------ period math */

describe("academy-local days", () => {
  it("assigns a late Seoul evening to its own calendar day", () => {
    // 2026-03-02T13:30Z is 22:30 on the 2nd in Seoul, and 2026-03-02T16:00Z is
    // 01:00 on the 3rd. A UTC-day boundary would put both on the 2nd.
    expect(academyLocalDate("2026-03-02T13:30:00Z", ACADEMY_TIME_ZONE)).toBe(
      "2026-03-02",
    );
    expect(academyLocalDate("2026-03-02T16:00:00Z", ACADEMY_TIME_ZONE)).toBe(
      "2026-03-03",
    );
  });

  it("starts a Seoul day at 15:00 the previous UTC day", () => {
    expect(academyDayStart("2026-03-03", ACADEMY_TIME_ZONE).toISOString()).toBe(
      "2026-03-02T15:00:00.000Z",
    );
  });

  it("holds across a daylight-saving transition in a zone that has one", () => {
    // New York moves to -04:00 on 2026-03-08. Both day starts must be local
    // midnight even though the offsets differ.
    expect(academyDayStart("2026-03-07", "America/New_York").toISOString()).toBe(
      "2026-03-07T05:00:00.000Z",
    );
    expect(academyDayStart("2026-03-09", "America/New_York").toISOString()).toBe(
      "2026-03-09T04:00:00.000Z",
    );
    // The short day is still one calendar day long.
    expect(localDaysBetween("2026-03-08", "2026-03-09")).toBe(1);
  });

  it("walks calendar labels across a month boundary", () => {
    expect(addLocalDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addLocalDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(localDateRange("2026-02-27", "2026-03-01")).toEqual([
      "2026-02-27",
      "2026-02-28",
      "2026-03-01",
    ]);
  });
});

describe("resolveOverviewPeriod", () => {
  const now = new Date("2026-08-13T02:00:00Z"); // 11:00 on the 13th in Seoul

  it("counts seven calendar days ending with today", () => {
    const period = resolveOverviewPeriod({
      range: "7d",
      now,
      timeZone: ACADEMY_TIME_ZONE,
    });
    expect(period.startDate).toBe("2026-08-07");
    expect(period.endDate).toBe("2026-08-13");
    expect(period.days).toBe(7);
    // Today counts in full: the period ends at tomorrow's local midnight.
    expect(period.endAt).toBe("2026-08-13T15:00:00.000Z");
    expect(period.startAt).toBe("2026-08-06T15:00:00.000Z");
  });

  it("counts thirty whole days, not thirty days back from this hour", () => {
    const period = resolveOverviewPeriod({
      range: "30d",
      now,
      timeZone: ACADEMY_TIME_ZONE,
    });
    expect(period.startDate).toBe("2026-07-15");
    expect(period.days).toBe(30);
    // A partial Tuesday compared against a whole one is the failure this
    // avoids: the start is a local midnight, never the current hour.
    expect(period.startAt).toBe("2026-07-14T15:00:00.000Z");
  });

  it("has no start at all for all time", () => {
    const period = resolveOverviewPeriod({
      range: "all",
      now,
      timeZone: ACADEMY_TIME_ZONE,
    });
    // Null rather than a very old date: "everything available" is what `all`
    // means, and inventing a boundary would make it a different question.
    expect(period.startAt).toBeNull();
    expect(period.startDate).toBeNull();
    expect(period.days).toBeNull();
    expect(period.endDate).toBe("2026-08-13");
  });

  it("scales the low-participation floor with the period, not with the range name", () => {
    expect(lowParticipationFloorSeconds(7)).toBe(1_800);
    expect(lowParticipationFloorSeconds(30)).toBe(7_714);
    expect(lowParticipationFloorSeconds(null)).toBe(1_800);
  });
});

/* ------------------------------------------------------------- heartbeats */

describe("heartbeatActiveSeconds", () => {
  it("measures nothing for the beat that opens an interval", () => {
    expect(heartbeatActiveSeconds({ lastAcceptedAt: null, now: 1_000 })).toBe(0);
  });

  it("counts the gap since the previous accepted beat", () => {
    expect(
      heartbeatActiveSeconds({ lastAcceptedAt: 60_000, now: 75_000 }),
    ).toBe(15);
    expect(heartbeatActiveSeconds({ lastAcceptedAt: 60_000, now: 68_000 })).toBe(
      8,
    );
  });

  it("caps one beat at the heartbeat cadence", () => {
    expect(
      heartbeatActiveSeconds({ lastAcceptedAt: 0, now: 25_000 }),
    ).toBe(15);
  });

  it("closes the interval rather than filling a long gap", () => {
    // A slept laptop, a hidden tab, or a dropped socket: the next beat starts
    // a new interval and buys nothing for the time nobody observed.
    expect(
      heartbeatActiveSeconds({ lastAcceptedAt: 0, now: 4 * 3_600_000 }),
    ).toBe(0);
    expect(heartbeatActiveSeconds({ lastAcceptedAt: 0, now: 30_001 })).toBe(0);
  });

  it("refuses a clock that ran backwards", () => {
    expect(heartbeatActiveSeconds({ lastAcceptedAt: 5_000, now: 4_000 })).toBe(
      0,
    );
  });
});

/* ---------------------------------------------------------------- metrics */

describe("averageBestScore", () => {
  it("averages best scores over attempted problems only", () => {
    expect(averageBestScore({ scoreSum: 240, attemptedProblems: 3 })).toBe(80);
  });

  it("reports nothing rather than zero when nothing was attempted", () => {
    // §6.4 — the single most misleading number this page could show. A student
    // who has not started is not a student scoring nought.
    expect(averageBestScore({ scoreSum: 0, attemptedProblems: 0 })).toBeNull();
  });

  it("takes a median of an even set without inventing a value outside it", () => {
    expect(medianOf([])).toBeNull();
    expect(medianOf([10, 30, 20])).toBe(20);
    expect(medianOf([10, 20, 30, 40])).toBe(25);
  });

  it("shares a part over a whole, and refuses an empty one", () => {
    expect(sharePercent(3, 12)).toBe(25);
    expect(sharePercent(0, 0)).toBeNull();
  });
});

describe("meanOfScores", () => {
  it("leaves students without a score out of the denominator", () => {
    // Folding the two nulls in as zeros would report 30 for a class where
    // everyone who worked scored 90.
    expect(meanOfScores([90, null, null])).toBe(90);
  });

  it("has no mean when nobody has a score", () => {
    expect(meanOfScores([null, null])).toBeNull();
    expect(meanOfScores([])).toBeNull();
  });
});

describe("lectureReadiness", () => {
  const base = { eligibleStudents: 4, attemptingStudents: 4 };

  it("counts students over the threshold, not the average of their percents", () => {
    // Half finished, half untouched. An average would also say 50 — and it
    // would say 50 for a class where everyone is exactly halfway too, and
    // those are different lessons to teach tomorrow.
    expect(
      lectureReadiness({ ...base, perStudentSolvedPercent: [100, 100, 0, 0] }),
    ).toEqual({ readiness: 50, readyStudents: 2 });
    expect(
      lectureReadiness({ ...base, perStudentSolvedPercent: [50, 50, 50, 50] }),
    ).toEqual({ readiness: 0, readyStudents: 0 });
  });

  it("counts exactly the threshold as ready", () => {
    expect(
      lectureReadiness({
        perStudentSolvedPercent: [80, 79, 90],
        eligibleStudents: 3,
        attemptingStudents: 3,
      }),
    ).toEqual({ readiness: 67, readyStudents: 2 });
  });

  it("refuses a percentage two children happened to produce", () => {
    // §6.8 — below the comparison floor the figure describes a coincidence, so
    // the section shows an explanatory state instead of "0%".
    expect(
      lectureReadiness({
        perStudentSolvedPercent: [100, 0],
        eligibleStudents: 12,
        attemptingStudents: 2,
      }).readiness,
    ).toBeNull();
  });

  it("reports no readiness for a lecture with no roster", () => {
    expect(
      lectureReadiness({
        perStudentSolvedPercent: [],
        eligibleStudents: 0,
        attemptingStudents: 0,
      }),
    ).toEqual({ readiness: null, readyStudents: 0 });
  });
});

describe("compareCurriculumReadiness", () => {
  const lecture = (
    overrides: Partial<CurriculumReadinessRow & { position: number }>,
  ): CurriculumReadinessRow & { position: number } => ({
    lectureId: "00000000-0000-4000-8000-00000000000c",
    lectureTitle: "While",
    moduleTitle: "Loops",
    courseTitle: "Python 1",
    outlineNumber: "2-3",
    eligibleStudents: 12,
    attemptingStudents: 8,
    readyStudents: 3,
    readiness: 25,
    classId: "00000000-0000-4000-8000-00000000000a",
    courseId: "00000000-0000-4000-8000-00000000000d",
    position: 3,
    ...overrides,
  });

  it("puts the least ready lecture first", () => {
    expect(
      compareCurriculumReadiness(
        lecture({ readiness: 10 }),
        lecture({ readiness: 60 }),
      ),
    ).toBeLessThan(0);
  });

  it("prefers the lecture more students have actually reached", () => {
    expect(
      compareCurriculumReadiness(
        lecture({ attemptingStudents: 11 }),
        lecture({ attemptingStudents: 4 }),
      ),
    ).toBeLessThan(0);
  });

  it("falls back to curriculum position so the list never reshuffles", () => {
    expect(
      compareCurriculumReadiness(
        lecture({ position: 1 }),
        lecture({ position: 8 }),
      ),
    ).toBeLessThan(0);
  });
});

/* -------------------------------------------------------------- attention */

describe("participation attention reasons", () => {
  const floorSeconds = lowParticipationFloorSeconds(7);

  it("flags a student with no counted signal and says how long", () => {
    expect(
      participationAttentionReasons({
        activeSeconds: 0,
        submissions: 0,
        daysSinceActivity: 9,
        periodDays: 7,
        floorSeconds,
      }),
    ).toEqual([{ kind: "inactive", value: 9 }]);
  });

  it("falls back to the period length when nobody ever saw them", () => {
    // "Inactive for 0 days" on the emptiest row would be the least useful
    // sentence on the page.
    expect(
      participationAttentionReasons({
        activeSeconds: 0,
        submissions: 0,
        daysSinceActivity: null,
        periodDays: 7,
        floorSeconds,
      }),
    ).toEqual([{ kind: "inactive", value: 7 }]);
  });

  it("flags counted time below the period floor, in minutes", () => {
    expect(
      participationAttentionReasons({
        activeSeconds: 600,
        submissions: 2,
        daysSinceActivity: 1,
        periodDays: 7,
        floorSeconds,
      }),
    ).toEqual([{ kind: "low_participation", value: 10 }]);
  });

  it("never says the same silence twice", () => {
    // A student with no signal is already described by `inactive`; adding
    // "0 minutes, below the floor" underneath states it a second time.
    const reasons = participationAttentionReasons({
      activeSeconds: 0,
      submissions: 0,
      daysSinceActivity: 3,
      periodDays: 7,
      floorSeconds,
    });
    expect(reasons).toHaveLength(1);
  });

  it("says nothing about a student who met the floor", () => {
    expect(
      participationAttentionReasons({
        activeSeconds: floorSeconds,
        submissions: 9,
        daysSinceActivity: 0,
        periodDays: 7,
        floorSeconds,
      }),
    ).toEqual([]);
  });

  it("submissions alone keep a student out of the inactive reason", () => {
    // An old client that never emitted activity intervals still submitted, and
    // a student who submitted work has plainly not been absent.
    expect(
      participationAttentionReasons({
        activeSeconds: 0,
        submissions: 3,
        daysSinceActivity: 1,
        periodDays: 7,
        floorSeconds,
      }).map((reason) => reason.kind),
    ).not.toContain("inactive");
  });

  it("scales the floor with the period rather than reusing the weekly one", () => {
    // §6.3 states the rule in seven-day terms. Applying 30 minutes flat to a
    // thirty-day view would flag almost nobody.
    expect(lowParticipationFloorSeconds(7)).toBe(1_800);
    expect(lowParticipationFloorSeconds(30)).toBeGreaterThan(1_800 * 4);
  });
});

describe("attention ordering", () => {
  it("ranks repeated failures above every other reason", () => {
    expect(attentionRank(["inactive", "repeated_failures"])).toBeLessThan(
      attentionRank(["inactive"]),
    );
  });

  it("keeps the worst measurement per kind and prints them in reading order", () => {
    expect(
      orderAttentionReasons([
        { kind: "inactive", value: 3 },
        { kind: "repeated_failures", value: 4 },
        { kind: "repeated_failures", value: 9 },
      ]),
    ).toEqual([
      { kind: "repeated_failures", value: 9 },
      { kind: "inactive", value: 3 },
    ]);
  });
});

describe("compareTeachingQueue", () => {
  const student = (
    overrides: Partial<TeachingQueueStudent>,
  ): TeachingQueueStudent => ({
    membershipId: "00000000-0000-4000-8000-000000000001",
    displayName: "Bora",
    classId: "00000000-0000-4000-8000-00000000000a",
    className: "Python A",
    reasons: [{ kind: "stalled", value: 8 }],
    activeSeconds: 0,
    activeDays: 0,
    averageScore: null,
    attemptedProblems: 0,
    curriculumLabel: null,
    materialId: null,
    courseId: null,
    lastActivityAt: "2026-08-10T00:00:00.000Z",
    ...overrides,
  });

  it("puts a repeated-failure student above a merely inactive one", () => {
    const stuck = student({
      reasons: [{ kind: "repeated_failures", value: 5 }],
      lastActivityAt: "2026-08-13T00:00:00.000Z",
    });
    const absent = student({
      membershipId: "00000000-0000-4000-8000-000000000004",
      reasons: [{ kind: "inactive", value: 7 }],
      lastActivityAt: null,
    });
    expect(compareTeachingQueue(stuck, absent)).toBeLessThan(0);
  });

  it("reads the longest wait first within one reason", () => {
    const older = student({ lastActivityAt: "2026-08-01T00:00:00.000Z" });
    const newer = student({
      membershipId: "00000000-0000-4000-8000-000000000002",
      lastActivityAt: "2026-08-12T00:00:00.000Z",
    });
    expect(compareTeachingQueue(older, newer)).toBeLessThan(0);

    // Never seen is the furthest thing from recently seen, not the closest.
    const never = student({
      membershipId: "00000000-0000-4000-8000-000000000003",
      lastActivityAt: null,
    });
    expect(compareTeachingQueue(never, older)).toBeLessThan(0);
  });

  it("is stable, so a five-row list does not reorder under the reader", () => {
    const first = student({ membershipId: "00000000-0000-4000-8000-00000000000a" });
    const second = student({ membershipId: "00000000-0000-4000-8000-00000000000b" });
    expect(compareTeachingQueue(first, second)).toBeLessThan(0);
    expect(compareTeachingQueue(second, first)).toBeGreaterThan(0);
  });
});

describe("localDaysSince", () => {
  it("counts calendar days in the academy's zone", () => {
    expect(
      localDaysSince({
        from: "2026-08-10T16:00:00Z", // the 11th in Seoul
        now: new Date("2026-08-13T02:00:00Z"),
        timeZone: ACADEMY_TIME_ZONE,
      }),
    ).toBe(2);
  });

  it("has no answer for a student who was never seen", () => {
    expect(
      localDaysSince({
        from: null,
        now: new Date("2026-08-13T02:00:00Z"),
        timeZone: ACADEMY_TIME_ZONE,
      }),
    ).toBeNull();
  });
});

/* ------------------------------------------------------- difficult problems */

describe("compareDifficultProblems", () => {
  const problem = (
    overrides: Partial<DifficultProblem & { position: number }>,
  ): DifficultProblem & { position: number } => ({
    materialId: "00000000-0000-4000-8000-00000000000b",
    title: "Loop the loop",
    courseTitle: "Python 1",
    moduleTitle: "Loops",
    lectureTitle: "While",
    outlineNumber: "2-3",
    attemptingStudents: 5,
    solvedStudents: 1,
    solveRate: 20,
    submissions: 14,
    classId: "00000000-0000-4000-8000-00000000000a",
    position: 3,
    ...overrides,
  });

  it("orders by solve rate, then by the students affected", () => {
    expect(
      compareDifficultProblems(
        problem({ solveRate: 10 }),
        problem({ solveRate: 40 }),
      ),
    ).toBeLessThan(0);
    expect(
      compareDifficultProblems(
        problem({ attemptingStudents: 9 }),
        problem({ attemptingStudents: 4 }),
      ),
    ).toBeLessThan(0);
  });

  it("never lets one student's retries outrank a whole class failing once", () => {
    // §6.9 — volume breaks a tie between equal rates, and only after the rate
    // and the distinct-student count have already been compared.
    const retried = problem({ solveRate: 50, attemptingStudents: 4, submissions: 90 });
    const widespread = problem({ solveRate: 10, attemptingStudents: 20, submissions: 20 });
    expect(compareDifficultProblems(widespread, retried)).toBeLessThan(0);
  });

  it("falls back to curriculum position so the list never reshuffles", () => {
    expect(
      compareDifficultProblems(problem({ position: 1 }), problem({ position: 8 })),
    ).toBeLessThan(0);
  });
});
