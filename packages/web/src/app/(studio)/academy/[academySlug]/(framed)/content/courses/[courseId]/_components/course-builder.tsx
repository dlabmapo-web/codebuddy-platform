'use client';

import { useContentBasePath } from '@/components/studio/content-base-path-provider';

import type { CourseOutline as CourseTree } from '@cove/shared';
import { Plus, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { routes } from '@/lib/routes';
import { useContentAcademySlug, useContentSurface } from '@/components/studio/content-base-path-provider';

import { useTranslation } from 'react-i18next';
import { useErrorText } from '@/i18n/client/use-error-text';

import { useCourseBuilder } from '../_hooks/use-course-builder';
import { BuilderHeader } from './builder-header';
import { ContentReadinessNotice } from './content-readiness';
import { BuilderDndProvider } from './builder-dnd';
import { ModuleCard } from './module-card';
import { MoveToast } from './move-toast';

export function CourseBuilder({
  academyId,
  canEditCurriculum,
  canEditExercises,
  canImport,
  courseId,
  initialTree,
  treeStaleTime = 30_000,
}: {
  academyId: string;
  canEditCurriculum: boolean;
  canEditExercises: boolean;
  canImport: boolean;
  courseId: string;
  initialTree: CourseTree;
  treeStaleTime?: number;
}) {
  const contentPaths = useContentBasePath();
  const { t } = useTranslation('content');
  const { t: sync } = useTranslation('library-sync');
  const academySlug = useContentAcademySlug();
  const surface = useContentSurface();
  const errorText = useErrorText();
  const builder = useCourseBuilder({
    target: { academyId, courseId },
    initialTree,
    treeStaleTime,
    canEditCurriculum,
    canEditExercises,
  });
  const exercisePath = (lectureId: string, materialId: string) =>
    contentPaths.exercise(courseId, lectureId, materialId);

  return (
    <div className="space-y-5">
      <BuilderHeader
        builder={builder}
        canImport={canImport}
        courseId={courseId}
      />

      {surface === 'academy' && builder.editable && (builder.tree.course.provenance?.linked?.openConflictCount ?? 0) > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-draft/25 bg-draft-soft px-4 py-3" role="status">
          <div className="flex items-start gap-2.5">
            <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-draft" />
            <div><p className="text-[13.5px] font-bold text-ink">{sync('banner.review', { count: builder.tree.course.provenance!.linked!.openConflictCount })}</p>
            <p className="mt-0.5 text-[13px] text-sub">{sync('banner.preserved')}</p></div>
          </div>
          <Link className="rounded text-[13px] font-bold text-draft underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-brand" href={routes.academyCourseLibraryUpdates(academySlug, courseId)}>{sync('banner.open')}</Link>
        </div>
      ) : null}
      <ContentReadinessNotice builder={builder} />

      <div>
        <section className="space-y-3">
          {builder.tree.modules.length === 0 ? (
            <div className="rounded-card border border-dashed border-border bg-card px-6 py-12 text-center">
              <h3 className="text-[17px] font-bold">{t('empty.heading')}</h3>
              <p className="mx-auto mt-2 max-w-md text-[14.5px] leading-[1.6] text-sub">
                {t('empty.body')}
              </p>
            </div>
          ) : (
            <BuilderDndProvider builder={builder}>
              {builder.tree.modules.map((courseModule) => (
                <ModuleCard
                  builder={builder}
                  courseModule={courseModule}
                  exercisePath={exercisePath}
                  key={courseModule.id}
                />
              ))}
            </BuilderDndProvider>
          )}

          {builder.editable ? (
            <form
              className="flex flex-wrap gap-2 rounded-card border border-dashed border-border bg-card p-3"
              onSubmit={(event) => {
                event.preventDefault();
                builder.createModule();
              }}
            >
              <input
                className="h-11 min-w-48 flex-1 rounded-lg border border-border bg-card px-3 text-[15px] outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
                maxLength={200}
                onChange={(event) => builder.setModuleTitle(event.target.value)}
                placeholder={t('module.title_placeholder')}
                value={builder.moduleTitle}
              />
              <button
                className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-brand px-5 text-[15px] font-bold text-on-brand transition-colors hover:bg-brand-deep disabled:opacity-40"
                disabled={
                  builder.createModulePending || !builder.moduleTitle.trim()
                }
                type="submit"
              >
                <Plus className="size-4" />
                {builder.createModulePending
                  ? t('module.adding')
                  : t('module.add')}
              </button>
            </form>
          ) : null}

          {builder.structuralError ? (
            <p className="text-[14px] font-semibold text-danger">
              {errorText(
                builder.structuralError,
                t('builder.structural_error'),
              )}
            </p>
          ) : null}
        </section>
      </div>

      <MoveToast builder={builder} />
    </div>
  );
}
