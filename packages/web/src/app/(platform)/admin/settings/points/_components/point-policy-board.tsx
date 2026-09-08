'use client';

import type {
  PlatformAcademyPointPolicyRow,
  PlatformPointPolicyBoard,
  PointPolicy,
} from '@cove/shared';
import type { ColumnDef } from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Coins, SlidersHorizontal } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { DataTable } from '@/components/studio/data-table';
import { useErrorText } from '@/i18n/client/use-error-text';
import { orpc } from '@/lib/orpc';
import { routes } from '@/lib/routes';
import { cn } from '@/lib/utils';

const boardKey = ['platform', 'settings', 'point-policies'] as const;

/**
 * The columns worth comparing across academies, in three groups.
 *
 * Not all nineteen. A board showing every field is a spreadsheet nobody reads
 * across, and most of the policy is machinery — grace minutes, tier
 * thresholds — that only makes sense beside its own siblings on the academy's
 * own form. These six are the ones an operator is asked about.
 *
 * The grouping is what makes a row scannable: three columns for what a problem
 * pays, two for what finishing something pays, one for the ceiling on a day.
 * Each group takes a hue, carried by a dot in the header alone — enough to
 * find "the solve columns" without reading three of them, and not so much that
 * the numbers underneath compete with it.
 */
const groups = [
  { id: 'solve', fields: ['solveEasy', 'solveMedium', 'solveHard'] },
  { id: 'complete', fields: ['lectureCompleted', 'courseCompleted'] },
  { id: 'cap', fields: ['studentDailyCap'] },
] as const satisfies readonly {
  id: string;
  fields: readonly (keyof PointPolicy)[];
}[];

/**
 * Exactly the six fields the groups name, as a union rather than
 * `keyof PointPolicy`.
 *
 * The wider type let `board.column.${field}` widen with it, so a key for a
 * field this board does not show — `attendanceGraceMinutes` — typechecked
 * against a catalogue that has no such string. Narrow, and the translation
 * types check the six that exist.
 */
type ComparedField = (typeof groups)[number]['fields'][number];

const compared: readonly ComparedField[] = groups.flatMap(
  (group) => group.fields,
);

/**
 * What every academy pays, side by side.
 *
 * Read-only — see the page above for why editing belongs on the academy's own
 * form rather than in a cell here.
 *
 * ## The bar under each number
 *
 * A column of numbers is not yet a comparison; the reader still has to hold
 * eight of them in their head to notice that one academy pays double. So every
 * value carries a hairline showing where it sits between the lowest and the
 * highest on the board for that column, and an outlier becomes visible without
 * anybody having to be labelled as wrong.
 *
 * It measures a *column*, never a row — the panel primitives' rule that colour
 * identifies a measurement and never a child holds one level up too, where the
 * child is an academy. Nothing here says an academy pays too much; it says
 * where its number sits, and the operator decides.
 *
 * Where every academy agrees the bars are all full, which is correct: there is
 * no spread to draw.
 *
 * ## Two facts that are not numbers
 *
 * **Points off** says the values are configured but pay nobody, the single
 * most common explanation for "our points are wrong". **Default** says the
 * academy never chose these at all — the difference between a deliberate 10
 * and an unexamined one. Without them an operator would read forty identical
 * rows and conclude the platform was broken.
 */
export function PointPolicyBoard({
  initialBoard,
}: {
  initialBoard: PlatformPointPolicyBoard | null;
}) {
  const { t } = useTranslation('platform');
  const errorText = useErrorText();

  const query = useQuery({
    queryKey: boardKey,
    queryFn: () => orpc.platformSettings.pointPolicies({}),
    ...(initialBoard ? { initialData: initialBoard } : {}),
  });

  const rows = React.useMemo(() => query.data?.rows ?? [], [query.data]);

  const columns = React.useMemo<ColumnDef<PlatformAcademyPointPolicyRow>[]>(
    () => [
      {
        id: 'academy',
        accessorFn: (row) => `${row.academyName} ${row.academySlug}`,
        header: t('table.name'),
        cell: ({ row }) => (
          <div className="min-w-0">
            <Link
              className="block truncate text-[14px] font-bold text-ink hover:text-brand"
              href={routes.adminAcademy(row.original.academySlug)}
            >
              {row.original.academyName}
            </Link>
            <span className="flex items-center gap-1.5">
              <span className="truncate font-mono text-[12px] text-sub">
                /{row.original.academySlug}
              </span>
              {row.original.isDefault ? (
                <span className="shrink-0 rounded px-1 py-px text-[10px] font-bold uppercase tracking-wide text-sub ring-1 ring-border">
                  {t('board.default')}
                </span>
              ) : null}
            </span>
          </div>
        ),
      },
      {
        id: 'points',
        size: 104,
        // A string, because a facet's values are strings — `arrIncludesSome`
        // compares what the chip carries against what the cell holds, and a
        // boolean accessor makes those two different types.
        accessorFn: (row) => (row.pointsEnabled ? 'on' : 'off'),
        filterFn: 'arrIncludesSome',
        header: t('board.points_state'),
        cell: ({ row }) =>
          row.original.pointsEnabled ? (
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-rank-gold-soft px-2 py-0.5 text-[12px] font-bold text-rank-gold">
              <Coins aria-hidden className="size-3" />
              {t('board.points_on')}
            </span>
          ) : (
            /*
             * Not a warning colour. An academy that does not run points has not
             * gone wrong — but the numbers in this row pay nobody, and a reader
             * comparing them needs to know that before they compare.
             */
            <span className="whitespace-nowrap rounded-full bg-accent px-2 py-0.5 text-[12px] font-bold text-sub">
              {t('board.points_off')}
            </span>
          ),
      },
      ...compared.map<ColumnDef<PlatformAcademyPointPolicyRow>>((field) => ({
          id: field,
          accessorFn: (row) => row.policy[field],
          header: t(`board.column.${field}`),
          size: 100,
          /*
           * The table's own measurement-column API, rather than a `text-right`
           * of my own: it right-aligns the header *and* the cell together, so
           * the label sits over the digits it names instead of at the far end
           * of the box. `px-2` buys back the sixteen pixels the default gutter
           * costs six times over — which is what was truncating "Lecture" and
           * "Course" into "LECTUR" and "COURS".
           */
          meta: { align: 'right', className: 'px-2' },
          cell: ({ row }) => (
            /*
             * The number, and nothing else. It carried a bar showing where it
             * sat in the platform's range, which read as decoration on a value
             * that is already one glance to compare down a column — and cost
             * the width that pushed this table into a horizontal scroll.
             *
             * Weight still does the one job the bar was there for: an academy
             * that does not pay shows its numbers greyed, because those values
             * are configuration rather than what anybody is earning.
             */
            <span
              className={cn(
                'font-mono text-[14px] tabular-nums',
                row.original.pointsEnabled
                  ? 'font-bold text-ink'
                  : 'text-sub/60',
              )}
            >
              {row.original.policy[field]}
            </span>
          ),
        }),
      ),
      {
        id: 'actions',
        header: t('table.actions'),
        enableSorting: false,
        size: 104,
        cell: ({ row }) =>
          // Archived academies keep their numbers and lose the way to change
          // them, as everywhere else in the console.
          row.original.status === 'ARCHIVED' ? null : (
            // The same control the academies table opens a row with, so one
            // gesture means one thing across the console.
            <Link
              className="group inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg bg-brand-soft px-3 text-[13px] font-bold text-brand transition-colors hover:bg-brand hover:text-on-brand"
              href={routes.adminAcademyPointPolicy(row.original.academySlug)}
            >
              {t('board.edit')}
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          ),
      },
    ],
    [t],
  );

  return (
    <div className="grid gap-4">
      <PolicyTally rows={rows} />

      {query.isError ? (
        <p
          className="rounded-lg bg-danger/10 px-3 py-2 text-[13px] font-semibold text-danger"
          role="alert"
        >
          {errorText(query.error)}
        </p>
      ) : null}
      {query.data?.truncated ? (
        <p className="text-[13px] text-sub">
          {t('board.truncated', { count: query.data.total })}
        </p>
      ) : null}

      {/*
        `fixed`, so nine columns cannot grow a horizontal scrollbar — the one
        outcome a comparison table must never have, because the reader loses
        the academy column the moment they look at the last number. Every
        column declares a width except the academy, which absorbs the slack and
        truncates.
      */}
      <DataTable
        columns={columns}
        data={rows}
        emptyMessage={t('table.empty')}
        layout="fixed"
        facets={[
          {
            columnId: 'points',
            title: t('board.points_state'),
            options: [
              { value: 'on', label: t('board.points_on') },
              { value: 'off', label: t('board.points_off') },
            ],
          },
        ]}
        searchPlaceholder={t('board.search')}
      />
    </div>
  );
}

/**
 * What the board says before a row is read.
 *
 * Three facts, each one changing how the table underneath should be read: how
 * many academies the numbers actually pay, how many never chose them, and how
 * far apart the ones that did have drifted. The third is the reason this page
 * exists — a platform where every academy pays the same needs no comparison,
 * and one where the spread is wide needs it badly.
 */
function PolicyTally({ rows }: { rows: PlatformAcademyPointPolicyRow[] }) {
  const { t } = useTranslation('platform');

  if (rows.length === 0) return null;

  const running = rows.filter((row) => row.pointsEnabled);
  const defaults = rows.filter((row) => row.isDefault).length;
  // The spread is only meaningful among academies that actually pay, so a
  // dormant academy on untouched defaults cannot widen it.
  const hard = running.map((row) => row.policy.solveHard);
  const spread =
    hard.length > 0 ? { min: Math.min(...hard), max: Math.max(...hard) } : null;

  const tiles = [
    {
      id: 'running',
      chip: 'bg-rank-gold-soft text-rank-gold',
      icon: Coins,
      label: t('board.tally_running'),
      value: `${running.length}`,
      hint: t('board.of_academies', { count: rows.length }),
    },
    {
      id: 'defaults',
      chip: 'bg-retired-soft text-retired',
      icon: SlidersHorizontal,
      label: t('board.tally_defaults'),
      value: `${defaults}`,
      hint: t('board.of_academies', { count: rows.length }),
    },
    {
      id: 'spread',
      chip: 'bg-peer-soft text-peer',
      icon: Coins,
      label: t('board.tally_spread'),
      value: spread
        ? spread.min === spread.max
          ? `${spread.min}`
          : `${spread.min}–${spread.max}`
        : '—',
      hint: t('board.tally_spread_hint'),
    },
  ];

  return (
    <div className="grid gap-2.5 sm:grid-cols-3">
      {tiles.map((tile) => (
        <div
          className="rounded-card border border-border bg-card p-3.5"
          key={tile.id}
        >
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className={cn(
                'grid size-7 shrink-0 place-items-center rounded-lg',
                tile.chip,
              )}
            >
              <tile.icon className="size-3.5" />
            </span>
            <span className="min-w-0 truncate text-[12.5px] font-bold text-ink">
              {tile.label}
            </span>
          </div>
          <p className="mt-2 flex items-baseline gap-1">
            <span className="font-mono text-[19px] font-extrabold tabular-nums text-ink">
              {tile.value}
            </span>
            <span className="text-[12.5px] text-sub">{tile.hint}</span>
          </p>
        </div>
      ))}
    </div>
  );
}
