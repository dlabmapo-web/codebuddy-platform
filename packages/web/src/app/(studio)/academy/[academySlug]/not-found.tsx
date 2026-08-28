'use client';

import Link from 'next/link';

import { useLayoutTranslation } from '@/i18n';

/**
 * A slug no academy answers to.
 *
 * `requireAcademyRoute` reaches here only after it has already tried the
 * retired-slug history and found nothing, so by this point the URL genuinely
 * names no academy this reader can open. Two causes are worth naming because
 * they have different fixes and the reader can tell them apart: the academy
 * was renamed, or their membership ended.
 *
 * Deliberately not a redirect. A rename is already answered upstream, and
 * guessing a destination for what is left would land somebody in an academy
 * they did not ask for.
 */
export default function AcademyNotFound() {
  const { t } = useLayoutTranslation('common');

  return (
    <div className="grid min-h-svh place-items-center bg-canvas px-5">
      <div className="w-full max-w-md text-center">
        <h1 className="text-[1.7rem] font-extrabold leading-tight">
          {t('boundary.academy_not_found_title')}
        </h1>
        <p className="mt-2.5 text-[15px] leading-[1.65] text-sub">
          {t('boundary.academy_not_found_body')}
        </p>
        <Link
          className="mt-6 inline-flex h-10 items-center rounded-lg bg-brand px-4 text-[14px] font-bold text-on-brand transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          href="/"
        >
          {t('boundary.not_found_home')}
        </Link>
      </div>
    </div>
  );
}
