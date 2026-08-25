'use client';

import type { CourseSummary } from '@cove/shared';
import { Plus } from 'lucide-react';

import { Button } from '@/components/studio/button';
import { LayoutTrans, useLayoutTranslation } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';

import { useCoursesManager } from '../_hooks/use-courses-manager';
import { CoursesTable } from './courses-table';
import { CourseModal } from './course-modal';

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
    <div className="space-y-4">
      <p className="text-[14px] font-semibold text-sub">
        <LayoutTrans
          components={[<span className="font-mono text-ink" key="count" />]}
          count={manager.courses.length}
          i18nKey="courses:course_count"
          values={{ count: manager.courses.length }}
        />
      </p>

      {canEdit ? <CourseModal manager={manager} /> : null}

      <CoursesTable
        academyId={academyId}
        canEdit={canEdit}
        manager={manager}
        toolbarActions={
          canEdit ? (
            <Button onClick={manager.openCreate}>
              <Plus />
              {t('new_course')}
            </Button>
          ) : null
        }
      />

      {manager.visibilityError ? (
        <p className="text-[14px] font-semibold text-danger">
          {errorText(manager.visibilityError, t('visibility_change_failed'))}
        </p>
      ) : null}
    </div>
  );
}
