'use client';

import { StudioPageSkeleton } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/studio-page-skeleton';
import { SkeletonTable } from '@/components/studio/skeletons';
import { useLayoutTranslation } from '@/i18n';

/**
 * The class list.
 */
export default function ClassesLoading() {
  const { t } = useLayoutTranslation('classes');

  return (
    <StudioPageSkeleton bleed>
      <SkeletonTable
        columns={[
          t('column.class'),
          t('column.status'),
          t('column.courses'),
          t('column.students'),
          t('column.teacher'),
        ]}
      />
    </StudioPageSkeleton>
  );
}
