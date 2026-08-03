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
