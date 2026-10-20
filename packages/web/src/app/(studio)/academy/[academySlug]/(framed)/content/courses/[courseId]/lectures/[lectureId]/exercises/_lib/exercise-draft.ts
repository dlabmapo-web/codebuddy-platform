import { defaultEliceGradingProfile, inferSubmissionPolicy, type SubmissionPolicy } from "@cove/shared";

import type { ExerciseSolutionEntry } from "@cove/shared";
import { exerciseSolutionsSchema } from "@cove/shared";
import {
  quizDefinitionSchema,
  type QuizDefinition,
  gradingProfileIssues,
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
  submissionPolicy?: SubmissionPolicy;
  referencePdfMaterialId?: string | null;
  quiz?: QuizDefinition | null;
  title: string;
  difficulty: ExerciseDifficulty;
  description: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  starterCode: string;
  solutions: ExerciseSolutionEntry[];
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
  solutions: ExerciseSolutionEntry[] = [],
): ExerciseDraft {
  const exercise = context.material?.programmingExercise;
  if (!exercise) {
    return {
      submissionPolicy: 'AUTOMATIC',
      referencePdfMaterialId: null,
      title: '',
      difficulty: 'EASY',
      description: '',
      inputFormat: '',
      outputFormat: '',
      constraints: '',
      starterCode: '',
      solutions: solutions.length ? solutions : [{ title: null, code: '' }],
      aiFeedbackEnabled: false,
      isVisible: false,
      testCases: [newTestCaseDraft('new-sample', 'SAMPLE')],
      grading: legacyGradingProfile,
      hints: [],
    };
  }

  return {
    submissionPolicy: inferSubmissionPolicy(exercise),
    referencePdfMaterialId: exercise.referencePdfMaterialId ?? null,
    quiz: exercise.quiz ?? null,
    title: context.material!.title,
    difficulty: exercise.difficulty,
    description: exercise.description,
    inputFormat: exercise.inputFormat,
    outputFormat: exercise.outputFormat,
    constraints: exercise.constraints,
    starterCode: exercise.starterCode,
    solutions: exercise.quiz ? [] : solutions.length ? solutions : [{ title: null, code: '' }],
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
      inputPromptPolicy: exercise.grading.inputPromptPolicy,
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

/** Policy toggles preserve cases; only a fresh empty PDF grader gets enhanced defaults. */
export function withSubmissionPolicy(draft: ExerciseDraft, submissionPolicy: SubmissionPolicy): ExerciseDraft {
  const fresh = !draft.testCases.length || draft.testCases.every(test => test.key === 'new-sample' && !test.input && !test.expectedOutput && !test.label);
  if (submissionPolicy === 'AUTOMATIC' && draft.referencePdfMaterialId && fresh && draft.grading.mode === 'LEGACY_STDIO') {
    return { ...draft, submissionPolicy, grading: { ...defaultEliceGradingProfile, materialScorePolicy: 'ABSOLUTE_CAP', materialMaximumHundredths: 10000 },
      testCases: [{ ...newTestCaseDraft('new-sample', 'HIDDEN'), weight: 100 }] };
  }
  return { ...draft, submissionPolicy };
}

export function draftToPayload(draft: ExerciseDraft) {
  return {
    submissionPolicy: draft.quiz ? "AUTOMATIC" as const : draft.submissionPolicy,
    referencePdfMaterialId: draft.quiz ? null : draft.referencePdfMaterialId,
    ...(draft.quiz ? { quiz: draft.quiz } : {}),
    title: draft.title.trim(),
    difficulty: draft.difficulty,
    description: draft.description,
    inputFormat: draft.inputFormat,
    outputFormat: draft.outputFormat,
    constraints: draft.constraints,
    starterCode: draft.starterCode,
    solutions: draft.quiz ? [] : draft.referencePdfMaterialId ? draft.solutions.filter(solution => solution.code.trim() || solution.title?.trim()) : draft.solutions,
    aiFeedbackEnabled: draft.aiFeedbackEnabled,
    isVisible: draft.isVisible,
    testCases: (draft.quiz ? [] : draft.testCases)
      .filter((testCase) => draft.submissionPolicy === 'AUTOMATIC' || (draft.submissionPolicy === 'PRACTICE_ONLY'
        ? !(testCase.key === 'new-sample' && !testCase.expectedOutput && !testCase.input && !testCase.label)
        : testCase.expectedOutput.trim().length > 0))
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
    grading: draft.quiz ? legacyGradingProfile : draft.grading,
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
      complete: Boolean(!draft.quiz && draft.referencePdfMaterialId) || richTextToPlainText(draft.description).length > 0,
      optional: Boolean(!draft.quiz && draft.referencePdfMaterialId),
    },
    {
      id: 'solution',
      complete: draft.quiz ? quizDefinitionSchema.safeParse(draft.quiz).success : draft.solutions.length > 0 && exerciseSolutionsSchema.safeParse(draft.solutions).success,
      optional: Boolean(!draft.quiz && draft.referencePdfMaterialId),
    },
    {
      id: 'test',
      complete: draft.quiz ? quizDefinitionSchema.safeParse(draft.quiz).success : draft.testCases.length > 0 && draft.testCases.every(test => test.expectedOutput.length > 0 || ['STDOUT_REGEX', 'STDOUT_REGEX_NOMATCH'].includes(test.comparator)),
      optional: draft.submissionPolicy !== 'AUTOMATIC' || Boolean(draft.quiz),
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
