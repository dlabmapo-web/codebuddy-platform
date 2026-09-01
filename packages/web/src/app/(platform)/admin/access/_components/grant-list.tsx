'use client';

import type { SupportGrant } from '@cove/shared';
import { formatShortDateTime } from '@cove/i18n/format';
import { ArrowRight, Eye, PenLine, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import { useLocale } from '@/i18n';

import { GrantStateChip } from './grant-state-chip';

/**
 * Every support session, live ones first.
 *
 * Two sections rather than one sorted table, for the reason the academy roll
 * call splits: the question "is anybody inside a customer's academy right now"
 * has to be answerable without reading anything, and a live row buried on page
 * three of a history is not an answer. An operator who sees an empty top
 * section is finished.
 */
export function GrantList({
  grants,
  liveCount,
}: {
  grants: SupportGrant[];
  liveCount: number;
}) {
  const { t } = useTranslation('platform-support');
  const live = grants.filter((grant) => grant.state === 'live');
  const past = grants.filter((grant) => grant.state !== 'live');

  return (
    <div className="grid gap-6">
      <section>
        {live.length === 0 ? (
          <div className="rounded-card border border-border bg-card p-5">
            <h2 className="text-[15px] font-bold text-ink">
              {t('list.live_none')}
            </h2>
            <p className="mt-1.5 text-[14px] leading-6 text-sub">
              {t('list.live_none_body')}
            </p>
          </div>
        ) : (
          <>
            <h2 className="mb-2.5 inline-flex items-center gap-2 text-[15px] font-bold text-warning">
              <ShieldAlert aria-hidden className="size-4" />
              {t('list.live_heading', { count: liveCount })}
            </h2>
            <ul className="grid gap-2.5">
              {live.map((grant) => (
                <li key={grant.id}>
                  <GrantCard grant={grant} highlighted />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section>
        <h2 className="mb-2.5 text-[15px] font-bold text-ink">
          {t('list.history')}
        </h2>
        {past.length === 0 ? (
          <p className="rounded-card border border-border bg-card p-5 text-[14px] text-sub">
            {t('list.empty')}
          </p>
        ) : (
          <ul className="grid gap-2">
            {past.map((grant) => (
              <li key={grant.id}>
                <GrantCard grant={grant} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function GrantCard({
  grant,
  highlighted = false,
}: {
  grant: SupportGrant;
  highlighted?: boolean;
}) {
  const { t } = useTranslation('platform-support');
  const locale = useLocale();

  return (
    <Link
      className={`group flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card border p-4 transition-colors hover:border-brand ${
        highlighted
          ? 'border-warning/40 bg-warning/5'
          : 'border-border bg-card'
      }`}
      href={`/admin/access/${grant.id}`}
    >
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className="truncate text-[14px] font-bold text-ink">
            {grant.academyName}
          </span>
          <GrantStateChip state={grant.state} />
        </p>
        {/* The reason, on the row. An operator scanning this list is asking
            "was that legitimate", and a list that made them open each session
            to find out would not be read. */}
        <p className="mt-0.5 truncate text-[13px] text-sub" title={grant.reason}>
          {grant.reason}
        </p>
      </div>

      <span className="inline-flex shrink-0 items-center gap-1.5 text-[13px] text-sub">
        {grant.readOnly ? (
          <Eye aria-hidden className="size-3.5" />
        ) : (
          <PenLine aria-hidden className="size-3.5 text-warning" />
        )}
        {grant.readOnly ? t('list.read_only') : t('list.read_write')}
        {' · '}
        {t(`role.${grant.assumedRole}`)}
      </span>

      <span className="shrink-0 whitespace-nowrap text-[13px] text-sub">
        {grant.adminName}
      </span>

      <span className="shrink-0 whitespace-nowrap text-[13px] text-sub">
        {formatShortDateTime(grant.createdAt, locale)}
      </span>

      <ArrowRight
        aria-hidden
        className="size-4 shrink-0 text-sub transition-transform group-hover:translate-x-0.5 group-hover:text-brand"
      />
    </Link>
  );
}
