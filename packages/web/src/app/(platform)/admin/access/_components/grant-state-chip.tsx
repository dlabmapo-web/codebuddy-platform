'use client';

import type { SupportGrantState } from '@cove/shared';
import { useTranslation } from 'react-i18next';

/**
 * Whether a session is open right now.
 *
 * `live` is the only state that gets colour, and it is a warning colour rather
 * than a success one — an open session is not an achievement, it is something
 * somebody should be able to spot in a list of two hundred and ask about.
 * Everything else is history and reads as history.
 */
const styles: Record<SupportGrantState, string> = {
  live: 'bg-warning/15 text-warning',
  scheduled: 'bg-brand-soft text-brand',
  expired: 'bg-muted text-sub',
  revoked: 'bg-muted text-sub',
};

export function GrantStateChip({ state }: { state: SupportGrantState }) {
  const { t } = useTranslation('platform-support');
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-[12.5px] font-bold ${styles[state]}`}
    >
      {state === 'live' ? (
        <span
          aria-hidden
          className="size-1.5 shrink-0 animate-pulse rounded-full bg-warning motion-reduce:animate-none"
        />
      ) : null}
      {t(`state.${state}`)}
    </span>
  );
}
