'use client';

import type {
  AcademyRole,
  MembershipStatus,
  RosterClassRef,
} from '@cove/shared';
import { academyRoles } from '@cove/shared';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import { toneStyles } from './overview-ui/panel';
import { roleTones, statusTones } from '../_lib/manager-view';

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

/**
 * Every role a person holds, highest first, as the chips the rest of the
 * product uses.
 *
 * All of them rather than the highest and a `+1`: on the Staff page the
 * question is exactly "who else does this person teach as", and a count makes
 * the manager open the profile to find out.
 */
export function RoleChips({ roles }: { roles: readonly AcademyRole[] }) {
  const { t } = useTranslation('manager');
  const ordered = [...academyRoles]
    .reverse()
    .filter((role) => roles.includes(role));
  return (
    <span className="flex flex-wrap gap-1">
      {ordered.map((role) => (
        <span
          className={cn(
            'inline-flex rounded-full px-2 py-0.5 text-[11.5px] font-bold',
            toneStyles[roleTones[role]].chip,
          )}
          key={role}
        >
          {t(`role.${role}`)}
        </span>
      ))}
    </span>
  );
}

/**
 * Class names, the first two in full and the rest as `+n`.
 *
 * The full list is the cell's `title`, so a manager hovering a busy teacher
 * reads all eight classes without the column growing to fit them.
 */
export function ClassChips({
  classes,
  emptyLabel,
}: {
  classes: readonly (RosterClassRef & { suffix?: string })[];
  emptyLabel: string;
}) {
  if (classes.length === 0) {
    return <span className="text-[12px] italic text-sub">{emptyLabel}</span>;
  }
  const shown = classes.slice(0, 2);
  const rest = classes.length - shown.length;
  const label = (entry: (typeof classes)[number]) =>
    entry.suffix ? `${entry.name} ${entry.suffix}` : entry.name;
  return (
    <span
      className="flex min-w-0 items-center gap-1"
      title={classes.map(label).join(', ')}
    >
      {shown.map((entry) => (
        <span
          className="min-w-0 truncate rounded-md bg-accent px-1.5 py-0.5 text-[12px] font-bold text-ink"
          key={entry.id}
        >
          {label(entry)}
        </span>
      ))}
      {rest > 0 ? (
        <span className="shrink-0 text-[12px] font-bold text-sub">+{rest}</span>
      ) : null}
    </span>
  );
}
