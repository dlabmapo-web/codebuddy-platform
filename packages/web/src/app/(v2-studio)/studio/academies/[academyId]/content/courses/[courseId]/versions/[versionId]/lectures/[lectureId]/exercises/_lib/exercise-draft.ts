import type {
  ExerciseAuthoringContext,
  ExerciseDifficulty,
  TestCaseVisibility,
} from '@cove/shared';

export type TestCaseDraft = {
  key: string;
  input: string;
  expectedOutput: string;
  visibility: TestCaseVisibility;
};

export type HintDraft = {
  key: string;
  content: string;
  triggerExpression: string;
};

export type ExerciseDraft = {
  title: string;
  difficulty: ExerciseDifficulty;
  description: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  starterCode: string;
  aiFeedbackEnabled: boolean;
  testCases: TestCaseDraft[];
  hints: HintDraft[];
};

export type ExerciseDraftKey = keyof ExerciseDraft;
export type ExerciseDraftUpdate = <K extends ExerciseDraftKey>(
  key: K,
  value: ExerciseDraft[K],
) => void;

export function contextToDraft(
  context: ExerciseAuthoringContext,
): ExerciseDraft {
  const exercise = context.material?.programmingExercise;
  if (!exercise) {
    return {
      title: '',
      difficulty: 'EASY',
      description: '',
      inputFormat: '',
      outputFormat: '',
      constraints: '',
      starterCode: '',
      aiFeedbackEnabled: false,
      testCases: [
        {
          key: 'new-sample',
          input: '',
          expectedOutput: '',
          visibility: 'SAMPLE',
        },
      ],
      hints: [],
    };
  }

  return {
    title: context.material!.title,
    difficulty: exercise.difficulty,
    description: exercise.description,
    inputFormat: exercise.inputFormat,
    outputFormat: exercise.outputFormat,
    constraints: exercise.constraints,
    starterCode: exercise.starterCode,
    aiFeedbackEnabled: exercise.aiFeedbackEnabled,
    testCases: exercise.testCases.map((testCase, index) => ({
      key: testCase.id,
      input: testCase.input,
      expectedOutput: testCase.expectedOutput,
      visibility: index === 0 ? 'SAMPLE' : 'HIDDEN',
    })),
    hints: exercise.hints.map((hint) => ({
      key: hint.id,
      content: hint.content,
      triggerExpression: hint.triggerExpression ?? '',
    })),
  };
}

export function draftToPayload(draft: ExerciseDraft) {
  return {
    title: draft.title.trim(),
    difficulty: draft.difficulty,
    description: draft.description,
    inputFormat: draft.inputFormat,
    outputFormat: draft.outputFormat,
    constraints: draft.constraints,
    starterCode: draft.starterCode,
    aiFeedbackEnabled: draft.aiFeedbackEnabled,
    testCases: draft.testCases
      .filter((testCase) => testCase.expectedOutput.trim().length > 0)
      .map((testCase, index) => ({
        input: testCase.input,
        expectedOutput: testCase.expectedOutput,
        visibility: index === 0 ? ('SAMPLE' as const) : ('HIDDEN' as const),
      })),
    hints: draft.hints
      .filter((hint) => hint.content.trim().length > 0)
      .map((hint) => ({
        content: hint.content.trim(),
        triggerExpression: hint.triggerExpression.trim() || null,
      })),
  };
}

export function exerciseCompleteness(draft: ExerciseDraft) {
  return [
    { id: 'title', complete: draft.title.trim().length > 0 },
    { id: 'difficulty', complete: Boolean(draft.difficulty) },
    {
      id: 'description',
      complete: richTextToPlainText(draft.description).length > 0,
    },
    {
      id: 'test',
      complete: draft.testCases.some(
        (testCase) => testCase.expectedOutput.trim().length > 0,
      ),
    },
  ] as const;
}

export function serializeDraft(draft: ExerciseDraft) {
  return JSON.stringify(draftToPayload(draft));
}

export function previewDocument(content: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:system-ui,sans-serif;color:#16181d;font-size:15px;line-height:1.75;margin:16px}img{max-width:100%}pre{white-space:pre-wrap}</style></head><body>${content}</body></html>`;
}

export function replaceAt<T>(items: T[], index: number, item: T) {
  return items.map((current, itemIndex) =>
    itemIndex === index ? item : current,
  );
}

export function newClientKey() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function richTextToPlainText(value: string) {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
