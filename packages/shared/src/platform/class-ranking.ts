import { z } from "zod";

import { pointsPeriodKindSchema } from "../points/points.js";

/**
 * Every academy's classes, ordered by what their students earned.
 *
 * The console's counterpart to the manager's class ranking page. A manager
 * picks one of *their* classes and reads its board; an operator has no academy,
 * so this answers the step in front of that — which class, out of every class
 * on the platform — and the board itself is still `points.getClassBoard`,
 * unchanged.
 *
 * ## Two levels, and the top one never ranks children
 *
 * §10.2 of the student points design is the constraint: a student can move a
 * position in a room of eighteen and cannot move one in an academy of four
 * hundred, so a list of every child on the platform would mostly rank enrolment
 * date. This contract therefore ranks **classes by aggregate**, and children
 * are ranked only within one class, by the board.
 *
 * No row here carries a child's name, a membership id, a submission, or a
 * grade. That is what lets the read sit behind `platform.analytics.read` while
 * the board it opens stays behind `platform.academies.inspect` — see the
 * service. It is a structural separation, not a convention: there is no field
 * on these schemas for a student.
 *
 * Read-only, and it cannot grow a write. Every point is awarded by the server
 * inside the transaction that recorded the fact it describes (§5.2), so there
 * is nothing here for a request to call.
 */

/* ------------------------------------------------------------- the shapes */

/** Which academy a row belongs to — the first thing an operator reads. */
export const rankingAcademySchema = z.object({
  academyId: z.uuid(),
  academyName: z.string().min(1),
  academySlug: z.string().min(1),
  /**
   * The clock this row's period was measured in.
   *
   * A period is academy-local, and the console reads every academy at once. It
   * is on the row so the table can state which "today" a figure covers rather
   * than implying one, and so a reader can tell two academies apart when their
   * days do not line up.
   */
  timeZone: z.string().min(1),
});

/**
 * Whether this class can be ranked at all, and why not.
 *
 * Both flags are per-academy, both default on, and a manager may switch either
 * off. A console page that simply omitted those academies would answer "why is
 * this academy missing from ranking" with silence, so every active class
 * appears wearing one of these.
 */
export const classPointsStates = [
  /** Both flags on. The board opens. */
  "ranked",
  /** Points are earned; the academy switched the named board off. */
  "board_off",
  /** `STUDENT_POINTS` is off. There is nothing to count. */
  "points_off",
] as const;
export const classPointsStateSchema = z.enum(classPointsStates);
export type ClassPointsState = (typeof classPointsStates)[number];

export const platformRankedClassSchema = rankingAcademySchema
  .extend({
    classId: z.uuid(),
    name: z.string().min(1),
    /** Null when nobody is assigned — the condition managers are asked about
     *  most, and the one nobody chose. */
    teacherName: z.string().nullable(),
    /** Active student memberships enrolled in the class. The same population
     *  `LeaderboardRepository.roster` ranks, so this figure and the board's
     *  participant count are the same measurement. */
    students: z.number().int().nonnegative(),
    /**
     * Of those, how many earned anything in the period.
     *
     * The measurement that separates a quiet class from an unused one, which is
     * the question an operator opens this page with. A total alone cannot: one
     * child earning forty and fourteen earning nothing reads the same as
     * fourteen children earning three each.
     */
    earningStudents: z.number().int().nonnegative(),
    /**
     * Null when points are off — never `0`.
     *
     * A zero would sort an academy that deliberately switched the feature off
     * to the bottom of a points-ordered table, next to an academy that is
     * failing. Em dash is the house rule for a missing measurement on every
     * points surface, and this is the field that makes it renderable.
     */
    points: z.number().int().nonnegative().nullable(),
    solvedProblems: z.number().int().nonnegative().nullable(),
    state: classPointsStateSchema,
  })
  .strict();
export type PlatformRankedClass = z.infer<typeof platformRankedClassSchema>;

/* ---------------------------------------------------------------- reading */

export const PLATFORM_RANKING_PAGE_SIZE = 25;

/**
 * How many classes one request may aggregate.
 *
 * A guard-rail rather than a page size. The service computes every class in
 * scope before it sorts (see below), so this bounds the work; past it the
 * response says `truncated` and the page asks the operator to narrow by
 * academy. A limit that says so, rather than a page that silently describes
 * part of the platform.
 */
export const PLATFORM_RANKING_MAX_CLASSES = 2000;

/**
 * What the class list can be ordered by.
 *
 * `points` leads because it is the question the page exists to answer.
 *
 * **None of these is an `orderBy`.** Points, solves and earning students are
 * period-scoped sums over `PointAward`, and there is no stored standing
 * anywhere by design — §10.2 requires that a position expire, and the cheapest
 * guarantee is having nowhere to keep one. `platform/content.ts` states the
 * rule that follows: a page of twenty-five sorted by a figure computed after
 * loading is twenty-five rows sorted among themselves, an order that changes on
 * every page and is a lie about the whole set.
 *
 * So the service aggregates the complete set, sorts it, and *then* slices the
 * page. That is the honest version of "sorted by points", and it is why this is
 * an allowlist of comparators rather than of column names.
 */
export const rankingSortKeys = [
  "points",
  "students",
  "earning",
  "class",
  "academy",
] as const;
export const rankingSortKeySchema = z.enum(rankingSortKeys);
export type RankingSortKey = (typeof rankingSortKeys)[number];

export const rankingSortDirections = ["asc", "desc"] as const;
export const rankingSortDirectionSchema = z.enum(rankingSortDirections);
export type RankingSortDirection = (typeof rankingSortDirections)[number];

export const listPlatformRankingInputSchema = z.object({
  query: z.string().trim().max(120).optional(),
  academyIds: z.array(z.uuid()).max(50).optional(),
  /** Drives the table's aggregates *and* the board below it. Two period
   *  controls on one screen showing two different weeks is a bug report. */
  period: pointsPeriodKindSchema.default("day"),
  sort: rankingSortKeySchema.default("points"),
  direction: rankingSortDirectionSchema.default("desc"),
  page: z.number().int().min(1).default(1),
  pageSize: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(PLATFORM_RANKING_PAGE_SIZE),
});
export type ListPlatformRankingInput = z.input<
  typeof listPlatformRankingInputSchema
>;
export type ResolvedListPlatformRankingInput = z.infer<
  typeof listPlatformRankingInputSchema
>;

const countSchema = z.number().int().nonnegative();

/**
 * What the platform earned, folded from the same set the rows come from.
 *
 * On the list response rather than behind a second method, unlike
 * `platformContent.summary`: every figure here is a fold over aggregates the
 * service has already computed in order to sort, so a separate endpoint would
 * be a second round trip to recompute what is in hand. It follows *all* the
 * filters including the search term, so the strip always describes the table
 * beneath it.
 */
export const platformRankingSummarySchema = z
  .object({
    academies: countSchema,
    classes: countSchema,
    /** Classes where at least one student earned something. */
    earningClasses: countSchema,
    students: countSchema,
    earningStudents: countSchema,
    points: countSchema,
    /** Classes whose academy has points switched off — the reason a figure is
     *  missing rather than zero. */
    pointsOffClasses: countSchema,
  })
  .strict();
export type PlatformRankingSummary = z.infer<
  typeof platformRankingSummarySchema
>;

export const listPlatformRankingResultSchema = z
  .object({
    rows: z.array(platformRankedClassSchema),
    total: countSchema,
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    /** True when the platform holds more classes than one pass may aggregate. */
    truncated: z.boolean(),
    summary: platformRankingSummarySchema,
    /** Every academy, for the facet — the same list the other console lists
     *  offer, so the surfaces filter by the same names. */
    academyOptions: z.array(
      z.object({
        id: z.uuid(),
        name: z.string().min(1),
        slug: z.string().min(1),
      }),
    ),
  })
  .strict();
export type ListPlatformRankingResult = z.infer<
  typeof listPlatformRankingResultSchema
>;
