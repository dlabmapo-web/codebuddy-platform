import {
  gradingProfileIssues,
  hasSampleTestCase,
  legacyCaseGrading,
  legacyGradingProfile,
  type CaseComparator,
  type ExerciseAuthoringContext,
  type ExerciseDifficulty,
  type ExerciseGradingProfile,
  type GradingIssue,
  type TestCaseVisibility,
} from '@cove/shared';

/**
 * One answer as the editor holds it.
 *
 * Every grading field the server stores is here, and is written back on save.
 * An editor that only knew input, output and visibility would save a weighted
 * problem's cases at weight 1 with the default comparator — the silent reset
 * the contract now refuses.
 */
export type TestCaseDraft = {
  key: string;
  input: string;
  expectedOutput: string;
  visibility: TestCaseVisibility;
  comparator: CaseComparator;
  weight: number;
  timeLimitMsOverride: number | null;
  softTimeLimitMs: number | null;
  softPenalty: number | null;
  label: string;
};

/** A fresh answer, graded the way the problem's mode grades a new one. */
export function newTestCaseDraft(
  key: string,
  visibility: TestCaseVisibility,
): TestCaseDraft {
  return {
    key,
    input: '',
    expectedOutput: '',
    visibility,
    ...legacyCaseGrading,
    label: '',
  };
}

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
  solutionCode: string;
  aiFeedbackEnabled: boolean;
  isVisible: boolean;
  testCases: TestCaseDraft[];
  grading: ExerciseGradingProfile;
  hints: HintDraft[];
};

export type ExerciseDraftKey = keyof ExerciseDraft;
export type ExerciseDraftUpdate = <K extends ExerciseDraftKey>(
  key: K,
  value: ExerciseDraft[K],
) => void;

export function contextToDraft(
  context: ExerciseAuthoringContext,
  solutionCode = '',
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
      solutionCode,
      aiFeedbackEnabled: false,
      isVisible: false,
      testCases: [newTestCaseDraft('new-sample', 'SAMPLE')],
      grading: legacyGradingProfile,
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
    solutionCode,
    aiFeedbackEnabled: exercise.aiFeedbackEnabled,
    isVisible: context.material!.isVisible,
    testCases: exercise.testCases.map((testCase) => ({
      key: testCase.id,
      input: testCase.input,
      expectedOutput: testCase.expectedOutput,
      visibility: testCase.visibility,
      comparator: testCase.comparator,
      weight: testCase.weight,
      timeLimitMsOverride: testCase.timeLimitMsOverride,
      softTimeLimitMs: testCase.softTimeLimitMs,
      softPenalty: testCase.softPenalty,
      label: testCase.label ?? '',
    })),
    grading: {
      mode: exercise.grading.mode,
      totalTimeLimitMs: exercise.grading.totalTimeLimitMs,
      comparatorTimeLimitMs: exercise.grading.comparatorTimeLimitMs,
      materialMaximumHundredths: exercise.grading.materialMaximumHundredths,
      materialScorePolicy: exercise.grading.materialScorePolicy,
    },
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
    solutionCode: draft.solutionCode,
    aiFeedbackEnabled: draft.aiFeedbackEnabled,
    isVisible: draft.isVisible,
    testCases: draft.testCases
      .filter((testCase) => testCase.expectedOutput.trim().length > 0)
      .map((testCase) => ({
        input: testCase.input,
        expectedOutput: testCase.expectedOutput,
        visibility: testCase.visibility,
        comparator: testCase.comparator,
        weight: testCase.weight,
        timeLimitMsOverride: testCase.timeLimitMsOverride,
        softTimeLimitMs: testCase.softTimeLimitMs,
        softPenalty: testCase.softPenalty,
        label: testCase.label.trim() || null,
      })),
    grading: draft.grading,
    hints: draft.hints
      .filter((hint) => hint.content.trim().length > 0)
      .map((hint) => ({
        content: hint.content.trim(),
        triggerExpression: hint.triggerExpression.trim() || null,
      })),
  };
}

/**
 * What the problem still needs, and which of it actually blocks saving.
 *
 * `optional` is the whole distinction: an answer is what makes the problem
 * *gradeable*, not what makes it *writable*. An author who has the question but
 * not yet the answer used to be unable to save at all, so the work lived in a
 * browser tab until they invented a test case. The row is still listed, still
 * unchecked, and now simply does not hold the button shut.
 */
export function exerciseCompleteness(draft: ExerciseDraft) {
  return [
    { id: 'title', complete: draft.title.trim().length > 0, optional: false },
    { id: 'difficulty', complete: Boolean(draft.difficulty), optional: false },
    {
      id: 'description',
      complete: richTextToPlainText(draft.description).length > 0,
      optional: false,
    },
    {
      id: 'solution',
      complete: draft.solutionCode.trim().length > 0,
      optional: false,
    },
    {
      id: 'test',
      complete: hasSampleTestCase(draft.testCases),
      optional: true,
    },
  ] as const;
}

/**
 * What the grading settings may not say together, as the server will judge
 * them — shown in the editor so the author fixes it before pressing Save.
 */
export function draftGradingIssues(draft: ExerciseDraft): GradingIssue[] {
  const payload = draftToPayload(draft);
  return gradingProfileIssues({
    grading: payload.grading,
    testCases: payload.testCases,
  });
}

export function serializeDraft(draft: ExerciseDraft) {
  return JSON.stringify(draftToPayload(draft));
}

/**
 * Renders authored rich text the way students see it. The stylesheet has to
 * cover every mark the editor can produce, otherwise a preview under-reports
 * headings, lists, and code the author actually wrote.
 */
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
