'use client';

import type { AuditEntry } from '@cove/shared';
import { formatDate, formatTime } from '@cove/i18n/format';
import {
  Eye,
  MinusCircle,
  PlusCircle,
  PencilLine,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useLocale } from '@/i18n';
import { cn } from '@/lib/utils';

import {
  auditActionLabel,
  auditFamily,
  auditNamespace,
  auditVerb,
  type AuditFamily,
} from '../_lib/audit-action';

/**
 * A hue and a glyph per family of act.
 *
 * The distinction an audit trail exists to draw, made visible: something made,
 * something changed, something taken away, something destroyed — and, kept
 * deliberately apart from all four in plain grey, somebody who only looked.
 * A read is not an event of the same kind as a deletion, and on a page where
 * every row looked alike that was invisible.
 */
const familyStyles: Record<
  AuditFamily,
  { node: string; icon: typeof Eye }
> = {
  created: { node: 'bg-teal-soft text-teal', icon: PlusCircle },
  changed: { node: 'bg-brand-soft text-brand', icon: PencilLine },
  withdrawn: { node: 'bg-draft-soft text-draft', icon: MinusCircle },
  destroyed: { node: 'bg-danger/10 text-danger', icon: Trash2 },
  read: { node: 'bg-accent text-sub', icon: Eye },
};

/**
 * The trail, as a chronology rather than a table.
 *
 * A table would put the action in a column and force every row to the width of
 * the longest one. What an operator reads here is a sentence — who did what, to
 * what, and why — so the row is shaped like one.
 *
 * ## A sentence, and only a sentence
 *
 * The row led with the raw action — `class.courses.updated` — because that is
 * the vocabulary operators search by. It is, and it was still the wrong thing
 * to put on a page somebody reads: dotted machine notation asks every reader to
 * parse what the platform could simply have told them.
 *
 * The code was kept beside the sentence for a while and that was half a
 * decision. Two labels for one fact is exactly the double duty a row should not
 * carry, and the scanning cost is paid on every line to serve the rare moment
 * somebody needs the string. It is still one click away — the entry's own page
 * is titled with it — and that is the right place for an exact identifier.
 *
 * An action with no sentence written yet still shows its code, set as the whole
 * page used to be: namespace receding, verb in ink. A feature shipped ahead of
 * its copy degrades to the old row rather than to a blank one.
 *
 * ## Grouped by day, with a rail inside each day
 *
 * The one structural truth about an audit log is that it is ordered in time, so
 * that is what the structure says. The rail joins the entries of a single day
 * and stops at its edges, which is a stronger claim than one continuous line:
 * it says *these happened together*, and the gap between groups is the night.
 *
 * ## Support access
 *
 * Still the one distinction on this page worth its own colour, and now the only
 * violet on it: everything else here was done by the academy's own people, and
 * this was done by Cove. It rings the node as well as marking the row, because
 * the node is what the eye lands on.
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

  const days = React.useMemo(() => groupByDay(entries, locale), [entries, locale]);

  if (entries.length === 0) {
    return (
      <div className="rounded-card border border-border bg-card p-8 text-center">
        <span
          aria-hidden
          className="mx-auto grid size-11 place-items-center rounded-full bg-accent text-sub"
        >
          <Eye className="size-5" />
        </span>
        <h2 className="mt-3 text-[15px] font-bold text-ink">{emptyTitle}</h2>
        <p className="mx-auto mt-1.5 max-w-md text-[14px] leading-6 text-sub">
          {emptyBody}
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      {days.map((day) => (
        <section key={day.key}>
          <h2 className="flex items-baseline gap-2 px-1 pb-2">
            <span className="text-[13px] font-bold text-ink">{day.label}</span>
            <span className="text-[12.5px] text-sub">
              {t('day_count', { count: day.entries.length })}
            </span>
          </h2>

          <ul className="relative grid gap-1.5">
            {/*
              The rail runs the height of one day and no further. Behind the
              nodes rather than between them, so a row's own hover background
              never breaks it into segments.
            */}
            <span
              aria-hidden
              className="pointer-events-none absolute top-5 bottom-5 left-[1.4rem] w-px bg-border"
            />
            {day.entries.map((entry) => (
              <AuditRow entry={entry} key={entry.id} locale={locale} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function AuditRow({
  entry,
  locale,
}: {
  entry: AuditEntry;
  locale: ReturnType<typeof useLocale>;
}) {
  const { t } = useTranslation('platform-audit');
  const family = auditFamily(entry.action);
  const label = auditActionLabel(entry.action);
  const style = familyStyles[family];
  const Icon = style.icon;
  const support = Boolean(entry.supportGrantId);

  return (
    <li className="relative">
      <Link
        className={cn(
          'flex items-start gap-3 rounded-card border bg-card p-3.5 transition-colors',
          'hover:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
          support ? 'border-peer/35' : 'border-border',
        )}
        href={`/admin/audit/${entry.id}`}
      >
        <span
          aria-hidden
          className={cn(
            'relative z-[1] grid size-9 shrink-0 place-items-center rounded-full',
            style.node,
            // Support access rings the node as well as the row: the node is
            // where the eye lands, and this is the fact worth interrupting it.
            support && 'ring-2 ring-peer/45',
          )}
        >
          <Icon className="size-4" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            {label ? (
              <span className="text-[14px] font-bold text-ink">{t(label)}</span>
            ) : (
              /* No sentence written for this one yet: the code, set the way the
                 whole page used to be — namespace receding, verb in ink. */
              <code className="font-mono text-[13px] text-sub">
                {auditNamespace(entry.action)}
                <span className="font-bold text-ink">
                  {auditVerb(entry.action)}
                </span>
              </code>
            )}
            {support ? (
              <span className="inline-flex items-center gap-1 rounded bg-peer-soft px-1.5 py-0.5 text-[11.5px] font-bold text-peer">
                <ShieldAlert aria-hidden className="size-3" />
                {t('support_marker')}
              </span>
            ) : null}
          </span>

          {entry.reason ? (
            <span className="mt-1 line-clamp-2 block text-[13px] leading-6 text-ink">
              {entry.reason}
            </span>
          ) : null}

          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-sub">
            <span className="font-semibold text-ink/70">
              {entry.actorName ?? t('actor_unknown')}
            </span>
            <span aria-hidden>·</span>
            <span>
              {entry.academyName ?? t('platform_wide')}
            </span>
            <span aria-hidden>·</span>
            <span className="font-mono tabular-nums">
              {formatTime(entry.createdAt, locale)}
            </span>
          </span>
        </span>
      </Link>
    </li>
  );
}

/**
 * The entries split into the days they happened on.
 *
 * The list already arrives newest first, so the groups and the entries inside
 * them keep the order they came in — nothing is sorted here, which is what
 * makes this safe to run on a page the server has already ordered.
 *
 * Keyed on the formatted date rather than on a parsed calendar day: the label
 * is what a reader compares, so two entries under one heading are exactly the
 * two entries that render the same heading.
 */
function groupByDay(
  entries: AuditEntry[],
  locale: ReturnType<typeof useLocale>,
): { key: string; label: string; entries: AuditEntry[] }[] {
  const days: { key: string; label: string; entries: AuditEntry[] }[] = [];
  for (const entry of entries) {
    const label = formatDate(entry.createdAt, locale);
    const current = days[days.length - 1];
    if (current && current.key === label) {
      current.entries.push(entry);
      continue;
    }
    days.push({ key: label, label, entries: [entry] });
  }
  return days;
}
