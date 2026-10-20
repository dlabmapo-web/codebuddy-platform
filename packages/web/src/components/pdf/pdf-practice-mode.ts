import type { LearnExercise } from '@cove/shared';

/** Running code needs no grading fixtures; Submit does. */
export function isPdfRunOnly(exercise: Pick<LearnExercise, 'hasReferencePdf' | 'sampleTestCases' | 'hiddenTestCaseCount' | 'submissionPolicy'>) {
  return exercise.submissionPolicy ? exercise.submissionPolicy === "PRACTICE_ONLY" : Boolean(exercise.hasReferencePdf && !exercise.sampleTestCases.length && !exercise.hiddenTestCaseCount);
}
