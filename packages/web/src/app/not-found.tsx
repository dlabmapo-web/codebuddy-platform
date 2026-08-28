'use client';

import Link from 'next/link';

import { useLayoutTranslation } from '@/i18n';

/**
 * A URL that matches no route.
 *
 * A client component so it can be translated: `not-found.tsx` renders inside
 * the root layout, which is where the layout namespaces are mounted.
 *
 * One way out, and it is the only one that is always right. Every reader of
 * this app is either signed in, in which case `/` sends them to their own
 * academy, or signed out, in which case it sends them to sign in. Guessing
 * anything more specific from a URL that matched nothing would be a guess.
 */
export default function NotFound() {
  const { t } = useLayoutTranslation('common');

  return (
    <div className="grid min-h-svh place-items-center bg-canvas px-5">
      <div className="w-full max-w-md text-center">
        <h1 className="text-[1.7rem] font-extrabold leading-tight">
          {t('boundary.not_found_title')}
        </h1>
        <p className="mt-2.5 text-[15px] leading-[1.65] text-sub">
          {t('boundary.not_found_body')}
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
