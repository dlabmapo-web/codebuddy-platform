import { z } from "zod";

import {
  academyDayStart,
  addLocalDays,
  academyLocalDate,
  localDaysBetween,
  type LocalDate,
} from "./academy-time.js";
import {
  teacherAttentionKinds,
  type TeacherAttentionKind,
} from "./teacher-progress.js";

/**
 * What a teacher's academy overview is made of, and how every number in it is
 * decided.
 *
 * Two rules shape the whole file.
 *
 * Nothing here ranks a child permanently. Ordering exists — a teacher asking
 * "who should I check first" is asking for one — but it is always a function of
 * the filters currently on screen, it always travels with the measurement that
 * produced it, and it never reaches a student-facing contract. A single opaque
 * score is the thing §4 rules out, and a schema with nowhere to put one cannot
 * grow one.
 *
 * The thresholds, the ordering, and the period arithmetic are pure functions
 * rather than SQL or React. A rule that lives in a query cannot be tested at
 * its boundaries, and a rule that lives in a chart component is a rule the
 * accessible table will state differently.
 *
 * See §6, §7.4, and §14.1 of the teacher overview and student analytics
 * redesign.
 */

const labelSchema = z.string().trim().min(1).max(200);
const percentSchema = z.number().int().min(0).max(100);
const countSchema = z.number().int().nonnegative();
const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/* ------------------------------------------------------------- thresholds */

/**
 * Every threshold the overview compares against, named once.
 *
 * Constants, not settings, for the same reason the attention thresholds are:
 * two classes that could disagree about what "low participation" means would
 * make the word useless in a staff room.
 */

/** Under half an hour of counted app time a week is low participation. */
export const LOW_PARTICIPATION_MINUTES_PER_WEEK = 30;
/** Fewer attempted exercises than this cannot be interpreted either way. */
export const MIN_ATTEMPTED_TO_INTERPRET = 3;
/** A lecture is "ready" for a student who solved this share of it. */
export const LECTURE_READY_SOLVED_PERCENT = 80;
/** A curriculum or problem signal below this many students is a coincidence. */
export const MIN_STUDENTS_FOR_COMPARISON = 3;

/** §10.2 — the bounded payload, stated where both sides can read it. */
export const OVERVIEW_MAX_PARTICIPATION_STUDENTS = 250;
/** §6.3, §6.6, §6.7, §6.9 — five rows is what a preview is. */
export const OVERVIEW_MAX_LIST_ROWS = 5;
/** §6.8 — readiness is the one section the spec bounds at three. */
export const OVERVIEW_MAX_READINESS_ROWS = 3;

/* --------------------------------------------------------- active learning */

/** §8.3 — one heartbeat may buy at most this much counted time. */
export const ACTIVITY_HEARTBEAT_MAX_SECONDS = 15;
/** Two accepted heartbeats further apart than this do not span an interval. */
export const ACTIVITY_MAX_GAP_MS = 30_000;
/** A student's accumulated seconds reach PostgreSQL at most this often. */
export const ACTIVITY_FLUSH_INTERVAL_MS = 60_000;
/** A completed flush receipt is kept this long, past the retry horizon. */
export const ACTIVITY_RECEIPT_RETENTION_DAYS = 7;

/**
 * How much counted time one accepted heartbeat is worth.
 *
 * The client never sends a duration. It says "I am here and the student just
 * did something", and this decides what that is worth from the gap since the
 * last accepted beat — capped, so a laptop that slept through lunch and woke up
 * mid-lesson cannot buy four hours of learning with one message.
 *
 * A gap wider than the cadence closes the interval rather than filling it: the
 * student may have been working offline, or may have been at dinner, and the
 * overview refuses to guess which.
 *
 * See §8.3.
 */
export function heartbeatActiveSeconds(input: {
  lastAcceptedAt: number | null;
  now: number;
  maxGapMs?: number;
  capSeconds?: number;
}): number {
  const maxGapMs = input.maxGapMs ?? ACTIVITY_MAX_GAP_MS;
  const capSeconds = input.capSeconds ?? ACTIVITY_HEARTBEAT_MAX_SECONDS;
  // The first beat of an interval measures nothing. It opens the interval; the
  // next one is what says how long the student stayed.
  if (input.lastAcceptedAt === null) return 0;
  const elapsedMs = input.now - input.lastAcceptedAt;
  if (elapsedMs <= 0 || elapsedMs > maxGapMs) return 0;
  return Math.min(capSeconds, Math.round(elapsedMs / 1000));
}

/* ------------------------------------------------------------------ scope */

export const overviewRanges = ["7d", "30d", "all"] as const;
export const overviewRangeSchema = z.enum(overviewRanges);
export type OverviewRange = z.infer<typeof overviewRangeSchema>;

/**
 * The period a response actually describes.
 *
 * Printed rather than implied. "7 days" means different days to a teacher
 * opening the page at 00:30 than at 23:30, and a screenshot of an overview
 * should still be readable next month.
 */
export const overviewPeriodSchema = z
  .object({
    range: overviewRangeSchema,
    timeZone: z.string().min(1).max(64),
    /** Null for `all`, which starts at whatever data exists. */
    startDate: localDateSchema.nullable(),
    endDate: localDateSchema,
    startAt: z.iso.datetime().nullable(),
    endAt: z.iso.datetime(),
    /** Counted calendar days, or null for `all`. */
    days: z.number().int().positive().nullable(),
  })
  .strict();
export type OverviewPeriod = z.infer<typeof overviewPeriodSchema>;

/**
 * Period boundaries, from one request timestamp.
 *
 * The end is the exclusive start of tomorrow, so today counts in full while it
 * is still being lived, and the start is the first of `days` whole local
 * calendar days ending with today — not "seven days back from now", which would
 * compare a partial Tuesday against a whole one.
 */
export function resolveOverviewPeriod(input: {
  range: OverviewRange;
  now: Date;
  timeZone: string;
}): OverviewPeriod {
  const { range, now, timeZone } = input;
  const endDate = academyLocalDate(now, timeZone);
  const endAt = academyDayStart(addLocalDays(endDate, 1), timeZone);

  if (range === "all") {
    return {
      range,
      timeZone,
      startDate: null,
      endDate,
      startAt: null,
      endAt: endAt.toISOString(),
      days: null,
    };
  }

  const days = range === "7d" ? 7 : 30;
  const startDate = addLocalDays(endDate, -(days - 1));

  return {
    range,
    timeZone,
    startDate,
    endDate,
    startAt: academyDayStart(startDate, timeZone).toISOString(),
    endAt: endAt.toISOString(),
    days,
  };
}

/**
 * The counted-minutes floor for a period, from the weekly rule.
 *
 * §6.3 states low participation in seven-day terms. Restating it as a rate is
 * what lets the same sentence hold for a thirty-day view without either
 * flagging most of a class or flagging nobody.
 */
export function lowParticipationFloorSeconds(days: number | null): number {
  const weeks = days === null ? 1 : Math.max(1, days) / 7;
  return Math.round(LOW_PARTICIPATION_MINUTES_PER_WEEK * 60 * weeks);
}

/* ---------------------------------------------------------------- filters */

export const overviewFilterOptionSchema = z
  .object({ value: z.uuid(), label: labelSchema })
  .strict();
export type OverviewFilterOption = z.infer<typeof overviewFilterOptionSchema>;

/**
 * A course option, carrying the classes that actually teach it.
 *
 * The dependency is data rather than a client rule: selecting a class narrows
 * the course list, and a browser that had to guess which courses survive would
 * guess differently from the server that authorizes them.
 */
export const overviewCourseOptionSchema = z
  .object({
    value: z.uuid(),
    label: labelSchema,
    classIds: z.array(z.uuid()),
  })
  .strict();
export type OverviewCourseOption = z.infer<typeof overviewCourseOptionSchema>;

export const overviewFiltersSchema = z
  .object({
    classes: z.array(overviewFilterOptionSchema),
    courses: z.array(overviewCourseOptionSchema),
  })
  .strict();
export type OverviewFilters = z.infer<typeof overviewFiltersSchema>;

export const overviewScopeSchema = z
  .object({
    academyId: z.uuid(),
    /** The selected class, or null for every assigned class. */
    classId: z.uuid().nullable(),
    courseId: z.uuid().nullable(),
    classCount: countSchema,
    courseCount: countSchema,
    /** Distinct students, counted once however many selected classes hold them. */
    enrolledStudents: countSchema,
    period: overviewPeriodSchema,
    /**
     * The first local date any activity was recorded for this academy.
     *
     * §5.3 — time before this was never tracked and is never reconstructed, so
     * the interface can say so rather than showing an honest zero as a decline.
     */
    activityTrackedSince: localDateSchema.nullable(),
    generatedAt: z.iso.datetime(),
  })
  .strict();
export type OverviewScope = z.infer<typeof overviewScopeSchema>;

/* ---------------------------------------------------------- metrics ledger */

/**
 * The five measurements §6.4 asks for, as one ledger rather than five heroes.
 *
 * Each entry carries its own denominator and its own missing-data disclosure,
 * because the honest answer to four of these five is sometimes "not measured"
 * and a ledger that could only print numbers would print zero instead.
 */
export const overviewLedgerSchema = z
  .object({
    /** Distinct active student memberships, counted once across classes. */
    students: z
      .object({ total: countSchema, active: countSchema })
      .strict(),
    /**
     * Distinct currently visible courses, and the class-course assignments
     * behind them. §6.4 — the primary value is the distinct count, and the
     * caption says which is which.
     */
    courses: z
      .object({ distinct: countSchema, assignments: countSchema })
      .strict(),
    /** De-duplicated student-course seconds, with the per-student mean. */
    activeLearning: z
      .object({
        totalSeconds: countSchema,
        averageSecondsPerStudent: countSchema.nullable(),
      })
      .strict(),
    /** Local calendar days with at least one counted interval from anyone. */
    activeDays: z
      .object({
        days: countSchema,
        /** The days the period contains, or null for `all`. */
        periodDays: z.number().int().positive().nullable(),
        activeStudents: countSchema,
        enrolledStudents: countSchema,
      })
      .strict(),
    /**
     * The mean of each scoped student's period-aware average best score.
     *
     * `withoutScore` is reported rather than folded in: §6.4 forbids treating a
     * missing score as zero, and a mean that silently included them would be
     * the most misleading number on the page.
     */
    averageScore: z
      .object({
        value: percentSchema.nullable(),
        scoredStudents: countSchema,
        withoutScore: countSchema,
        attemptedProblems: countSchema,
      })
      .strict(),
  })
  .strict();
export type OverviewLedger = z.infer<typeof overviewLedgerSchema>;

/**
 * A student's average best score over the problems they attempted.
 *
 * Null rather than zero when nothing was attempted. A student who has not
 * started is not a student scoring nought, and printing one as the other is
 * the single most misleading thing this page could do.
 *
 * Unattempted work is deliberately absent from the denominator, which is why
 * §7.4 requires the attempted count to be displayed beside the value: 100% on
 * one problem and 100% across twenty are not the same claim.
 */
export function averageBestScore(input: {
  scoreSum: number;
  attemptedProblems: number;
}): number | null {
  if (input.attemptedProblems <= 0) return null;
  return clampPercent(Math.round(input.scoreSum / input.attemptedProblems));
}

/** The mean of the students who have a score at all. */
export function meanOfScores(scores: (number | null)[]): number | null {
  const scored = scores.filter((score): score is number => score !== null);
  if (scored.length === 0) return null;
  return clampPercent(
    Math.round(scored.reduce((total, score) => total + score, 0) / scored.length),
  );
}

/** The share of a roster that reached a threshold, as a whole percent. */
export function sharePercent(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return clampPercent(Math.round((part / whole) * 100));
}

/** The middle value, or null when there is nothing to take a middle of. */
export function medianOf(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/* -------------------------------------------------------------- attention */

/**
 * The §6.3 reason vocabulary: the three Solution status already names, plus the
 * two participation reasons only an academy-wide view can see.
 *
 * Extending the class-level list rather than replacing it is what keeps the
 * overview and Solution status from disagreeing about the same student. Both
 * additions are as factual as the three they join: one counts days without a
 * signal, the other compares counted time against a stated floor.
 */
export const overviewAttentionKinds = [
  ...teacherAttentionKinds,
  "inactive",
  "low_participation",
] as const;
export const overviewAttentionKindSchema = z.enum(overviewAttentionKinds);
export type OverviewAttentionKind = z.infer<
  typeof overviewAttentionKindSchema
>;

export const overviewAttentionReasonSchema = z
  .object({
    kind: overviewAttentionKindSchema,
    /**
     * `repeated_failures` → consecutive failed attempts.
     * `stalled` → whole days since the last attempt.
     * `long_solve` → measured seconds on the latest failed attempt.
     * `inactive` → whole days since any counted signal, capped at the period.
     * `low_participation` → counted minutes, against the period's floor.
     */
    value: countSchema,
  })
  .strict();
export type OverviewAttentionReason = z.infer<
  typeof overviewAttentionReasonSchema
>;

/**
 * The order a teacher should read attention in, stated once.
 *
 * Not a severity score: it is a reading order, and the numbers stay on every
 * row so a teacher can disagree with it. Repeated failure comes first because
 * it is the only reason that says a student is actively stuck right now.
 */
const attentionPriority: Record<OverviewAttentionKind, number> = {
  repeated_failures: 0,
  stalled: 1,
  long_solve: 2,
  inactive: 3,
  low_participation: 4,
};

export function attentionRank(kinds: OverviewAttentionKind[]): number {
  return kinds.reduce(
    (best, kind) => Math.min(best, attentionPriority[kind]),
    Number.MAX_SAFE_INTEGER,
  );
}

/**
 * The two participation reasons, decided from measurements alone.
 *
 * `inactive` needs no scores at all, which is the point: a student who has not
 * opened the app cannot produce a failure signal, and a page that only knew how
 * to notice failure would call them fine.
 *
 * The two are mutually exclusive by construction — no signal at all is already
 * said by `inactive`, and saying "0 minutes, below the floor" underneath it
 * would print the same silence twice.
 */
export function participationAttentionReasons(input: {
  activeSeconds: number;
  submissions: number;
  daysSinceActivity: number | null;
  periodDays: number | null;
  floorSeconds: number;
}): OverviewAttentionReason[] {
  if (input.activeSeconds <= 0 && input.submissions <= 0) {
    return [
      {
        kind: "inactive",
        // No signal ever recorded reads as the whole period rather than as zero
        // days, which would print "inactive for 0 days" on the emptiest row.
        value: input.daysSinceActivity ?? input.periodDays ?? 0,
      },
    ];
  }

  if (input.activeSeconds < input.floorSeconds) {
    return [
      {
        kind: "low_participation",
        // Minutes, because the copy beside it is written in minutes and a
        // reason whose unit differs from its sentence is a reason nobody reads.
        value: Math.round(input.activeSeconds / 60),
      },
    ];
  }

  return [];
}

/** Every reason a row can hold, deduplicated and in reading order. */
export function orderAttentionReasons(
  reasons: OverviewAttentionReason[],
): OverviewAttentionReason[] {
  const strongest = new Map<OverviewAttentionKind, OverviewAttentionReason>();
  for (const reason of reasons) {
    const current = strongest.get(reason.kind);
    // The larger measurement wins for a kind: five consecutive failures and
    // three are the same reason, and the one worth printing is the worse one.
    if (!current || reason.value > current.value) {
      strongest.set(reason.kind, reason);
    }
  }
  return [...strongest.values()].sort(
    (left, right) => attentionPriority[left.kind] - attentionPriority[right.kind],
  );
}

/* --------------------------------------------------------- teaching queue */

/**
 * One row of the signature surface: who to check, why, and what says so.
 *
 * Every field is either an identity or a measurement. There is deliberately no
 * severity, level, band, or label — §6.3 forbids calling a child weak, and a
 * schema with nowhere to put an adjective cannot acquire one later.
 */
export const teachingQueueStudentSchema = z
  .object({
    membershipId: z.uuid(),
    displayName: labelSchema,
    classId: z.uuid(),
    className: labelSchema,
    /** In reading order; the first is the row's primary reason. */
    reasons: z.array(overviewAttentionReasonSchema).min(1),
    activeSeconds: countSchema,
    activeDays: countSchema,
    averageScore: percentSchema.nullable(),
    attemptedProblems: countSchema,
    /** Where they were last working, in curriculum words. */
    curriculumLabel: labelSchema.nullable(),
    materialId: z.uuid().nullable(),
    courseId: z.uuid().nullable(),
    lastActivityAt: z.iso.datetime().nullable(),
  })
  .strict();
export type TeachingQueueStudent = z.infer<typeof teachingQueueStudentSchema>;

/**
 * The §6.3 order: reason priority, then the most recent relevant evidence,
 * then a stable membership id.
 *
 * The final tiebreak is not cosmetic. Without it two students with identical
 * signals swap places between requests, and a teacher reading a five-row list
 * would see it reorder under them for no reason they could name.
 */
export function compareTeachingQueue(
  left: TeachingQueueStudent,
  right: TeachingQueueStudent,
): number {
  const byReason =
    attentionRank(left.reasons.map((reason) => reason.kind)) -
    attentionRank(right.reasons.map((reason) => reason.kind));
  if (byReason !== 0) return byReason;

  // Never active sorts first within a reason: a student with no signal at all
  // is the furthest thing from recently seen, and the queue is a list of who
  // has waited longest for a look.
  const leftSeen = left.lastActivityAt ? Date.parse(left.lastActivityAt) : 0;
  const rightSeen = right.lastActivityAt ? Date.parse(right.lastActivityAt) : 0;
  if (leftSeen !== rightSeen) return leftSeen - rightSeen;

  return left.membershipId.localeCompare(right.membershipId);
}

/* ---------------------------------------------------- student participation */

/**
 * One bar pair in the CEO-required participation chart.
 *
 * Both series come from submissions created inside the selected period, so a
 * solve from last term does not appear as this week's participation. The
 * tooltip fields ride along rather than being fetched again — §6.5 names four
 * of them and a second request would let the tooltip describe another moment.
 */
export const participationRowSchema = z
  .object({
    membershipId: z.uuid(),
    displayName: labelSchema,
    /** Present only when a single class is selected; §6.5. */
    className: labelSchema.nullable(),
    submissions: countSchema,
    solvedProblems: countSchema,
    activeSeconds: countSchema,
    averageScore: percentSchema.nullable(),
  })
  .strict();
export type ParticipationRow = z.infer<typeof participationRowSchema>;

/* ------------------------------------------------------------- previews */

/** §6.6 — five students by score, for the current scope only. */
export const scorePreviewRowSchema = z
  .object({
    membershipId: z.uuid(),
    displayName: labelSchema,
    classId: z.uuid().nullable(),
    className: labelSchema.nullable(),
    averageScore: percentSchema.nullable(),
    attemptedProblems: countSchema,
    lastActivityAt: z.iso.datetime().nullable(),
  })
  .strict();
export type ScorePreviewRow = z.infer<typeof scorePreviewRowSchema>;

/** §6.7 — five students by counted time, in both directions. */
export const activeTimePreviewRowSchema = z
  .object({
    membershipId: z.uuid(),
    displayName: labelSchema,
    classId: z.uuid().nullable(),
    className: labelSchema.nullable(),
    activeSeconds: countSchema,
    activeDays: countSchema,
    lastActivityAt: z.iso.datetime().nullable(),
  })
  .strict();
export type ActiveTimePreviewRow = z.infer<typeof activeTimePreviewRowSchema>;

/* ----------------------------------------------------- curriculum readiness */

export const curriculumReadinessRowSchema = z
  .object({
    lectureId: z.uuid(),
    lectureTitle: labelSchema,
    moduleTitle: labelSchema,
    courseTitle: labelSchema,
    outlineNumber: z.string().max(24).nullable(),
    /** Students the lecture is assigned to, whether or not they started. */
    eligibleStudents: countSchema,
    attemptingStudents: countSchema,
    readyStudents: countSchema,
    /** Null when too few students attempted for the figure to describe them. */
    readiness: percentSchema.nullable(),
    classId: z.uuid(),
    courseId: z.uuid(),
  })
  .strict();
export type CurriculumReadinessRow = z.infer<
  typeof curriculumReadinessRowSchema
>;

/**
 * Readiness: students who have solved most of a lecture, over the roster.
 *
 * Deliberately a per-student threshold rather than an average of percentages.
 * A lecture where half the class finished everything and half started nothing
 * is 50% ready, which is what a teacher deciding whether to move on needs to
 * know; the average would report 50% "done" for a class where everyone is
 * halfway, and those are different lessons.
 *
 * Null below the comparison floor rather than a small number: §6.8 requires an
 * explanatory state instead of a percentage two children happened to produce.
 */
export function lectureReadiness(input: {
  perStudentSolvedPercent: number[];
  eligibleStudents: number;
  attemptingStudents: number;
  threshold?: number;
  minimumStudents?: number;
}): { readiness: number | null; readyStudents: number } {
  const threshold = input.threshold ?? LECTURE_READY_SOLVED_PERCENT;
  const minimum = input.minimumStudents ?? MIN_STUDENTS_FOR_COMPARISON;
  const readyStudents = input.perStudentSolvedPercent.filter(
    (percent) => percent >= threshold,
  ).length;
  return {
    readiness:
      input.attemptingStudents < minimum
        ? null
        : sharePercent(readyStudents, input.eligibleStudents),
    readyStudents,
  };
}

/**
 * §6.8's order: least ready first, then the lecture more students have reached,
 * then curriculum position.
 *
 * Position is the final tiebreak rather than the id, so two equally unready
 * lectures appear in the order the course teaches them and the list does not
 * reshuffle between two identical requests.
 */
export function compareCurriculumReadiness(
  left: CurriculumReadinessRow & { position: number },
  right: CurriculumReadinessRow & { position: number },
): number {
  return (
    (left.readiness ?? 0) - (right.readiness ?? 0) ||
    right.attemptingStudents - left.attemptingStudents ||
    left.position - right.position ||
    left.lectureId.localeCompare(right.lectureId)
  );
}

/* ----------------------------------------------------- difficult problems */

export const difficultProblemSchema = z
  .object({
    materialId: z.uuid(),
    title: labelSchema,
    courseTitle: labelSchema,
    moduleTitle: labelSchema,
    lectureTitle: labelSchema,
    outlineNumber: z.string().max(24).nullable(),
    attemptingStudents: countSchema,
    solvedStudents: countSchema,
    solveRate: percentSchema,
    /** Every counted attempt, so repeated tries are visible as volume. */
    submissions: countSchema,
    classId: z.uuid(),
  })
  .strict();
export type DifficultProblem = z.infer<typeof difficultProblemSchema>;

/**
 * §6.9's order, as a comparator.
 *
 * Repeated submissions by one student raise `submissions` but never
 * `attemptingStudents`, so a problem one child retried twenty times cannot
 * outrank a problem twenty children each failed once.
 */
export function compareDifficultProblems(
  left: DifficultProblem & { position: number },
  right: DifficultProblem & { position: number },
): number {
  return (
    left.solveRate - right.solveRate ||
    right.attemptingStudents - left.attemptingStudents ||
    right.submissions - left.submissions ||
    left.position - right.position ||
    left.materialId.localeCompare(right.materialId)
  );
}

/* ------------------------------------------------------ partial failure */

/**
 * A section that could not be computed, named by a stable code.
 *
 * §6.10 — one failing aggregate must not falsify the rest of the page. The
 * panel says what is missing; the numbers that did load stay, because a teacher
 * who cannot tell an outage from an empty class will believe the empty class.
 */
export const overviewSections = [
  "queue",
  "ledger",
  "participation",
  "scores",
  "activity",
  "readiness",
  "problems",
] as const;
export const overviewSectionSchema = z.enum(overviewSections);
export type OverviewSection = z.infer<typeof overviewSectionSchema>;

/* ----------------------------------------------------------- the response */

export const academyTeacherOverviewSchema = z
  .object({
    scope: overviewScopeSchema,
    filters: overviewFiltersSchema,
    /** §6.3 — the signature surface, first in the payload as on the page. */
    queue: z.array(teachingQueueStudentSchema).max(OVERVIEW_MAX_LIST_ROWS),
    /** Distinct students holding at least one reason, across the whole scope. */
    queueTotal: countSchema,
    ledger: overviewLedgerSchema,
    participation: z
      .array(participationRowSchema)
      .max(OVERVIEW_MAX_PARTICIPATION_STUDENTS),
    /** True when the roster exceeded the participation cap; §6.5. */
    participationTruncated: z.boolean(),
    scorePreview: z.array(scorePreviewRowSchema).max(OVERVIEW_MAX_LIST_ROWS),
    mostActive: z.array(activeTimePreviewRowSchema).max(OVERVIEW_MAX_LIST_ROWS),
    leastActive: z.array(activeTimePreviewRowSchema).max(OVERVIEW_MAX_LIST_ROWS),
    readiness: z
      .array(curriculumReadinessRowSchema)
      .max(OVERVIEW_MAX_READINESS_ROWS),
    problems: z.array(difficultProblemSchema).max(OVERVIEW_MAX_LIST_ROWS),
    unavailable: z.array(overviewSectionSchema),
  })
  .strict();
export type AcademyTeacherOverview = z.infer<
  typeof academyTeacherOverviewSchema
>;

export const getAcademyTeacherOverviewInputSchema = z.object({
  academyId: z.uuid(),
  classId: z.uuid().optional(),
  courseId: z.uuid().optional(),
  range: overviewRangeSchema.optional(),
});
export type GetAcademyTeacherOverviewInput = z.infer<
  typeof getAcademyTeacherOverviewInputSchema
>;

/* ------------------------------------------------------------- formatting */

/**
 * Whole days since an instant, in academy-local calendar terms.
 *
 * Calendar days rather than elapsed hours: "inactive for 3 days" should mean
 * three dates on a wall calendar, which is how a teacher who saw the student on
 * Monday will read it.
 */
export function localDaysSince(input: {
  from: Date | string | null;
  now: Date;
  timeZone: string;
}): number | null {
  if (!input.from) return null;
  return Math.max(
    0,
    localDaysBetween(
      academyLocalDate(input.from, input.timeZone),
      academyLocalDate(input.now, input.timeZone),
    ),
  );
}

export type { TeacherAttentionKind, LocalDate };
