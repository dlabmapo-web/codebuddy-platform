import type { ExerciseDifficulty } from '@cove/shared';
import dynamic from 'next/dynamic';

import { useLayoutTranslation } from '@/i18n';

import {
  previewDocument,
  type ExerciseDraft,
  type ExerciseDraftUpdate,
} from '../_lib/exercise-draft';
import { Field, inputClass, SectionCard } from './authoring-fields';

const RichEditor = dynamic(
  () =>
    import('@/components/editor/RichEditor').then((module) => ({
      default: module.RichEditor,
    })),
  { ssr: false },
);

export function BasicInformation({
  draft,
  editable,
  update,
}: {
  draft: ExerciseDraft;
  editable: boolean;
  update: ExerciseDraftUpdate;
}) {
  const { t } = useLayoutTranslation('content');

  return (
    <SectionCard
      description={t('exercise.basic_help')}
      title={t('exercise.section.basics')}
    >
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_13rem]">
        <Field label={t('exercise.field.title')} required>
          <input
            className={inputClass}
            disabled={!editable}
            maxLength={200}
            onChange={(event) => update('title', event.target.value)}
            placeholder={t('exercise.placeholder.title')}
            value={draft.title}
          />
        </Field>
        <Field label={t('exercise.field.difficulty')} required>
          <select
            className={inputClass}
            disabled={!editable}
            onChange={(event) =>
              update('difficulty', event.target.value as ExerciseDifficulty)
            }
            value={draft.difficulty}
          >
            {(['EASY', 'MEDIUM', 'HARD'] as const).map((difficulty) => (
              <option key={difficulty} value={difficulty}>
                {t(`exercise.difficulty.${difficulty}`)}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label={t('exercise.field.description')} required>
        {editable ? (
          <div className="overflow-hidden rounded-lg border border-border">
            <RichEditor
              onChange={(description) => update('description', description)}
              placeholder={t('exercise.placeholder.description')}
              value={draft.description}
            />
          </div>
        ) : (
          <iframe
            className="min-h-72 w-full rounded-lg border border-border bg-white"
            sandbox=""
            srcDoc={previewDocument(draft.description)}
            title={t('exercise.field.description')}
          />
        )}
      </Field>

      <Field label={t('exercise.field.constraints')}>
        <textarea
          className={`${inputClass} min-h-28 resize-y py-2.5`}
          disabled={!editable}
          maxLength={10_000}
          onChange={(event) => update('constraints', event.target.value)}
          value={draft.constraints}
        />
      </Field>

      <label className="flex items-start gap-3 rounded-lg border border-border bg-canvas p-4">
        <input
          checked={draft.aiFeedbackEnabled}
          className="mt-0.5 size-4 accent-brand"
          disabled={!editable}
          onChange={(event) =>
            update('aiFeedbackEnabled', event.target.checked)
          }
          type="checkbox"
        />
        <span>
          <span className="block text-[13.5px] font-bold">
            {t('exercise.field.ai_feedback')}
          </span>
          <span className="mt-0.5 block text-[12.5px] leading-5 text-sub">
            {t('exercise.field.ai_feedback_hint')}
          </span>
        </span>
      </label>
    </SectionCard>
  );
}
