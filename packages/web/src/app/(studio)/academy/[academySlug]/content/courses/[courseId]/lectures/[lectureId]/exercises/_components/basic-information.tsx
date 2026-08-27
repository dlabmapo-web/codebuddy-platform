import type { ExerciseDifficulty } from '@cove/shared';
import { BookOpen } from 'lucide-react';
import dynamic from 'next/dynamic';

import { useLayoutTranslation } from '@/i18n';

import type { ExerciseAuthoring } from '../_hooks/use-exercise-authoring';
import {
  type ExerciseDraft,
  type ExerciseDraftUpdate,
} from '../_lib/exercise-draft';
import { DifficultyPicker } from './difficulty-picker';
import {
  Field,
  inputClass,
  invalidClass,
  SectionCard,
} from './authoring-fields';
import { RichTextFrame } from '@/components/studio/rich-text-frame';

const RichEditor = dynamic(
  () =>
    import('@/components/editor/RichEditor').then((module) => ({
      default: module.RichEditor,
    })),
  { ssr: false },
);

export function BasicInformation({
  authoring,
  draft,
  editable,
  update,
}: {
  authoring: ExerciseAuthoring;
  draft: ExerciseDraft;
  editable: boolean;
  update: ExerciseDraftUpdate;
}) {
  const { t } = useLayoutTranslation('content');
  const titleError = authoring.errorFor('title');
  const descriptionError = authoring.errorFor('description');

  return (
    <SectionCard
      description={t('exercise.basic_help')}
      icon={BookOpen}
      title={t('exercise.section.basics')}
    >
      <Field error={titleError} label={t('exercise.field.title')} required>
        <input
          aria-invalid={Boolean(titleError)}
          className={`${inputClass} ${invalidClass(titleError)}`}
          disabled={!editable}
          maxLength={200}
          onChange={(event) => update('title', event.target.value)}
          placeholder={t('exercise.placeholder.title')}
          value={draft.title}
        />
      </Field>
      <Field as="group" label={t('exercise.field.difficulty')} required>
        <DifficultyPicker
          disabled={!editable}
          onChange={(difficulty: ExerciseDifficulty) =>
            update('difficulty', difficulty)
          }
          value={draft.difficulty}
        />
      </Field>

      <Field
        as="group"
        error={descriptionError}
        label={t('exercise.field.description')}
        required
      >
        {editable ? (
          <div
            className={`overflow-hidden rounded-lg border ${
              descriptionError ? 'border-danger' : 'border-border'
            }`}
          >
            <RichEditor
              onChange={(description) => update('description', description)}
              placeholder={t('exercise.placeholder.description')}
              value={draft.description}
            />
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <RichTextFrame
              content={draft.description}
              minHeight={120}
              title={t('exercise.field.description')}
            />
          </div>
        )}
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t('exercise.field.input_format')}>
          <textarea
            className={`${inputClass} min-h-24 resize-y py-2.5`}
            disabled={!editable}
            maxLength={10_000}
            onChange={(event) => update('inputFormat', event.target.value)}
            placeholder={t('exercise.placeholder.input_format')}
            value={draft.inputFormat}
          />
        </Field>
        <Field label={t('exercise.field.output_format')}>
          <textarea
            className={`${inputClass} min-h-24 resize-y py-2.5`}
            disabled={!editable}
            maxLength={10_000}
            onChange={(event) => update('outputFormat', event.target.value)}
            placeholder={t('exercise.placeholder.output_format')}
            value={draft.outputFormat}
          />
        </Field>
      </div>

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
          checked={draft.isVisible}
          className="mt-0.5 size-4 accent-brand"
          disabled={!editable}
          onChange={(event) => update('isVisible', event.target.checked)}
          type="checkbox"
        />
        <span>
          <span className="block text-[13.5px] font-bold">
          {t('exercise.field.is_visible')}
          </span>
          <span className="mt-0.5 block text-[12.5px] leading-5 text-sub">
          {t('exercise.field.is_visible_hint')}
          </span>
        </span>
      </label>

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
