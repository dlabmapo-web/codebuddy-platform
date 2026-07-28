import { describe, expect, it } from 'vitest';
import {
  canSelectCurriculumProblem,
  hasStudentMoved,
} from './navigator';

describe('canSelectCurriculumProblem', () => {
  it('lets a student select another published problem', () => {
    expect(canSelectCurriculumProblem({
      mode: 'student',
      problemId: 'problem-2',
      displayedProblemId: 'problem-1',
      liveProblemId: 'problem-1',
      navigationDisabled: false,
    })).toBe(true);
  });

  it('lets a teacher preview another problem or return to the live problem', () => {
    expect(canSelectCurriculumProblem({
      mode: 'teacher',
      problemId: 'problem-2',
      displayedProblemId: 'problem-1',
      liveProblemId: 'problem-2',
      navigationDisabled: false,
    })).toBe(true);
    expect(canSelectCurriculumProblem({
      mode: 'teacher',
      problemId: 'problem-3',
      displayedProblemId: 'problem-1',
      liveProblemId: 'problem-2',
      navigationDisabled: false,
    })).toBe(true);
  });

  it('does not select the problem that is already displayed', () => {
    expect(canSelectCurriculumProblem({
      mode: 'teacher',
      problemId: 'problem-1',
      displayedProblemId: 'problem-1',
      liveProblemId: 'problem-2',
      navigationDisabled: false,
    })).toBe(false);
  });
});

describe('hasStudentMoved', () => {
  it('detects a new live session without treating offline as movement', () => {
    expect(hasStudentMoved({
      displayedSessionId: 'session-1',
      activeSessionId: 'session-2',
    })).toBe(true);
    expect(hasStudentMoved({
      displayedSessionId: 'session-1',
      activeSessionId: null,
    })).toBe(false);
  });
});
