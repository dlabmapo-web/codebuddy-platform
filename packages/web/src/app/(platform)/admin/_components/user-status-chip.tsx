'use client';

import type { UserStatus } from '@cove/shared';
import { useTranslation } from 'react-i18next';

import {
  accountStatusTone,
  statusDotStyles,
  statusToneStyles,
} from '../_lib/user-view';

/**
 * What state an account is in, in the colour that state wears.
 *
 * One shape for all four — a filled chip with a dot — matching the status
 * chips on the manager's own people table, so a manager and an operator
 * looking at the same person are shown the same fact the same way.
 *
 * The dot is not decoration: it is what keeps the four legible to a reader who
 * cannot separate the hues, alongside the word itself. Colour is never the
 * only carrier here.
 */
export function UserStatusChip({ status }: { status: UserStatus }) {
  const { t } = useTranslation('platform-users');
  const tone = accountStatusTone[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12.5px] font-bold ${statusToneStyles[tone]}`}
    >
      <span
        aria-hidden
        className={`size-1.5 shrink-0 rounded-full ${statusDotStyles[tone]}`}
      />
      {t(`account_status.${status}`)}
    </span>
  );
}
