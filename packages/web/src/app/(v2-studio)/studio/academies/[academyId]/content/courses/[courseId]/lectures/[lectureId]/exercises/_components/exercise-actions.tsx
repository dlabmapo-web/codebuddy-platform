import { Eye, Save } from 'lucide-react';

import { useLayoutTranslation } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';

import type { ExerciseAuthoring } from '../_hooks/use-exercise-authoring';

/**
 * Actions close the form rather than hover over it: the author fills the fields
 * top to bottom and finishes here.
 */
export function ExerciseActions({
  authoring,
}: {
  authoring: ExerciseAuthoring;
}) {
  const { t } = useLayoutTranslation('content');
  const errorText = useErrorText();
  const {
    editable,
    dirty,
    isNew,
    leave,
    missing,
    openPreview,
    save,
    saveError,
    savePending,
    saveReady,
  } = authoring;
  const blocked = editable && !saveReady;

  return (
    <div className="rounded-card border border-border bg-card p-5 sm:p-6">
      {saveError ? (
        <p className="mb-4 rounded-lg bg-danger/5 px-3.5 py-2.5 text-[14px] font-semibold text-danger">
          {errorText(saveError, t('exercise.save_failed_detail'))}
        </p>
      ) : null}

      {/* A disabled button is a dead end without this: it names what is left. */}
      {blocked ? (
        <p className="mb-4 text-[14px] leading-6 text-sub">
          {t('exercise.still_needed', {
            fields: missing
              .map((field) => t(`exercise.required.${field}`))
              .join(', '),
          })}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          className="inline-flex h-11 items-center gap-2 px-3 text-[14.5px] font-bold text-sub transition-colors hover:text-ink"
          onClick={leave}
          type="button"
        >
          {t('exercise.back')}
        </button>
        <button
          className="inline-flex h-11 items-center gap-2 rounded-lg border border-border bg-card px-4 text-[14.5px] font-bold text-brand transition-colors hover:border-brand hover:text-brand-deep"
          onClick={openPreview}
          type="button"
        >
          <Eye className="size-4" />
          {t('exercise.preview')}
        </button>
        {editable ? (
          <button
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand px-5 text-[14.5px] font-bold text-on-brand transition-colors hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!dirty || !saveReady || savePending}
            onClick={save}
            type="button"
          >
            <Save className="size-4" />
            {savePending
              ? t('exercise.saving')
              : isNew
                ? t('exercise.create')
                : t('exercise.save_changes')}
          </button>
        ) : null}
      </div>
    </div>
  );
}
