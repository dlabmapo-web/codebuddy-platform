'use client';

import type { CurriculumChange } from '@cove/shared';
import { Eye, EyeOff, History } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import { changeIcons, changeShape } from '../../_lib/lead-view';
import { EmptyState } from '../overview-ui/panel';

/**
 * Who changed what, and whether students were watching when it happened.
 *
 * This panel does two jobs that were designed as separate sections. It is the
 * authorship trail — the way back into whatever was being worked on — and it is
 * the change history. Merging them is what makes both free: a material carries
 * no author column, so a personal "continue editing" list would have needed a
 * schema change, while the audit log has recorded exactly this since the
 * content module shipped.
 *
 * The visibility flag is the reason this is worth more than a list of
 * timestamps. An edit to a hidden lecture is a draft; the same edit to a live
 * one moved under a class that may have been mid-lesson, and only one of those
 * is worth a Team Lead's attention on a Monday morning.
 */
export function ChangeLog({ rows }: { rows: CurriculumChange[] }) {
  const { t, i18n } = useTranslation('lead');

  if (rows.length === 0) {
    return (
      <EmptyState
        body={t('changes.empty_body')}
        icon={History}
        title={t('changes.empty_title')}
        tone="peer"
      />
    );
  }

  const formatter = new Intl.DateTimeFormat(i18n.language, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

  return (
    <ul className="divide-y divide-border">
      {rows.map((row) => {
        const shape = changeShape(row.action);
        const Icon = changeIcons[shape];

        return (
          <li
            className="flex flex-wrap items-start gap-x-3 gap-y-1.5 px-4 py-3"
            key={row.id}
          >
            <span
              aria-hidden
              className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-peer/10 text-peer"
            >
              <Icon className="size-3.5" strokeWidth={2.25} />
            </span>

            <span className="min-w-0 flex-1">
              <span className="block text-[13px] leading-[1.5]">
                <span className="font-semibold text-ink">{row.targetLabel}</span>{' '}
                <span className="text-sub">
                  {t(`changes.action.${row.action}`)}
                </span>
              </span>
              <span className="mt-0.5 block text-[11.5px] text-sub">
                {row.actorName
                  ? t('changes.by', { name: row.actorName })
                  : t('changes.by_unknown')}
              </span>
            </span>

            {/*
             * Live or hidden at the moment of the change. Rendered as an icon
             * plus a word rather than a colour alone, so the distinction
             * survives both themes and a monochrome screen.
             */}
            {row.wasVisible !== null ? (
              <span
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold',
                  row.wasVisible
                    ? 'bg-brand/10 text-brand'
                    : 'bg-retired/10 text-retired',
                )}
              >
                {row.wasVisible ? (
                  <Eye aria-hidden className="size-3" />
                ) : (
                  <EyeOff aria-hidden className="size-3" />
                )}
                {t(row.wasVisible ? 'changes.was_live' : 'changes.was_hidden')}
              </span>
            ) : null}

            <time
              className="shrink-0 font-mono text-[11px] font-bold tabular-nums text-sub"
              dateTime={row.at}
            >
              {formatter.format(new Date(row.at))}
            </time>
          </li>
        );
      })}
    </ul>
  );
}
