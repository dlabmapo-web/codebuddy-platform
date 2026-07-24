'use client';

import type { CourseDraftTree } from '@cove/shared';
import { Plus } from 'lucide-react';

import { useLayoutTranslation } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';

import { useCourseBuilder } from '../_hooks/use-course-builder';
import { BuilderHeader } from './builder-header';
import { BuilderSidebar } from './builder-sidebar';
import { ModuleCard } from './module-card';

export function CourseBuilder({
  academyId,
  canEditCurriculum,
  canEditExercises,
  canPublish,
  courseId,
  versionId,
  initialTree,
}: {
  academyId: string;
  canEditCurriculum: boolean;
  canEditExercises: boolean;
  canPublish: boolean;
  courseId: string;
  versionId: string;
  initialTree: CourseDraftTree;
}) {
  const { t } = useLayoutTranslation('content');
  const errorText = useErrorText();
  const builder = useCourseBuilder({
    target: { academyId, courseId, versionId },
    initialTree,
    canEditCurriculum,
    canEditExercises,
  });
  const exerciseBasePath = `/studio/academies/${academyId}/content/courses/${courseId}/versions/${versionId}/lectures`;

  return (
    <div className="space-y-5">
      <BuilderHeader
        academyId={academyId}
        builder={builder}
        canEditCurriculum={canEditCurriculum}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <section className="space-y-3">
          {builder.tree.modules.length === 0 ? (
            <div className="rounded-card border border-dashed border-border bg-white px-6 py-12 text-center">
              <h3 className="text-[15.5px] font-bold">{t('empty.heading')}</h3>
              <p className="mx-auto mt-2 max-w-sm text-[13.5px] leading-[1.55] text-sub">
                {t('empty.body')}
              </p>
            </div>
          ) : (
            builder.tree.modules.map((courseModule, index) => (
              <ModuleCard
                builder={builder}
                courseModule={courseModule}
                exerciseBasePath={exerciseBasePath}
                index={index}
                key={courseModule.id}
              />
            ))
          )}

          {builder.editable ? (
            <form
              className="flex flex-wrap gap-2 rounded-card border border-dashed border-border bg-white p-3"
              onSubmit={(event) => {
                event.preventDefault();
                builder.createModule();
              }}
            >
              <input
                className="h-10 min-w-48 flex-1 rounded-lg border border-border bg-white px-3 text-[14px] outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
                maxLength={200}
                onChange={(event) => builder.setModuleTitle(event.target.value)}
                placeholder={t('module.title_placeholder')}
                value={builder.moduleTitle}
              />
              <button
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-ink px-4 text-[14px] font-bold text-white transition-opacity disabled:opacity-40"
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
            <p className="text-[13px] font-semibold text-danger">
              {errorText(
                builder.structuralError,
                t('builder.structural_error'),
              )}
            </p>
          ) : null}
        </section>

        <BuilderSidebar builder={builder} canPublish={canPublish} />
      </div>
    </div>
  );
}
