import { Eye, EyeOff, ListChecks, Plus, Trash2 } from 'lucide-react';

import { useTranslation } from 'react-i18next';

import {
  caseComparators,
  defaultExerciseTimeLimitMs,
  type CaseComparator,
  type ExerciseGradingProfile,
  type GradingIssue,
} from '@cove/shared';

import {
  newClientKey,
  newTestCaseDraft,
  replaceAt,
  type TestCaseDraft,
} from '../_lib/exercise-draft';
import {
  Field,
  inputClass,
  secondaryButtonClass,
  SectionCard,
  TextAreaField,
} from './authoring-fields';
import { GradingSettings } from './grading-settings';
import { ChoiceField } from '@/components/studio/choice-field';
import { NumberField } from '@/components/studio/number-field';

/** Mirrors the 50-case ceiling enforced by exerciseDraftFieldsSchema. */
const MAX_TEST_CASES = 50;

export function AnswersEditor({
  editable,
  error,
  testCases,
  grading,
  gradingIssues,
  update,
  updateGrading,
}: {
  editable: boolean;
  error?: string | null;
  testCases: TestCaseDraft[];
  grading: ExerciseGradingProfile;
  gradingIssues: GradingIssue[];
  update: (testCases: TestCaseDraft[]) => void;
  updateGrading: (grading: ExerciseGradingProfile, testCases: TestCaseDraft[]) => void;
}) {
  const { t } = useTranslation('content');
  const weighted = grading.mode === 'ELICE_STDIO';

  return (
    <SectionCard
      action={
        editable ? (
          <button
            className={`${secondaryButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}
            disabled={testCases.length >= MAX_TEST_CASES}
            onClick={() =>
              update([...testCases, newTestCaseDraft(newClientKey(), 'HIDDEN')])
            }
            type="button"
          >
            <Plus className="size-4" />
            {t('exercise.test.add')}
          </button>
        ) : null
      }
      description={t('exercise.test.help')}
      icon={ListChecks}
      title={t('exercise.section.tests')}
    >
      <GradingSettings
        editable={editable}
        grading={grading}
        issues={gradingIssues}
        onChange={updateGrading}
        testCases={testCases}
      />

      {error ? (
        <p className="rounded-lg bg-danger/5 px-3.5 py-2.5 text-[13.5px] font-semibold text-danger">
          {error}
        </p>
      ) : null}

      <div className="space-y-3">
        {testCases.map((testCase, index) => {
          const isSample = testCase.visibility === 'SAMPLE';
          return (
          <article
            className={`rounded-xl border p-4 ${
              isSample
                ? 'border-brand/25 bg-brand-soft/40'
                : 'border-border bg-canvas'
            }`}
            key={testCase.key}
          >
            <header className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <h3 className="text-[14.5px] font-bold">
                  {t('exercise.test.label', { number: index + 1 })}
                  {weighted && testCase.label.trim() ? (
                    <span className="ml-1.5 font-semibold text-sub">
                      · {testCase.label.trim()}
                    </span>
                  ) : null}
                </h3>
                <button
                  aria-pressed={isSample}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-bold transition-colors ${
                    isSample
                      ? 'bg-brand-soft text-brand'
                      : 'bg-retired-soft text-retired'
                  } ${
                    editable ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
                  }`}
                  disabled={!editable}
                  onClick={() =>
                    update(
                      replaceAt(testCases, index, {
                        ...testCase,
                        visibility: isSample ? 'HIDDEN' : 'SAMPLE',
                      }),
                    )
                  }
                  title={t('exercise.test.toggle_visibility')}
                  type="button"
                >
                  {isSample ? (
                    <Eye className="size-3" />
                  ) : (
                    <EyeOff className="size-3" />
                  )}
                  {isSample
                    ? t('exercise.test.sample_badge')
                    : t('exercise.test.hidden_badge')}
                </button>
              </div>
              {editable ? (
                <button
                  aria-label={t('exercise.test.remove', {
                    number: index + 1,
                  })}
                  className="grid size-8 place-items-center rounded-lg text-danger hover:bg-danger/10"
                  onClick={() =>
                    update(
                      testCases.filter(
                        (_, itemIndex) => itemIndex !== index,
                      ),
                    )
                  }
                  type="button"
                >
                  <Trash2 className="size-4" />
                </button>
              ) : null}
            </header>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextAreaField
                dark={false}
                disabled={!editable}
                label={t('exercise.test.input')}
                onChange={(input) =>
                  update(
                    replaceAt(testCases, index, { ...testCase, input }),
                  )
                }
                value={testCase.input}
              />
              <TextAreaField
                dark
                disabled={!editable}
                label={t(expectedLabelKey(testCase.comparator))}
                onChange={(expectedOutput) =>
                  update(
                    replaceAt(testCases, index, {
                      ...testCase,
                      expectedOutput,
                    }),
                  )
                }
                value={testCase.expectedOutput}
              />
            </div>
            {weighted ? (
              <CaseGrading
                editable={editable}
                onChange={(next) => update(replaceAt(testCases, index, next))}
                testCase={testCase}
              />
            ) : null}
          </article>
          );
        })}
      </div>
    </SectionCard>
  );
}

function expectedLabelKey(comparator: CaseComparator) {
  switch (comparator) {
    case 'STDOUT':
      return 'exercise.test.expected' as const;
    case 'STDOUT_MATCH':
    case 'STDOUT_NOMATCH':
      return 'exercise.grading.expected_text' as const;
    case 'STDOUT_REGEX':
    case 'STDOUT_REGEX_NOMATCH':
      return 'exercise.grading.expected_pattern' as const;
  }
}

/** One answer's weighted-grading settings: rule, points, label, limits. */
function CaseGrading({
  editable,
  testCase,
  onChange,
}: {
  editable: boolean;
  testCase: TestCaseDraft;
  onChange: (testCase: TestCaseDraft) => void;
}) {
  const { t } = useTranslation('content');
  const seconds = (ms: number | null) => ms === null ? null : ms / 1000;
  const milliseconds = (value: number | null) => value === null ? null : Math.round(value * 1000);
  const usesPattern =
    testCase.comparator === 'STDOUT_REGEX' ||
    testCase.comparator === 'STDOUT_REGEX_NOMATCH';

  return (
    <div className="mt-4 space-y-3 border-t border-border pt-4">
      <div className="grid items-start gap-3 lg:grid-cols-[2fr_1fr_2fr]">
        <ChoiceField
          label={t('exercise.grading.comparator')} disabled={!editable}
          value={testCase.comparator}
          options={caseComparators.map((value) => ({ value, label: t(`exercise.grading.comparator_${value}`), description: t(`exercise.controls.rule_${value}`) }))}
          onChange={(comparator) => onChange({ ...testCase, comparator })}
        />
        <NumberField
          label={t('exercise.grading.points')} disabled={!editable}
          min={0} max={10000} unit={t('exercise.controls.points')}
          value={testCase.weight} onChange={(weight) => onChange({ ...testCase, weight: weight ?? Number.NaN })}
        />
        <Field label={t('exercise.grading.case_label')}>
          <input
            className={inputClass}
            disabled={!editable}
            maxLength={200}
            onChange={(event) => onChange({ ...testCase, label: event.target.value })}
            value={testCase.label}
          />
        </Field>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <NumberField
          label={t('exercise.grading.time_limit')} disabled={!editable}
          min={0.1} max={60} step={0.1} precision={3} optional unit={t('exercise.controls.seconds')}
          placeholder={t('exercise.grading.time_limit_placeholder', { seconds: defaultExerciseTimeLimitMs / 1000 })}
          value={seconds(testCase.timeLimitMsOverride)}
          onChange={(value) => onChange({ ...testCase, timeLimitMsOverride: milliseconds(value) })}
        />
        <NumberField
          label={t('exercise.grading.soft_limit')} disabled={!editable}
          min={0.001} max={60} step={0.1} precision={3} optional unit={t('exercise.controls.seconds')}
          value={seconds(testCase.softTimeLimitMs)}
          onChange={(value) => onChange({ ...testCase, softTimeLimitMs: milliseconds(value) })}
        />
        <NumberField
          label={t('exercise.grading.soft_penalty')} disabled={!editable}
          min={0} max={10000} optional unit={t('exercise.controls.points')}
          value={testCase.softPenalty}
          onChange={(softPenalty) => onChange({ ...testCase, softPenalty })}
        />
      </div>
      {usesPattern ? (
        <p className="text-[13px] leading-[1.5] text-sub">
          {t('exercise.grading.regex_checked_on_submit')}
        </p>
      ) : null}
    </div>
  );
}
