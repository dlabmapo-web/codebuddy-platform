import type { ExerciseAuthoringContext } from '@cove/shared';
import { ArrowLeft, Eye, Save } from 'lucide-react';

import { useLayoutTranslation } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';

import type { ExerciseAuthoring } from '../_hooks/use-exercise-authoring';
import { secondaryButtonClass } from './authoring-fields';

export function ExerciseHeader({
  context,
  authoring,
}: {
  context: ExerciseAuthoringContext;
  authoring: ExerciseAuthoring;
}) {
  const { t } = useLayoutTranslation('content');
  const errorText = useErrorText();
  const {
    editable,
    dirty,
    leave,
    openPreview,
    save,
    saveConflict,
    saveError,
    savePending,
    saveReady,
    savedMaterialId,
  } = authoring;

  return (
    <header className="sticky top-16 z-[5] rounded-card border border-border bg-white/95 p-4 shadow-sm backdrop-blur sm:p-5">
      <button
        className="inline-flex items-center gap-1.5 text-[13px] font-bold text-sub hover:text-ink"
        onClick={leave}
        type="button"
      >
        <ArrowLeft className="size-3.5" />
        {t('exercise.back')}
      </button>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-semibold text-sub">
            {context.course.title} / {context.module.title} /{' '}
            {context.lecture.title}
          </p>
          <h1 className="mt-1 text-[1.4rem] font-extrabold tracking-[-0.025em]">
            {savedMaterialId
              ? t('exercise.edit_title')
              : t('exercise.create_title')}
          </h1>
          <div className="mt-2">
            <StatusPill
              tone={
                !editable
                  ? 'neutral'
                  : savePending
                    ? 'brand'
                    : saveError
                      ? 'danger'
                      : dirty
                        ? 'draft'
                        : 'success'
              }
            >
              {!editable
                ? t('exercise.read_only')
                : savePending
                  ? t('exercise.saving')
                  : saveError
                    ? saveConflict
                      ? t('exercise.conflict')
                      : t('exercise.save_failed')
                    : dirty
                      ? t('exercise.unsaved')
                      : t('exercise.saved')}
            </StatusPill>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className={secondaryButtonClass}
            onClick={openPreview}
            type="button"
          >
            <Eye className="size-4" />
            {t('exercise.preview')}
          </button>
          {editable ? (
            <button
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-[13.5px] font-bold text-white hover:bg-brand-deep disabled:opacity-40"
              disabled={!dirty || !saveReady || savePending}
              onClick={save}
              type="button"
            >
              <Save className="size-4" />
              {savePending
                ? t('exercise.saving')
                : t('exercise.save_draft')}
            </button>
          ) : null}
        </div>
      </div>
      {saveError ? (
        <p className="mt-3 rounded-lg bg-danger/5 px-3 py-2 text-[13px] font-semibold text-danger">
          {errorText(saveError, t('exercise.save_failed_detail'))}
        </p>
      ) : null}
    </header>
  );
}

type StatusTone = 'neutral' | 'brand' | 'danger' | 'draft' | 'success';

const toneClass: Record<StatusTone, string> = {
  neutral: 'bg-retired-soft text-retired',
  brand: 'bg-brand-soft text-brand',
  danger: 'bg-danger/10 text-danger',
  draft: 'bg-draft-soft text-draft',
  success: 'bg-success/10 text-success',
};

const dotClass: Record<StatusTone, string> = {
  neutral: 'bg-retired',
  brand: 'bg-brand',
  danger: 'bg-danger',
  draft: 'bg-draft',
  success: 'bg-success',
};

function StatusPill({
  tone,
  children,
}: {
  tone: StatusTone;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold ${toneClass[tone]}`}
    >
      <span
        className={`size-1.5 rounded-full ${dotClass[tone]} ${
          tone === 'brand' ? 'animate-pulse' : ''
        }`}
      />
      {children}
    </span>
  );
}
