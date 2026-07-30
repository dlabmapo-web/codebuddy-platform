import { ArrowLeft, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import Link from 'next/link';

import { useLayoutTranslation } from '@/i18n';

import type { CourseBuilderState } from '../_hooks/use-course-builder';

export function BuilderHeader({
  academyId,
  builder,
}: {
  academyId: string;
  builder: CourseBuilderState;
}) {
  const { t } = useLayoutTranslation('content');

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Link
        className="inline-flex items-center gap-1.5 text-[14.5px] font-semibold text-sub transition-colors hover:text-ink"
        href={`/studio/academies/${academyId}/content/courses`}
      >
        <ArrowLeft className="size-3.5" />
        {t('builder.all_courses')}
      </Link>
      <div className="flex items-center gap-3">
        <p className="text-[14px] font-semibold text-sub">
          {t('builder.summary', {
            modules: builder.tree.modules.length,
            lectures: builder.lectureCount,
          })}
        </p>
        {builder.tree.modules.length > 0 ? (
          <button
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-[13.5px] font-bold text-sub transition-colors hover:border-brand hover:text-brand"
            onClick={builder.toggleAll}
            type="button"
          >
            {builder.anyExpanded ? (
              <ChevronsDownUp className="size-4" />
            ) : (
              <ChevronsUpDown className="size-4" />
            )}
            {builder.anyExpanded
              ? t('outline.collapse_all')
              : t('outline.expand_all')}
          </button>
        ) : null}
      </div>
    </div>
  );
}
