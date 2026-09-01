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
        {/* Blank headings, deliberately. One `loading.tsx` covers every
            console route — academies, users, support access, the audit trail
            — and they do not share a column set, so naming any of them would
            flash the wrong headings on three routes out of four. The shape is
            the honest part; the words arrive with the page. */}
        <SkeletonTable columns={['', '', '', '']} rows={6} />
      </div>
    </SkeletonChrome>
  );
}
