'use client';

import { Skeleton, SkeletonRegion } from '@/components/studio/skeletons';
import { useLayoutTranslation } from '@/i18n';

/**
 * The exercise workspace, which is the whole viewport and has no chrome.
 *
 * Its geometry is the point: a toolbar, then the statement beside the editor,
 * then the terminal under both. A student opening a problem lands on the shape
 * they are about to work in rather than on white, and the panes do not jump
 * when the exercise arrives.
 *
 * The split is drawn at the same breakpoint the workspace uses, so the single
 * column a phone gets is a single column here too.
 */
export default function ExerciseWorkspaceLoading() {
  const { t } = useLayoutTranslation('common');

  return (
    <SkeletonRegion
      className="flex h-svh w-full flex-col bg-canvas"
      label={t('state.loading')}
    >
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
        <Skeleton className="h-7 w-7 rounded-md" />
        <Skeleton className="h-4 w-48" />
        <div className="ml-auto flex items-center gap-2">
          <Skeleton className="h-8 w-24 rounded-lg" />
          <Skeleton className="h-8 w-20 rounded-lg" />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="min-h-0 flex-1 border-b border-border p-5 md:border-b-0 md:border-r">
          <Skeleton className="mb-4 h-6 w-2/3" />
          <div className="flex flex-col gap-2.5">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-4/5" />
            <Skeleton className="mt-3 h-28 w-full rounded-lg" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-3/5" />
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          <Skeleton className="m-3 flex-1 rounded-lg" />
          <Skeleton className="mx-3 mb-3 h-32 shrink-0 rounded-lg" />
        </div>
      </div>
    </SkeletonRegion>
  );
}
