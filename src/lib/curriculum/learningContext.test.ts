import { describe, expect, it } from 'vitest';
import {
  buildLearningContext,
  updateLearningProgress,
  type LearningContextSource,
} from './learningContext';

function source(
  overrides: Partial<LearningContextSource> = {}
): LearningContextSource {
  return {
    path: {
      subject: { id: 'subject-1', title: 'Algorithms' },
      stage: { id: 'stage-1', title: 'Week 1' },
      chapter: { id: 'chapter-1', title: 'Output' },
      problem: { id: 'problem-1', problemNo: 101, title: 'Hello' },
    },
    stages: [
      { id: 'stage-2', subjectId: 'subject-1', title: 'Week 2', orderNo: 2, isPublished: true },
      { id: 'stage-1', subjectId: 'subject-1', title: 'Week 1', orderNo: 1, isPublished: true },
      { id: 'hidden-stage', subjectId: 'subject-1', title: 'Hidden', orderNo: 3, isPublished: false },
      { id: 'other-stage', subjectId: 'subject-2', title: 'Other', orderNo: 1, isPublished: true },
    ],
    chapters: [
      { id: 'chapter-2', stageId: 'stage-1', title: 'Input', orderNo: 2, isPublished: true },
      { id: 'chapter-1', stageId: 'stage-1', title: 'Output', orderNo: 1, isPublished: true },
      { id: 'chapter-3', stageId: 'stage-2', title: 'Loops', orderNo: 1, isPublished: true },
      { id: 'hidden-chapter', stageId: 'stage-1', title: 'Hidden', orderNo: 3, isPublished: false },
    ],
    problems: [
      { id: 'problem-2', chapterId: 'chapter-1', problemNo: 102, title: 'World', orderNo: 2, isPublished: true },
      { id: 'problem-1', chapterId: 'chapter-1', problemNo: 101, title: 'Hello', orderNo: 1, isPublished: true },
      { id: 'problem-3', chapterId: 'chapter-3', problemNo: 201, title: 'Loop', orderNo: 1, isPublished: true },
      { id: 'hidden-problem', chapterId: 'chapter-1', problemNo: 103, title: 'Hidden', orderNo: 3, isPublished: false },
    ],
    submissions: [],
    ...overrides,
  };
}

describe('buildLearningContext', () => {
  it('builds a published subject tree in canonical order', () => {
    const context = buildLearningContext(source());

    expect(context.subject.stages.map((stage) => stage.id)).toEqual([
      'stage-1',
      'stage-2',
    ]);
    expect(context.subject.stages[0].chapters.map((chapter) => chapter.id)).toEqual([
      'chapter-1',
      'chapter-2',
    ]);
    expect(
      context.subject.stages[0].chapters[0].problems.map((problem) => problem.id)
    ).toEqual(['problem-1', 'problem-2']);
  });

  it('resolves passed, attempted, and untouched progress', () => {
    const context = buildLearningContext(source({
      submissions: [
        { problemId: 'problem-1', status: 'fail' },
        { problemId: 'problem-1', status: 'pass' },
        { problemId: 'problem-2', status: 'partial' },
      ],
    }));
    const problems = context.subject.stages[0].chapters[0].problems;

    expect(problems.map(({ id, status }) => ({ id, status }))).toEqual([
      { id: 'problem-1', status: 'passed' },
      { id: 'problem-2', status: 'attempted' },
    ]);
    expect(context.subject.stages[1].chapters[0].problems[0].status).toBe(
      'untouched'
    );
  });

  it('updates a problem status after a submission without changing its path', () => {
    const context = buildLearningContext(source());
    const updated = updateLearningProgress(context, 'problem-1', 'passed');

    expect(updated.path).toBe(context.path);
    expect(updated.subject.stages[0].chapters[0].problems[0].status).toBe(
      'passed'
    );
  });
});
