'use client';

import { ArrowRight, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { INACTIVITY_RETURN_KEY, safeReturnPath } from './inactivity';

/**
 * The way back to the page an automatic sign-out interrupted.
 *
 * §9.3 asks for an *offer*, not a redirect, and the distinction matters: the
 * student may be signing back in half an hour later to do something else, and
 * being thrown into the problem they abandoned would be the app deciding what
 * their lesson is about. So it is a dismissible prompt, and it appears exactly
 * once — the stored path is consumed on read.
 *
 * The path was validated when it was stored and is validated again here.
 * `sessionStorage` is writable by anything running on the origin, so a value
 * read back out of it is untrusted input even though this code is what put it
 * there; the second check is what stops it becoming an open redirect.
 *
 * Nothing here restores state. It is a link to a route, and that route proves
 * the student's access again on its own — a stale path to a class they have
 * since left lands on the same refusal any other stale link would.
 */
export function ResumePrompt() {
  const { t } = useTranslation('session');
  const pathname = usePathname();
  const [target, setTarget] = React.useState<string | null>(null);

  React.useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.sessionStorage.getItem(INACTIVITY_RETURN_KEY);
      // Consumed on read, so a student who dismisses it — or who simply
      // navigates away — is not offered the same page again on every load.
      window.sessionStorage.removeItem(INACTIVITY_RETURN_KEY);
    } catch {
      return;
    }
    if (!stored) return;
    const safe = safeReturnPath(stored);
    // Already there: the redirect after sign-in happened to land on it, and
    // offering to go where they are would be noise.
    if (!safe || safe === pathname) return;

    // This is the shape the rule is written to allow — reading an external
    // system on mount — but it is read synchronously rather than through a
    // subscription, because the value is consumed and can never change again.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTarget(safe);
    // Deliberately mount-only. `pathname` changing later means the student went
    // somewhere themselves, which is an answer to the offer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!target) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-brand-soft px-4 py-2 text-[13px]">
      <span className="font-semibold text-ink">{t('resume.body')}</span>
      <Link
        className="inline-flex items-center gap-1 font-bold text-brand underline-offset-2 transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        href={target}
        onClick={() => setTarget(null)}
      >
        {t('resume.action')}
        <ArrowRight aria-hidden className="size-3.5" />
      </Link>
      <button
        aria-label={t('resume.dismiss')}
        className="ml-auto rounded-md p-1 text-sub transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        onClick={() => setTarget(null)}
        type="button"
      >
        <X aria-hidden className="size-4" />
      </button>
    </div>
  );
}
