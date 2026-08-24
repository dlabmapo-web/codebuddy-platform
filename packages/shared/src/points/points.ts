import { z } from "zod";

import { memberAvatarUrlsSchema } from "../profile/avatar.js";
import { pointsPeriodKinds } from "./period.js";

/**
 * What the points page is made of.
 *
 * The schemas carry the design's two load-bearing constraints rather than
 * merely describing them.
 *
 * **Points are earned, never lost.** `amount` is a positive integer everywhere.
 * There is no reason code for a penalty and no shape a deduction could travel
 * in, so a future edit that wanted one would have to change this file on
 * purpose — §7.6 of the student points design.
 *
 * **A leaderboard row carries exactly one identity field.** `displayName` is
 * the academy-scoped name a manager set: never an email, a username, a real
 * name from the user account, a membership id, or a user id. A position is
 * scoped to one class and one period that expires, so no row here survives a
 * season. Adding a field that did would be a deliberate edit to a schema whose
 * doc comment says why it must not happen — §10.2 and §17.
 */

const countSchema = z.number().int().nonnegative();
const pointsSchema = z.number().int().nonnegative();
const labelSchema = z.string().trim().min(1).max(200);
const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/* ------------------------------------------------------------------ period */

export const pointsPeriodKindSchema = z.enum(pointsPeriodKinds);

export const pointsPeriodSchema = z
  .object({
    kind: pointsPeriodKindSchema,
    timeZone: z.string(),
    startDate: localDateSchema,
    endDate: localDateSchema,
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
  })
  .strict();
export type PointsPeriodView = z.infer<typeof pointsPeriodSchema>;

/* ------------------------------------------------------------------ reason */

export const pointReasons = [
  "ATTENDANCE",
  "ATTENDANCE_LATE",
  "LEARNING_TIME",
  "EXERCISE_SOLVED",
  "LECTURE_COMPLETED",
  "MODULE_COMPLETED",
  "COURSE_COMPLETED",
] as const;

export const pointReasonSchema = z.enum(pointReasons);
export type PointReasonName = z.infer<typeof pointReasonSchema>;

/* ------------------------------------------------------------------ ledger */

/** One earned line. Immutable except for a void, which is an exclusion. */
export const pointAwardRowSchema = z
  .object({
    id: z.uuid(),
    reason: pointReasonSchema,
    /** Always positive. §7.6. */
    amount: z.number().int().positive(),
    /** The label this row printed when it was written, frozen since. */
    subjectLabel: labelSchema,
    /** Difficulty, for a solve. Printed as a word, never as a colour. */
    difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).nullable(),
    localDate: localDateSchema.nullable(),
    createdAt: z.iso.datetime(),
    /** The daily cap trimmed this line, so the ledger can say why. */
    capped: z.boolean(),
    /** A platform correction. Excluded from every sum; still shown. */
    voided: z.boolean(),
    voidReason: z.string().max(500).nullable(),
    /** Where the work was, when there is somewhere to go back to. */
    materialId: z.uuid().nullable(),
    courseId: z.uuid().nullable(),
  })
  .strict();
export type PointAwardRow = z.infer<typeof pointAwardRowSchema>;

/**
 * One page of the ledger, and enough to draw a pager.
 *
 * Offset paging rather than a cursor. A cursor is the better shape for a feed
 * that only ever grows downward, and it is what this started as — but it can
 * only ever offer "more", and a student with four hundred rows was left
 * pressing it. A pager needs to know how many pages there are, which needs a
 * total, which a cursor cannot give. The extra `COUNT` is one indexed query
 * against one student's rows.
 */
export const pointsLedgerPageSchema = z
  .object({
    rows: z.array(pointAwardRowSchema),
    /** 1-based, echoed back so a client never has to assume it got what it asked. */
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    /** Every row this student has, not the ones on this page. */
    totalRows: countSchema,
  })
  .strict();
export type PointsLedgerPage = z.infer<typeof pointsLedgerPageSchema>;

/* ------------------------------------------------------------- leaderboard */

/**
 * One student on the board.
 *
 * `displayName` is the only identity field, and `isYou` is the only thing that
 * marks one row out from another. See this module's header.
 */
/**
 * How one student's points were actually made.
 *
 * §10.5 promises that a student can always work out why somebody is above
 * them. A single total honours that only in principle: it says 30P and leaves
 * a child to guess whether the row above solved more, solved harder, or simply
 * sat at the machine for longer. The composition answers it outright, and the
 * counts multiplied by the published rates in the rules section reproduce the
 * total exactly — which is what makes the board auditable by the children on
 * it rather than only by the people who wrote it.
 *
 * It is the same information for every row, including the reader's own. There
 * is nothing here a student can see about a classmate that the classmate
 * cannot see about them.
 *
 * Counts of *paid* facts, not of attempts: a problem solved twice pays once
 * and appears once, and a failed submission appears nowhere. Nothing here can
 * be read as a record of struggle.
 *
 * ## The four point fields are exhaustive
 *
 * `solvePoints + finishPoints + attendancePoints + learningPoints` equals the
 * row's `points`, always. Every one of the seven reasons in `pointReasons`
 * lands in exactly one of them, so the board can print a total beside its four
 * parts and a child can add them up and get the same answer. That property is
 * the reason these are sums of what was actually paid rather than counts
 * multiplied by a published rate: the daily cap truncates an award, and a
 * derived figure would disagree with the ledger on exactly the days a student
 * worked hardest.
 */
export const leaderboardBreakdownSchema = z
  .object({
    /* ---- solving ---- */
    solvedEasy: countSchema,
    solvedMedium: countSchema,
    solvedHard: countSchema,
    solvedEasyPoints: pointsSchema,
    solvedMediumPoints: pointsSchema,
    solvedHardPoints: pointsSchema,
    /** Everything `EXERCISE_SOLVED` paid, including rows with no difficulty. */
    solvePoints: pointsSchema,

    /* ---- finishing ---- */
    lectures: countSchema,
    modules: countSchema,
    courses: countSchema,
    /** Lectures, modules, and courses together. */
    finishPoints: pointsSchema,

    /* ---- turning up ---- */
    /** Class sessions the student was counted present for. */
    attendance: countSchema,
    attendancePoints: pointsSchema,

    /* ---- time ---- */
    /**
     * Counted active minutes in the period.
     *
     * Reported, never ranked — §10.3 keeps time out of the ordering keys,
     * because a child who understands the material solves the same problem in
     * less time and a board ordered on minutes would place them below a child
     * who struggled. A student may sort by it; the board never does.
     */
    learningMinutes: countSchema,
    /** What the time ladder paid. A threshold reached, never a rate per minute. */
    learningPoints: pointsSchema,
  })
  .strict();
export type LeaderboardBreakdown = z.infer<typeof leaderboardBreakdownSchema>;

export const leaderboardRowSchema = z
  .object({
    position: z.number().int().positive(),
    displayName: labelSchema,
    /**
     * The photo this member chose, resolved through the usual chain.
     *
     * Named in §10.1's row shape from the start. It is the second identity
     * field on the row and the last one: a face and the name beside it are
     * what make a list of eighteen classmates scannable, and everything past
     * that would be a fact about a child rather than about their week.
     */
    avatar: memberAvatarUrlsSchema,
    points: pointsSchema,
    solvedProblems: countSchema,
    activeDays: countSchema,
    breakdown: leaderboardBreakdownSchema,
    /** True only when the position rose against the previous period. */
    improved: z.boolean(),
    isYou: z.boolean(),
  })
  .strict();
export type LeaderboardRow = z.infer<typeof leaderboardRowSchema>;

/** The gap the season plate prints. §11.2. */
export const rankGapSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("chase"), points: pointsSchema }).strict(),
  z.object({ kind: z.literal("lead"), points: pointsSchema }).strict(),
  z.object({ kind: z.literal("alone") }).strict(),
]);
export type RankGapView = z.infer<typeof rankGapSchema>;

export const leaderboardIneligibleReasons = [
  "TOO_FEW_STUDENTS",
  "NO_ACTIVITY_YET",
  "NOT_ENROLLED",
  /**
   * The board's own read failed. Distinct from every reason above, which are
   * answers — this one is an apology, and it exists so a failing aggregate
   * takes down the board rather than the page. §12.3.
   */
  "UNAVAILABLE",
] as const;
export const leaderboardIneligibleReasonSchema = z.enum(
  leaderboardIneligibleReasons,
);
export type LeaderboardIneligibleReason = z.infer<
  typeof leaderboardIneligibleReasonSchema
>;

export const leaderboardClassSchema = z
  .object({ classId: z.uuid(), name: labelSchema })
  .strict();
export type LeaderboardClass = z.infer<typeof leaderboardClassSchema>;

export const leaderboardSchema = z.discriminatedUnion("eligible", [
  z
    .object({
      eligible: z.literal(false),
      reason: leaderboardIneligibleReasonSchema,
      /** The classes the reader may switch to, even when this one is quiet. */
      classes: z.array(leaderboardClassSchema),
      classId: z.uuid().nullable(),
    })
    .strict(),
  z
    .object({
      eligible: z.literal(true),
      classId: z.uuid(),
      className: labelSchema,
      classes: z.array(leaderboardClassSchema),
      participants: z.number().int().positive(),
      rows: z.array(leaderboardRowSchema),
    })
    .strict(),
]);
export type Leaderboard = z.infer<typeof leaderboardSchema>;

/* -------------------------------------------------------------- the plate */

/**
 * The reader's own standing.
 *
 * `position` and `participants` are null when there is no board — a student
 * still has a total, and a plate that printed a rank out of nothing would be
 * inventing one.
 */
export const pointsStandingSchema = z
  .object({
    points: pointsSchema,
    solvedProblems: countSchema,
    activeDays: countSchema,
    position: z.number().int().positive().nullable(),
    participants: z.number().int().positive().nullable(),
    gap: rankGapSchema,
  })
  .strict();
export type PointsStanding = z.infer<typeof pointsStandingSchema>;

/* --------------------------------------------------------------- the rules */

/**
 * What each action pays, from the same policy the awarding service reads.
 *
 * Sent to the client rather than written into the page's copy: a rules list a
 * translator can edit is a rules list that can disagree with the server.
 */
export const pointRulesSchema = z
  .object({
    solve: z
      .object({ easy: pointsSchema, medium: pointsSchema, hard: pointsSchema })
      .strict(),
    lectureCompleted: pointsSchema,
    moduleCompleted: pointsSchema,
    courseCompleted: pointsSchema,
    attendance: pointsSchema,
    attendanceLate: pointsSchema,
    learningTiers: z.array(
      z.object({ minutes: countSchema, points: pointsSchema }).strict(),
    ),
    dailyCap: pointsSchema,
  })
  .strict();
export type PointRules = z.infer<typeof pointRulesSchema>;

/* ------------------------------------------------- comparison resolution */

/**
 * Which comparison surface an academy shows a student — at most one, ever.
 *
 * §18.2 of the student points design: the class leaderboard supersedes the
 * class standing wherever both flags are on. Two comparison surfaces computed
 * differently will eventually disagree, and neither a student nor their
 * teacher would be able to say which is right.
 *
 * A pure function rather than three conditions inside an access service,
 * because "both must never render" is the kind of rule that survives exactly
 * as long as it is testable at its boundary.
 *
 * The points card requires **both** flags. §5.2 calls a leaderboard without
 * points a configuration error; offering the card on the leaderboard flag
 * alone would put a dead link on a child's overview.
 */
export function resolveComparisonSurface(
  enabled: Iterable<string>,
): { standing: boolean; points: boolean } {
  const on = new Set(enabled);
  const points = on.has("STUDENT_POINTS") && on.has("STUDENT_CLASS_LEADERBOARD");
  return { points, standing: !points && on.has("STUDENT_CLASS_STANDING") };
}

/* ------------------------------------------------------------ the card */

/**
 * The compact card the student overview carries. §6.1.
 *
 * Today's total, where it puts them, and a link. Deliberately not a board: the
 * overview answers "what should I work on now", and a ranked table of eighteen
 * classmates is the opposite of a hand-off. `position` is null whenever there
 * is no eligible board — a card that printed a rank out of nothing would be
 * inventing one.
 */
export const pointsSummarySchema = z
  .object({
    points: pointsSchema,
    position: z.number().int().positive().nullable(),
    participants: z.number().int().positive().nullable(),
  })
  .strict();
export type PointsSummary = z.infer<typeof pointsSummarySchema>;

/* ------------------------------------------------------------ page + input */

export const pointsPageSchema = z
  .object({
    academyId: z.uuid(),
    /**
     * Whose page this is, by the name their academy calls them.
     *
     * A student reading their own page gets their own name back, which costs
     * nothing. It exists for staff: "why does 지호 have 40 points" is a
     * question a parent asks a teacher, and a ledger that cannot name the
     * child it belongs to is a ledger nobody can answer it with. Never an
     * email, a username, or an id — §17.
     */
    subjectName: labelSchema,
    period: pointsPeriodSchema,
    standing: pointsStandingSchema,
    /** Null when the academy has not enabled the named board at all. */
    leaderboard: leaderboardSchema.nullable(),
    rules: pointRulesSchema,
    /**
     * Null when the ledger's own read failed. The board and the ledger fail
     * independently, and neither may take the plate with it — a student's own
     * total is the one number on this page that must never silently read
     * zero. §12.3.
     */
    ledger: pointsLedgerPageSchema.nullable(),
  })
  .strict();
export type PointsPage = z.infer<typeof pointsPageSchema>;

export const pointsPageInputSchema = z
  .object({
    academyId: z.uuid(),
    period: pointsPeriodKindSchema.optional(),
    classId: z.uuid().optional(),
    /**
     * Whose page this is. Omitted by a student — their own membership comes
     * from the identity and no input can aim the read at somebody else.
     * Supplied only by staff reading a student they are entitled to read.
     */
    membershipId: z.uuid().optional(),
  })
  .strict();
export type PointsPageInput = z.infer<typeof pointsPageInputSchema>;

/**
 * One class's board, read by staff. §5.1.
 *
 * The same shape a student sees, from the same query — a teacher and a student
 * comparing their screens must never see two different third places. `isYou`
 * is false on every row, because the reader is not on the board.
 *
 * The rows still carry no membership id. Staff reach a student's ledger from
 * the roster, which has ids already; putting one here would put an identifier
 * on a shape that also renders for children.
 */
/**
 * A board row as staff receive it, carrying the one field a student's never may.
 *
 * `membershipId` is what a "Points" link needs to open one child's ledger, and
 * it is the reason this is a second schema rather than an optional field on
 * `leaderboardRowSchema`. A student's board is sent to a child, and a child
 * holding every classmate's membership id is a fact about their classmates
 * that has nothing to do with a ranking — §10.1 says the student row carries
 * exactly one identity field, and it still does.
 *
 * The separation is structural, not a convention: `points.getPage` returns the
 * student shape and `points.getClassBoard` returns this one, and no request a
 * student can make reaches this schema. §5.1.
 */
export const staffLeaderboardRowSchema = leaderboardRowSchema
  .extend({ membershipId: z.uuid() })
  .strict();
export type StaffLeaderboardRow = z.infer<typeof staffLeaderboardRowSchema>;

export const staffLeaderboardSchema = z.discriminatedUnion("eligible", [
  z
    .object({
      eligible: z.literal(false),
      reason: leaderboardIneligibleReasonSchema,
      classes: z.array(leaderboardClassSchema),
      classId: z.uuid().nullable(),
    })
    .strict(),
  z
    .object({
      eligible: z.literal(true),
      classId: z.uuid(),
      className: labelSchema,
      classes: z.array(leaderboardClassSchema),
      participants: z.number().int().positive(),
      rows: z.array(staffLeaderboardRowSchema),
    })
    .strict(),
]);
export type StaffLeaderboard = z.infer<typeof staffLeaderboardSchema>;

export const classPointsBoardSchema = z
  .object({
    period: pointsPeriodSchema,
    /** Null when the reader runs no classes at all, so there is none to name. */
    className: labelSchema.nullable(),
    leaderboard: staffLeaderboardSchema,
  })
  .strict();
export type ClassPointsBoard = z.infer<typeof classPointsBoardSchema>;

export const classPointsBoardInputSchema = z
  .object({
    academyId: z.uuid(),
    /**
     * Optional, so one call serves both entry points.
     *
     * A teacher opens this from a class page and always names one. A manager
     * opens the academy-wide page with nothing chosen yet and gets the first
     * class they may read, along with the list to switch between — the same
     * shape the student's own board uses, for the same reason: a page that
     * needed two round trips to draw a picker and a table would show one
     * before the other.
     */
    classId: z.uuid().optional(),
    period: pointsPeriodKindSchema.optional(),
  })
  .strict();
export type ClassPointsBoardInput = z.infer<typeof classPointsBoardInputSchema>;

export const pointsLedgerInputSchema = z
  .object({
    academyId: z.uuid(),
    membershipId: z.uuid().optional(),
    /** 1-based. Absent means the first page. */
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().positive().max(100).optional(),
  })
  .strict();
export type PointsLedgerInput = z.infer<typeof pointsLedgerInputSchema>;

/** How many ledger rows one page carries by default. */
export const POINTS_LEDGER_PAGE_SIZE = 20;
/** §15 — a class larger than this is a data problem, and the board says so. */
export const LEADERBOARD_MAX_ROWS = 250;
