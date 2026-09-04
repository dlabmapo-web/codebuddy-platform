import {
  ArrowLeft,
  ChevronsDownUp,
  ChevronsUpDown,
  FileSpreadsheet,
} from 'lucide-react';
import Link from 'next/link';

import {
  useContentBasePath,
  useContentSurface,
} from '@/components/studio/content-base-path-provider';
import { useLayoutTranslation } from '@/i18n';

import type { CourseBuilderState } from '../_hooks/use-course-builder';
import { VisibilityIndicator } from './builder-controls';
import { ContentVisibilityControl } from './content-readiness';

export function BuilderHeader({
  builder,
  canImport,
  courseId,
}: {
  builder: CourseBuilderState;
  canImport: boolean;
  courseId: string;
}) {
  const contentPaths = useContentBasePath();
  // The console shell renders its own `BackLink` above the page heading, and it
  // knows something this one cannot: which list the operator actually arrived
  // from. Two back arrows forty pixels apart, pointing at different places, is
  // a choice nobody asked to make — so under the console the shell's wins.
  const shellOwnsBack = useContentSurface() === 'console';
  const { t } = useLayoutTranslation('content');

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {shellOwnsBack ? null : (
        <Link
          className="inline-flex items-center gap-1.5 text-[14.5px] font-semibold text-sub transition-colors hover:text-ink"
          href={contentPaths.courses()}
        >
          <ArrowLeft className="size-3.5" />
          {t('builder.all_courses')}
        </Link>
      )}
      <div className="ml-auto flex items-center gap-3">
        <p className="text-[14px] font-semibold text-sub">
          {t('builder.summary', {
            modules: builder.tree.modules.length,
            lectures: builder.lectureCount,
          })}
        </p>
        {/*
          §4.1 — offered only to a Team Lead, and only as a convenience: every
          server call the wizard makes checks `content.import` for itself, so
          hiding this saves a Manager a dead end rather than protecting
          anything.
        */}
        {canImport ? (
          <Link
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[13.5px] font-bold text-sub transition-colors hover:border-brand hover:text-brand"
            href={`${contentPaths.course(courseId)}/imports/new`}
          >
            <FileSpreadsheet className="size-4" />
            {t('builder.import_excel')}
          </Link>
        ) : null}
        <VisibilityIndicator
          effectivelyVisible={builder.tree.course.isVisible}
          isVisible={builder.tree.course.isVisible}
        />
        {builder.editable && builder.tree.course.content.exercises > 0 ? (
          <ContentVisibilityControl builder={builder} />
        ) : null}
        {builder.tree.modules.length > 0 ? (
          <button
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[13.5px] font-bold text-sub transition-colors hover:border-brand hover:text-brand"
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
