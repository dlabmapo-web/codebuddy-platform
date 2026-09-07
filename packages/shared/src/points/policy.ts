/**
 * One academy's point economy, as numbers rather than code.
 *
 * Every value a student can earn is a column on `AcademyPointPolicy`, and this
 * module is the only place that reads them. The rules section on the points
 * page and the services that pay the points both call these functions, which
 * is what makes it impossible for the page to promise 5P and the server to pay
 * 3P — §7.2 of the student points design.
 *
 * Nothing here returns a negative number. Points are earned and never
 * deducted, and there is no reason code for a penalty (§7.6).
 */

import { z } from "zod";

import type { PointRules } from "./points.js";

export type ExerciseDifficultyName = "EASY" | "MEDIUM" | "HARD";

export type PointPolicy = {
  solveEasy: number;
  solveMedium: number;
  solveHard: number;

  lectureCompleted: number;
  moduleCompleted: number;
  courseCompleted: number;

  attendance: number;
  attendanceLate: number;
  /** Counted active minutes inside the class window that count as present. */
  attendanceMinMinutes: number;
  /** Minutes after the start a first interval may begin and still be on time. */
  attendanceGraceMinutes: number;

  learningTimeTier1Minutes: number;
  learningTimeTier1Points: number;
  learningTimeTier2Minutes: number;
  learningTimeTier2Points: number;
  learningTimeTier3Minutes: number;
  learningTimeTier3Points: number;

  /** The most one student may earn in one academy-local day. */
  studentDailyCap: number;
};

/**
 * What a brand-new academy starts with.
 *
 * `HARD` at 10 is three and a third `EASY` problems: set it lower and the
 * arithmetic tells a student that grinding easy problems beats attempting a
 * hard one, which is the exact lesson the number exists to prevent.
 *
 * The learning-time rungs are a ladder rather than one high threshold because
 * these are *counted* minutes — `ACTIVITY_MAX_GAP_MS` closes the interval after
 * thirty seconds of stillness, so two counted hours is a long day for a child
 * and a five-hour rung would be invisible to almost everyone. Academies that
 * want a higher top rung raise `learningTimeTier3Minutes`; §7.3.
 */
export const DEFAULT_POINT_POLICY: PointPolicy = {
  solveEasy: 3,
  solveMedium: 5,
  solveHard: 10,

  lectureCompleted: 15,
  moduleCompleted: 40,
  courseCompleted: 150,

  attendance: 5,
  attendanceLate: 2,
  attendanceMinMinutes: 10,
  attendanceGraceMinutes: 15,

  learningTimeTier1Minutes: 30,
  learningTimeTier1Points: 3,
  learningTimeTier2Minutes: 60,
  learningTimeTier2Points: 5,
  learningTimeTier3Minutes: 120,
  learningTimeTier3Points: 7,

  studentDailyCap: 100,
};

/**
 * The seventeen values, picked off a wider row.
 *
 * `AcademyPointPolicy` also carries its key and its timestamps, and every
 * reader wants the economy without them. Structural typing does the work: a
 * Prisma row is assignable here, and the picking happens once rather than in
 * every service that loads one.
 */
export function pointPolicyFrom(row: PointPolicy): PointPolicy {
  return {
    solveEasy: row.solveEasy,
    solveMedium: row.solveMedium,
    solveHard: row.solveHard,
    lectureCompleted: row.lectureCompleted,
    moduleCompleted: row.moduleCompleted,
    courseCompleted: row.courseCompleted,
    attendance: row.attendance,
    attendanceLate: row.attendanceLate,
    attendanceMinMinutes: row.attendanceMinMinutes,
    attendanceGraceMinutes: row.attendanceGraceMinutes,
    learningTimeTier1Minutes: row.learningTimeTier1Minutes,
    learningTimeTier1Points: row.learningTimeTier1Points,
    learningTimeTier2Minutes: row.learningTimeTier2Minutes,
    learningTimeTier2Points: row.learningTimeTier2Points,
    learningTimeTier3Minutes: row.learningTimeTier3Minutes,
    learningTimeTier3Points: row.learningTimeTier3Points,
    studentDailyCap: row.studentDailyCap,
  };
}

/** What one first solve pays, by how hard the problem is. */
export function pointsForSolve(
  difficulty: ExerciseDifficultyName,
  policy: PointPolicy = DEFAULT_POINT_POLICY,
): number {
  if (difficulty === "HARD") return policy.solveHard;
  if (difficulty === "MEDIUM") return policy.solveMedium;
  return policy.solveEasy;
}

/** One rung of the daily learning-time ladder. */
export type LearningTier = {
  /** 1, 2, or 3. Part of the dedupe key, so it must not be re-derived. */
  tier: 1 | 2 | 3;
  minutes: number;
  points: number;
};

/** The ladder, lowest rung first. */
export function learningTiers(
  policy: PointPolicy = DEFAULT_POINT_POLICY,
): LearningTier[] {
  return [
    {
      tier: 1,
      minutes: policy.learningTimeTier1Minutes,
      points: policy.learningTimeTier1Points,
    },
    {
      tier: 2,
      minutes: policy.learningTimeTier2Minutes,
      points: policy.learningTimeTier2Points,
    },
    {
      tier: 3,
      minutes: policy.learningTimeTier3Minutes,
      points: policy.learningTimeTier3Points,
    },
  ];
}

/**
 * Which rungs a day's total has now reached.
 *
 * Returns every tier at or below the total rather than only the newest one:
 * the caller writes one award per tier and the unique dedupe key absorbs the
 * repeats, so a flush that jumps two rungs at once pays both and a replayed
 * flush pays neither. Deciding "which is new" here would need state this
 * function does not have and the database already enforces.
 */
export function learningTiersReached(
  totalMinutes: number,
  policy: PointPolicy = DEFAULT_POINT_POLICY,
): LearningTier[] {
  return learningTiers(policy).filter((tier) => totalMinutes >= tier.minutes);
}

/**
 * An award, trimmed to what the day has left.
 *
 * Truncated rather than skipped: the ledger still prints the line, marked, so
 * a student can see why the number stopped moving instead of watching a solve
 * pay nothing for no stated reason.
 */
export function applyDailyCap(
  amount: number,
  earnedToday: number,
  policy: PointPolicy = DEFAULT_POINT_POLICY,
): { amount: number; capped: boolean } {
  const remaining = Math.max(0, policy.studentDailyCap - earnedToday);
  if (amount <= remaining) return { amount, capped: false };
  return { amount: remaining, capped: true };
}

/* ------------------------------------------------------------ the schema */

const policyPointsSchema = z.number().int().min(0).max(1000);
const policyMinutesSchema = z.number().int().min(1).max(1440);

/**
 * A policy a manager may save.
 *
 * The bounds are wide on purpose — this is one academy's economy, not a
 * platform opinion — and the refinements below are narrow: each one exists
 * because breaking it would mislead a *student*, not because we would have
 * chosen differently.
 *
 * One schema, imported by the contract and by the form, so the message a
 * manager reads while typing and the rule the server enforces are the same
 * sentence. The same technique as `pointsForSolve`, one layer up.
 */
export const pointPolicySchema = z
  .object({
    solveEasy: policyPointsSchema,
    solveMedium: policyPointsSchema,
    solveHard: policyPointsSchema,

    lectureCompleted: policyPointsSchema,
    moduleCompleted: policyPointsSchema,
    courseCompleted: policyPointsSchema,

    attendance: policyPointsSchema,
    attendanceLate: policyPointsSchema,
    attendanceMinMinutes: policyMinutesSchema,
    attendanceGraceMinutes: policyMinutesSchema,

    learningTimeTier1Minutes: policyMinutesSchema,
    learningTimeTier1Points: policyPointsSchema,
    learningTimeTier2Minutes: policyMinutesSchema,
    learningTimeTier2Points: policyPointsSchema,
    learningTimeTier3Minutes: policyMinutesSchema,
    learningTimeTier3Points: policyPointsSchema,

    studentDailyCap: z.number().int().min(1).max(10000),
  })
  .strict()
  /*
   * A hard problem must never pay less than an easy one. §7.2's argument is
   * arithmetic rather than taste: if it does, the numbers tell a student that
   * grinding easy problems beats attempting a hard one, which is the exact
   * lesson the values exist to prevent. Equality is allowed — an academy may
   * flatten the ladder — inversion is not.
   */
  .refine(
    (policy) =>
      policy.solveEasy <= policy.solveMedium &&
      policy.solveMedium <= policy.solveHard,
    { error: "SOLVE_ORDER", path: ["solveHard"] },
  )
  /*
   * The rungs are a ladder. `learningTiersReached` returns *every* rung at or
   * below the day's total, so an inverted ladder does not merely read oddly —
   * it pays the wrong sum.
   */
  .refine(
    (policy) =>
      policy.learningTimeTier1Minutes < policy.learningTimeTier2Minutes &&
      policy.learningTimeTier2Minutes < policy.learningTimeTier3Minutes,
    { error: "TIER_MINUTES_ORDER", path: ["learningTimeTier3Minutes"] },
  )
  .refine(
    (policy) =>
      policy.learningTimeTier1Points <= policy.learningTimeTier2Points &&
      policy.learningTimeTier2Points <= policy.learningTimeTier3Points,
    { error: "TIER_POINTS_ORDER", path: ["learningTimeTier3Points"] },
  )
  /** Arriving late must never pay better than arriving on time. */
  .refine((policy) => policy.attendanceLate <= policy.attendance, {
    error: "LATE_ORDER",
    path: ["attendanceLate"],
  })
  ;

/**
 * The awards this policy's daily cap would trim, largest first.
 *
 * Not a validation error, and the platform's own defaults are why: a course
 * completion pays 150 against a cap of 100, so the shipped economy already
 * trims one award and has since the feature launched. `applyDailyCap`
 * truncates rather than skips, the ledger prints the capped line, and a
 * milestone worth more than a day is a defensible thing for an academy to
 * want.
 *
 * What is not defensible is not knowing. The editor shows this list beside the
 * cap, so a manager who typed 150 for a course is told it will pay 100 — by
 * the same function that would decide it.
 */
export function awardsAboveDailyCap(
  policy: PointPolicy,
): { field: PointPolicyAmountField; amount: number }[] {
  return pointPolicyAmountFields
    .map((field) => ({ field, amount: policy[field] }))
    .filter((entry) => entry.amount > policy.studentDailyCap)
    .sort((first, second) => second.amount - first.amount);
}

/** Every field that pays points, in the order the editor lists them. */
export const pointPolicyAmountFields = [
  "solveEasy",
  "solveMedium",
  "solveHard",
  "lectureCompleted",
  "moduleCompleted",
  "courseCompleted",
  "attendance",
  "attendanceLate",
  "learningTimeTier1Points",
  "learningTimeTier2Points",
  "learningTimeTier3Points",
] as const;
export type PointPolicyAmountField = (typeof pointPolicyAmountFields)[number];

export const pointPolicyStateSchema = z
  .object({
    policy: pointPolicySchema,
    /**
     * Whether this academy has ever chosen. False means the values above are
     * `DEFAULT_POINT_POLICY` and no row exists — which is a different state
     * from a row that happens to hold the defaults, because an academy that
     * never chose follows any future change to them.
     */
    isCustom: z.boolean(),
  })
  .strict();
export type PointPolicyState = z.infer<typeof pointPolicyStateSchema>;

export const pointPolicyInputSchema = z.object({ academyId: z.uuid() }).strict();
export type PointPolicyInput = z.infer<typeof pointPolicyInputSchema>;

/**
 * A whole policy, never a patch.
 *
 * The refinements above are between fields, so a partial update would have to
 * merge against the stored row before it could be validated at all — and two
 * managers patching different fields would each pass a check the result fails.
 */
export const pointPolicyUpdateSchema = z
  .object({ academyId: z.uuid(), policy: pointPolicySchema })
  .strict();
export type PointPolicyUpdate = z.infer<typeof pointPolicyUpdateSchema>;

/**
 * What the student's rules panel says, from what the awarding service pays.
 *
 * The projection lives here rather than in the service so the manager's
 * preview can call it with values that have not been saved yet. Two callers,
 * one mapping: the preview cannot promise what the server would not pay.
 */
export function pointRulesFrom(policy: PointPolicy): PointRules {
  return {
    solve: {
      easy: policy.solveEasy,
      medium: policy.solveMedium,
      hard: policy.solveHard,
    },
    lectureCompleted: policy.lectureCompleted,
    moduleCompleted: policy.moduleCompleted,
    courseCompleted: policy.courseCompleted,
    attendance: policy.attendance,
    attendanceLate: policy.attendanceLate,
    learningTiers: learningTiers(policy).map((tier) => ({
      minutes: tier.minutes,
      points: tier.points,
    })),
    dailyCap: policy.studentDailyCap,
  };
}
