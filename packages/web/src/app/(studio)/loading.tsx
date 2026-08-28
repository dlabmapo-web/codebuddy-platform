'use client';

import { SkeletonChrome, SkeletonColumn } from '@/components/studio/skeletons';
import { useLayoutTranslation } from '@/i18n';

/**
 * Cold entry into the studio: a refresh, or a first arrival from outside it.
 *
 * This is the one place the chrome itself is drawn. It sits above
 * `academy/[academySlug]/layout.tsx`, which reads the account and so blocks
 * until it answers — `loading.tsx` does not cover a layout in its own segment,
 * but it does cover the layouts below it, which is exactly this case.
 *
 * Once inside an academy, the chrome is a layout and Next does not re-render
 * it, so every navigation from here on keeps the real sidebar and falls to a
 * content-only skeleton instead.
 */
export default function StudioLoading() {
  const { t } = useLayoutTranslation('common');

  return (
    <SkeletonChrome label={t('state.loading')}>
      <div className="mx-auto w-full max-w-6xl flex-1 px-5 py-7">
        <SkeletonColumn heights={[3, 12, 16, 14]} />
      </div>
    </SkeletonChrome>
  );
}
