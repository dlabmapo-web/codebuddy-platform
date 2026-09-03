import { z } from "zod";

/**
 * The content library: what head office publishes, and what a branch takes.
 *
 * A library course is an ordinary `Course` in an academy whose `kind` is
 * `LIBRARY` — platform-owned curriculum with no members, no classes, and no
 * students. An academy adopts one by taking a **complete copy** of its tree.
 *
 * The copy is a copy. Head office's later edits never reach it, which is the
 * whole point: a live shared course would rewrite what a branch is teaching
 * this afternoon, and `Class → ClassCourse → Course → academyId` would stop
 * naming one academy. What the branch gets instead is a *status* — this file
 * computes it — telling them whether head office has moved on and whether they
 * have edited their own copy since taking it.
 */

/* ------------------------------------------------------------- the kinds */

export const academyKinds = ["ACADEMY", "LIBRARY"] as const;
export const academyKindSchema = z.enum(academyKinds);
export type AcademyKind = z.infer<typeof academyKindSchema>;

/* ------------------------------------------------------------ the shapes */

/** A master course as head office reads it in the console. */
export const libraryCourseSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1),
  description: z.string(),
  /** Listed in the library for branches to take. */
  isVisible: z.boolean(),
  /** Withdrawn from the library. Wins over `isVisible` in every display. */
  retiredAt: z.iso.datetime().nullable(),
  contentRevision: z.number().int().positive(),
  moduleCount: z.number().int().nonnegative(),
  lectureCount: z.number().int().nonnegative(),
  exerciseCount: z.number().int().nonnegative(),
  /**
   * Problems under this course with no test cases at all.
   *
   * Louder here than anywhere else in the product: a master that cannot grade
   * propagates to every branch that adopts it, and each of those copies has to
   * be fixed separately afterwards.
   */
  problemsWithoutTests: z.number().int().nonnegative(),
  /** How many academies hold a copy. */
  copyCount: z.number().int().nonnegative(),
  /** How many of those copies were taken before the current revision. */
  behindCount: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime(),
});
export type LibraryCourse = z.infer<typeof libraryCourseSchema>;

/**
 * The three states a library course can be in, derived rather than stored.
 *
 * `RETIRED` wins over both others: a withdrawn course is withdrawn whether or
 * not it was published when it was withdrawn.
 */
export const libraryCourseStates = ["DRAFT", "PUBLISHED", "RETIRED"] as const;
export const libraryCourseStateSchema = z.enum(libraryCourseStates);
export type LibraryCourseState = z.infer<typeof libraryCourseStateSchema>;

export function libraryCourseState(course: {
  isVisible: boolean;
  retiredAt: string | Date | null;
}): LibraryCourseState {
  if (course.retiredAt !== null) return "RETIRED";
  return course.isVisible ? "PUBLISHED" : "DRAFT";
}

/** One academy's copy, as head office reads it on the fan-out panel. */
export const libraryCopySchema = z.object({
  academyId: z.uuid(),
  academyName: z.string().min(1),
  academySlug: z.string().min(1),
  courseId: z.uuid(),
  courseTitle: z.string().min(1),
  /**
   * The master revision this copy was taken at.
   *
   * Named identically to the column it reads, so the fan-out here and the
   * chip on the branch's own course list cannot be read as two different
   * numbers.
   */
  sourceContentRevision: z.number().int().positive(),
  isCustomized: z.boolean(),
  copiedAt: z.iso.datetime(),
});
export type LibraryCopy = z.infer<typeof libraryCopySchema>;

/** A master course as a branch reads it, before deciding to take a copy. */
export const availableLibraryCourseSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1),
  description: z.string(),
  contentRevision: z.number().int().positive(),
  moduleCount: z.number().int().nonnegative(),
  lectureCount: z.number().int().nonnegative(),
  exerciseCount: z.number().int().nonnegative(),
  /**
   * Courses in *this* academy already copied from it.
   *
   * Empty is the ordinary case. A non-empty list is what stops a branch
   * adopting the same course twice without meaning to — and, when they do mean
   * to, tells them which existing course they are about to sit beside.
   */
  existingCopies: z.array(
    z.object({ courseId: z.uuid(), title: z.string().min(1) }),
  ),
  updatedAt: z.iso.datetime(),
});
export type AvailableLibraryCourse = z.infer<
  typeof availableLibraryCourseSchema
>;

/* ------------------------------------------------------- the two axes */

/**
 * Whether head office has moved on since this copy was taken.
 *
 * Deliberately separate from whether the branch has edited its copy. The two
 * are independent — the case that matters most is both at once, where taking a
 * fresh copy would throw the branch's own work away — and a single enum
 * covering both would need six values that no reader could scan.
 */
export const librarySyncStates = [
  "UP_TO_DATE",
  "UPDATE_AVAILABLE",
  "SOURCE_RETIRED",
] as const;
export const librarySyncStateSchema = z.enum(librarySyncStates);
export type LibrarySyncState = z.infer<typeof librarySyncStateSchema>;

/**
 * Where a branch's copy stands against its master.
 *
 * `SOURCE_RETIRED` is checked first and wins, because a branch must never be
 * invited to re-copy a course head office has withdrawn — which is exactly
 * what `UPDATE_AVAILABLE` invites.
 */
export function librarySyncState(input: {
  /** The master's revision now. */
  sourceContentRevision: number;
  /** The master's revision when this copy was taken. */
  copiedAtRevision: number;
  sourceRetiredAt: string | Date | null;
}): LibrarySyncState {
  if (input.sourceRetiredAt !== null) return "SOURCE_RETIRED";
  return input.sourceContentRevision > input.copiedAtRevision
    ? "UPDATE_AVAILABLE"
    : "UP_TO_DATE";
}

/**
 * Whether the branch has edited its copy since taking it.
 *
 * `contentRevision` is bumped by every mutation anywhere in a course tree, in
 * the same transaction as the mutation, so anything above the baseline
 * recorded at copy time is the branch's own editing.
 *
 * The baseline is stored rather than assumed to be 1, so a later change to the
 * copy path — one that bumps the revision while building the tree — cannot
 * silently make every copy in the product read as customized.
 */
export function isCourseCustomized(course: {
  contentRevision: number;
  baselineRevision: number | null;
}): boolean {
  if (course.baselineRevision === null) return false;
  return course.contentRevision > course.baselineRevision;
}

/**
 * Everything a branch's course row says about where it came from.
 *
 * Null on a course the academy authored itself, which is most of them.
 */
export const courseProvenanceSchema = z.object({
  sourceCourseId: z.uuid(),
  sourceTitle: z.string().min(1),
  syncState: librarySyncStateSchema,
  isCustomized: z.boolean(),
  copiedAt: z.iso.datetime(),
});
export type CourseProvenance = z.infer<typeof courseProvenanceSchema>;

/* ---------------------------------------------------------------- inputs */

export const LIBRARY_PAGE_SIZE = 25;

export const listLibraryCoursesSchema = z.object({
  search: z.string().trim().max(200).optional(),
  /** Omitted means every state, which is what head office wants by default:
   *  drafts are the ones that need finishing. */
  state: libraryCourseStateSchema.optional(),
  page: z.number().int().positive().default(1),
});
export type ListLibraryCoursesInput = z.infer<typeof listLibraryCoursesSchema>;

export const createLibraryCourseSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(10_000).default(""),
});

export const retireLibraryCourseSchema = z.object({
  courseId: z.uuid(),
  retired: z.boolean(),
});

export const adoptLibraryCourseSchema = z.object({
  academyId: z.uuid(),
  libraryCourseId: z.uuid(),
  /**
   * The title the copy will carry in the branch's own academy.
   *
   * Required and editable rather than inherited, because course titles are
   * unique per academy (case-insensitive). A branch taking head office's newer
   * version of a course it already holds has to be able to name the second
   * one, or the adoption is refused with nowhere to go.
   */
  title: z.string().trim().min(1).max(200),
});
export type AdoptLibraryCourseInput = z.infer<typeof adoptLibraryCourseSchema>;

/**
 * The title to offer for a copy, given what the academy already holds.
 *
 * `Python Level 1` → `Python Level 1 (2)` → `Python Level 1 (3)`. Compared
 * case-insensitively because the server's uniqueness check is, so a suggestion
 * that differs only in case would be refused the moment it was submitted.
 *
 * Gives up at `limit` and returns the plain title: the dialog's field is
 * editable, and a refusal the operator can fix beats a loop nobody bounded.
 */
export function suggestedCopyTitle(
  title: string,
  existingTitles: readonly string[],
  limit = 50,
): string {
  const taken = new Set(
    existingTitles.map((one) => one.trim().toLocaleLowerCase()),
  );
  if (!taken.has(title.trim().toLocaleLowerCase())) return title;
  for (let suffix = 2; suffix <= limit; suffix += 1) {
    const candidate = `${title} (${suffix})`;
    if (!taken.has(candidate.toLocaleLowerCase())) return candidate;
  }
  return title;
}
