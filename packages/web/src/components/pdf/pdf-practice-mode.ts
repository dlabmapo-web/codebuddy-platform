import type { LearnExercise } from '@cove/shared';

/** Running code needs no grading fixtures; Submit does. */
export function isPdfRunOnly(exercise: Pick<LearnExercise, 'hasReferencePdf' | 'sampleTestCases' | 'hiddenTestCaseCount'>) {
  return Boolean(exercise.hasReferencePdf && !exercise.sampleTestCases.length && !exercise.hiddenTestCaseCount);
}
