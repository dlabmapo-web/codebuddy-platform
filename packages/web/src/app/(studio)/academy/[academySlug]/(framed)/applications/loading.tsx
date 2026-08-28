'use client';

import { StudioPageSkeleton } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/studio-page-skeleton';
import { SkeletonTable } from '@/components/studio/skeletons';
import { useLayoutTranslation } from '@/i18n';

/**
 * Membership applications waiting on a decision.
 */
export default function ApplicationsLoading() {
  const { t } = useLayoutTranslation('applications');

  return (
    <StudioPageSkeleton description={false}>
      <SkeletonTable
        columns={[
          t('column.applicant'),
          t('column.message'),
          t('column.status'),
          t('column.applied'),
        ]}
        rows={5}
      />
    </StudioPageSkeleton>
  );
}
