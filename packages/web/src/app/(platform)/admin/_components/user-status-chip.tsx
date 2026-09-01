'use client';

import type { UserStatus } from '@cove/shared';
import { useTranslation } from 'react-i18next';

import {
  accountStatusTone,
  statusDotStyles,
  statusToneStyles,
} from '../_lib/user-view';

/**
 * What state an account is in, loud only when that is bad news.
 *
 * A healthy account gets a small dot and a muted word; a suspended one gets a
 * filled chip. The asymmetry is the design: a table that puts a green ACTIVE
 * pill on all three hundred rows teaches the eye to skip the column, and then
 * the one suspended account is the row nobody notices. Colour is spent where it
 * carries information.
 *
 * The same instinct as the academy roll call, which shows an operator nothing
 * when nothing is wrong.
 */
export function UserStatusChip({ status }: { status: UserStatus }) {
  const { t } = useTranslation('platform-users');
  const tone = accountStatusTone[status];
  const label = t(`account_status.${status}`);

  if (tone === 'quiet') {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] text-sub">
        <span
          aria-hidden
          className={`size-1.5 shrink-0 rounded-full ${statusDotStyles[tone]}`}
        />
        {label}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-[12.5px] font-bold ${statusToneStyles[tone]}`}
    >
      {label}
    </span>
  );
}
