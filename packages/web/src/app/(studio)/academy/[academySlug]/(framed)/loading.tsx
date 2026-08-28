'use client';

import { StudioPageSkeleton } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/studio-page-skeleton';
import { SkeletonColumn } from '@/components/studio/skeletons';

/**
 * The academy overview, whichever role is reading it.
 *
 * All four role dashboards are one column of stacked panels, so one set of
 * heights covers them. The overview owns its own heading — it greets the
 * reader and carries the period control — so none is reserved here.
 */
export default function AcademyOverviewLoading() {
  return (
    <StudioPageSkeleton bleed description={false}>
      <SkeletonColumn heights={[8, 15, 18, 20, 16]} />
    </StudioPageSkeleton>
  );
}
