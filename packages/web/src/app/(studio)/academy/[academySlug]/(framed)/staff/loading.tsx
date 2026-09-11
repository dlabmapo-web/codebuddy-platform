'use client';

import { StudioPageSkeleton } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/studio-page-skeleton';
import { SkeletonTable } from '@/components/studio/skeletons';
import { useLayoutTranslation } from '@/i18n';

/**
 * The Staff roster. Placeholder rows under the headings the layout already
 * has loaded — the roster's own copy arrives with the page.
 */
export default function StaffLoading() {
  const { t } = useLayoutTranslation('members');

  return (
    <StudioPageSkeleton>
      <SkeletonTable
        columns={[t('column.member'), t('column.status'), t('column.role')]}
      />
    </StudioPageSkeleton>
  );
}
