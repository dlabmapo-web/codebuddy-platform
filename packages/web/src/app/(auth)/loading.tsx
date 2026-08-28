'use client';

import { Skeleton, SkeletonRegion } from '@/components/studio/skeletons';
import { useLayoutTranslation } from '@/i18n';

/**
 * The signed-out screens are one centred card, so this is one centred card.
 * No brand mark is drawn: the wordmark is an asset, not a fetch, and a page
 * that painted a grey rectangle where a logo was about to appear would be
 * inventing suspense about something already on disk.
 */
export default function AuthLoading() {
  const { t } = useLayoutTranslation('common');

  return (
    <SkeletonRegion
      className="grid min-h-svh place-items-center bg-canvas px-5"
      label={t('state.loading')}
    >
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-card border border-border bg-card p-7">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-full" />
        <div className="mt-2 flex flex-col gap-3">
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="mt-1 h-10 w-full rounded-lg" />
        </div>
      </div>
    </SkeletonRegion>
  );
}
