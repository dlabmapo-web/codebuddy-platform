'use client';

import type { ActiveSupportGrant } from '@cove/shared';
import { Eye, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * You are inside somebody else's academy.
 *
 * Not dismissible, and deliberately. An operator who forgets they are working
 * in a customer's data is the failure the whole support-grant design exists to
 * prevent, and a banner that can be closed is a banner that will be — usually
 * within the first minute, by the person who most needs it.
 *
 * It sits above everything rather than inside the page frame so it is present
 * on the exercise workspace and live monitoring too, which have no chrome of
 * their own and are exactly where an operator is deepest into somebody's data.
 *
 * The countdown is the second job. A grant ends on a clock rather than on a
 * decision, so the operator has to be able to see how long they have without
 * going to look for it.
 */
export function SupportBanner({
  academyName,
  grant,
}: {
  academyName: string;
  grant: ActiveSupportGrant;
}) {
  const { t } = useTranslation('platform-support');
  const [remaining, setRemaining] = React.useState(() =>
    minutesLeft(grant?.expiresAt),
  );

  React.useEffect(() => {
    if (!grant) return;
    const id = setInterval(
      () => setRemaining(minutesLeft(grant.expiresAt)),
      30_000,
    );
    return () => clearInterval(id);
  }, [grant]);

  // No session: an operator reading an academy on their standing permission.
  // Quieter than a session — nothing is being changed — but never absent,
  // because the one thing that must not happen is an operator forgetting
  // whose data is on screen.
  if (!grant) {
    return (
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border bg-muted px-4 py-2 text-[13px] text-sub"
        role="status"
      >
        <span className="inline-flex items-center gap-1.5 font-bold text-ink">
          <Eye aria-hidden className="size-3.5 shrink-0" />
          {t('banner.viewing', { academy: academyName })}
        </span>
        <span>{t('banner.viewing_hint')}</span>
      </div>
    );
  }

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-warning/30 bg-warning/10 px-4 py-2 text-[13px] text-ink"
      role="status"
    >
      <span className="inline-flex items-center gap-1.5 font-bold text-warning">
        <ShieldAlert aria-hidden className="size-4 shrink-0" />
        {t('banner.title', { academy: grant.academyName })}
      </span>

      <span className="inline-flex items-center gap-1.5 text-sub">
        {grant.readOnly ? (
          <>
            <Eye aria-hidden className="size-3.5 shrink-0" />
            {t('banner.read_only')}
          </>
        ) : (
          t('banner.writing', {
            role: t(`role.${grant.assumedRole}`),
          })
        )}
      </span>

      <span className="text-sub">
        {remaining > 0
          ? t('banner.remaining', { count: remaining })
          : t('banner.ending')}
      </span>

      <span className="min-w-0 flex-1 truncate text-sub" title={grant.reason}>
        {grant.reason}
      </span>

      <Link
        className="shrink-0 rounded-md border border-warning/40 px-2.5 py-1 font-bold text-warning transition-colors hover:bg-warning hover:text-white"
        href={`/admin/access/${grant.id}`}
      >
        {t('banner.manage')}
      </Link>
    </div>
  );
}

/**
 * Rounded up, so a grant with forty seconds left reads "1 minute" rather than
 * "0" — which would say the session is over while the operator is still using
 * it.
 */
function minutesLeft(expiresAt: string | undefined): number {
  if (!expiresAt) return 0;
  const ms = new Date(expiresAt).getTime() - Date.now();
  return ms <= 0 ? 0 : Math.ceil(ms / 60_000);
}
