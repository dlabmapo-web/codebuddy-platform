'use client';

import { StudioPageSkeleton } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/studio-page-skeleton';
import { SkeletonTable } from '@/components/studio/skeletons';
import { useLayoutTranslation } from '@/i18n';

/**
 * The people directory. Real column headers, placeholder rows.
 */
export default function PeopleLoading() {
  const { t } = useLayoutTranslation('members');

  return (
    <StudioPageSkeleton>
      <SkeletonTable
        columns={[t('column.member'), t('column.status'), t('column.role')]}
      />
    </StudioPageSkeleton>
  );
}
