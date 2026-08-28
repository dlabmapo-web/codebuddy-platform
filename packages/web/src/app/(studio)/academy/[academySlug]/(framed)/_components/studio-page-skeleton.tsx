'use client';

import { Skeleton, SkeletonRegion } from '@/components/studio/skeletons';
import { useLayoutTranslation } from '@/i18n';

/**
 * `StudioPage`'s geometry, held while the page it wraps is still on the wire.
 *
 * It lives beside `StudioPage` rather than in the skeleton kit so the two are
 * read together: the measure, the padding, and the heading block are copied
 * from it line for line, and a change to one that is not made to the other
 * shows up as a jump when the real page lands. Keeping them adjacent is what
 * makes that drift visible in review.
 *
 * The heading is a placeholder rather than the real title, and deliberately
 * so. Page titles live in page-scoped namespaces, which a `loading.tsx` cannot
 * have — it renders before the page mounts its own translations. Guessing at a
 * near-enough title from a layout namespace would put one sentence on screen
 * and replace it with a different one a moment later, which is worse than a
 * grey bar that was never a claim.
 *
 * Column headers and field labels are a different case: those *are* in layout
 * namespaces, so the callers pass the real ones. See `skeletons.tsx`.
 */
export function StudioPageSkeleton({
  bleed = false,
  children,
  description = true,
}: {
  /** Match the page's own `bleed`, or the card appears and then does not. */
  bleed?: boolean;
  children: React.ReactNode;
  /** Reserve the sub-heading line. Pages without one pass `false`. */
  description?: boolean;
}) {
  const { t } = useLayoutTranslation('common');

  return (
    <SkeletonRegion
      className="mx-auto w-full max-w-6xl flex-1 px-5 py-7"
      label={t('state.loading')}
    >
      <div className="mb-6 flex flex-col gap-2.5">
        <Skeleton className="h-8 w-56" />
        {description ? <Skeleton className="h-4 w-full max-w-lg" /> : null}
      </div>

      {bleed ? (
        children
      ) : (
        <section className="rounded-card border border-border bg-card p-6">
          {children}
        </section>
      )}
    </SkeletonRegion>
  );
}
