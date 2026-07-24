import { ArrowLeft, Lock } from 'lucide-react';
import Link from 'next/link';

import { useLayoutTranslation } from '@/i18n';

import type { CourseBuilderState } from '../_hooks/use-course-builder';

export function BuilderHeader({
  academyId,
  builder,
  canEditCurriculum,
}: {
  academyId: string;
  builder: CourseBuilderState;
  canEditCurriculum: boolean;
}) {
  const { t } = useLayoutTranslation('content');

  return (
    <>
      <Link
        className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-sub transition-colors hover:text-ink"
        href={`/studio/academies/${academyId}/content/courses`}
      >
        <ArrowLeft className="size-3.5" />
        {t('builder.all_courses')}
      </Link>

      {builder.editable ? null : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-brand/25 bg-brand-soft px-5 py-4">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 size-4 shrink-0 text-brand" />
            <div>
              <h2 className="text-[14px] font-bold text-brand">
                {t('builder.locked_heading', {
                  version: builder.tree.version.versionNumber,
                })}
              </h2>
              <p className="mt-1 text-[13.5px] leading-[1.55] text-brand-deep/80">
                {t('builder.locked_body')}
              </p>
            </div>
          </div>
          {canEditCurriculum &&
          builder.tree.version.status !== 'DRAFT' ? (
            <button
              className="h-10 shrink-0 rounded-lg bg-brand px-4 text-[14px] font-bold text-white transition-colors hover:bg-brand-deep disabled:opacity-40"
              disabled={builder.startNextDraftPending}
              onClick={builder.startNextDraft}
              type="button"
            >
              {builder.startNextDraftPending
                ? t('builder.starting')
                : t('builder.start_next_draft')}
            </button>
          ) : null}
        </div>
      )}
    </>
  );
}
