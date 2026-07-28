export type CurriculumNavigatorMode = 'student' | 'teacher';

export function canSelectCurriculumProblem({
  mode,
  problemId,
  displayedProblemId,
  navigationDisabled,
}: {
  mode: CurriculumNavigatorMode;
  problemId: string;
  displayedProblemId: string;
  liveProblemId: string | null;
  navigationDisabled: boolean;
}): boolean {
  if (navigationDisabled) return false;
  if (problemId === displayedProblemId) return false;
  if (mode === 'student') return true;
  return true;
}

export function hasStudentMoved({
  displayedSessionId,
  activeSessionId,
}: {
  displayedSessionId: string;
  activeSessionId: string | null;
}): boolean {
  return activeSessionId !== null && activeSessionId !== displayedSessionId;
}
