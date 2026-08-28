'use client';

import { StudioPageSkeleton } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/studio-page-skeleton';
import { SkeletonTable } from '@/components/studio/skeletons';
import { useLayoutTranslation } from '@/i18n';

/**
 * The curriculum surfaces: the course list, and the builder beneath it.
 * Both open on a table of courses, which is what this reserves.
 */
export default function CurriculumLoading() {
  const { t } = useLayoutTranslation('courses');

  return (
    <StudioPageSkeleton bleed>
      <SkeletonTable
        columns={[
          t('column.course'),
          t('column.modules'),
          t('column.lectures'),
          t('column.exercises'),
          t('column.updated'),
        ]}
      />
    </StudioPageSkeleton>
  );
}
