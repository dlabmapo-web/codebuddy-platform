import { describe, expect, it } from 'vitest';

import {
  draftToPayload,
  exerciseCompleteness,
  serializeDraft,
  type ExerciseDraft,
} from './exercise-draft';

function draft(overrides: Partial<ExerciseDraft> = {}): ExerciseDraft {
  return {
    title: ' Sum two numbers ',
    difficulty: 'EASY',
    description: '<p>Add the values.</p>',
    inputFormat: '',
    outputFormat: '',
    constraints: '',
    starterCode: '',
    aiFeedbackEnabled: false,
    isVisible: true,
    testCases: [
      {
        key: 'sample',
        input: '1 2',
        expectedOutput: '3',
        visibility: 'SAMPLE',
      },
      {
        key: 'blank',
        input: '',
        expectedOutput: '',
        visibility: 'HIDDEN',
      },
    ],
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
            },
            {
              key: 'sample-second',
              input: '4 5',
              expectedOutput: '9',
              visibility: 'SAMPLE',
            },
          ],
        }),
      ).testCases,
    ).toEqual([
      { input: '1 2', expectedOutput: '3', visibility: 'HIDDEN' },
      { input: '4 5', expectedOutput: '9', visibility: 'SAMPLE' },
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
            },
          ],
        }),
      ).find((item) => item.id === 'test')?.complete,
    ).toBe(false);
  });
});
