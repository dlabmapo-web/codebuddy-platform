'use client';

import { useLayoutTranslation } from '@/i18n';

/**
 * A page inside an academy that this reader cannot open.
 *
 * The academy itself resolved (its layout rendered), so the academy-level
 * "This academy is not available" would be wrong here: the usual cause is a
 * page the reader's role does not reach — a teacher opening a course's test
 * settings — or something that was removed. Rendered inside the academy's
 * frame, so the menu is right there for what they can open.
 */
export default function AcademyPageNotFound() {
  const { t } = useLayoutTranslation('common');

  return (
    <div className="grid min-h-[60svh] place-items-center px-5">
      <div className="w-full max-w-md text-center">
        <h1 className="text-[1.5rem] font-extrabold leading-tight">
          {t('boundary.page_unavailable_title')}
        </h1>
        <p className="mt-2.5 text-[15px] leading-[1.65] text-sub">
          {t('boundary.page_unavailable_body')}
        </p>
      </div>
    </div>
  );
}
