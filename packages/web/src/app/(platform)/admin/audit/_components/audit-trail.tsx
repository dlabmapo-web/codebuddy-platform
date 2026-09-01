'use client';

import type { AuditEntry } from '@cove/shared';
import { formatShortDateTime } from '@cove/i18n/format';
import { ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import { useLocale } from '@/i18n';
import { routes } from '@/lib/routes';

/**
 * The trail, as a list rather than a table.
 *
 * A table would put the action in a column and force every row to the width of
 * the longest one. What an operator actually reads here is a sentence — who did
 * what, to what, and why — so the row is shaped like one, and the metadata sits
 * under it in the order somebody scanning would want it.
 *
 * Entries made under support access carry a marker. That is the one distinction
 * on this page worth colour: everything else here was done by the academy's own
 * people, and this was done by Cove.
 */
export function AuditTrail({
  entries,
  emptyTitle,
  emptyBody,
}: {
  entries: AuditEntry[];
  emptyTitle: string;
  emptyBody: string;
}) {
  const { t } = useTranslation('platform-audit');
  const locale = useLocale();

  if (entries.length === 0) {
    return (
      <div className="rounded-card border border-border bg-card p-5">
        <h2 className="text-[15px] font-bold text-ink">{emptyTitle}</h2>
        <p className="mt-1.5 text-[14px] leading-6 text-sub">{emptyBody}</p>
      </div>
    );
  }

  return (
    <ul className="grid gap-1.5">
      {entries.map((entry) => (
        <li key={entry.id}>
          <Link
            className={`block rounded-card border p-3.5 transition-colors hover:border-brand ${
              entry.supportGrantId
                ? 'border-warning/35 bg-warning/5'
                : 'border-border bg-card'
            }`}
            href={`/admin/audit/${entry.id}`}
          >
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12.5px] font-semibold text-ink">
                {entry.action}
              </code>
              {entry.supportGrantId ? (
                <span className="inline-flex items-center gap-1 rounded bg-warning/15 px-1.5 py-0.5 text-[11.5px] font-bold text-warning">
                  <ShieldAlert aria-hidden className="size-3" />
                  {t('support_marker')}
                </span>
              ) : null}
              {entry.academyName ? (
                <span className="text-[13px] text-sub">
                  {entry.academyName}
                </span>
              ) : (
                <span className="text-[13px] text-sub">{t('platform_wide')}</span>
              )}
            </p>

            {entry.reason ? (
              <p className="mt-1 line-clamp-2 text-[13px] leading-6 text-ink">
                {entry.reason}
              </p>
            ) : null}

            <p className="mt-1 flex flex-wrap gap-x-2 text-[12.5px] text-sub">
              <span>{entry.actorName ?? t('actor_unknown')}</span>
              <span aria-hidden>·</span>
              <span>{formatShortDateTime(entry.createdAt, locale)}</span>
              <span aria-hidden>·</span>
              <span className="font-mono">{entry.targetType}</span>
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
