'use client';

import { Skeleton, SkeletonRegion } from '@/components/studio/skeletons';
import { useLayoutTranslation } from '@/i18n';

/**
 * The content column only. The rail and the bar are the layout's and stay on
 * screen, which is the whole reason this page moved inside the frame.
 */
export default function AcademyMyPageLoading() {
  const { t } = useLayoutTranslation('common');

  return (
    <SkeletonRegion
      className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-5 pb-16 pt-7"
      label={t('state.loading')}
    >
      <Skeleton className="h-48 w-full rounded-card" />
      <Skeleton className="h-64 w-full rounded-card" />
      <Skeleton className="h-64 w-full rounded-card" />
    </SkeletonRegion>
  );
}
