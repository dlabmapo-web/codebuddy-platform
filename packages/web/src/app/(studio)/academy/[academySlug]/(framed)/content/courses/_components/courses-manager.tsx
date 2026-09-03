'use client';

import type { CourseSummary } from '@cove/shared';
import { Library, Plus } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/studio/button';
import {
  useContentBasePath,
  useContentSurface,
} from '@/components/studio/content-base-path-provider';
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
  const { t: library } = useTranslation('academy-library');
  const errorText = useErrorText();
  const manager = useCoursesManager({ academyId, initialCourses });
  const contentPaths = useContentBasePath();
  // Adopting is the academy's own act, so the way in is offered only where an
  // academy is standing: the console reaches the library through its own rail.
  const inAcademy = useContentSurface() === 'academy';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[14px] font-semibold text-sub">
          <LayoutTrans
            components={[<span className="font-mono text-ink" key="count" />]}
            count={manager.courses.length}
            i18nKey="courses:course_count"
            values={{ count: manager.courses.length }}
          />
        </p>
        {canEdit && inAcademy ? (
          <Button asChild variant="outline">
            <Link href={contentPaths.library()}>
              <Library className="size-4" />
              {library('action')}
            </Link>
          </Button>
        ) : null}
      </div>

      {canEdit ? <CourseModal manager={manager} /> : null}

      <CoursesTable
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
