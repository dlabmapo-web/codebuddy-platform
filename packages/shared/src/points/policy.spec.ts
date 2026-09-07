import { describe, expect, it } from "vitest";

import {
  DEFAULT_POINT_POLICY,
  awardsAboveDailyCap,
  pointPolicySchema,
  pointRulesFrom,
  type PointPolicy,
} from "./policy.js";

const policy = (patch: Partial<PointPolicy> = {}): PointPolicy => ({
  ...DEFAULT_POINT_POLICY,
  ...patch,
});

/** The first message a failure carries, which is what the form renders. */
function firstError(input: PointPolicy): string | null {
  const result = pointPolicySchema.safeParse(input);
  return result.success ? null : (result.error.issues[0]?.message ?? "");
}

describe("pointPolicySchema", () => {
  it("accepts the defaults, unchanged", () => {
    // Not a formality: the seed every academy runs on must be a policy a
    // manager could have typed, or the editor would refuse to save the state
    // it opens in.
    expect(pointPolicySchema.safeParse(DEFAULT_POINT_POLICY).success).toBe(true);
  });

  it("refuses a hard problem worth less than an easy one", () => {
    expect(firstError(policy({ solveHard: 2 }))).toBe("SOLVE_ORDER");
    // Flattening the ladder is a choice; inverting it is the one §7.2 forbids.
    expect(
      firstError(policy({ solveEasy: 5, solveMedium: 5, solveHard: 5 })),
    ).toBeNull();
  });

  it("refuses a learning-time ladder that does not climb", () => {
    expect(firstError(policy({ learningTimeTier3Minutes: 45 }))).toBe(
      "TIER_MINUTES_ORDER",
    );
    // A longer day paying less is the same mistake in the other column, and
    // `learningTiersReached` would pay every rung below it too.
    expect(firstError(policy({ learningTimeTier3Points: 1 }))).toBe(
      "TIER_POINTS_ORDER",
    );
  });

  it("refuses lateness that pays better than turning up on time", () => {
    expect(firstError(policy({ attendanceLate: 9 }))).toBe("LATE_ORDER");
    expect(firstError(policy({ attendanceLate: 5, attendance: 5 }))).toBeNull();
  });

  it("allows an award larger than the daily cap", () => {
    // The platform's own defaults are this case — a course pays 150 against a
    // cap of 100 — so refusing it would refuse the state every academy is in.
    // The editor warns instead; `awardsAboveDailyCap` is what it warns from.
    expect(firstError(policy({ courseCompleted: 900 }))).toBeNull();
  });

  it("allows zero everywhere it is a decision", () => {
    // Zero is how a manager switches one reason off without switching points
    // off; `PointAwardService` already declines to write a zero award.
    const quiet = policy({
      solveEasy: 0,
      solveMedium: 0,
      solveHard: 0,
      lectureCompleted: 0,
      moduleCompleted: 0,
      courseCompleted: 0,
      attendance: 0,
      attendanceLate: 0,
      learningTimeTier1Points: 0,
      learningTimeTier2Points: 0,
      learningTimeTier3Points: 0,
    });
    expect(pointPolicySchema.safeParse(quiet).success).toBe(true);
  });

  it("refuses negatives, fractions, and values past the bounds", () => {
    for (const patch of [
      { solveEasy: -1 },
      { solveEasy: 2.5 },
      { moduleCompleted: 1001 },
      { studentDailyCap: 0 },
      { attendanceMinMinutes: 0 },
      { attendanceGraceMinutes: 1441 },
    ]) {
      expect(pointPolicySchema.safeParse(policy(patch)).success).toBe(false);
    }
  });

  it("refuses a key it does not know", () => {
    expect(
      pointPolicySchema.safeParse({ ...DEFAULT_POINT_POLICY, bonus: 5 }).success,
    ).toBe(false);
  });
});

describe("awardsAboveDailyCap", () => {
  it("names what the cap will trim, largest first", () => {
    // True of the shipped defaults, which is the point: a manager should be
    // able to read this before they are surprised by a capped ledger line.
    expect(awardsAboveDailyCap(DEFAULT_POINT_POLICY)).toEqual([
      { field: "courseCompleted", amount: 150 },
    ]);

    expect(
      awardsAboveDailyCap(policy({ studentDailyCap: 30, moduleCompleted: 40 })),
    ).toEqual([
      { field: "courseCompleted", amount: 150 },
      { field: "moduleCompleted", amount: 40 },
    ]);
  });

  it("is empty when the day admits everything", () => {
    expect(awardsAboveDailyCap(policy({ studentDailyCap: 200 }))).toEqual([]);
  });
});

describe("pointRulesFrom", () => {
  it("says what the awarding service pays", () => {
    const rules = pointRulesFrom(DEFAULT_POINT_POLICY);

    expect(rules.solve).toEqual({ easy: 3, medium: 5, hard: 10 });
    expect(rules.dailyCap).toBe(100);
    expect(rules.learningTiers).toEqual([
      { minutes: 30, points: 3 },
      { minutes: 60, points: 5 },
      { minutes: 120, points: 7 },
    ]);
  });

  it("follows a custom policy rather than the defaults", () => {
    const rules = pointRulesFrom(
      policy({ solveHard: 25, learningTimeTier1Minutes: 45 }),
    );

    expect(rules.solve.hard).toBe(25);
    expect(rules.learningTiers[0]).toEqual({ minutes: 45, points: 3 });
  });
});
