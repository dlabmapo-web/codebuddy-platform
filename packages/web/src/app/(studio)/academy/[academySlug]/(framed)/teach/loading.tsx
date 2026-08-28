'use client';

import { StudioPageSkeleton } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/studio-page-skeleton';
import { SkeletonTable } from '@/components/studio/skeletons';
import { useLayoutTranslation } from '@/i18n';

/**
 * The teaching surfaces: assigned classes, and the students inside them.
 */
export default function TeachingLoading() {
  const { t } = useLayoutTranslation('classes');

  return (
    <StudioPageSkeleton bleed>
      <SkeletonTable
        columns={[
          t('column.class'),
          t('column.students'),
          t('column.courses'),
          t('column.updated'),
        ]}
        rows={6}
      />
    </StudioPageSkeleton>
  );
}
