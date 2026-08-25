'use client';

import { ArrowLeft, LinkIcon } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

/**
 * What a recovery link that cannot be used says.
 *
 * One state for missing, malformed, expired, already-spent, and
 * signed-in-but-not-recovering. Naming which one it was would tell whoever is
 * holding the link something about the account behind it, and would not help
 * the person reading it: the next step is the same in every case.
 */
export function RecoveryLinkFailure() {
  const { t } = useTranslation('auth');

  return (
    <div>
      <div
        className="flex gap-3.5 rounded-2xl border border-warning/25 bg-warning/10 p-5"
        role="alert"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning text-on-warning">
          <LinkIcon aria-hidden size={20} strokeWidth={2} />
        </span>
        <div>
          <p className="text-[15px] font-bold text-ink">
            {t('recovery.invalid_heading')}
          </p>
          <p className="mt-1.5 text-[14px] leading-6 text-sub">
            {t('recovery.invalid_body')}
          </p>
        </div>
      </div>

      <Link
        className="mt-6 flex h-14 w-full items-center justify-center rounded-xl bg-brand text-[17px] font-bold text-on-brand transition-colors hover:bg-brand-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        href="/forgot-password"
      >
        {t('recovery.request_new_link')}
      </Link>

      <p className="mt-8 border-t border-border pt-6">
        <Link
          className="inline-flex items-center gap-2 text-[15px] font-semibold text-sub transition-colors hover:text-ink"
          href="/login"
        >
          <ArrowLeft aria-hidden size={18} strokeWidth={2} />
          {t('forgot.back_to_login')}
        </Link>
      </p>
    </div>
  );
}
