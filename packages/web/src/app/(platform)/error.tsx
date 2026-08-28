'use client';

import { useLayoutTranslation } from '@/i18n';

/**
 * The platform console, which still composes its own chrome per page — so a
 * throw here takes the whole screen and this stands centred in it.
 *
 * `reset()` re-renders the segment beneath this boundary. It is offered rather
 * than a page reload because the frame around it is still intact and still
 * correct — throwing the whole document away to recover one column would cost
 * the reader their place for no reason.
 *
 * The message does not name a cause. A boundary catches everything from an
 * unreachable API to a bug in a chart, and a sentence that guessed which one
 * would be wrong most of the time. What it can honestly say is what happened,
 * what to try, and who to tell when trying does not work.
 */
export default function PlatformError({ reset }: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useLayoutTranslation('common');

  return (
    <div className="grid min-h-svh place-items-center bg-canvas px-5">
      <div className="w-full max-w-md rounded-card border border-danger/25 bg-danger/5 p-6">
        <h1 className="text-[17px] font-bold text-danger">
          {t('boundary.error_title')}
        </h1>
        <p className="mt-2 text-[14px] leading-[1.65] text-sub">
          {t('boundary.error_body')}
        </p>
        <button
          className="mt-4 inline-flex h-9 items-center rounded-lg bg-danger px-3.5 text-[13px] font-bold text-on-danger transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
          onClick={reset}
          type="button"
        >
          {t('action.try_again')}
        </button>
      </div>
    </div>
  );
}
