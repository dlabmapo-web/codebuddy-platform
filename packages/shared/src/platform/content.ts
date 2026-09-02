import { z } from "zod";

import { classStatusSchema } from "../classes/class.js";
import { exerciseDifficultySchema } from "../content/course.js";

/**
 * The platform's view of what every academy teaches.
 *
 * The browser finds a course, class, or problem across the whole platform —
 * the question no academy-scoped surface can answer. Its Open links mount the
 * academy editors under console routes, and its row actions call the same
 * academy endpoints a customer's Team Lead uses. The console owns discovery
 * and chrome, not a second implementation of curriculum mutations.
 */

/* ------------------------------------------------------------- the shapes */

/** Which academy a row belongs to. Every content row carries it, because on
 *  this surface "which academy" is the first thing the operator reads. */
export const contentAcademySchema = z.object({
  academyId: z.uuid(),
  academyName: z.string().min(1),
  academySlug: z.string().min(1),
});

export const platformCourseSchema = contentAcademySchema.extend({
  id: z.uuid(),
  title: z.string().min(1),
  /** The academy's own one-line description. Empty is the ordinary case. */
  description: z.string(),
  isVisible: z.boolean(),
  moduleCount: z.number().int().nonnegative(),
  lectureCount: z.number().int().nonnegative(),
  exerciseCount: z.number().int().nonnegative(),
  /** Classes currently taught this course. Zero means it is authored and not
   *  yet delivered, which is a real and common state. */
  classCount: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime(),
});
export type PlatformCourse = z.infer<typeof platformCourseSchema>;

export const platformClassSchema = contentAcademySchema.extend({
  id: z.uuid(),
  name: z.string().min(1),
  description: z.string(),
  status: classStatusSchema,
  /**
   * The courses this class teaches, named rather than counted.
   *
   * A count answers "is anything assigned"; the names answer "what is this
   * class", which is what somebody scanning a roster of eight is actually
   * asking. Capped by the service, not here.
   */
  courses: z.array(z.object({ id: z.uuid(), title: z.string().min(1) })),
  /** Null when nobody is assigned — the condition a manager most needs to see
   *  and the one an operator is most often asked about. */
  teacherName: z.string().nullable(),
  /** The teacher's photo, for the avatar beside their name. */
  teacherAvatarUrl: z.string().nullable(),
  studentCount: z.number().int().nonnegative(),
  courseCount: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime(),
});
export type PlatformClass = z.infer<typeof platformClassSchema>;

export const platformProblemSchema = contentAcademySchema.extend({
  /** The material id, which is what the academy's own URLs address. */
  materialId: z.uuid(),
  title: z.string().min(1),
  isVisible: z.boolean(),
  difficulty: exerciseDifficultySchema.nullable(),
  testCaseCount: z.number().int().nonnegative(),
  courseId: z.uuid(),
  courseTitle: z.string().min(1),
  lectureId: z.uuid(),
  lectureTitle: z.string().min(1),
  updatedAt: z.iso.datetime(),
});
export type PlatformProblem = z.infer<typeof platformProblemSchema>;

/* ---------------------------------------------------------------- reading */

export const PLATFORM_CONTENT_PAGE_SIZE = 25;

/**
 * What the three lists can be ordered by.
 *
 * One union across all three lenses rather than three, for the reason the input
 * below is shared: the operator's question — "the biggest", "the newest" — is
 * the same wherever they ask it, and the service maps a key its lens does not
 * have onto that lens's default. An allowlist and not a free column name,
 * because this reaches an `orderBy`.
 *
 * **Only what the database can order.** `lectures`, `problems` and `tests` are
 * summed from nested counts after the rows are loaded, so a page of twenty-five
 * sorted by them would be twenty-five rows sorted among themselves — an order
 * that changes on every page and is a lie about the whole set. Those columns
 * stay unsortable in the table rather than appearing to work; see §8.1 of the
 * content browser design.
 *
 * `updatedAt` leads because it is the only key every lens shares and the one an
 * operator reaches for without being asked to think.
 */
export const contentSortKeys = [
  "updatedAt",
  "title",
  "classes",
  "modules",
  "students",
  "difficulty",
] as const;
export const contentSortKeySchema = z.enum(contentSortKeys);
export type ContentSortKey = (typeof contentSortKeys)[number];

export const contentSortDirections = ["asc", "desc"] as const;
export const contentSortDirectionSchema = z.enum(contentSortDirections);
export type ContentSortDirection = (typeof contentSortDirections)[number];

/**
 * One input for all three lists.
 *
 * The three differ in what they return, not in how they are asked for: an
 * operator narrows by academy and types a name, whichever tab they are on.
 * Separate inputs would have drifted the moment one of them grew a filter.
 */
export const listPlatformContentInputSchema = z.object({
  query: z.string().trim().max(120).optional(),
  academyIds: z.array(z.uuid()).max(50).optional(),
  sort: contentSortKeySchema.default("updatedAt"),
  direction: contentSortDirectionSchema.default("desc"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(PLATFORM_CONTENT_PAGE_SIZE),
});
export type ListPlatformContentInput = z.input<
  typeof listPlatformContentInputSchema
>;
export type ResolvedListPlatformContentInput = z.infer<
  typeof listPlatformContentInputSchema
>;

/**
 * The summary follows the academy facet only. Search is deliberately absent:
 * a course-title query has no coherent meaning for the problem or class totals
 * shown beside it.
 */
export const platformContentSummaryInputSchema = z.object({
  academyIds: z.array(z.uuid()).max(50).optional(),
});
export type PlatformContentSummaryInput = z.infer<
  typeof platformContentSummaryInputSchema
>;

const summaryCountSchema = z.number().int().nonnegative();

export const platformContentSummarySchema = z.object({
  /** Academies in scope: the denominator for the three content totals. */
  academies: summaryCountSchema,
  courses: z.object({
    total: summaryCountSchema,
    published: summaryCountSchema,
  }),
  classes: z.object({
    total: summaryCountSchema,
    running: summaryCountSchema,
    withoutTeacher: summaryCountSchema,
  }),
  problems: z.object({
    total: summaryCountSchema,
    withoutTests: summaryCountSchema,
  }),
});
export type PlatformContentSummary = z.infer<
  typeof platformContentSummarySchema
>;

const listResult = <T extends z.ZodTypeAny>(row: T) =>
  z.object({
    rows: z.array(row),
    total: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    /** Every academy, for the facet — the same list the users directory
     *  offers, so the two surfaces filter by the same names. */
    academyOptions: z.array(
      z.object({ id: z.uuid(), name: z.string().min(1), slug: z.string().min(1) }),
    ),
  });

export const listPlatformCoursesResultSchema = listResult(platformCourseSchema);
export const listPlatformClassesResultSchema = listResult(platformClassSchema);
export const listPlatformProblemsResultSchema = listResult(platformProblemSchema);

export type ListPlatformCoursesResult = z.infer<
  typeof listPlatformCoursesResultSchema
>;
export type ListPlatformClassesResult = z.infer<
  typeof listPlatformClassesResultSchema
>;
export type ListPlatformProblemsResult = z.infer<
  typeof listPlatformProblemsResultSchema
>;

/* ----------------------------------------------------------------- lenses */

export const contentLenses = ["courses", "classes", "problems"] as const;
export const contentLensSchema = z.enum(contentLenses);
export type ContentLens = (typeof contentLenses)[number];
