import { z } from "zod";

import { classStatusSchema } from "../classes/class.js";
import { exerciseDifficultySchema, type ExerciseDifficulty } from "./course.js";
import {
  difficultProblemSchema,
  overviewPeriodSchema,
  overviewRangeSchema,
  sharePercent,
} from "./teacher-overview.js";

/**
 * What a Team Lead's curriculum overview is made of, and how every number in it
 * is decided.
 *
 * The three overviews next door answer three other questions. A student asks
 * where to pick up, a teacher asks who needs them today, a manager asks whether
 * the place is running. This one asks:
 *
 *   Is what we teach any good, and is it actually reaching anyone?
 *
 * The difference shows up in what the file refuses to do. There is nowhere in
 * any schema here to put a student identity — not a membership id, not a
 * display name, not an avatar. §6.3 makes that a contract-level rule rather
 * than a UI preference, because a Team Lead holds `academy.members.read` and
 * the page would otherwise drift into being a second teaching dashboard one
 * well-meaning field at a time.
 *
 * The arithmetic lives here rather than in SQL or React for the reason it
 * always does: a rule inside a query cannot be tested at its boundaries, and a
 * rule inside a chart is a rule the accessible table beside it will state
 * differently.
 *
 * See the team lead curriculum overview design.
 */

const labelSchema = z.string().trim().min(1).max(200);
const countSchema = z.number().int().nonnegative();
const percentSchema = z.number().int().min(0).max(100);

/* ------------------------------------------------------------------ bounds */

/** §8 — a preview is five records, on every section that has one. */
export const LEAD_MAX_PREVIEW_ROWS = 5;
/** §11 — the displayed course table is bounded; catalog totals are not. */
export const LEAD_MAX_COURSE_ROWS = 100;
/** The class list is bounded on the same principle, and its totals are not. */
export const LEAD_MAX_CLASS_ROWS = 50;
/**
 * §10.2 — below this many attempting students a solve rate is not evidence
 * that an authored difficulty label is wrong.
 *
 * Deliberately higher than `MIN_STUDENTS_FOR_PROBLEM_SIGNAL`. Three children
 * failing a problem is enough to say a class needs help; it is not enough to
 * ask somebody to change published metadata, and that is what this flag asks.
 */
export const MIN_STUDENTS_FOR_CALIBRATION = 8;
/** §10.3 — a grind ratio needs solvers to divide by. */
export const MIN_SOLVERS_FOR_GRIND = 5;
/** §10.3 — attempts per solver at or above this is brute force, not practice. */
export const GRIND_SUBMISSIONS_PER_SOLVER = 6;
/** §10.3 — and only counts as grind while students are actually getting there. */
export const GRIND_MIN_SOLVE_RATE = 60;
/** §10.4 — readiness under this is where a course loses its students. */
export const LECTURE_DROPOFF_READINESS = 50;

/* ----------------------------------------------------- effective visibility */

/**
 * The four `isVisible` flags on the path from a course down to one material.
 *
 * The 2026-08-03 visibility design made hiding a parent hide its descendants
 * without overwriting their own settings, which means "can a student see this"
 * is never one column. It is this chain, and it is read identically by the
 * catalog counts, three of the blocker scans, and every effectiveness scope.
 */
export type VisibilityChain = {
  course: boolean;
  module: boolean;
  lecture: boolean;
  material: boolean;
};

/** Whether a student can reach this material at all. */
export function isEffectivelyVisible(chain: VisibilityChain): boolean {
  return chain.course && chain.module && chain.lecture && chain.material;
}

/**
 * The nearest ancestor hiding a material that is itself set visible.
 *
 * Null when the material is visible, and null when the material's own flag is
 * off — that is not buried content, it is content somebody chose to hide, and
 * telling a Team Lead their hidden exercise is hidden is not a finding.
 *
 * Nearest rather than outermost: showing the course again would still leave a
 * hidden module in the way, so the nearest one is the edit that actually
 * changes what students see.
 */
export function hiddenAncestor(
  chain: VisibilityChain,
): "lecture" | "module" | "course" | null {
  if (!chain.material) return null;
  if (!chain.lecture) return "lecture";
  if (!chain.module) return "module";
  if (!chain.course) return "course";
  return null;
}

/* ----------------------------------------------------------------- catalog */

const visibilitySplitSchema = z
  .object({ total: countSchema, visible: countSchema, hidden: countSchema })
  .strict();

export const curriculumCatalogSchema = z
  .object({
    courses: visibilitySplitSchema,
    modules: visibilitySplitSchema,
    lectures: visibilitySplitSchema,
    /**
     * Exercises split three ways rather than two. `buried` is the population
     * the other two cannot describe: set visible by its author, unreachable
     * because something above it is not. It is the number this page exists to
     * surface and it is invisible from inside any single course editor.
     */
    exercises: z
      .object({
        total: countSchema,
        live: countSchema,
        hidden: countSchema,
        buried: countSchema,
      })
      .strict(),
    /** Live exercises by their authored label, for §10.2's context. */
    difficulty: z
      .object({ EASY: countSchema, MEDIUM: countSchema, HARD: countSchema })
      .strict(),
    /** Courses assigned to at least one active class. */
    taughtCourses: countSchema,
    /** Visible courses assigned to none. Not a defect; see §11. */
    shelvedCourses: countSchema,
    /** Distinct active students in an active class holding a course. */
    studentsReached: countSchema,
  })
  .strict();
export type CurriculumCatalog = z.infer<typeof curriculumCatalogSchema>;

/* ---------------------------------------------------------------- blockers */

/**
 * §9.2 — the seven ways a curriculum is broken in a way only a Team Lead can
 * fix.
 *
 * Every one of them is a defect with an obvious edit behind it, which is what
 * earns it a place in a queue. None of them is a judgement about a course, and
 * none of them can be resolved by anybody else in the academy — `no_students`
 * from `classGapKinds` is deliberately absent, because it needs
 * `class-enrollments.manage` and a queue seeded with rows its reader cannot
 * action is a queue its reader learns to skim.
 */
export const blockerKinds = [
  "hidden_course_assigned",
  "empty_visible_course",
  "ungradeable_exercise",
  "unfinished_exercise",
  "class_without_teacher",
  "class_teacher_unavailable",
  "class_without_course",
] as const;
export const blockerKindSchema = z.enum(blockerKinds);
export type BlockerKind = z.infer<typeof blockerKindSchema>;

/**
 * The order the groups are rendered in, declared rather than derived.
 *
 * `hidden_course_assigned` leads because it is the only defect where a class is
 * live, staffed, enrolled, and learning nothing — the most likely failure of
 * the visibility model and the hardest to notice from inside a course editor.
 * The class-shaped gaps sit together at the end because they are one decision
 * each rather than an authoring session.
 *
 * Derived order — by count, by students affected — would reshuffle the page
 * between two visits to the same academy, and a queue whose shape changes as
 * you fix it is one you cannot learn.
 */
export const blockerKindOrder: readonly BlockerKind[] = blockerKinds;

/**
 * Where a blocker row points.
 *
 * Every id the row could need, all nullable, rather than a discriminated union
 * per kind. The union is more precise and would make the link-building code a
 * seven-armed switch that has to be kept in step with seven row shapes; this
 * shape lets one function turn a row into an href and lets the schema stay
 * `.strict()`, which is what actually stops a student id appearing here.
 */
export const blockerTargetSchema = z
  .object({
    courseId: z.uuid().nullable(),
    lectureId: z.uuid().nullable(),
    materialId: z.uuid().nullable(),
    classId: z.uuid().nullable(),
  })
  .strict();
export type BlockerTarget = z.infer<typeof blockerTargetSchema>;

export const blockerRowSchema = z
  .object({
    /** Stable within a response, for React keys and nothing else. */
    id: z.string().min(1).max(200),
    label: labelSchema,
    /** The curriculum path or class name that locates the label. */
    context: z.string().trim().max(300).nullable(),
    /**
     * Active students who can reach the defective content today.
     *
     * Zero is meaningful and common: a defect in an unassigned course affects
     * nobody yet. The number says so rather than implying an urgency the
     * situation does not have.
     */
    studentsAffected: countSchema,
    target: blockerTargetSchema,
  })
  .strict();
export type BlockerRow = z.infer<typeof blockerRowSchema>;

export const blockerGroupSchema = z
  .object({
    kind: blockerKindSchema,
    total: countSchema,
    studentsAffected: countSchema,
    preview: z.array(blockerRowSchema).max(LEAD_MAX_PREVIEW_ROWS),
  })
  .strict();
export type BlockerGroup = z.infer<typeof blockerGroupSchema>;

/**
 * Most consequential first, then alphabetical, then by id.
 *
 * Label before id so two equally consequential rows appear in the order a Team
 * Lead would look for them, and id last so the list never reshuffles between
 * two identical requests.
 */
export function compareBlockerRows(left: BlockerRow, right: BlockerRow): number {
  return (
    right.studentsAffected - left.studentsAffected ||
    left.label.localeCompare(right.label) ||
    left.id.localeCompare(right.id)
  );
}

/**
 * Rows into groups, in declared order, with the empty groups dropped.
 *
 * A group with nothing in it is absent rather than present-and-zero. Seven
 * headings, four of them reading "0", is a page that looks broken in an academy
 * whose curriculum is fine — and "nothing is blocking students" is a single
 * clear answer that the caller can only render once the noise is gone.
 *
 * `studentsAffected` on the group is the distinct-student count supplied by the
 * caller, not the sum of its rows: one class sitting behind three defective
 * exercises is one affected class, and adding the rows would report its
 * students three times.
 */
export function buildBlockerGroups(
  input: {
    kind: BlockerKind;
    total: number;
    studentsAffected: number;
    rows: BlockerRow[];
  }[],
): BlockerGroup[] {
  const byKind = new Map(input.map((group) => [group.kind, group]));
  return blockerKindOrder.flatMap((kind) => {
    const group = byKind.get(kind);
    if (!group || group.total <= 0) return [];
    return [
      {
        kind,
        total: group.total,
        studentsAffected: group.studentsAffected,
        preview: [...group.rows]
          .sort(compareBlockerRows)
          .slice(0, LEAD_MAX_PREVIEW_ROWS),
      },
    ];
  });
}

/* ----------------------------------------------------------------- changes */

/**
 * §9.3 — every audited content action the changes panel can name.
 *
 * One list, in `@cove/shared`, for the reason `academyAuditActions` next door
 * records: there were three lists, they disagreed, and a real change in a real
 * academy rendered as a raw dotted code in a manager's history with nothing in
 * the type system able to notice. The API's action helpers are typed against
 * this and the locale catalogues are tested against it, so both halves fail
 * until a new audited content action is named here.
 */
export const curriculumAuditActions = [
  "content.course.created",
  "content.course.updated",
  "content.course.visibility_changed",
  "content.course.deleted",
  "content.course_module.created",
  "content.course_module.updated",
  "content.course_module.visibility_changed",
  "content.course_module.deleted",
  "content.course_module.reordered",
  "content.lecture.created",
  "content.lecture.updated",
  "content.lecture.visibility_changed",
  "content.lecture.deleted",
  "content.lecture.reordered",
  "content.programming_exercise.created",
  "content.programming_exercise.updated",
  "content.programming_exercise.visibility_changed",
  "content.programming_exercise.deleted",
  "content.programming_exercise.reordered",
] as const;
export const curriculumAuditActionSchema = z.enum(curriculumAuditActions);
export type CurriculumAuditAction = z.infer<typeof curriculumAuditActionSchema>;

const curriculumAuditActionSet = new Set<string>(curriculumAuditActions);

/** Whether the panel has a name for an action, or must print its code. */
export function isCurriculumAuditAction(
  action: string,
): action is CurriculumAuditAction {
  return curriculumAuditActionSet.has(action);
}

export const curriculumChangeSchema = z
  .object({
    id: z.uuid(),
    action: curriculumAuditActionSchema,
    /** Null when the actor's account is gone; the change still happened. */
    actorName: labelSchema.nullable(),
    targetLabel: labelSchema,
    targetType: z.enum(["Course", "CourseModule", "Lecture", "Material"]),
    /**
     * Whether students could see the thing at the moment it changed.
     *
     * The difference between a quiet edit and one that moved under a class
     * mid-lesson, and the only reason this panel is worth more than a
     * timestamp. Null when the audit row predates the column being recorded.
     */
    wasVisible: z.boolean().nullable(),
    at: z.iso.datetime(),
  })
  .strict();
export type CurriculumChange = z.infer<typeof curriculumChangeSchema>;

/* ----------------------------------------------------------- effectiveness */

/**
 * §10.2 — the solve rate each authored difficulty label claims.
 *
 * The bands overlap on purpose. A problem at 65% is describable as `MEDIUM` and
 * as `HARD`, and only a problem outside every band its own label allows is
 * flagged. Non-overlapping bands would flag the boundary cases hardest, which
 * are exactly the ones where the author's judgement is most likely right and
 * the measurement least likely decisive.
 */
export const calibrationBands: Record<
  ExerciseDifficulty,
  { min: number | null; max: number | null }
> = {
  EASY: { min: 70, max: null },
  MEDIUM: { min: 40, max: 85 },
  HARD: { min: null, max: 60 },
};

export const calibrationVerdicts = [
  "harder_than_labelled",
  "easier_than_labelled",
] as const;
export const calibrationVerdictSchema = z.enum(calibrationVerdicts);
export type CalibrationVerdict = z.infer<typeof calibrationVerdictSchema>;

/**
 * Whether a measured solve rate contradicts the label the author gave.
 *
 * Null below the floor rather than a quiet verdict: §10.2 requires an
 * explanatory absence instead of a judgement seven children happened to
 * produce. Null also when the rate sits inside the band, which is the ordinary
 * case and the one this function exists to stay silent about.
 */
export function calibrationVerdictFor(input: {
  difficulty: ExerciseDifficulty;
  solveRate: number;
  attemptingStudents: number;
  minimumStudents?: number;
}): CalibrationVerdict | null {
  const minimum = input.minimumStudents ?? MIN_STUDENTS_FOR_CALIBRATION;
  if (input.attemptingStudents < minimum) return null;
  const band = calibrationBands[input.difficulty];
  if (band.min !== null && input.solveRate < band.min) {
    return "harder_than_labelled";
  }
  if (band.max !== null && input.solveRate > band.max) {
    return "easier_than_labelled";
  }
  return null;
}

export const calibrationRowSchema = z
  .object({
    materialId: z.uuid(),
    title: labelSchema,
    courseId: z.uuid(),
    courseTitle: labelSchema,
    lectureTitle: labelSchema,
    outlineNumber: z.string().max(24).nullable(),
    difficulty: exerciseDifficultySchema,
    solveRate: percentSchema,
    attemptingStudents: countSchema,
    solvedStudents: countSchema,
    verdict: calibrationVerdictSchema,
  })
  .strict();
export type CalibrationRow = z.infer<typeof calibrationRowSchema>;

/**
 * Furthest from its own band first, then the better-evidenced row.
 *
 * Distance rather than raw rate, because an `EASY` problem at 20% and a `HARD`
 * one at 95% are both badly labelled and a plain sort by rate would put every
 * `HARD` row at one end of the table regardless of how wrong it was.
 */
export function calibrationDistance(row: {
  difficulty: ExerciseDifficulty;
  solveRate: number;
}): number {
  const band = calibrationBands[row.difficulty];
  if (band.min !== null && row.solveRate < band.min) {
    return band.min - row.solveRate;
  }
  if (band.max !== null && row.solveRate > band.max) {
    return row.solveRate - band.max;
  }
  return 0;
}

export function compareCalibration(
  left: CalibrationRow,
  right: CalibrationRow,
): number {
  return (
    calibrationDistance(right) - calibrationDistance(left) ||
    right.attemptingStudents - left.attemptingStudents ||
    left.title.localeCompare(right.title) ||
    left.materialId.localeCompare(right.materialId)
  );
}

/**
 * §10.3 — attempts spent per student who got there.
 *
 * Null without enough solvers to divide by. One student who passed on their
 * fortieth try is a story about one student, not about the problem.
 */
export function submissionsPerSolver(input: {
  submissions: number;
  solvedStudents: number;
  minimumSolvers?: number;
}): number | null {
  const minimum = input.minimumSolvers ?? MIN_SOLVERS_FOR_GRIND;
  if (input.solvedStudents < minimum) return null;
  return Math.round((input.submissions / input.solvedStudents) * 10) / 10;
}

/**
 * Whether a problem is a grind rather than a challenge.
 *
 * The conjunction is the whole signal. High effort with a low solve rate is a
 * hard problem, and §10.1 already reports it. High effort with a *high* solve
 * rate means students do get there, but only by brute force — which points at
 * an ambiguous specification, an unstated output format, or a test case that
 * disagrees with the description. That is a content defect with a content fix,
 * and it is invisible on every other page in the product.
 */
export function isGrind(input: {
  ratio: number | null;
  solveRate: number;
  minimumRatio?: number;
  minimumSolveRate?: number;
}): boolean {
  if (input.ratio === null) return false;
  return (
    input.ratio >= (input.minimumRatio ?? GRIND_SUBMISSIONS_PER_SOLVER) &&
    input.solveRate >= (input.minimumSolveRate ?? GRIND_MIN_SOLVE_RATE)
  );
}

export const grindRowSchema = z
  .object({
    materialId: z.uuid(),
    title: labelSchema,
    courseId: z.uuid(),
    courseTitle: labelSchema,
    lectureTitle: labelSchema,
    outlineNumber: z.string().max(24).nullable(),
    submissions: countSchema,
    solvedStudents: countSchema,
    /** Attempts per solver, to one decimal. */
    ratio: z.number().nonnegative(),
    solveRate: percentSchema,
  })
  .strict();
export type GrindRow = z.infer<typeof grindRowSchema>;

export function compareGrind(left: GrindRow, right: GrindRow): number {
  return (
    right.ratio - left.ratio ||
    right.solvedStudents - left.solvedStudents ||
    left.title.localeCompare(right.title) ||
    left.materialId.localeCompare(right.materialId)
  );
}

/**
 * §10.4 — where a course starts losing the students who reached it.
 *
 * The transition rather than the minimum: the least ready lecture in a course
 * is usually the last one, which tells a Team Lead only that courses are
 * finished from the front. The first lecture to fall below the floor while the
 * one before it stayed above is the place the curriculum changed difficulty.
 */
export const dropOffSchema = z
  .object({
    lectureId: z.uuid(),
    lectureTitle: labelSchema,
    outlineNumber: z.string().max(24).nullable(),
    readiness: percentSchema,
    previousReadiness: percentSchema,
  })
  .strict();
export type DropOff = z.infer<typeof dropOffSchema>;

/**
 * The first qualifying fall, walking the course in teaching order.
 *
 * A lecture whose readiness could not be measured breaks the comparison rather
 * than counting as zero: `lectureReadiness` returns null precisely when too few
 * students attempted for the figure to describe them, and treating that as a
 * cliff would invent a drop-off out of a quiet week.
 */
export function findDropOff(
  lectures: {
    lectureId: string;
    lectureTitle: string;
    outlineNumber: string | null;
    readiness: number | null;
  }[],
  threshold = LECTURE_DROPOFF_READINESS,
): DropOff | null {
  for (let index = 1; index < lectures.length; index += 1) {
    const previous = lectures[index - 1];
    const current = lectures[index];
    if (previous.readiness === null || current.readiness === null) continue;
    if (previous.readiness >= threshold && current.readiness < threshold) {
      return {
        lectureId: current.lectureId,
        lectureTitle: current.lectureTitle,
        outlineNumber: current.outlineNumber,
        readiness: current.readiness,
        previousReadiness: previous.readiness,
      };
    }
  }
  return null;
}

export const neverAttemptedRowSchema = z
  .object({
    materialId: z.uuid(),
    title: labelSchema,
    courseId: z.uuid(),
    courseTitle: labelSchema,
    lectureTitle: labelSchema,
    outlineNumber: z.string().max(24).nullable(),
    /** Students who could reach it and have not. */
    reachableStudents: countSchema,
  })
  .strict();
export type NeverAttemptedRow = z.infer<typeof neverAttemptedRowSchema>;

export const curriculumEffectivenessSchema = z
  .object({
    problems: z.array(difficultProblemSchema).max(LEAD_MAX_PREVIEW_ROWS),
    calibration: z.array(calibrationRowSchema).max(LEAD_MAX_PREVIEW_ROWS),
    grind: z.array(grindRowSchema).max(LEAD_MAX_PREVIEW_ROWS),
    neverAttempted: z
      .array(neverAttemptedRowSchema)
      .max(LEAD_MAX_PREVIEW_ROWS),
    /** Distinct live exercises with no counted attempt, for the panel's meta. */
    neverAttemptedTotal: countSchema,
  })
  .strict();
export type CurriculumEffectiveness = z.infer<
  typeof curriculumEffectivenessSchema
>;

/* ------------------------------------------------------------------- reach */

/**
 * Exercise completion, with both its parts.
 *
 * Never a bare percentage. The denominator is students times live exercises,
 * which is a number a Team Lead can check against a roster and a course, and a
 * completion figure nobody can check is one nobody should act on.
 *
 * Null rather than zero when there is nothing to divide: a course assigned to
 * no class has not been completed 0% — it has not been asked.
 */
export function courseCompletion(input: {
  solvedPairs: number;
  studentsReached: number;
  liveExercises: number;
}): { percent: number | null; solved: number; possible: number } {
  const possible = input.studentsReached * input.liveExercises;
  return {
    percent: possible > 0 ? sharePercent(input.solvedPairs, possible) : null,
    solved: input.solvedPairs,
    possible,
  };
}

export const courseReachRowSchema = z
  .object({
    courseId: z.uuid(),
    title: labelSchema,
    isVisible: z.boolean(),
    /** Visible, and assigned to no active class. A fact, never a defect. */
    shelved: z.boolean(),
    liveExercises: countSchema,
    hiddenExercises: countSchema,
    classes: countSchema,
    studentsReached: countSchema,
    activeStudents: countSchema,
    completion: z
      .object({
        percent: percentSchema.nullable(),
        solved: countSchema,
        possible: countSchema,
      })
      .strict(),
    /** Median active learning seconds per reached student, or null. */
    medianActiveSeconds: countSchema.nullable(),
    dropOff: dropOffSchema.nullable(),
    lastChangeAt: z.iso.datetime().nullable(),
  })
  .strict();
export type CourseReachRow = z.infer<typeof courseReachRowSchema>;

/**
 * Taught courses first, then the least complete, then by name.
 *
 * Reach before completion because a course nobody is taking has no completion
 * worth ranking, and sorting the two together would bury a struggling live
 * course under a shelf of untouched drafts.
 */
export function compareCourseReach(
  left: CourseReachRow,
  right: CourseReachRow,
): number {
  return (
    right.classes - left.classes ||
    (left.completion.percent ?? 101) - (right.completion.percent ?? 101) ||
    left.title.localeCompare(right.title) ||
    left.courseId.localeCompare(right.courseId)
  );
}

/* ------------------------------------------------------------------ roster */

/**
 * Who teaches what, to how many.
 *
 * The catalog says what has been written. This says how it is staffed and who
 * it is being taught to, which is the other half of "is it actually reaching
 * anyone" and the half a Team Lead can act on directly: they assign the
 * teacher, they arrange the class, they attach the course.
 *
 * ## Teachers are named and students are counted
 *
 * The rule at the top of this file stands unchanged: no student identity in any
 * schema here, not a membership id and not a display name. A class carries a
 * seat count and nothing more.
 *
 * A teacher is different in kind and the distinction is deliberate rather than
 * convenient. The assignment *is* the fact — "this class has no teacher" and
 * "this class's teacher can no longer teach" are two of the seven blockers on
 * this page, and neither can be stated, let alone fixed, without saying who is
 * or was assigned. A Team Lead assigns teachers as part of the job; they do not
 * assign students, and the page gives them no way to look one up.
 */
export const classTeacherSchema = z
  .object({
    /** Null when the class is unassigned. */
    membershipId: z.uuid().nullable(),
    /** Null when unassigned, or when the account behind it is gone. */
    name: labelSchema.nullable(),
    /**
     * Assigned, but the membership can no longer teach — suspended, removed,
     * or no longer holding the teacher role. The same condition the
     * `class_teacher_unavailable` blocker counts, carried here so the roster
     * and the queue cannot disagree about one class.
     */
    unavailable: z.boolean(),
  })
  .strict();
export type ClassTeacher = z.infer<typeof classTeacherSchema>;

export const classRosterRowSchema = z
  .object({
    classId: z.uuid(),
    name: labelSchema,
    status: classStatusSchema,
    teacher: classTeacherSchema,
    /** Active student seats. A count, never a roster. */
    students: countSchema,
    courses: countSchema,
    /** Enough course names to recognise the class by, never the whole list. */
    courseTitles: z.array(labelSchema).max(LEAD_MAX_PREVIEW_ROWS),
    /** Live exercises across every course attached to this class. */
    liveExercises: countSchema,
  })
  .strict();
export type ClassRosterRow = z.infer<typeof classRosterRowSchema>;

/**
 * A count and the part of it that is a loose end.
 *
 * Both halves are always present, because the second is only readable against
 * the first: "3 unassigned" is an emergency in an academy with four teachers
 * and a rounding error in one with ninety.
 */
const rosterSplitSchema = z
  .object({ total: countSchema, loose: countSchema })
  .strict();

export const teachingRosterSchema = z
  .object({
    /** Active classes, and how many of those have no teacher. */
    classes: rosterSplitSchema,
    /** Active teachers, and how many are running no class. */
    teachers: rosterSplitSchema,
    /** Active students, and how many hold no seat in any class. */
    students: rosterSplitSchema,
    /** Classes that were archived rather than deleted. Context, not a defect. */
    archivedClasses: countSchema,
    rows: z.array(classRosterRowSchema).max(LEAD_MAX_CLASS_ROWS),
    rowsTruncated: z.boolean(),
  })
  .strict();
export type TeachingRoster = z.infer<typeof teachingRosterSchema>;

/**
 * Classes that need a decision first, then the biggest, then by name.
 *
 * "Needs a decision" is unassigned or unavailable teacher, and no course — the
 * three states where the class cannot teach anybody as it stands. Sorting by
 * size alone would bury a brand-new empty class under the ones already running,
 * and a brand-new empty class is the one a Team Lead has to act on.
 *
 * Archived classes always sort last. They are context for a name a reader
 * half-remembers, not work.
 */
export function compareClassRoster(
  left: ClassRosterRow,
  right: ClassRosterRow,
): number {
  return (
    Number(left.status === "ARCHIVED") - Number(right.status === "ARCHIVED") ||
    Number(classNeedsDecision(right)) - Number(classNeedsDecision(left)) ||
    right.students - left.students ||
    left.name.localeCompare(right.name) ||
    left.classId.localeCompare(right.classId)
  );
}

/**
 * Whether an active class is unable to teach as it stands.
 *
 * Archived classes are never included: an archived class with no teacher is
 * finished, not broken.
 */
export function classNeedsDecision(row: ClassRosterRow): boolean {
  if (row.status === "ARCHIVED") return false;
  return (
    row.teacher.membershipId === null || row.teacher.unavailable || row.courses === 0
  );
}

/* --------------------------------------------------------- partial failure */

/**
 * §13 — the sections that may fail on their own.
 *
 * The catalog is not here on purpose: it is the page's own claim, and a
 * curriculum overview that cannot count the curriculum is an error page rather
 * than a narrower one. Everything below it is evidence, and evidence that could
 * not be gathered says so in its own panel while the rest stands.
 */
export const teamLeadOverviewSections = [
  "blockers",
  "changes",
  "effectiveness",
  "courses",
  "roster",
] as const;
export const teamLeadOverviewSectionSchema = z.enum(teamLeadOverviewSections);
export type TeamLeadOverviewSection = z.infer<
  typeof teamLeadOverviewSectionSchema
>;

/* -------------------------------------------------------------- the payload */

export const getTeamLeadOverviewInputSchema = z
  .object({
    academyId: z.uuid(),
    range: overviewRangeSchema.optional(),
  })
  .strict();
export type GetTeamLeadOverviewInput = z.infer<
  typeof getTeamLeadOverviewInputSchema
>;

/**
 * One bounded snapshot of one curriculum at one instant.
 *
 * §8 — the page never joins five interfaces in the browser. Five independently
 * clocked reads would let the catalog, the blocker queue, and the effectiveness
 * panel describe three different moments while sitting on the same screen, and
 * a Team Lead comparing them would be right that they disagree.
 */
export const teamLeadOverviewSchema = z
  .object({
    academy: z
      .object({
        id: z.uuid(),
        name: labelSchema,
        timeZone: z.string().min(1).max(64),
      })
      .strict(),
    period: overviewPeriodSchema,
    generatedAt: z.iso.datetime(),
    /** The earliest counted learning signal, or null before there is one. */
    activityTrackedSince: z.iso.datetime().nullable(),
    catalog: curriculumCatalogSchema,
    roster: teachingRosterSchema,
    blockers: z.array(blockerGroupSchema),
    changes: z.array(curriculumChangeSchema).max(LEAD_MAX_PREVIEW_ROWS),
    effectiveness: curriculumEffectivenessSchema,
    courses: z.array(courseReachRowSchema).max(LEAD_MAX_COURSE_ROWS),
    /** True when the academy owns more courses than the table may carry. */
    coursesTruncated: z.boolean(),
    unavailable: z.array(teamLeadOverviewSectionSchema),
  })
  .strict();
export type TeamLeadOverview = z.infer<typeof teamLeadOverviewSchema>;
