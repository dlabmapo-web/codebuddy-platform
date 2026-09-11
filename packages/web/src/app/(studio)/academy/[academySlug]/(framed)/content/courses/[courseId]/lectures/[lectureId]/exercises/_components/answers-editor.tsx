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
import { GradingSettings, parseSeconds } from './grading-settings';

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
  const seconds = (ms: number | null) => (ms === null ? '' : ms / 1000);
  const whole = (value: string) => {
    if (value.trim() === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : null;
  };
  const usesPattern =
    testCase.comparator === 'STDOUT_REGEX' ||
    testCase.comparator === 'STDOUT_REGEX_NOMATCH';

  return (
    <div className="mt-4 space-y-3 border-t border-border pt-4">
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_2fr]">
        <Field label={t('exercise.grading.comparator')}>
          <select
            className={inputClass}
            disabled={!editable}
            onChange={(event) =>
              onChange({ ...testCase, comparator: event.target.value as CaseComparator })
            }
            value={testCase.comparator}
          >
            {caseComparators.map((comparator) => (
              <option key={comparator} value={comparator}>
                {t(`exercise.grading.comparator_${comparator}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('exercise.grading.points')}>
          <input
            className={inputClass}
            disabled={!editable}
            min={0}
            onChange={(event) => onChange({ ...testCase, weight: whole(event.target.value) ?? 0 })}
            step={1}
            type="number"
            value={testCase.weight}
          />
        </Field>
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
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t('exercise.grading.time_limit')}>
          <input
            className={inputClass}
            disabled={!editable}
            min={0.1}
            onChange={(event) =>
              onChange({ ...testCase, timeLimitMsOverride: parseSeconds(event.target.value) })
            }
            placeholder={t('exercise.grading.time_limit_placeholder', {
              seconds: defaultExerciseTimeLimitMs / 1000,
            })}
            step={0.1}
            type="number"
            value={seconds(testCase.timeLimitMsOverride)}
          />
        </Field>
        <Field label={t('exercise.grading.soft_limit')}>
          <input
            className={inputClass}
            disabled={!editable}
            min={0.001}
            onChange={(event) =>
              onChange({ ...testCase, softTimeLimitMs: parseSeconds(event.target.value) })
            }
            step={0.1}
            type="number"
            value={seconds(testCase.softTimeLimitMs)}
          />
        </Field>
        <Field label={t('exercise.grading.soft_penalty')}>
          <input
            className={inputClass}
            disabled={!editable}
            min={0}
            onChange={(event) =>
              onChange({ ...testCase, softPenalty: whole(event.target.value) })
            }
            step={1}
            type="number"
            value={testCase.softPenalty ?? ''}
          />
        </Field>
      </div>
      {usesPattern ? (
        <p className="text-[13px] leading-[1.5] text-sub">
          {t('exercise.grading.regex_checked_on_submit')}
        </p>
      ) : null}
    </div>
  );
}
