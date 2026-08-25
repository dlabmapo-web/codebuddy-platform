'use client';

import type { CourseTree } from '@cove/shared';
import { Plus } from 'lucide-react';

import { useLayoutTranslation } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';

import { useCourseBuilder } from '../_hooks/use-course-builder';
import { BuilderHeader } from './builder-header';
import { ModuleCard } from './module-card';

export function CourseBuilder({
  academyId,
  canEditCurriculum,
  canEditExercises,
  canImport,
  courseId,
  initialTree,
}: {
  academyId: string;
  canEditCurriculum: boolean;
  canEditExercises: boolean;
  canImport: boolean;
  courseId: string;
  initialTree: CourseTree;
}) {
  const { t } = useLayoutTranslation('content');
  const errorText = useErrorText();
  const builder = useCourseBuilder({
    target: { academyId, courseId },
    initialTree,
    canEditCurriculum,
    canEditExercises,
  });
  const exerciseBasePath = `/studio/academies/${academyId}/content/courses/${courseId}/lectures`;

  return (
    <div className="space-y-5">
      <BuilderHeader
        academyId={academyId}
        builder={builder}
        canImport={canImport}
        courseId={courseId}
      />

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
            builder.tree.modules.map((courseModule) => (
              <ModuleCard
                builder={builder}
                courseModule={courseModule}
                exerciseBasePath={exerciseBasePath}
                key={courseModule.id}
              />
            ))
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
    </div>
  );
}
