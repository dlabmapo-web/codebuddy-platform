'use client';

import { StudioPageSkeleton } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/studio-page-skeleton';
import { Skeleton } from '@/components/studio/skeletons';

/**
 * The points board: a standings panel over a ledger.
 */
export default function PointsLoading() {
  return (
    <StudioPageSkeleton>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-40 w-full rounded-card" />
        <Skeleton className="h-72 w-full rounded-card" />
      </div>
    </StudioPageSkeleton>
  );
}
