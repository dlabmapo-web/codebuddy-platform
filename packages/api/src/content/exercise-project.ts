import {
  exerciseProjectSchema,
  learnerProjectFor,
  type ExerciseProject,
  type LearnerProject,
} from "@cove/shared";

/**
 * A stored `source_project`, read back.
 *
 * Written only through `exerciseProjectSchema`, so a row that no longer parses
 * is corruption: it is reported, and the exercise reads as single-file rather
 * than handing a learner something half-understood.
 */
export function storedExerciseProject(raw: unknown): ExerciseProject | null {
  if (raw === null || raw === undefined) return null;
  const parsed = exerciseProjectSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** What a learner's workspace may know: never a hidden path or any content. */
export function learnerProjectView(raw: unknown): LearnerProject | null {
  const project = storedExerciseProject(raw);
  return project ? learnerProjectFor(project) : null;
}
