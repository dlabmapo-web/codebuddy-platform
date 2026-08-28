'use client';

import { StudioPageSkeleton } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/studio-page-skeleton';
import { SkeletonCards } from '@/components/studio/skeletons';

/**
 * A student's catalog, classes, and answer records all open on a grid of
 * cards, so one shape covers the three.
 */
export default function LearningLoading() {
  return (
    <StudioPageSkeleton bleed>
      <SkeletonCards count={6} />
    </StudioPageSkeleton>
  );
}
