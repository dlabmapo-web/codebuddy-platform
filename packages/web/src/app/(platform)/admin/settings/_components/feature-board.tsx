'use client';

import type {
  AcademyFeatureName,
  PlatformAcademyFeatureRow,
  PlatformFeatureBoard,
} from '@cove/shared';
import { academyFeatureNames, academyFeatureRequires } from '@cove/shared';
import type { ColumnDef } from '@tanstack/react-table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Coins, Eye, Trophy, Users } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { DataTable } from '@/components/studio/data-table';
import { Switch, type SwitchTone } from '@/components/studio/switch';
import { useLayoutTranslation } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';
import { orpc } from '@/lib/orpc';
import { routes } from '@/lib/routes';
import { cn } from '@/lib/utils';

const boardKey = ['platform', 'settings', 'features'] as const;

/**
 * A literal key per status, rather than one built from the value.
 *
 * The translation catalogue is typed, and a template key widens to
 * `condition.${string}` — which typechecks against nothing. Written out, a
 * status added later fails to compile here until it has copy.
 *
 * Prefixed, because an academy's condition is named by the console's own
 * `platform` namespace while this board's primary one is `platform-settings`.
 */
const statusLabels = {
  ACTIVE: 'platform:condition.running',
  SUSPENDED: 'platform:condition.suspended',
  ARCHIVED: 'platform:condition.archived',
} as const;

/**
 * A hue and a glyph per feature.
 *
 * The product already colours by subject — every overview section owns a hue,
 * and `toneStyles` in the panel primitives is that legend. A grid of switches
 * is the case that needs it most: four identical blue columns have to be
 * checked against the header every time, where four hues let an operator read
 * one academy's whole configuration as a shape and scan a column down the page
 * without leaving it.
 *
 * The hues are not arbitrary. Live monitoring is teal because it is the
 * watching surface; class standing takes `peer`, which exists in this palette
 * precisely for "where you sit among others"; points take the ranking's gold;
 * and the leaderboard — the only feature built on another — takes a hue of its
 * own so a reader can see it lit beside its prerequisite.
 */
const featureStyles: Record<
  AcademyFeatureName,
  { tone: SwitchTone; dot: string; chip: string; meter: string; icon: typeof Eye }
> = {
  TEACHER_LIVE_MONITORING: {
    tone: 'teal',
    dot: 'bg-teal',
    chip: 'bg-teal-soft text-teal',
    meter: 'bg-teal',
    icon: Eye,
  },
  STUDENT_CLASS_STANDING: {
    tone: 'peer',
    dot: 'bg-peer',
    chip: 'bg-peer-soft text-peer',
    meter: 'bg-peer',
    icon: Users,
  },
  STUDENT_POINTS: {
    tone: 'gold',
    dot: 'bg-rank-gold',
    chip: 'bg-rank-gold-soft text-rank-gold',
    meter: 'bg-rank-gold',
    icon: Coins,
  },
  STUDENT_CLASS_LEADERBOARD: {
    tone: 'rose',
    dot: 'bg-course-d',
    chip: 'bg-course-d-soft text-course-d',
    meter: 'bg-course-d',
    icon: Trophy,
  },
};

/**
 * Every academy's switches, in one grid.
 *
 * ## Why a cell is the control
 *
 * The board could have linked each row to that academy's settings page, and
 * been a report. It would then be a page that shows an operator forty answers
 * and makes them leave to change any of them — the round trip this surface
 * exists to remove. A switch in the cell is the shortest true version of "turn
 * points on for this academy".
 *
 * ## Why the switch moves before the server answers
 *
 * It used to wait, and disable its whole row while it waited. That made every
 * press feel like a page reload for a change the operator had already decided
 * on, and it punished exactly the person this board is for — somebody setting
 * eight academies in a row.
 *
 * So the change is applied locally the instant it is pressed, including the
 * one cascade the rules describe: the class leaderboard is computed from the
 * point ledger, so points going off takes the board with it. That rule lives
 * in `academyFeatureRequires` and is enforced by the endpoint; applying it
 * here as well means the optimistic state matches the answer instead of
 * flickering when it arrives. A failure rolls the row back to exactly what the
 * server last said and names the error above the table.
 */
export function FeatureBoard({
  initialBoard,
}: {
  initialBoard: PlatformFeatureBoard | null;
}) {
  const { t } = useTranslation(['platform-settings', 'platform']);
  const { t: academy } = useLayoutTranslation('academy');
  const errorText = useErrorText();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: boardKey,
    queryFn: () => orpc.platformSettings.features({}),
    ...(initialBoard ? { initialData: initialBoard } : {}),
  });

  const mutation = useMutation({
    mutationFn: (input: {
      academyId: string;
      feature: AcademyFeatureName;
      isEnabled: boolean;
    }) => orpc.academyFeatures.setEnabled(input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: boardKey });
      const previous = queryClient.getQueryData<PlatformFeatureBoard>(boardKey);
      queryClient.setQueryData<PlatformFeatureBoard>(boardKey, (board) =>
        board
          ? {
              ...board,
              rows: board.rows.map((row) =>
                row.academyId === input.academyId
                  ? { ...row, features: applyLocally(row.features, input) }
                  : row,
              ),
            }
          : board,
      );
      return { previous };
    },
    onError: (_error, _input, context) => {
      // Back to what the server last said, not to what the switch looked like
      // a moment ago — those differ once a cascade has been applied.
      if (context?.previous) {
        queryClient.setQueryData(boardKey, context.previous);
      }
    },
    onSuccess: (next, input) => {
      queryClient.setQueryData<PlatformFeatureBoard>(boardKey, (board) =>
        board
          ? {
              ...board,
              rows: board.rows.map((row) =>
                row.academyId === input.academyId
                  ? { ...row, features: next.features }
                  : row,
              ),
            }
          : board,
      );
    },
  });

  const rows = React.useMemo(() => query.data?.rows ?? [], [query.data]);

  const columns = React.useMemo<ColumnDef<PlatformAcademyFeatureRow>[]>(
    () => [
      {
        id: 'academy',
        accessorFn: (row) => `${row.academyName} ${row.academySlug}`,
        header: t('platform:table.name'),
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0">
              {/* The name links to the academy it names. An operator who wants
                  more than a switch is one click from everything else. */}
              <Link
                className="block truncate text-[14px] font-bold text-ink hover:text-brand"
                href={routes.adminAcademy(row.original.academySlug)}
              >
                {row.original.academyName}
              </Link>
              <span className="block truncate font-mono text-[12px] text-sub">
                /{row.original.academySlug}
              </span>
            </div>
            {row.original.status !== 'ACTIVE' ? (
              <span className="shrink-0 rounded-full bg-retired-soft px-2 py-0.5 text-[11px] font-bold text-retired">
                {t(statusLabels[row.original.status])}
              </span>
            ) : null}
          </div>
        ),
      },
      ...academyFeatureNames.map<ColumnDef<PlatformAcademyFeatureRow>>(
        (feature) => {
          const style = featureStyles[feature];
          const label = academy(`settings.feature.${feature}.title`);
          return {
            id: feature,
            accessorFn: (row) =>
              row.features.find((state) => state.feature === feature)
                ?.isEnabled ?? false,
            enableSorting: false,
            header: () => (
              <span className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                <span
                  aria-hidden
                  className={cn('size-1.5 shrink-0 rounded-full', style.dot)}
                />
                {label}
              </span>
            ),
            cell: ({ row }) => {
              const record = row.original;
              const isEnabled =
                record.features.find((entry) => entry.feature === feature)
                  ?.isEnabled ?? false;
              const requires = academyFeatureRequires[feature];
              const requirementMet =
                !requires ||
                (record.features.find((entry) => entry.feature === requires)
                  ?.isEnabled ??
                  false);
              const archived = record.status === 'ARCHIVED';

              return (
                <span className="flex justify-center">
                  <Switch
                    checked={isEnabled}
                    /*
                     * A feature whose prerequisite is off cannot be switched on
                     * here, exactly as on the academy's own page — the
                     * leaderboard has nothing to rank without the point ledger.
                     * Turning it *off* stays available, so a board that somehow
                     * disagrees can always be settled downwards.
                     */
                    disabled={archived || (!requirementMet && !isEnabled)}
                    label={`${record.academyName} — ${label}`}
                    onCheckedChange={(next) =>
                      mutation.mutate({
                        academyId: record.academyId,
                        feature,
                        isEnabled: next,
                      })
                    }
                    tone={style.tone}
                  />
                </span>
              );
            },
          };
        },
      ),
    ],
    [academy, mutation, t],
  );

  return (
    <div className="grid gap-4">
      <FeatureTally rows={rows} />

      {mutation.isError ? (
        <p
          className="rounded-lg bg-danger/10 px-3 py-2 text-[13px] font-semibold text-danger"
          role="alert"
        >
          {errorText(mutation.error)}
        </p>
      ) : null}
      {query.isError ? (
        <p
          className="rounded-lg bg-danger/10 px-3 py-2 text-[13px] font-semibold text-danger"
          role="alert"
        >
          {errorText(query.error)}
        </p>
      ) : null}
      {/* Said plainly rather than paged. The board's promise is that it shows
          every academy at once; past the ceiling it stops being able to keep
          that promise and should say so instead of quietly answering about a
          subset. */}
      {query.data?.truncated ? (
        <p className="text-[13px] text-sub">
          {t('board.truncated', { count: query.data.total })}
        </p>
      ) : null}

      <DataTable
        columns={columns}
        data={rows}
        emptyMessage={t('platform:table.empty')}
        searchPlaceholder={t('board.search')}
      />
    </div>
  );
}

/**
 * How far each feature has spread, before a single row is read.
 *
 * The board's rows answer "does *this* academy have it on". The question an
 * operator usually arrives with is the other one — is this feature something
 * everybody runs or something two academies tried — and counting switches down
 * a column is a poor way to be told.
 *
 * A meter rather than a percentage: the comparison is between the four
 * features, and four bars of different lengths say it without arithmetic.
 */
function FeatureTally({ rows }: { rows: PlatformAcademyFeatureRow[] }) {
  const { t } = useTranslation(['platform-settings', 'platform']);
  const { t: academy } = useLayoutTranslation('academy');

  if (rows.length === 0) return null;

  return (
    <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
      {academyFeatureNames.map((feature) => {
        const style = featureStyles[feature];
        const Icon = style.icon;
        const on = rows.filter(
          (row) =>
            row.features.find((state) => state.feature === feature)?.isEnabled,
        ).length;
        const share = rows.length === 0 ? 0 : (on / rows.length) * 100;

        return (
          <div
            className="rounded-card border border-border bg-card p-3.5"
            key={feature}
          >
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className={cn(
                  'grid size-7 shrink-0 place-items-center rounded-lg',
                  style.chip,
                )}
              >
                <Icon className="size-3.5" />
              </span>
              <span className="min-w-0 truncate text-[12.5px] font-bold text-ink">
                {academy(`settings.feature.${feature}.title`)}
              </span>
            </div>
            <p className="mt-2 flex items-baseline gap-1">
              <span className="font-mono text-[19px] font-extrabold tabular-nums text-ink">
                {on}
              </span>
              <span className="text-[12.5px] text-sub">
                {t('board.of_academies', { count: rows.length })}
              </span>
            </p>
            <span
              aria-hidden
              className="mt-2 block h-1 overflow-hidden rounded-full bg-accent"
            >
              <span
                className={cn('block h-full rounded-full', style.meter)}
                style={{ width: `${share}%` }}
              />
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The change the server is about to make, applied locally first.
 *
 * Mirrors `academyFeatureRequires`, which the endpoint enforces: switching a
 * prerequisite off switches off everything that depends on it. Duplicated
 * deliberately and narrowly — the alternative is an optimistic state that
 * disagrees with the answer and flickers when it lands.
 */
function applyLocally(
  features: PlatformAcademyFeatureRow['features'],
  change: { feature: AcademyFeatureName; isEnabled: boolean },
): PlatformAcademyFeatureRow['features'] {
  return features.map((state) => {
    if (state.feature === change.feature) {
      return { ...state, isEnabled: change.isEnabled };
    }
    const dependsOnChanged =
      academyFeatureRequires[state.feature] === change.feature;
    if (dependsOnChanged && !change.isEnabled) {
      return { ...state, isEnabled: false };
    }
    return state;
  });
}
