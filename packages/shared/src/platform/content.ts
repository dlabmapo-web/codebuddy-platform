import { z } from "zod";

import { classStatusSchema } from "../classes/class.js";
import { exerciseDifficultySchema } from "../content/course.js";

/**
 * The platform's view of what every academy teaches.
 *
 * Read-only, and that is the design rather than an unfinished state. The
 * console browses so an operator can *find* a course, a class, or a problem
 * across the whole platform — the question no academy-scoped surface can
 * answer. Changing one is still academy work, so every row's Edit action opens
 * a support session and lands the operator in that academy's own editor, where
 * the change is made by the same code the customer's Team Lead uses and lands
 * on their audit trail with a stated reason.
 *
 * The alternative — editing curriculum from the console — would mean a second
 * implementation of every content mutation, running under different
 * authorization, whose bugs the academy's own screens would never show.
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
  status: classStatusSchema,
  /** Null when nobody is assigned — the condition a manager most needs to see
   *  and the one an operator is most often asked about. */
  teacherName: z.string().nullable(),
  studentCount: z.number().int().nonnegative(),
  courseCount: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime(),
});
export type PlatformClass = z.infer<typeof platformClassSchema>;

export const platformProblemSchema = contentAcademySchema.extend({
  /** The material id, which is what the academy's own URLs address. */
  materialId: z.uuid(),
  title: z.string().min(1),
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
 * One input for all three lists.
 *
 * The three differ in what they return, not in how they are asked for: an
 * operator narrows by academy and types a name, whichever tab they are on.
 * Separate inputs would have drifted the moment one of them grew a filter.
 */
export const listPlatformContentInputSchema = z.object({
  query: z.string().trim().max(120).optional(),
  academyIds: z.array(z.uuid()).max(50).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(PLATFORM_CONTENT_PAGE_SIZE),
});
export type ListPlatformContentInput = z.input<
  typeof listPlatformContentInputSchema
>;
export type ResolvedListPlatformContentInput = z.infer<
  typeof listPlatformContentInputSchema
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
