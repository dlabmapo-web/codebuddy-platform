'use client';

import { StudioPageSkeleton } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/studio-page-skeleton';
import { SkeletonTable } from '@/components/studio/skeletons';
import { useLayoutTranslation } from '@/i18n';

/**
 * Outstanding invitations.
 */
export default function InvitationsLoading() {
  const { t } = useLayoutTranslation('invitations');

  return (
    <StudioPageSkeleton description={false}>
      <SkeletonTable
        columns={[
          t('column.email'),
          t('column.status'),
          t('column.role'),
          t('column.expires'),
        ]}
        rows={5}
      />
    </StudioPageSkeleton>
  );
}
