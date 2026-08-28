import { Eye, EyeOff, ListChecks, Plus, Trash2 } from 'lucide-react';

import { useLayoutTranslation } from '@/i18n';

import {
  newClientKey,
  replaceAt,
  type TestCaseDraft,
} from '../_lib/exercise-draft';
import {
  secondaryButtonClass,
  SectionCard,
  TextAreaField,
} from './authoring-fields';

/** Mirrors the 50-case ceiling enforced by exerciseDraftFieldsSchema. */
const MAX_TEST_CASES = 50;

export function AnswersEditor({
  editable,
  error,
  testCases,
  update,
}: {
  editable: boolean;
  error?: string | null;
  testCases: TestCaseDraft[];
  update: (testCases: TestCaseDraft[]) => void;
}) {
  const { t } = useLayoutTranslation('content');

  return (
    <SectionCard
      action={
        editable ? (
          <button
            className={`${secondaryButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}
            disabled={testCases.length >= MAX_TEST_CASES}
            onClick={() =>
              update([
                ...testCases,
                {
                  key: newClientKey(),
                  input: '',
                  expectedOutput: '',
                  visibility: 'HIDDEN',
                },
              ])
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
      {error ? (
        <p className="rounded-lg bg-danger/5 px-3.5 py-2.5 text-[13.5px] font-semibold text-danger">
          {error}
        </p>
      ) : null}

      <div className="space-y-3">
        {testCases.map((testCase, index) => {
          const isSample = testCase.visibility === 'SAMPLE';
          // Guard the last visible sample so the exercise stays saveable.
          const isOnlySample =
            isSample &&
            testCases.filter((item) => item.visibility === 'SAMPLE').length ===
              1;
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
                </h3>
                <button
                  aria-pressed={isSample}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-bold transition-colors ${
                    isSample
                      ? 'bg-brand-soft text-brand'
                      : 'bg-retired-soft text-retired'
                  } ${
                    editable && !isOnlySample
                      ? 'cursor-pointer hover:opacity-80'
                      : 'cursor-default'
                  }`}
                  disabled={!editable || isOnlySample}
                  onClick={() =>
                    update(
                      replaceAt(testCases, index, {
                        ...testCase,
                        visibility: isSample ? 'HIDDEN' : 'SAMPLE',
                      }),
                    )
                  }
                  title={
                    isOnlySample
                      ? t('exercise.test.last_sample_locked')
                      : t('exercise.test.toggle_visibility')
                  }
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
              {editable && testCases.length > 1 && !isOnlySample ? (
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
                label={t('exercise.test.expected')}
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
          </article>
          );
        })}
      </div>
    </SectionCard>
  );
}
