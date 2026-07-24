'use client';

import type { CourseSummary } from '@cove/shared';
import { Plus, X } from 'lucide-react';

import { Button } from '@/components/studio/button';
import { LayoutTrans, useLayoutTranslation } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';

import { useCoursesManager } from '../_hooks/use-courses-manager';
import { CoursesTable } from './courses-table';
import { CreateCourseForm } from './create-course-form';
import { LifecycleGuide } from './lifecycle-guide';

export function CoursesManager({
  academyId,
  canEdit,
  initialCourses,
}: {
  academyId: string;
  canEdit: boolean;
  initialCourses: CourseSummary[];
}) {
  const { t } = useLayoutTranslation(['courses', 'common']);
  const errorText = useErrorText();
  const manager = useCoursesManager({ academyId, initialCourses });

  return (
    <div className="space-y-6">
      <LifecycleGuide />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[14px] font-semibold text-sub">
          <LayoutTrans
            components={[<span className="font-mono text-ink" key="count" />]}
            count={manager.courses.length}
            i18nKey="courses:course_count"
            values={{ count: manager.courses.length }}
          />
        </p>
        {canEdit ? (
          <Button onClick={manager.toggleCreate}>
            {manager.showCreate ? <X /> : <Plus />}
            {manager.showCreate
              ? t('common:action.cancel')
              : t('new_course')}
          </Button>
        ) : null}
      </div>

      {canEdit && manager.showCreate ? (
        <CreateCourseForm manager={manager} />
      ) : null}

      <CoursesTable
        academyId={academyId}
        canEdit={canEdit}
        manager={manager}
      />

      {manager.startDraftError ? (
        <p className="text-[13px] font-semibold text-danger">
          {errorText(manager.startDraftError, t('draft_start_failed'))}
        </p>
      ) : null}
    </div>
  );
}
