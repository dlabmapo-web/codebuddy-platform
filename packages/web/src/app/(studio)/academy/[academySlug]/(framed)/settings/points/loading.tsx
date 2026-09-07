'use client';

import { StudioPageSkeleton } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/studio-page-skeleton';
import { Skeleton } from '@/components/studio/skeletons';

/** The editor: four grouped cards and a preview column beside them. */
export default function PointPolicyLoading() {
  return (
    <StudioPageSkeleton>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-4">
          {[0, 1, 2].map((index) => (
            <Skeleton className="h-44 w-full rounded-card" key={index} />
          ))}
        </div>
        <Skeleton className="h-72 w-full rounded-card" />
      </div>
    </StudioPageSkeleton>
  );
}
