'use client';

import type { ContentImportCounts } from '@cove/shared';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import { toneStyles, type PlanTone } from '../_lib/action-tokens';

export type PlanFilter =
  | 'all'
  | 'create'
  | 'update'
  | 'unchanged'
  | 'warning'
  | 'conflict';

/**
 * What this workbook would do, before a single row is read.
 *
 * The counts §4.4 asks for, plus one thing it does not: a single bar whose
 * segments are sized by those counts. A team lead re-uploading a workbook they
 * changed two problems in should be able to *see* that it is two problems —
 * a mostly-slate bar with a sliver of blue — rather than reading three numbers
 * and doing the arithmetic. A first import of a new course is the opposite
 * picture, almost entirely green, and the two are distinguishable across the
 * room.
 *
 * Warnings and conflicts are deliberately not in the bar. They are annotations
 * on the actions rather than a fourth share of them, and adding them would make
 * the segments stop summing to the number of things being imported. They sit
 * beside it as filters instead, which is where somebody acts on them.
 */
export function PlanSummary({
  counts,
  filter,
  onFilterChange,
}: {
  counts: ContentImportCounts;
  filter: PlanFilter;
  onFilterChange: (next: PlanFilter) => void;
}) {
  const { t } = useTranslation('content-import');

  const total = counts.create + counts.update + counts.unchanged;
  const segments: Array<{ tone: PlanTone; value: number }> = [
    { tone: 'create', value: counts.create },
    { tone: 'update', value: counts.update },
    { tone: 'unchanged', value: counts.unchanged },
  ];

  return (
    <section className="rounded-card border border-border bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className="text-[15.5px] font-extrabold text-ink">
          {t('review.summary_title')}
        </h2>
        <p className="text-[13px] font-semibold text-sub">
          {t('review.summary_total', { count: total })}
        </p>
      </div>

      {/*
        The bar is decorative in the accessibility tree: every number it encodes
        is spelled out in the chips directly below it, and a screen reader
        walking three unlabelled segments learns nothing the next line does not
        say better.
      */}
      <div
        aria-hidden
        className="mt-4 flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted"
      >
        {total === 0
          ? null
          : segments
              .filter((segment) => segment.value > 0)
              .map((segment) => (
                <div
                  className={cn('h-full', toneStyles[segment.tone].bar)}
                  key={segment.tone}
                  style={{ width: `${(segment.value / total) * 100}%` }}
                />
              ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <FilterPill
          active={filter === 'all'}
          count={total}
          label={t('review.filter.all')}
          onSelect={() => onFilterChange('all')}
          tone={null}
        />
        <FilterPill
          active={filter === 'create'}
          count={counts.create}
          label={t('review.filter.create')}
          onSelect={() => onFilterChange('create')}
          tone="create"
        />
        <FilterPill
          active={filter === 'update'}
          count={counts.update}
          label={t('review.filter.update')}
          onSelect={() => onFilterChange('update')}
          tone="update"
        />
        <FilterPill
          active={filter === 'unchanged'}
          count={counts.unchanged}
          label={t('review.filter.unchanged')}
          onSelect={() => onFilterChange('unchanged')}
          tone="unchanged"
        />
        <FilterPill
          active={filter === 'warning'}
          count={counts.warnings}
          label={t('review.filter.warnings')}
          onSelect={() => onFilterChange('warning')}
          tone="warning"
        />
        <FilterPill
          active={filter === 'conflict'}
          count={counts.conflicts + counts.errors}
          label={t('review.filter.conflicts')}
          onSelect={() => onFilterChange('conflict')}
          tone="conflict"
        />
      </div>
    </section>
  );
}

/**
 * A count and a filter in one control.
 *
 * The two are the same thing here: a team lead who reads "Conflicts 3" wants to
 * see those three next, and making the number itself the way to get there
 * removes a step and a second place to put the same word. A pill with nothing
 * behind it is disabled rather than hidden, so the row of outcomes keeps its
 * shape between uploads and "no conflicts" is a thing you can see rather than
 * an absence you have to notice.
 */
function FilterPill({
  active,
  count,
  label,
  onSelect,
  tone,
}: {
  active: boolean;
  count: number;
  label: string;
  onSelect: () => void;
  tone: PlanTone | null;
}) {
  const empty = count === 0;
  return (
    <button
      aria-pressed={active}
      className={cn(
        'inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[13px] font-bold transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        empty && 'cursor-default border-border bg-card text-sub/60',
        !empty && !active && 'border-border bg-card text-sub hover:border-ink/25 hover:text-ink',
        !empty && active && (tone ? toneStyles[tone].pill : 'border-ink bg-ink text-card'),
      )}
      disabled={empty}
      onClick={onSelect}
      type="button"
    >
      {label}
      <span className="tabular text-[13px] font-extrabold">{count}</span>
    </button>
  );
}
