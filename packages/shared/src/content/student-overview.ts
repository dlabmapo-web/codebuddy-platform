import { z } from "zod";

import { acceptedRate } from "./answer-records.js";
import { overviewPeriodSchema, overviewRangeSchema } from "./teacher-overview.js";

/**
 * What a student's own academy overview is made of.
 *
 * The measurements are the teacher's measurements. `averageBestScore`,
 * `resolveOverviewPeriod`, and the attention rules all live in
 * `teacher-overview.ts` and `teacher-progress.ts`, and this file imports them
 * rather than restating them — a student and their teacher reading different
 * averages for the same week would be a defect neither could diagnose, and one
 * definition is how that stays impossible.
 *
 * What is decided here is everything that is only true of the student's own
 * page: which work to resume, how a position in a class is computed, and — the
 * part the schemas carry rather than describe — what a student may learn about
 * another student, which is a position and nothing else.
 *
 * See §8 and §9 of the student academy overview design.
 */

const labelSchema = z.string().trim().min(1).max(200);
const percentSchema = z.number().int().min(0).max(100);
const countSchema = z.number().int().nonnegative();
const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/* ------------------------------------------------------------- thresholds */

/** §7.3 — the resume plate is a door, not a drawer. */
export const STUDENT_MAX_CONTINUE_ROWS = 3;
/** §7.7, §7.10 — five rows is what a preview is. */
export const STUDENT_MAX_PREVIEW_ROWS = 5;
/** §7.8 — three is what a child will actually work through in a sitting. */
export const STUDENT_MAX_PRACTICE_ROWS = 3;
/** §7.6 — a period longer than this aggregates to weeks rather than shrinking. */
export const STUDENT_ACTIVITY_DAILY_MAX_DAYS = 31;
/** §9.1 — the top of the standing, above the student's own neighbourhood. */
export const STUDENT_STANDING_TOP_ROWS = 3;
/** §9.1 — how far either side of the student their neighbourhood reaches. */
export const STUDENT_STANDING_NEIGHBOURS = 2;

/* ------------------------------------------------------------------ scope */

/**
 * Who is reading, and over what period.
 *
 * The classes are here because the page's first sentence names them, and
 * because standing needs one. They carry the teacher's display name — which
 * the class pages already show a student — and nothing else about anybody.
 */
export const studentOverviewClassSchema = z
  .object({
    classId: z.uuid(),
    name: labelSchema,
    teacherName: labelSchema.nullable(),
  })
  .strict();
export type StudentOverviewClass = z.infer<typeof studentOverviewClassSchema>;

export const studentOverviewScopeSchema = z
  .object({
    academyId: z.uuid(),
    academyName: labelSchema,
    /**
     * What to call the student, or nothing.
     *
     * Null when no display name has been set anywhere. The header greets
     * generically rather than substituting an email, a username, or the
     * academy's own name — the first thing this page says should not be an
     * identifier the student never chose.
     */
    displayName: labelSchema.nullable(),
    classes: z.array(studentOverviewClassSchema),
    courseCount: countSchema,
    period: overviewPeriodSchema,
    /**
     * The student's first counted learning day, or null before there is one.
     *
     * §6.2 — time before the projection existed is never reconstructed, and a
     * page that showed an honest zero would be read as a decline.
     */
    activityTrackedSince: localDateSchema.nullable(),
    generatedAt: z.iso.datetime(),
  })
  .strict();
export type StudentOverviewScope = z.infer<typeof studentOverviewScopeSchema>;

/* --------------------------------------------------------------- continue */

export const continueKinds = ["draft", "next", "start"] as const;
export const continueKindSchema = z.enum(continueKinds);
export type ContinueKind = z.infer<typeof continueKindSchema>;

/**
 * One row of the signature surface: a door with the coordinate written on it.
 *
 * `outlineNumber` is the structural device the whole page borrows from the
 * course outline — `2-3-4` is the module, lecture, and problem position, which
 * is information a student navigates by rather than an ornament. It is the
 * same numbering `teacherOutlineNumber` prints, so a child and their teacher
 * point at the same exercise by the same name.
 */
export const continueTargetSchema = z
  .object({
    kind: continueKindSchema,
    materialId: z.uuid(),
    title: labelSchema,
    courseId: z.uuid(),
    courseTitle: labelSchema,
    moduleTitle: labelSchema,
    lectureTitle: labelSchema,
    outlineNumber: z.string().max(24).nullable(),
    /** Lines already written, for a draft. Null for work not yet started. */
    lineCount: countSchema.nullable(),
    lastTouchedAt: z.iso.datetime().nullable(),
  })
  .strict();
export type ContinueTarget = z.infer<typeof continueTargetSchema>;

/**
 * Which door to open first.
 *
 * A draft beats an unstarted exercise, and a more recent draft beats an older
 * one. Nothing else is consulted: a student who stopped mid-problem yesterday
 * is resuming that problem, whatever the curriculum thinks should come next.
 */
export function compareContinueTargets(
  left: ContinueTarget,
  right: ContinueTarget,
): number {
  const byKind = continueKinds.indexOf(left.kind) - continueKinds.indexOf(right.kind);
  if (byKind !== 0) return byKind;
  const leftAt = left.lastTouchedAt ? Date.parse(left.lastTouchedAt) : 0;
  const rightAt = right.lastTouchedAt ? Date.parse(right.lastTouchedAt) : 0;
  if (leftAt !== rightAt) return rightAt - leftAt;
  return left.materialId.localeCompare(right.materialId);
}

/* ----------------------------------------------------------------- ledger */

/**
 * The five measurements §7.4 asks for, each carrying its own denominator.
 *
 * Every one of them can be missing, and each says so in its own field rather
 * than through a zero. A child who has not started is not a child scoring
 * nought, and printing one as the other is the single most misleading thing
 * this page could do — the same rule the teacher's ledger states, for the same
 * reason, about the same numbers.
 */
export const studentLedgerSchema = z
  .object({
    solved: z
      .object({ problems: countSchema, attempted: countSchema })
      .strict(),
    score: z
      .object({
        value: percentSchema.nullable(),
        attemptedProblems: countSchema,
      })
      .strict(),
    activeLearning: z
      .object({
        totalSeconds: countSchema,
        /** Counted intervals, so a total reads as one sitting or twelve. */
        intervals: countSchema,
      })
      .strict(),
    activeDays: z
      .object({
        days: countSchema,
        /** The days the period contains, or null for `all`. */
        periodDays: z.number().int().positive().nullable(),
      })
      .strict(),
    accepted: z
      .object({
        rate: percentSchema.nullable(),
        passed: countSchema,
        attempts: countSchema,
      })
      .strict(),
  })
  .strict();
export type StudentLedger = z.infer<typeof studentLedgerSchema>;

/**
 * `PASSED / (PASSED + FAILED)` for the period, or nothing.
 *
 * The arithmetic is Answer records' own `acceptedRate`, so a student reading
 * both pages sees one number. What differs is the empty case: that page is a
 * lifetime summary and prints `0%`, and this one is a ledger entry that must
 * not claim `0%` about work nobody has done. Null is what the em dash renders.
 */
export function periodAcceptedRate(input: {
  passed: number;
  attempts: number;
}): number | null {
  if (input.attempts <= 0) return null;
  return acceptedRate({
    accepted: input.passed,
    notAccepted: input.attempts - input.passed,
  });
}

/* --------------------------------------------------------------- courses */

export const studentCourseProgressSchema = z
  .object({
    courseId: z.uuid(),
    title: labelSchema,
    solved: countSchema,
    started: countSchema,
    total: countSchema,
    percent: percentSchema,
    /** Where the student last worked, in curriculum words. */
    lastLectureLabel: labelSchema.nullable(),
    /** The next unsolved exercise, or null when the course is finished. */
    nextMaterialId: z.uuid().nullable(),
    nextTitle: labelSchema.nullable(),
    lastActivityAt: z.iso.datetime().nullable(),
  })
  .strict();
export type StudentCourseProgress = z.infer<typeof studentCourseProgressSchema>;

/**
 * Courses in the order a student would pick one up.
 *
 * Where they were working most recently first, then unfinished courses, then
 * the rest by title. A finished course sinking to the bottom is the point: it
 * is the one row with nothing left to do.
 */
export function compareCourseProgress(
  left: StudentCourseProgress,
  right: StudentCourseProgress,
): number {
  const leftAt = left.lastActivityAt ? Date.parse(left.lastActivityAt) : 0;
  const rightAt = right.lastActivityAt ? Date.parse(right.lastActivityAt) : 0;
  if (leftAt !== rightAt) return rightAt - leftAt;
  const leftDone = left.total > 0 && left.solved >= left.total ? 1 : 0;
  const rightDone = right.total > 0 && right.solved >= right.total ? 1 : 0;
  if (leftDone !== rightDone) return leftDone - rightDone;
  return left.title.localeCompare(right.title) || left.courseId.localeCompare(right.courseId);
}

/* -------------------------------------------------------------- activity */

export const studentActivityPointSchema = z
  .object({
    /** A local calendar date, or the first date of a week when bucketed. */
    date: localDateSchema,
    activeSeconds: countSchema,
    submissions: countSchema,
    solved: countSchema,
  })
  .strict();
export type StudentActivityPoint = z.infer<typeof studentActivityPointSchema>;

export const activityBuckets = ["day", "week"] as const;
export const activityBucketSchema = z.enum(activityBuckets);
export type ActivityBucket = z.infer<typeof activityBucketSchema>;

/**
 * Days, until days stop being legible.
 *
 * §7.6 — above a month the chart aggregates to weeks rather than drawing bars
 * too thin to compare, which is the failure mode of every 90-day daily chart.
 */
export function activityBucketFor(days: number | null): ActivityBucket {
  if (days === null) return "week";
  return days > STUDENT_ACTIVITY_DAILY_MAX_DAYS ? "week" : "day";
}

/** The tallest bar in a series, so a chart can scale without a second pass. */
export function activityPeak(points: StudentActivityPoint[]): number {
  return points.reduce((peak, point) => Math.max(peak, point.activeSeconds), 0);
}

/* -------------------------------------------------------------- messages */

/**
 * One message a teacher wrote to this student.
 *
 * There is no author name and no author id, preserving the anonymity the
 * feedback delivery design chose deliberately: the student sees "Teacher", the
 * live indicator already tells them somebody is helping, and a named thread
 * would hand back exactly what the rest of the system withholds.
 */
export const studentMessageSchema = z
  .object({
    id: z.uuid(),
    body: z.string().min(1).max(4000),
    materialId: z.uuid().nullable(),
    exerciseTitle: labelSchema.nullable(),
    createdAt: z.iso.datetime(),
    readAt: z.iso.datetime().nullable(),
  })
  .strict();
export type StudentMessage = z.infer<typeof studentMessageSchema>;

/* -------------------------------------------------------------- practice */

/**
 * An exercise worth returning to.
 *
 * The teacher's queue prints the reason and the measurement, because a teacher
 * is deciding where to spend a lesson. This prints neither. A child needs the
 * door, not the evidence that they failed four times, and there is no field
 * here that could carry a count, a severity, or an adjective — §7.8 forbids
 * one, and a schema with nowhere to put it cannot grow one later.
 */
export const practiceExerciseSchema = z
  .object({
    materialId: z.uuid(),
    title: labelSchema,
    courseTitle: labelSchema,
    moduleTitle: labelSchema,
    lectureTitle: labelSchema,
    outlineNumber: z.string().max(24).nullable(),
    /** The best score so far, which is the one number that helps a student. */
    bestScore: percentSchema.nullable(),
    lastAttemptAt: z.iso.datetime().nullable(),
  })
  .strict();
export type PracticeExercise = z.infer<typeof practiceExerciseSchema>;

/** Most recently attempted first: the thing they were last trying to do. */
export function comparePracticeExercises(
  left: PracticeExercise,
  right: PracticeExercise,
): number {
  const leftAt = left.lastAttemptAt ? Date.parse(left.lastAttemptAt) : 0;
  const rightAt = right.lastAttemptAt ? Date.parse(right.lastAttemptAt) : 0;
  if (leftAt !== rightAt) return rightAt - leftAt;
  return left.materialId.localeCompare(right.materialId);
}

/* --------------------------------------------------------------- records */

export const studentRecordSchema = z
  .object({
    id: z.uuid(),
    materialId: z.uuid().nullable(),
    problemTitle: labelSchema,
    courseTitle: labelSchema,
    passed: z.boolean(),
    score: percentSchema,
    solveElapsedSec: countSchema.nullable(),
    createdAt: z.iso.datetime(),
  })
  .strict();
export type StudentRecord = z.infer<typeof studentRecordSchema>;

/* -------------------------------------------------------------- standing */

/**
 * One position in a class comparison, and everything a student may learn about
 * whoever holds it.
 *
 * There is no name here. No display name, no membership id, no user id, no
 * avatar, no initial. This is §9.1's guarantee, and it is structural on
 * purpose: turning this page into a leaderboard is not a UI change a busy
 * afternoon could produce, it is a deliberate edit to this schema, past this
 * comment, in a repository whose design documents say three times that a
 * student surface shows no classmate identity.
 *
 * `isYou` is the only thing that distinguishes one row from another.
 */
export const standingRowSchema = z
  .object({
    position: z.number().int().positive(),
    solvedProblems: countSchema,
    averageScore: percentSchema.nullable(),
    activeDays: countSchema,
    isYou: z.boolean(),
  })
  .strict();
export type StandingRow = z.infer<typeof standingRowSchema>;

/**
 * Why a standing is not being shown.
 *
 * Distinguished from `standing: null`, which means the academy has not turned
 * the section on at all. The UI stays silent in that case and explains itself
 * in these, and one nullable field could not tell a child "not enough people
 * yet" apart from "your school does not use this".
 */
export const standingIneligibleReasons = [
  "too_few_students",
  "too_few_attempts",
] as const;
export const standingIneligibleReasonSchema = z.enum(standingIneligibleReasons);
export type StandingIneligibleReason = z.infer<
  typeof standingIneligibleReasonSchema
>;

export const classStandingSchema = z.discriminatedUnion("eligible", [
  z
    .object({
      eligible: z.literal(false),
      classId: z.uuid(),
      className: labelSchema,
      reason: standingIneligibleReasonSchema,
      /** How many more are needed, so the copy can say something concrete. */
      needed: countSchema,
    })
    .strict(),
  z
    .object({
      eligible: z.literal(true),
      classId: z.uuid(),
      className: labelSchema,
      participants: z.number().int().positive(),
      yourPosition: z.number().int().positive(),
      top: z.array(standingRowSchema).max(STUDENT_STANDING_TOP_ROWS),
      neighbourhood: z
        .array(standingRowSchema)
        .max(STUDENT_STANDING_NEIGHBOURS * 2 + 1),
    })
    .strict(),
]);
export type ClassStanding = z.infer<typeof classStandingSchema>;

/** One student's measurements, before they become a position. */
export type StandingCandidate = {
  membershipId: string;
  solvedProblems: number;
  averageScore: number | null;
  activeDays: number;
};

/**
 * The order §9.3 specifies, and the one it refuses.
 *
 * Solved problems, then score, then active days. Active learning *time* is
 * deliberately absent: a child who understands the material solves the same
 * problem in less time, and ranking on minutes would place them below a child
 * who struggled. Time is on the page, in the student's own history, where it
 * describes them rather than sorting them.
 *
 * The membership id is the final tiebreak so two identical students do not
 * swap places between requests. It never leaves this function.
 */
export function compareStandingCandidates(
  left: StandingCandidate,
  right: StandingCandidate,
): number {
  if (left.solvedProblems !== right.solvedProblems) {
    return right.solvedProblems - left.solvedProblems;
  }
  // A student with no scored attempt sorts after one who has a score, rather
  // than being treated as a zero — the ledger's rule, applied to an ordering.
  const leftScore = left.averageScore ?? -1;
  const rightScore = right.averageScore ?? -1;
  if (leftScore !== rightScore) return rightScore - leftScore;
  if (left.activeDays !== right.activeDays) return right.activeDays - left.activeDays;
  return left.membershipId.localeCompare(right.membershipId);
}

/** Whether two candidates are level on every measurement that decides order. */
function tiedWith(left: StandingCandidate, right: StandingCandidate): boolean {
  return (
    left.solvedProblems === right.solvedProblems &&
    (left.averageScore ?? -1) === (right.averageScore ?? -1) &&
    left.activeDays === right.activeDays
  );
}

/**
 * Positions, with ties sharing one and the next position skipping.
 *
 * Standard competition ranking: two students level on every measurement hold
 * the same position, and the student behind them holds the position their
 * count implies. Two children with identical work being told one of them is
 * ahead would be a claim the measurements do not support.
 */
export function assignStandingPositions(
  candidates: StandingCandidate[],
): (StandingCandidate & { position: number })[] {
  const sorted = [...candidates].sort(compareStandingCandidates);
  const placed: (StandingCandidate & { position: number })[] = [];
  for (const [index, candidate] of sorted.entries()) {
    const previous = placed[index - 1];
    const position =
      previous && tiedWith(previous, candidate) ? previous.position : index + 1;
    placed.push({ ...candidate, position });
  }
  return placed;
}

/**
 * The top, and the student's own neighbourhood — never the tail.
 *
 * §9.1 — the section shows the leading few and the rows either side of the
 * reader. It never renders the complete ordered class, because a complete list
 * ends, and something has to be last. A child opening their overview should
 * not be told they are the something.
 *
 * The neighbourhood is trimmed of anything the top already shows, so a student
 * sitting second does not see themselves twice.
 */
export function projectStanding(input: {
  candidates: StandingCandidate[];
  membershipId: string;
  classId: string;
  className: string;
  topRows?: number;
  neighbours?: number;
}): ClassStanding | null {
  const topRows = input.topRows ?? STUDENT_STANDING_TOP_ROWS;
  const neighbours = input.neighbours ?? STUDENT_STANDING_NEIGHBOURS;
  const placed = assignStandingPositions(input.candidates);
  const meIndex = placed.findIndex(
    (candidate) => candidate.membershipId === input.membershipId,
  );
  if (meIndex < 0) return null;

  const row = (
    candidate: StandingCandidate & { position: number },
  ): StandingRow => ({
    position: candidate.position,
    solvedProblems: candidate.solvedProblems,
    averageScore: candidate.averageScore,
    activeDays: candidate.activeDays,
    isYou: candidate.membershipId === input.membershipId,
  });

  const top = placed.slice(0, topRows);
  const from = Math.max(topRows, meIndex - neighbours);
  const to = Math.min(placed.length, meIndex + neighbours + 1);

  return {
    eligible: true,
    classId: input.classId,
    className: input.className,
    participants: placed.length,
    yourPosition: placed[meIndex].position,
    top: top.map(row),
    neighbourhood: from < to ? placed.slice(from, to).map(row) : [],
  };
}

/**
 * The share of a class the student is at least level with, for the one-line
 * summary above the rows.
 *
 * Expressed as "ahead of or level with N%", never as a percentile band with a
 * label. A number a child can check against the rows underneath it is a
 * different thing from a badge that grades them.
 */
export function standingSharePercent(input: {
  position: number;
  participants: number;
}): number | null {
  if (input.participants <= 1) return null;
  const behind = input.participants - input.position;
  return Math.max(0, Math.min(100, Math.round((behind / (input.participants - 1)) * 100)));
}

/* ------------------------------------------------------- partial failure */

/**
 * The sections that may fail on their own.
 *
 * The header — who the student is, which classes, which period — is not here.
 * It is the page's core claim, and an overview that cannot say whose it is has
 * no narrower version to render; that failure is a retryable page error
 * instead. Everything below it is evidence, and evidence that could not be
 * gathered says so in its own panel while the rest of the page stands.
 */
export const studentOverviewSections = [
  "continue",
  "ledger",
  "courses",
  "activity",
  "messages",
  "practice",
  "standing",
  "records",
] as const;
export const studentOverviewSectionSchema = z.enum(studentOverviewSections);
export type StudentOverviewSection = z.infer<
  typeof studentOverviewSectionSchema
>;

/* ------------------------------------------------------------ the payload */

export const getStudentOverviewInputSchema = z
  .object({
    academyId: z.uuid(),
    range: overviewRangeSchema.optional(),
    /** Which class the standing describes, when the student is in several. */
    standingClassId: z.uuid().optional(),
  })
  .strict();
export type GetStudentOverviewInput = z.infer<
  typeof getStudentOverviewInputSchema
>;

/**
 * One bounded snapshot of one student at one instant.
 *
 * §10.1 — eight independently clocked reads would let the ledger, the chart
 * beneath it, and the standing below that describe three different moments
 * while sitting on one screen, and a student comparing them would be right
 * that they disagree.
 *
 * `standing` is null when the academy has not enabled the section. It is a
 * field rather than a second procedure so the single-instant guarantee holds
 * across it too; the feature flag is read before any aggregate runs, so a
 * disabled academy costs nothing to answer.
 */
export const studentAcademyOverviewSchema = z
  .object({
    scope: studentOverviewScopeSchema,
    continueTargets: z
      .array(continueTargetSchema)
      .max(STUDENT_MAX_CONTINUE_ROWS),
    ledger: studentLedgerSchema,
    courses: z.array(studentCourseProgressSchema),
    activity: z
      .object({
        bucket: activityBucketSchema,
        points: z.array(studentActivityPointSchema),
      })
      .strict(),
    messages: z.array(studentMessageSchema).max(STUDENT_MAX_PREVIEW_ROWS),
    unreadMessages: countSchema,
    practice: z.array(practiceExerciseSchema).max(STUDENT_MAX_PRACTICE_ROWS),
    records: z.array(studentRecordSchema).max(STUDENT_MAX_PREVIEW_ROWS),
    /** Null when the academy has not enabled class standing at all. */
    standing: classStandingSchema.nullable(),
    /** Every class the standing could describe, when there is more than one. */
    standingClasses: z.array(studentOverviewClassSchema),
    unavailable: z.array(studentOverviewSectionSchema),
  })
  .strict();
export type StudentAcademyOverview = z.infer<
  typeof studentAcademyOverviewSchema
>;
