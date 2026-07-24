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
});
