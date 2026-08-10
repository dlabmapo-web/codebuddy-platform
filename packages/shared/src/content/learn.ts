import { z } from "zod";

import {
  exerciseDifficultySchema,
  exerciseLanguageSchema,
} from "./course.js";

/**
 * Student-facing content schemas.
 *
 * These are deliberately a separate shape from the authoring schemas in
 * `course.ts` rather than a subset of them. `programmingExerciseSchema` carries
 * `testCases[].expectedOutput` for every case including HIDDEN ones; nothing
 * here has a field capable of holding that. A student payload therefore cannot
 * leak a hidden expectation even if a service method selects too much — the
 * output schema has nowhere to put it.
 *
 * See §7.3 of the student learning experience design.
 */

const titleSchema = z.string().trim().min(1).max(200);
const descriptionSchema = z.string().trim().max(10_000);
const positionSchema = z.number().int().positive();

/**
 * `SOLVED` is unreachable until server grading lands, but it is defined now so
 * the client renders three states from the start and needs no change later.
 */
export const exerciseProgressStatuses = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "SOLVED",
] as const;
export const exerciseProgressStatusSchema = z.enum(exerciseProgressStatuses);
export type ExerciseProgressStatus = z.infer<
  typeof exerciseProgressStatusSchema
>;

/** Only ever built from a SAMPLE case. Hidden cases are counted, never listed. */
export const learnSampleTestCaseSchema = z.object({
  position: positionSchema,
  input: z.string(),
  expectedOutput: z.string(),
});
export type LearnSampleTestCase = z.infer<typeof learnSampleTestCaseSchema>;

export const learnHintSchema = z.object({
  position: positionSchema,
  content: z.string(),
});
export type LearnHint = z.infer<typeof learnHintSchema>;

export const learnExerciseSummarySchema = z.object({
  materialId: z.uuid(),
  title: titleSchema,
  position: positionSchema,
  difficulty: exerciseDifficultySchema,
  status: exerciseProgressStatusSchema,
  /** Highest ever earned, 0-100. A student stuck at 60 can find it again. */
  bestScore: z.number().int().min(0).max(100),
});
export type LearnExerciseSummary = z.infer<typeof learnExerciseSummarySchema>;

export const learnLectureSchema = z.object({
  id: z.uuid(),
  title: titleSchema,
  description: descriptionSchema,
  position: positionSchema,
  exercises: z.array(learnExerciseSummarySchema),
});

export const learnModuleSchema = z.object({
  id: z.uuid(),
  title: titleSchema,
  description: descriptionSchema,
  position: positionSchema,
  lectures: z.array(learnLectureSchema),
});

export const learnCourseProgressSchema = z.object({
  total: z.number().int().nonnegative(),
  started: z.number().int().nonnegative(),
  solved: z.number().int().nonnegative(),
});
export type LearnCourseProgress = z.infer<typeof learnCourseProgressSchema>;

export const learnCourseSummarySchema = z.object({
  courseId: z.uuid(),
  title: titleSchema,
  description: descriptionSchema,
  counts: z.object({
    modules: z.number().int().nonnegative(),
    lectures: z.number().int().nonnegative(),
    exercises: z.number().int().nonnegative(),
  }),
  progress: learnCourseProgressSchema,
});
export type LearnCourseSummary = z.infer<typeof learnCourseSummarySchema>;

export const learnCourseOutlineSchema = z.object({
  course: z.object({
    id: z.uuid(),
    title: titleSchema,
    description: descriptionSchema,
  }),
  progress: learnCourseProgressSchema,
  modules: z.array(learnModuleSchema),
});
export type LearnCourseOutline = z.infer<typeof learnCourseOutlineSchema>;

/** Where an exercise sits, for the workspace header and back-navigation. */
export const learnExerciseRefSchema = z.object({
  materialId: z.uuid(),
  title: titleSchema,
  lectureId: z.uuid(),
});
export type LearnExerciseRef = z.infer<typeof learnExerciseRefSchema>;

export const learnExerciseSchema = z.object({
  materialId: z.uuid(),
  title: titleSchema,
  difficulty: exerciseDifficultySchema,
  language: exerciseLanguageSchema,
  description: z.string(),
  inputFormat: z.string(),
  outputFormat: z.string(),
  constraints: z.string(),
  starterCode: z.string(),
  timeLimitMs: z.number().int().positive(),
  memoryLimitMb: z.number().int().positive(),
  sampleTestCases: z.array(learnSampleTestCaseSchema),
  hints: z.array(learnHintSchema),
  /** A count. The cases themselves never cross this boundary. */
  hiddenTestCaseCount: z.number().int().nonnegative(),
});
export type LearnExercise = z.infer<typeof learnExerciseSchema>;

export const learnExerciseWorkspaceSchema = z.object({
  breadcrumb: z.object({
    course: z.object({ id: z.uuid(), title: titleSchema }),
    module: z.object({ id: z.uuid(), title: titleSchema }),
    lecture: z.object({ id: z.uuid(), title: titleSchema }),
  }),
  exercise: learnExerciseSchema,
  neighbors: z.object({
    previous: learnExerciseRefSchema.nullable(),
    next: learnExerciseRefSchema.nullable(),
  }),
  draft: z
    .object({ code: z.string(), updatedAt: z.iso.datetime() })
    .nullable(),
  status: exerciseProgressStatusSchema,
});
export type LearnExerciseWorkspace = z.infer<
  typeof learnExerciseWorkspaceSchema
>;

/* --------------------------------------------- curriculum navigator */

/**
 * Where the workspace currently is, as one line of context.
 *
 * The same four segments the fullscreen header prints — Course › Module ›
 * Lecture › Exercise — and the same four the gateway sends when a watched
 * student moves. Declared once so the header, the navigator, and the realtime
 * event cannot disagree about what a position is.
 */
export const navigatorPathSchema = z.object({
  course: z.object({ id: z.uuid(), title: titleSchema }),
  module: z.object({ id: z.uuid(), title: titleSchema }),
  lecture: z.object({ id: z.uuid(), title: titleSchema }),
  exercise: z.object({ materialId: z.uuid(), title: titleSchema }),
});
export type NavigatorPath = z.infer<typeof navigatorPathSchema>;

export const navigatorExerciseSchema = z.object({
  materialId: z.uuid(),
  title: titleSchema,
  position: positionSchema,
  status: exerciseProgressStatusSchema,
  /** Null until the student has earned one, so 0 never reads as a grade. */
  bestScore: z.number().int().min(0).max(100).nullable(),
});
export type NavigatorExercise = z.infer<typeof navigatorExerciseSchema>;

export const navigatorLectureSchema = z.object({
  id: z.uuid(),
  title: titleSchema,
  position: positionSchema,
  exercises: z.array(navigatorExerciseSchema),
});

export const navigatorModuleSchema = z.object({
  id: z.uuid(),
  title: titleSchema,
  position: positionSchema,
  lectures: z.array(navigatorLectureSchema),
});

/**
 * One course, as the fullscreen navigator draws it.
 *
 * Deliberately a projection of `LearnCourseOutline` rather than a second
 * curriculum type: `toNavigatorContext` is the only thing that builds one, so
 * a change to ordering or progress semantics happens in one place and reaches
 * the outline page, both fullscreen panels, and previous/next together.
 */
export const workspaceNavigatorContextSchema = z.object({
  path: navigatorPathSchema,
  course: z.object({
    id: z.uuid(),
    title: titleSchema,
    progress: learnCourseProgressSchema,
    modules: z.array(navigatorModuleSchema),
  }),
});
export type WorkspaceNavigatorContext = z.infer<
  typeof workspaceNavigatorContextSchema
>;

/**
 * The workspace and its course, in one authorized read.
 *
 * The initial fullscreen entry needs both; an in-place transition inside the
 * same course needs only the first, which is why they stay separable.
 */
export const learnExerciseBootstrapSchema = z.object({
  workspace: learnExerciseWorkspaceSchema,
  navigator: workspaceNavigatorContextSchema,
});
export type LearnExerciseBootstrap = z.infer<
  typeof learnExerciseBootstrapSchema
>;

export const learnDraftSummarySchema = z.object({
  materialId: z.uuid(),
  exerciseTitle: titleSchema,
  courseId: z.uuid(),
  courseTitle: titleSchema,
  lineCount: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime(),
});
export type LearnDraftSummary = z.infer<typeof learnDraftSummarySchema>;

/* --------------------------------------------------------------- inputs */

export const learnAcademyInputSchema = z.object({ academyId: z.uuid() });

export const learnCourseInputSchema = learnAcademyInputSchema.extend({
  courseId: z.uuid(),
});

export const learnMaterialInputSchema = learnAcademyInputSchema.extend({
  materialId: z.uuid(),
});

/**
 * 256 KiB. Large enough that no realistic solution hits it, small enough that a
 * runaway client cannot post megabytes on every autosave.
 */
export const DRAFT_MAX_BYTES = 262_144;

export const saveDraftSchema = learnMaterialInputSchema.extend({
  code: z.string().max(DRAFT_MAX_BYTES),
});

/* ------------------------------------------------------------ pure logic */

type OrderedExercise = { materialId: string; title: string; lectureId: string };

/**
 * Flattens a published outline into the order a student walks it: modules by
 * position, then lectures, then exercises. Previous/Next in the workspace step
 * through this list, so it must match what the outline page renders.
 */
export function flattenOutlineExercises(
  modules: ReadonlyArray<{
    position: number;
    lectures: ReadonlyArray<{
      id: string;
      position: number;
      exercises: ReadonlyArray<{
        materialId: string;
        title: string;
        position: number;
      }>;
    }>;
  }>,
): OrderedExercise[] {
  return [...modules]
    .sort((left, right) => left.position - right.position)
    .flatMap((module) =>
      [...module.lectures]
        .sort((left, right) => left.position - right.position)
        .flatMap((lecture) =>
          [...lecture.exercises]
            .sort((left, right) => left.position - right.position)
            .map((exercise) => ({
              materialId: exercise.materialId,
              title: exercise.title,
              lectureId: lecture.id,
            })),
        ),
    );
}

/**
 * Neighbours cross lecture and module boundaries — reaching the end of a
 * lecture continues into the next one rather than dead-ending.
 */
export function resolveExerciseNeighbors(
  ordered: ReadonlyArray<OrderedExercise>,
  materialId: string,
): { previous: LearnExerciseRef | null; next: LearnExerciseRef | null } {
  const index = ordered.findIndex((item) => item.materialId === materialId);
  if (index < 0) return { previous: null, next: null };
  return {
    previous: ordered[index - 1] ?? null,
    next: ordered[index + 1] ?? null,
  };
}

/**
 * The outline as one course the navigator can draw, positioned at a material.
 *
 * Returns `null` when the material is not a visible programming exercise of
 * this course. That is not an error shape — it is how a caller learns that a
 * remembered id no longer belongs here, and it is the only way this function
 * refuses.
 */
export function toNavigatorContext(
  outline: LearnCourseOutline,
  materialId: string,
): WorkspaceNavigatorContext | null {
  const path = navigatorPathFor(outline, materialId);
  if (!path) return null;

  return {
    path,
    course: {
      id: outline.course.id,
      title: outline.course.title,
      progress: outline.progress,
      modules: orderedModules(outline.modules).map((courseModule) => ({
        id: courseModule.id,
        title: courseModule.title,
        position: courseModule.position,
        lectures: orderedLectures(courseModule.lectures).map((lecture) => ({
          id: lecture.id,
          title: lecture.title,
          position: lecture.position,
          exercises: orderedExercises(lecture.exercises).map((exercise) => ({
            materialId: exercise.materialId,
            title: exercise.title,
            position: exercise.position,
            status: exercise.status,
            // A best score belongs to work that happened. Reporting 0 for an
            // untouched exercise would render as a failing grade.
            bestScore:
              exercise.status === "NOT_STARTED" ? null : exercise.bestScore,
          })),
        })),
      })),
    },
  };
}

/**
 * The same four segments, from a payload that already carries them.
 *
 * Both fullscreen workspaces receive a breadcrumb and an exercise with every
 * response; deriving the header path from those rather than from the loaded
 * course is what keeps the printed position and the rendered exercise from
 * ever describing two different things.
 */
export function navigatorPathFromBreadcrumb(input: {
  breadcrumb: {
    course: { id: string; title: string };
    module: { id: string; title: string };
    lecture: { id: string; title: string };
  };
  exercise: { materialId: string; title: string };
}): NavigatorPath {
  return {
    course: input.breadcrumb.course,
    module: input.breadcrumb.module,
    lecture: input.breadcrumb.lecture,
    exercise: {
      materialId: input.exercise.materialId,
      title: input.exercise.title,
    },
  };
}

/** The four segments the fullscreen header prints, or nothing. */
export function navigatorPathFor(
  outline: LearnCourseOutline,
  materialId: string,
): NavigatorPath | null {
  for (const courseModule of outline.modules) {
    for (const lecture of courseModule.lectures) {
      const exercise = lecture.exercises.find(
        (candidate) => candidate.materialId === materialId,
      );
      if (!exercise) continue;
      return {
        course: { id: outline.course.id, title: outline.course.title },
        module: { id: courseModule.id, title: courseModule.title },
        lecture: { id: lecture.id, title: lecture.title },
        exercise: { materialId: exercise.materialId, title: exercise.title },
      };
    }
  }
  return null;
}

export type NavigatorRow = NavigatorExercise & {
  /** Stable, course-relative, and 1-based: the number printed on the row. */
  number: number;
  moduleId: string;
  lectureId: string;
};

/**
 * The course in the order a student walks it, numbered.
 *
 * The same traversal as `flattenOutlineExercises`, so the number on a
 * navigator row and the destination Previous/Next reaches for it are decided
 * by one ordering rather than two that happen to agree today.
 */
export function flattenNavigatorExercises(
  context: WorkspaceNavigatorContext,
): NavigatorRow[] {
  const rows: NavigatorRow[] = [];
  for (const courseModule of orderedModules(context.course.modules)) {
    for (const lecture of orderedLectures(courseModule.lectures)) {
      for (const exercise of orderedExercises(lecture.exercises)) {
        rows.push({
          ...exercise,
          number: rows.length + 1,
          moduleId: courseModule.id,
          lectureId: lecture.id,
        });
      }
    }
  }
  return rows;
}

/**
 * Fresh progress over the tree the user is already looking at.
 *
 * Merged rather than replaced so a refresh after a submission cannot reset the
 * accordion branches they opened: statuses move, identity and order do not.
 */
export function mergeNavigatorProgress(
  current: WorkspaceNavigatorContext,
  incoming: WorkspaceNavigatorContext,
): WorkspaceNavigatorContext {
  if (current.course.id !== incoming.course.id) return incoming;
  const statuses = new Map(
    flattenNavigatorExercises(incoming).map((row) => [
      row.materialId,
      { status: row.status, bestScore: row.bestScore },
    ]),
  );

  return {
    ...incoming,
    course: {
      ...incoming.course,
      modules: incoming.course.modules.map((courseModule) => ({
        ...courseModule,
        lectures: courseModule.lectures.map((lecture) => ({
          ...lecture,
          exercises: lecture.exercises.map((exercise) => ({
            ...exercise,
            ...(statuses.get(exercise.materialId) ?? {}),
          })),
        })),
      })),
    },
  };
}

function orderedModules<T extends { position: number; id: string }>(
  modules: ReadonlyArray<T>,
): T[] {
  return byPosition(modules);
}

function orderedLectures<T extends { position: number; id: string }>(
  lectures: ReadonlyArray<T>,
): T[] {
  return byPosition(lectures);
}

function orderedExercises<T extends { position: number; materialId: string }>(
  exercises: ReadonlyArray<T>,
): T[] {
  return [...exercises].sort(
    (left, right) =>
      left.position - right.position ||
      left.materialId.localeCompare(right.materialId),
  );
}

/** Position first, id as the tiebreak — the ordering every read applies. */
function byPosition<T extends { position: number; id: string }>(
  items: ReadonlyArray<T>,
): T[] {
  return [...items].sort(
    (left, right) =>
      left.position - right.position || left.id.localeCompare(right.id),
  );
}

/**
 * Which code the editor opens with. A local entry newer than the server's means
 * the last sync did not complete, so the student's own machine wins.
 */
export function resolveInitialCode(input: {
  localDraft: { code: string; updatedAt: string } | null;
  serverDraft: { code: string; updatedAt: string } | null;
  starterCode: string;
}): { code: string; source: "local" | "server" | "starter" } {
  const { localDraft, serverDraft, starterCode } = input;

  if (localDraft && serverDraft) {
    return Date.parse(localDraft.updatedAt) > Date.parse(serverDraft.updatedAt)
      ? { code: localDraft.code, source: "local" }
      : { code: serverDraft.code, source: "server" };
  }
  if (localDraft) return { code: localDraft.code, source: "local" };
  if (serverDraft) return { code: serverDraft.code, source: "server" };
  return { code: starterCode, source: "starter" };
}

/**
 * Until grading lands, a draft is the only evidence a student has engaged with
 * a problem. `SOLVED` becomes reachable when submissions exist.
 */
export function progressStatusFromDraft(
  hasDraft: boolean,
): ExerciseProgressStatus {
  return hasDraft ? "IN_PROGRESS" : "NOT_STARTED";
}
