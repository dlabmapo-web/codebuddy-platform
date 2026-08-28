'use client';

import { StudioPageSkeleton } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/studio-page-skeleton';
import { Skeleton } from '@/components/studio/skeletons';

/**
 * One member's profile. The section headings are the page's own copy and
 * are in a page namespace this boundary cannot read, so the sections are
 * sized rather than named.
 */
export default function MemberProfileLoading() {
  return (
    <StudioPageSkeleton bleed>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-32 w-full rounded-card" />
        <Skeleton className="h-72 w-full rounded-card" />
      </div>
    </StudioPageSkeleton>
  );
}
