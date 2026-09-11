import { describe, expect, it } from 'vitest';

import { defaultEliceGradingProfile, legacyGradingProfile } from '@cove/shared';

import {
  contextToDraft,
  draftGradingIssues,
  draftToPayload,
  exerciseCompleteness,
  serializeDraft,
  type ExerciseDraft,
} from './exercise-draft';

const legacyFields = {
  comparator: 'STDOUT' as const,
  weight: 1,
  timeLimitMsOverride: null,
  softTimeLimitMs: null,
  softPenalty: null,
  label: '',
};

function draft(overrides: Partial<ExerciseDraft> = {}): ExerciseDraft {
  return {
    title: ' Sum two numbers ',
    difficulty: 'EASY',
    description: '<p>Add the values.</p>',
    inputFormat: '',
    outputFormat: '',
    constraints: '',
    starterCode: '',
    solutionCode: 'print(sum(map(int, input().split())))\n',
    aiFeedbackEnabled: false,
    isVisible: true,
    testCases: [
      {
        key: 'sample',
        input: '1 2',
        expectedOutput: '3',
        visibility: 'SAMPLE',
        ...legacyFields,
      },
      {
        key: 'blank',
        input: '',
        expectedOutput: '',
        visibility: 'HIDDEN',
        ...legacyFields,
      },
    ],
    grading: legacyGradingProfile,
    hints: [
      { key: 'hint', content: ' Use addition. ', triggerExpression: '' },
      { key: 'blank-hint', content: '', triggerExpression: '' },
    ],
    ...overrides,
  };
}

describe('exercise draft helpers', () => {
  it('normalizes the authoring draft into the existing save payload', () => {
    expect(draftToPayload(draft())).toMatchObject({
      title: 'Sum two numbers',
      testCases: [
        { input: '1 2', expectedOutput: '3', visibility: 'SAMPLE' },
      ],
      hints: [{ content: 'Use addition.', triggerExpression: null }],
    });
  });

  it('keeps dirty-state serialization aligned with the save payload', () => {
    expect(
      serializeDraft(
        draft({
          testCases: [
            {
              key: 'different-client-key',
              input: '1 2',
              expectedOutput: '3',
              visibility: 'SAMPLE',
              ...legacyFields,
            },
          ],
        }),
      ),
    ).toBe(
      serializeDraft(
        draft({
          testCases: [
            {
              key: 'server-id',
              input: '1 2',
              expectedOutput: '3',
              visibility: 'SAMPLE',
              ...legacyFields,
            },
          ],
        }),
      ),
    );
  });

  it('keeps the visibility the author chose per case, not the position', () => {
    expect(
      draftToPayload(
        draft({
          testCases: [
            {
              key: 'hidden-first',
              input: '1 2',
              expectedOutput: '3',
              visibility: 'HIDDEN',
              ...legacyFields,
            },
            {
              key: 'sample-second',
              input: '4 5',
              expectedOutput: '9',
              visibility: 'SAMPLE',
              ...legacyFields,
            },
          ],
        }),
      ).testCases,
    ).toEqual([
      expect.objectContaining({ input: '1 2', expectedOutput: '3', visibility: 'HIDDEN' }),
      expect.objectContaining({ input: '4 5', expectedOutput: '9', visibility: 'SAMPLE' }),
    ]);
  });

  it('reports the four save requirements', () => {
    expect(exerciseCompleteness(draft()).every((item) => item.complete)).toBe(
      true,
    );
    expect(
      exerciseCompleteness(draft({ description: '<p>&nbsp;</p>' })).find(
        (item) => item.id === 'description',
      )?.complete,
    ).toBe(false);
  });

  it('needs a sample case, not just any expected output, to be saveable', () => {
    expect(
      exerciseCompleteness(
        draft({
          testCases: [
            {
              key: 'hidden-only',
              input: '1 2',
              expectedOutput: '3',
              visibility: 'HIDDEN',
              ...legacyFields,
            },
          ],
        }),
      ).find((item) => item.id === 'test')?.complete,
    ).toBe(false);
  });

  it('writes back every grading field it read, so a save never resets them', () => {
    // The editor used to send input, output and visibility only, and the
    // contract defaulted the rest: opening a 30/30/40 problem and saving it
    // untouched turned it into 1/1/1.
    const loaded = contextToDraft({
      course: { id: '10000000-0000-4000-8000-000000000001', title: 'Course' },
      module: { id: '20000000-0000-4000-8000-000000000001', title: 'Module' },
      lecture: { id: '30000000-0000-4000-8000-000000000001', title: 'Lecture' },
      material: {
        id: '40000000-0000-4000-8000-000000000001',
        type: 'PROGRAMMING_EXERCISE',
        title: 'Calculator',
        position: 1,
        isRequired: true,
        isVisible: true,
        programmingExercise: {
          materialId: '40000000-0000-4000-8000-000000000001',
          externalKey: 'calculator',
          legacyProblemNo: null,
          difficulty: 'EASY',
          description: '<p>Calculate.</p>',
          inputFormat: '',
          outputFormat: '',
          constraints: '',
          starterCode: '',
          language: 'PYTHON',
          timeLimitMs: 3000,
          memoryLimitMb: 256,
          aiFeedbackEnabled: false,
          gradingRevision: 3,
          grading: {
            mode: 'ELICE_STDIO',
            semanticVersion: 'elice-v1',
            totalTimeLimitMs: 60_000,
            comparatorTimeLimitMs: 100,
            materialMaximumHundredths: 10_000,
            materialScorePolicy: 'PROPORTIONAL',
          },
          updatedAt: '2026-09-10T00:00:00.000Z',
          testCases: [30, 30, 40].map((weight, index) => ({
            id: `50000000-0000-4000-8000-00000000000${index + 1}`,
            position: index + 1,
            input: `${index}`,
            expectedOutput: `${index}`,
            visibility: 'HIDDEN' as const,
            comparator: index === 0 ? ('STDOUT_REGEX' as const) : ('STDOUT' as const),
            weight,
            timeLimitMsOverride: index === 1 ? 2_000 : null,
            softTimeLimitMs: index === 2 ? 500 : null,
            softPenalty: index === 2 ? 10 : null,
            label: index === 0 ? 'shape' : null,
          })),
          hints: [],
        },
      },
    });

    const payload = draftToPayload(loaded);

    expect(payload.grading).toEqual({
      mode: 'ELICE_STDIO',
      totalTimeLimitMs: 60_000,
      comparatorTimeLimitMs: 100,
      materialMaximumHundredths: 10_000,
      materialScorePolicy: 'PROPORTIONAL',
    });
    expect(payload.testCases).toEqual([
      expect.objectContaining({ weight: 30, comparator: 'STDOUT_REGEX', label: 'shape' }),
      expect.objectContaining({ weight: 30, timeLimitMsOverride: 2_000, label: null }),
      expect.objectContaining({ weight: 40, softTimeLimitMs: 500, softPenalty: 10 }),
    ]);
    expect(draftGradingIssues(loaded)).toEqual([]);
  });

  it('reports a weight on a standard problem before the server has to refuse it', () => {
    const issues = draftGradingIssues(
      draft({
        testCases: [
          { key: 'a', input: '1', expectedOutput: '1', visibility: 'SAMPLE', ...legacyFields, weight: 30 },
        ],
      }),
    );

    expect(issues.map((issue) => issue.code)).toEqual(['needs_weighted_grading']);
  });

  it('accepts a weighted problem once it is worth points', () => {
    expect(
      draftGradingIssues(
        draft({
          grading: defaultEliceGradingProfile,
          testCases: [
            { key: 'a', input: '1', expectedOutput: '1', visibility: 'SAMPLE', ...legacyFields, weight: 0 },
          ],
        }),
      ).map((issue) => issue.code),
    ).toEqual(['no_points']);
  });
});
