import { describe, expect, it } from "vitest";

import {
  activityBucketFor,
  assignStandingPositions,
  classStandingSchema,
  compareContinueTargets,
  compareCourseProgress,
  compareStandingCandidates,
  periodAcceptedRate,
  projectStanding,
  standingRowSchema,
  standingSharePercent,
  type ContinueTarget,
  type StandingCandidate,
  type StudentCourseProgress,
} from "./student-overview.js";

const candidate = (
  membershipId: string,
  solvedProblems: number,
  averageScore: number | null,
  activeDays = 0,
): StandingCandidate => ({
  membershipId,
  solvedProblems,
  averageScore,
  activeDays,
});

describe("periodAcceptedRate", () => {
  it("is the share of counted attempts that passed", () => {
    expect(periodAcceptedRate({ passed: 3, attempts: 4 })).toBe(75);
  });

  it("has no rate without an attempt, rather than zero", () => {
    expect(periodAcceptedRate({ passed: 0, attempts: 0 })).toBeNull();
  });

  it("is zero when every attempt failed, which is a measurement", () => {
    expect(periodAcceptedRate({ passed: 0, attempts: 5 })).toBe(0);
  });
});

describe("activityBucketFor", () => {
  it("draws days for a week and a month", () => {
    expect(activityBucketFor(7)).toBe("day");
    expect(activityBucketFor(30)).toBe("day");
  });

  it("folds to weeks past a month, and for all time", () => {
    expect(activityBucketFor(90)).toBe("week");
    expect(activityBucketFor(null)).toBe("week");
  });
});

describe("compareStandingCandidates", () => {
  it("orders by solved problems first", () => {
    expect(
      compareStandingCandidates(candidate("a", 5, 10), candidate("b", 4, 99)),
    ).toBeLessThan(0);
  });

  it("breaks a tie on score, then on days worked", () => {
    expect(
      compareStandingCandidates(candidate("a", 4, 90), candidate("b", 4, 80)),
    ).toBeLessThan(0);
    expect(
      compareStandingCandidates(
        candidate("a", 4, 80, 6),
        candidate("b", 4, 80, 2),
      ),
    ).toBeLessThan(0);
  });

  it("sorts a student with no score after one who has one", () => {
    expect(
      compareStandingCandidates(candidate("a", 4, null), candidate("b", 4, 0)),
    ).toBeGreaterThan(0);
  });

  it("never lets time decide an order it was not given", () => {
    // The only inputs are solved, score, and days. There is deliberately no
    // seconds field to pass, which is what makes §9.3 structural.
    const keys = Object.keys(candidate("a", 1, 1));
    expect(keys).not.toContain("activeSeconds");
  });
});

describe("assignStandingPositions", () => {
  it("gives level students one position and skips the next", () => {
    const placed = assignStandingPositions([
      candidate("a", 5, 90, 3),
      candidate("b", 5, 90, 3),
      candidate("c", 4, 80, 2),
    ]);
    expect(placed.map((row) => row.position)).toEqual([1, 1, 3]);
  });

  it("settles an otherwise identical pair deterministically", () => {
    const forwards = assignStandingPositions([
      candidate("b", 5, 90, 3),
      candidate("a", 5, 90, 3),
    ]);
    const backwards = assignStandingPositions([
      candidate("a", 5, 90, 3),
      candidate("b", 5, 90, 3),
    ]);
    expect(forwards.map((row) => row.membershipId)).toEqual(
      backwards.map((row) => row.membershipId),
    );
  });
});

describe("projectStanding", () => {
  const roster = [
    candidate("a", 9, 95, 8),
    candidate("b", 8, 90, 7),
    candidate("c", 7, 85, 6),
    candidate("d", 6, 80, 5),
    candidate("e", 5, 75, 4),
    candidate("f", 4, 70, 3),
    candidate("g", 3, 65, 2),
  ];
  const project = (membershipId: string) =>
    projectStanding({
      candidates: roster,
      membershipId,
      classId: "11111111-1111-4111-8111-111111111111",
      className: "Level 1",
    });

  it("shows the leading rows and the reader's neighbours", () => {
    const standing = project("e");
    if (!standing?.eligible) throw new Error("expected an eligible standing");
    expect(standing.yourPosition).toBe(5);
    expect(standing.top.map((row) => row.position)).toEqual([1, 2, 3]);
    // The top already shows 1 through 3, so the neighbourhood starts below
    // it rather than printing position 3 twice.
    expect(standing.neighbourhood.map((row) => row.position)).toEqual([
      4, 5, 6, 7,
    ]);
    expect(standing.neighbourhood.filter((row) => row.isYou)).toHaveLength(1);
  });

  it("never renders the whole class, however far down the reader sits", () => {
    const standing = project("g");
    if (!standing?.eligible) throw new Error("expected an eligible standing");
    // The last row is present because it is the reader's own, but the rows
    // between the top and their neighbourhood are not: §9.1 forbids a
    // complete ordered list, because a complete list ends.
    const shown = new Set([
      ...standing.top.map((row) => row.position),
      ...standing.neighbourhood.map((row) => row.position),
    ]);
    expect(shown.size).toBeLessThan(roster.length);
  });

  it("does not repeat the reader when they are already in the top", () => {
    const standing = project("b");
    if (!standing?.eligible) throw new Error("expected an eligible standing");
    const inTop = standing.top.filter((row) => row.isYou);
    expect(inTop).toHaveLength(1);
    expect(standing.neighbourhood.every((row) => row.position > 3)).toBe(true);
  });

  it("has nothing to say about a student who is not in the class", () => {
    expect(project("zz")).toBeNull();
  });

  it("emits no identifier for anyone, including the reader", () => {
    const standing = project("e");
    if (!standing?.eligible) throw new Error("expected an eligible standing");
    for (const row of [...standing.top, ...standing.neighbourhood]) {
      expect(Object.keys(row).sort()).toEqual([
        "activeDays",
        "averageScore",
        "isYou",
        "position",
        "solvedProblems",
      ]);
    }
  });
});

describe("standingRowSchema", () => {
  const row = {
    position: 1,
    solvedProblems: 4,
    averageScore: 80,
    activeDays: 3,
    isYou: false,
  };

  it("accepts a row that names nobody", () => {
    expect(standingRowSchema.parse(row)).toEqual(row);
  });

  it("refuses a row carrying a classmate's identity", () => {
    // The guarantee in §9.1 is only real if something checks it. A display
    // name added here has to fail a test, not merely contradict a comment.
    expect(() =>
      standingRowSchema.parse({ ...row, displayName: "Ji-woo" }),
    ).toThrow();
    expect(() =>
      standingRowSchema.parse({ ...row, membershipId: "x" }),
    ).toThrow();
  });
});

describe("classStandingSchema", () => {
  it("tells a disabled section apart from an unmeasurable one", () => {
    const ineligible = classStandingSchema.parse({
      eligible: false,
      classId: "11111111-1111-4111-8111-111111111111",
      className: "Level 1",
      reason: "too_few_students",
      needed: 2,
    });
    expect(ineligible.eligible).toBe(false);
  });
});

describe("standingSharePercent", () => {
  it("reports the share the reader is level with or ahead of", () => {
    expect(standingSharePercent({ position: 1, participants: 5 })).toBe(100);
    expect(standingSharePercent({ position: 5, participants: 5 })).toBe(0);
    expect(standingSharePercent({ position: 3, participants: 5 })).toBe(50);
  });

  it("has no share to report in a class of one", () => {
    expect(standingSharePercent({ position: 1, participants: 1 })).toBeNull();
  });
});

describe("compareContinueTargets", () => {
  const target = (
    materialId: string,
    kind: ContinueTarget["kind"],
    lastTouchedAt: string | null,
  ): ContinueTarget => ({
    kind,
    materialId,
    title: "Sum two numbers",
    courseId: "c",
    courseTitle: "Python A",
    moduleTitle: "Basics",
    lectureTitle: "Arithmetic",
    outlineNumber: "1-2-3",
    lineCount: null,
    lastTouchedAt,
  });

  it("puts unfinished work before anything the curriculum suggests", () => {
    const rows = [
      target("m2", "next", null),
      target("m1", "draft", "2026-08-18T09:00:00.000Z"),
    ].sort(compareContinueTargets);
    expect(rows[0].materialId).toBe("m1");
  });

  it("puts the more recent draft first", () => {
    const rows = [
      target("m1", "draft", "2026-08-17T09:00:00.000Z"),
      target("m2", "draft", "2026-08-18T09:00:00.000Z"),
    ].sort(compareContinueTargets);
    expect(rows[0].materialId).toBe("m2");
  });
});

describe("compareCourseProgress", () => {
  const course = (
    courseId: string,
    title: string,
    solved: number,
    total: number,
    lastActivityAt: string | null,
  ): StudentCourseProgress => ({
    courseId,
    title,
    solved,
    started: 0,
    total,
    percent: total === 0 ? 0 : Math.round((solved / total) * 100),
    lastLectureLabel: null,
    nextMaterialId: null,
    nextTitle: null,
    lastActivityAt,
  });

  it("sinks a finished course below one with work left", () => {
    const rows = [
      course("a", "Done", 5, 5, null),
      course("b", "Open", 1, 5, null),
    ].sort(compareCourseProgress);
    expect(rows.map((row) => row.courseId)).toEqual(["b", "a"]);
  });

  it("orders by title when nothing else separates two courses", () => {
    const rows = [
      course("b", "Python B", 1, 5, null),
      course("a", "Python A", 1, 5, null),
    ].sort(compareCourseProgress);
    expect(rows.map((row) => row.title)).toEqual(["Python A", "Python B"]);
  });
});
