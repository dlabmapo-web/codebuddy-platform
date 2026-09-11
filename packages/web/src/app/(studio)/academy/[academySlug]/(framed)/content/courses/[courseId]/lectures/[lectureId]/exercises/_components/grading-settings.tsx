import { Scale } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  defaultEliceGradingProfile,
  legacyCaseGrading,
  legacyGradingProfile,
  type ExerciseGradingProfile,
  type GradingIssue,
  type MaterialScorePolicy,
} from '@cove/shared';

import type { TestCaseDraft } from '../_lib/exercise-draft';
import { Field, inputClass } from './authoring-fields';

/**
 * The problem-level half of grading: which method, and — for weighted grading —
 * what a full solve is worth, how points become that score, and how long the
 * whole run may take.
 *
 * Switching back to standard grading clears every answer's points, rule and
 * limits, after asking. Standard grading cannot honour them, and the server
 * refuses a standard problem that still carries them rather than saving
 * settings nobody will ever apply.
 */
export function GradingSettings({
  editable,
  grading,
  testCases,
  issues,
  onChange,
}: {
  editable: boolean;
  grading: ExerciseGradingProfile;
  testCases: TestCaseDraft[];
  issues: GradingIssue[];
  onChange: (grading: ExerciseGradingProfile, testCases: TestCaseDraft[]) => void;
}) {
  const { t } = useTranslation('content');
  const weighted = grading.mode === 'ELICE_STDIO';
  const totalPoints = testCases.reduce((total, testCase) => total + testCase.weight, 0);

  function chooseMode(mode: ExerciseGradingProfile['mode']) {
    if (mode === grading.mode) return;
    if (mode === 'ELICE_STDIO') {
      onChange(defaultEliceGradingProfile, testCases);
      return;
    }
    const carriesSettings = testCases.some(
      (testCase) =>
        testCase.comparator !== legacyCaseGrading.comparator ||
        testCase.weight !== legacyCaseGrading.weight ||
        testCase.timeLimitMsOverride !== null ||
        testCase.softTimeLimitMs !== null ||
        testCase.softPenalty !== null,
    );
    if (carriesSettings && !window.confirm(t('exercise.grading.switch_to_legacy_confirm'))) {
      return;
    }
    onChange(
      legacyGradingProfile,
      testCases.map((testCase) => ({ ...testCase, ...legacyCaseGrading })),
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-canvas p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
          <Scale className="size-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-[14.5px] font-bold">{t('exercise.grading.title')}</h3>
          <p className="mt-0.5 text-[13.5px] leading-[1.55] text-sub">
            {t('exercise.grading.help')}
          </p>
        </div>
      </div>

      <div
        aria-label={t('exercise.grading.mode_label')}
        className="grid gap-2 sm:grid-cols-2"
        role="radiogroup"
      >
        {(['LEGACY_STDIO', 'ELICE_STDIO'] as const).map((mode) => {
          const selected = grading.mode === mode;
          const name = mode === 'ELICE_STDIO' ? 'weighted' : 'legacy';
          return (
            <button
              aria-checked={selected}
              className={`rounded-lg border px-3.5 py-2.5 text-left transition-colors disabled:cursor-default ${
                selected
                  ? 'border-brand bg-brand-soft/60'
                  : 'border-border bg-card hover:border-brand/50'
              }`}
              disabled={!editable}
              key={mode}
              onClick={() => chooseMode(mode)}
              role="radio"
              type="button"
            >
              <span className="block text-[14px] font-bold">
                {t(`exercise.grading.mode_${name}`)}
              </span>
              <span className="mt-0.5 block text-[13px] leading-[1.5] text-sub">
                {t(`exercise.grading.mode_${name}_help`)}
              </span>
            </button>
          );
        })}
      </div>

      {weighted ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t('exercise.grading.material_points')}>
              <input
                className={inputClass}
                disabled={!editable}
                min={0.01}
                onChange={(event) =>
                  onChange(
                    {
                      ...grading,
                      materialMaximumHundredths: parseHundredths(event.target.value),
                    },
                    testCases,
                  )
                }
                step={0.01}
                type="number"
                value={
                  grading.materialMaximumHundredths === null
                    ? ''
                    : grading.materialMaximumHundredths / 100
                }
              />
            </Field>
            <Field label={t('exercise.grading.score_policy')}>
              <select
                className={inputClass}
                disabled={!editable}
                onChange={(event) =>
                  onChange(
                    {
                      ...grading,
                      materialScorePolicy: event.target.value as MaterialScorePolicy,
                    },
                    testCases,
                  )
                }
                value={grading.materialScorePolicy ?? 'PROPORTIONAL'}
              >
                <option value="PROPORTIONAL">
                  {t('exercise.grading.policy_proportional')}
                </option>
                <option value="ABSOLUTE_CAP">
                  {t('exercise.grading.policy_absolute')}
                </option>
              </select>
            </Field>
            <Field label={t('exercise.grading.total_time')}>
              <input
                className={inputClass}
                disabled={!editable}
                min={1}
                onChange={(event) =>
                  onChange(
                    { ...grading, totalTimeLimitMs: parseSeconds(event.target.value) },
                    testCases,
                  )
                }
                step={1}
                type="number"
                value={
                  grading.totalTimeLimitMs === null ? '' : grading.totalTimeLimitMs / 1000
                }
              />
            </Field>
          </div>
          <p className="text-[13.5px] font-semibold text-sub">
            {t('exercise.grading.total_points', { total: totalPoints })}
          </p>
        </>
      ) : null}

      {issues.length > 0 ? (
        <div className="rounded-lg bg-danger/5 px-3.5 py-2.5 text-[13.5px] text-danger">
          <p className="font-semibold">{t('exercise.grading.fix_before_saving')}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {dedupe(issues).map((issue) => (
              <li key={`${issue.code}-${issue.path.join('.')}`}>
                {typeof issue.path[1] === 'number'
                  ? `${t('exercise.grading.issue.answer', { number: issue.path[1] + 1 })}: `
                  : ''}
                {t(`exercise.grading.issue.${issue.code}`)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** One line per answer and problem: three weight issues on one answer read as one. */
function dedupe(issues: GradingIssue[]): GradingIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.code}-${typeof issue.path[1] === 'number' ? issue.path[1] : ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Seconds typed by an author, as whole milliseconds; blank is "not set". */
export function parseSeconds(value: string): number | null {
  if (value.trim() === '') return null;
  const seconds = Number(value);
  return Number.isFinite(seconds) ? Math.round(seconds * 1000) : null;
}

function parseHundredths(value: string): number | null {
  if (value.trim() === '') return null;
  const points = Number(value);
  return Number.isFinite(points) ? Math.round(points * 100) : null;
}
