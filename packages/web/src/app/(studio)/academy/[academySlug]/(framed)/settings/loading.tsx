'use client';

import { StudioPageSkeleton } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/studio-page-skeleton';
import { Skeleton } from '@/components/studio/skeletons';

/**
 * Academy settings: a short form, sized to it.
 */
export default function AcademySettingsLoading() {
  return (
    <StudioPageSkeleton>
      <div className="flex flex-col gap-5">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>
    </StudioPageSkeleton>
  );
}
