import {
  hasSampleTestCase,
  type ExerciseAuthoringContext,
  type ExerciseDifficulty,
  type TestCaseVisibility,
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
  isPublished: boolean;
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
      isPublished: true,
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
    isPublished: context.material!.isPublished,
    testCases: exercise.testCases.map((testCase) => ({
      key: testCase.id,
      input: testCase.input,
      expectedOutput: testCase.expectedOutput,
      visibility: testCase.visibility,
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
    isPublished: draft.isPublished,
    testCases: draft.testCases
      .filter((testCase) => testCase.expectedOutput.trim().length > 0)
      .map((testCase) => ({
        input: testCase.input,
        expectedOutput: testCase.expectedOutput,
        visibility: testCase.visibility,
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
      complete: hasSampleTestCase(draft.testCases),
    },
  ] as const;
}

export function serializeDraft(draft: ExerciseDraft) {
  return JSON.stringify(draftToPayload(draft));
}

/**
 * Renders authored rich text the way students see it. The stylesheet has to
 * cover every mark the editor can produce, otherwise a preview under-reports
 * headings, lists, and code the author actually wrote.
 */
export function previewDocument(content: string, padding = 16) {
  const body = content.trim().length > 0 ? content : '';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}
html,body{margin:0}
body{padding:${padding}px;font-family:"Pretendard Variable",Pretendard,system-ui,sans-serif;color:#16181d;font-size:14.5px;line-height:1.75;letter-spacing:-0.006em;word-break:break-word}
body>:first-child{margin-top:0}
body>:last-child{margin-bottom:0}
p{margin:0 0 0.75em}
h1,h2,h3,h4{margin:1.25em 0 0.5em;font-weight:700;line-height:1.35}
h1{font-size:1.4em}h2{font-size:1.2em}h3{font-size:1.05em}h4{font-size:1em}
ul,ol{margin:0 0 0.75em;padding-left:1.35em}
li{margin:0.2em 0}
a{color:#1b64da;text-decoration:underline;text-underline-offset:2px}
strong,b{font-weight:700}
em,i{font-style:italic}
s{text-decoration:line-through}
img{max-width:100%;height:auto;border-radius:8px;display:block;margin:0.5em 0}
code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:0.9em;background:#f1f5f9;padding:0.15em 0.35em;border-radius:4px}
pre{margin:0 0 0.75em;padding:12px 14px;background:#0f172a;color:#e2e8f0;border-radius:8px;overflow-x:auto;white-space:pre-wrap;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:0.85em;line-height:1.6}
pre code{background:none;padding:0;color:inherit;font-size:1em}
blockquote{margin:0 0 0.75em;padding:0.1em 0 0.1em 0.9em;border-left:3px solid #e5e8ec;color:#5a6270}
table{border-collapse:collapse;width:100%;margin:0 0 0.75em;font-size:0.95em}
th,td{border:1px solid #e5e8ec;padding:6px 9px;text-align:left}
th{background:#f6f7f9;font-weight:700}
hr{border:0;border-top:1px solid #e5e8ec;margin:1.2em 0}
</style></head><body>${body}</body></html>`;
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
