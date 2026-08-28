'use client';

import { Skeleton, SkeletonRegion } from '@/components/studio/skeletons';
import { useLayoutTranslation } from '@/i18n';

/**
 * My Page keeps its own narrow reading column, so its skeleton does too —
 * sections stacked in one order, at roughly the heights they settle to.
 */
export default function AccountLoading() {
  const { t } = useLayoutTranslation('common');

  return (
    <div className="min-h-svh bg-canvas">
      <div className="flex h-14 items-center gap-3 border-b border-border px-4">
        <Skeleton className="h-8 w-24 rounded-lg" />
        <div className="ml-auto flex items-center gap-2">
          <Skeleton className="size-9 rounded-lg" />
          <Skeleton className="size-9 rounded-lg" />
        </div>
      </div>
      <SkeletonRegion
        className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-5 pb-16 pt-7"
        label={t('state.loading')}
      >
        <Skeleton className="h-48 w-full rounded-card" />
        <Skeleton className="h-64 w-full rounded-card" />
        <Skeleton className="h-64 w-full rounded-card" />
      </SkeletonRegion>
    </div>
  );
}
