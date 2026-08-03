import type { ExerciseAuthoringContext } from '@cove/shared';
import { ArrowLeft, ChevronRight } from 'lucide-react';

import { useLayoutTranslation } from '@/i18n';

import type { ExerciseAuthoring } from '../_hooks/use-exercise-authoring';

export function ExerciseHeader({
  context,
  authoring,
}: {
  context: ExerciseAuthoringContext;
  authoring: ExerciseAuthoring;
}) {
  const { t } = useLayoutTranslation('content');
  const { editable, dirty, isNew, leave, savePending, saveError, saveConflict } =
    authoring;
  const title = authoring.draft.title.trim();

  return (
    <header className="rounded-card border border-border bg-white p-5 sm:p-6">
      <button
        className="inline-flex items-center gap-1.5 text-[14px] font-bold text-sub transition-colors hover:text-ink"
        onClick={leave}
        type="button"
      >
        <ArrowLeft className="size-4" />
        {t('exercise.back')}
      </button>

      {/* Where this problem lives: course → module → lecture → problem. */}
      <nav
        aria-label={t('exercise.location')}
        className="mt-3.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[14px] text-sub"
      >
        <Crumb>{context.course.title}</Crumb>
        <ChevronRight className="size-3.5 shrink-0 text-sub/60" />
        <Crumb>{context.module.title}</Crumb>
        <ChevronRight className="size-3.5 shrink-0 text-sub/60" />
        <Crumb>{context.lecture.title}</Crumb>
        <ChevronRight className="size-3.5 shrink-0 text-sub/60" />
        <span className="font-bold text-ink">
          {title || (isNew ? t('exercise.create_title') : t('exercise.edit_title'))}
        </span>
      </nav>

      {/* Only states the author can act on. An untouched form says nothing. */}
      {!editable || savePending || saveError || (!isNew && !dirty) ? (
        <div className="mt-3">
          <StatusPill
            tone={
              !editable
                ? 'neutral'
                : savePending
                  ? 'brand'
                  : saveError
                    ? 'danger'
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
                  : t('exercise.saved')}
          </StatusPill>
        </div>
      ) : null}
    </header>
  );
}

function Crumb({ children }: { children: React.ReactNode }) {
  return <span className="max-w-[16rem] truncate">{children}</span>;
}

type StatusTone = 'neutral' | 'brand' | 'danger' | 'success';

const toneClass: Record<StatusTone, string> = {
  neutral: 'bg-retired-soft text-retired',
  brand: 'bg-brand-soft text-brand',
  danger: 'bg-danger/10 text-danger',
  success: 'bg-success/10 text-success',
};

const dotClass: Record<StatusTone, string> = {
  neutral: 'bg-retired',
  brand: 'bg-brand',
  danger: 'bg-danger',
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
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-bold ${toneClass[tone]}`}
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
