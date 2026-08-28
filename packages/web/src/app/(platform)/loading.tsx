'use client';

import { SkeletonChrome, SkeletonTable } from '@/components/studio/skeletons';
import { useLayoutTranslation } from '@/i18n';

/**
 * The platform console draws its own chrome because it still composes the
 * shell per page, as the studio used to. Above `admin/layout.tsx`, which
 * checks the operator's role before anything renders.
 */
export default function PlatformLoading() {
  const { t } = useLayoutTranslation('common');

  return (
    <SkeletonChrome label={t('state.loading')}>
      <div className="mx-auto w-full max-w-6xl flex-1 px-5 py-7">
        <SkeletonTable columns={['', '', '', '']} rows={6} />
      </div>
    </SkeletonChrome>
  );
}
