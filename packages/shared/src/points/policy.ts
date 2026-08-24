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
