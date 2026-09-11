'use client';

import type { MembershipStatus } from '@cove/shared';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import { statusTones } from '../_lib/manager-view';

/**
 * Cells the three people tables — Members, Students, Staff — draw the same
 * way. One definition each, so a status or an ID never looks different
 * depending on which page a manager opened it from.
 */

/**
 * A member's sign-in name, or a plain statement that they have none.
 *
 * Accounts that arrived through Kakao or Google, and those older than
 * usernames, have no ID. "None" in italics says that; a dash would read as a
 * value the page failed to load.
 */
export function UsernameCell({ username }: { username: string | null }) {
  const { t } = useTranslation('manager');
  return username ? (
    <span
      className="block truncate font-mono text-[12.5px] text-ink"
      title={username}
    >
      {username}
    </span>
  ) : (
    <span className="text-[12px] italic text-sub">
      {t('people.no_username')}
    </span>
  );
}

/** A membership status, in the tone it wears everywhere else. */
export function StatusBadge({ status }: { status: MembershipStatus }) {
  const { t } = useTranslation('manager');
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2.5 py-0.5 text-[11.5px] font-bold',
        statusTones[status],
      )}
    >
      {t(`status.${status}`)}
    </span>
  );
}
