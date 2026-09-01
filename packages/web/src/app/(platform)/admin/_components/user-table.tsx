'use client';

import type { ListPlatformUsersResult, PlatformUserSummary } from '@cove/shared';
import { academyRoles, membershipStatuses, userStatuses } from '@cove/shared';
import type { ColumnDef, ColumnFiltersState } from '@tanstack/react-table';
import { formatShortDate } from '@cove/i18n/format';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { DataTable } from '@/components/studio/data-table';
import { facetSelection } from '@/components/studio/data-table-state';
import { useLocale } from '@/i18n';
import { cn } from '@/lib/utils';

import {
  usePlatformUsersQuery,
  usePlatformUsersState,
} from '../_hooks/use-platform-users';
import { useRoleChange } from './user-action-dialogs';
import {
  affiliationOf,
  operatorPlateStyles,
  userDisplayName,
} from '../_lib/user-view';
import { UserAvatar } from './user-avatar';
import { UserComposition } from './user-composition';
import { UserExportButton } from './user-export-button';
import { UserRowActions } from './user-row-actions';
import { UserRoleCell } from './user-role-cell';
import { UserStatusChip } from './user-status-chip';

/**
 * The value the Academy facet uses for "belongs to no academy at all".
 *
 * A sentinel in the facet rather than a second control, because to an operator
 * it is one question — *which academy* — and "none" is one of its answers.
 * It maps to `unaffiliatedOnly`, never into `academyIds`: the flag exists
 * precisely because a sentinel uuid would be a lie the database had to be
 * taught to read.
 */
const NO_ACADEMY = 'none';

/**
 * Every account on Cove, in the table the rest of the product uses.
 *
 * Server-paged, because this list is the whole platform rather than one
 * academy's roster — so the table runs in its manual mode and the address owns
 * the query. Everything else is the `DataTable` a manager already knows: the
 * same search box, the same facet chips, the same paging controls.
 *
 * ## Colour
 *
 * Two channels, two meanings, never crossed (§3.1 of the console people
 * operations design). **Hue** says what a person is — the four academy role
 * hues, shared with the manager's own pages so the same teacher is the same
 * violet in both. **Loudness** says whether the account is in trouble — a
 * quiet dot for `ACTIVE`, a filled chip for everything else. A suspended
 * teacher is a violet role chip beside a red status chip: two facts, legible
 * separately.
 *
 * The summary strip is rendered here rather than by the page above, so its
 * counts move with the filters: an operator who narrows to one academy is
 * shown that academy's composition, not the platform's.
 */
export function UserTable({
  initialData,
  initialKey,
}: {
  initialData: ListPlatformUsersResult | null;
  initialKey: string;
}) {
  const { t } = useTranslation('platform-users');
  const locale = useLocale();
  const router = useRouter();

  const { query, change } = usePlatformUsersState();
  const result = usePlatformUsersQuery(query, initialData, initialKey);
  const page = result.data;

  const refetch = React.useCallback(() => {
    void result.refetch();
    // The account page reads the same rows on its own next visit, and a role
    // change moves what the row says about an academy it is not fetching here.
    router.refresh();
  }, [result, router]);

  const columns = React.useMemo<ColumnDef<PlatformUserSummary>[]>(
    () => [
      {
        // The one unsized column, so it absorbs the slack and truncates: a
        // name and an email are the longest things here and the only two the
        // operator actually reads across. `layout="fixed"` requires every
        // other column to declare a width.
        id: 'person',
        header: t('table.person'),
        enableSorting: false,
        cell: ({ row }) => {
          const person = row.original;
          return (
            <div className="flex min-w-0 items-center gap-2.5">
              <UserAvatar person={person} />
              <div className="min-w-0">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[14px] font-bold text-ink">
                    {userDisplayName(person)}
                  </span>
                  {/* The only solid chip in the table (§3.3). Platform
                      authority is a different axis from an academy role, so it
                      reads as weight rather than as a fifth hue — and
                      mistaking an operator for a customer is the expensive
                      mistake this exists to prevent. */}
                  {person.platformRole === 'ADMIN' ? (
                    <span
                      className={cn(
                        'inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-px text-[10.5px] font-bold uppercase tracking-wide',
                        operatorPlateStyles,
                      )}
                    >
                      <ShieldCheck className="size-3" strokeWidth={2.5} />
                      {t('table.operator')}
                    </span>
                  ) : null}
                </span>
                {/* The operator's handle for a person is their email — it is
                    what a support message quotes and what they paste into the
                    search box. Mono so the column scans as one shape, exactly
                    as the academy table sets its slugs. */}
                <span className="block truncate font-mono text-[12px] text-sub">
                  {person.email ?? person.username ?? '—'}
                </span>
              </div>
            </div>
          );
        },
      },
      {
        // Lifted out of the affiliation cell's second line, where the page's
        // most important fact was set in its smallest type, and made a control
        // rather than a label — the same coloured badge that opens the same
        // radio menu on the manager's own people table.
        id: 'role',
        header: t('table.role'),
        enableSorting: false,
        size: 168,
        cell: ({ row }) => (
          <RoleControl onUpdated={refetch} person={row.original} />
        ),
      },
      {
        id: 'affiliation',
        header: t('table.affiliation'),
        enableSorting: false,
        size: 200,
        cell: ({ row }) => {
          const { lead, others } = affiliationOf(row.original);
          if (!lead) {
            return (
              <span className="text-[13.5px] text-sub/60">
                {t('table.no_academy')}
              </span>
            );
          }
          return (
            <div className="min-w-0">
              <span className="flex min-w-0 items-baseline gap-1.5">
                <span className="truncate text-[13.5px] font-semibold text-ink">
                  {lead.academyName}
                </span>
                {others > 0 ? (
                  // A count, not more chips. Four academies would otherwise
                  // make this row four times the height of its neighbours, and
                  // a table with uneven rows cannot be scanned — which is the
                  // only thing this table is for. The rest are on the account
                  // page, where there is room to list them properly.
                  <span className="shrink-0 rounded bg-muted px-1.5 py-px text-[11px] font-semibold tabular-nums text-sub">
                    {t('table.more', { count: others })}
                  </span>
                ) : null}
              </span>
              {lead.status !== 'ACTIVE' ? (
                <span className="block truncate text-[12px] text-danger">
                  {t(`membership_status.${lead.status}`)}
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        id: 'status',
        header: t('table.status'),
        enableSorting: false,
        size: 132,
        cell: ({ row }) => <UserStatusChip status={row.original.status} />,
      },
      {
        id: 'joined',
        header: t('table.joined'),
        enableSorting: false,
        size: 108,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-[13.5px] text-sub">
            {formatShortDate(row.original.createdAt, locale)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        size: 96,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-0.5">
            {/* Out of the menu and beside it. Opening the account is what
                nearly every row is clicked for, and a common action behind two
                clicks to keep a destructive one company is the wrong trade. */}
            <Link
              aria-label={t('action.open')}
              className="group grid size-8 place-items-center rounded-md text-sub transition-colors hover:bg-brand-soft hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              href={`/admin/users/${row.original.userId}`}
              onClick={(event) => event.stopPropagation()}
              title={t('action.open')}
            >
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <UserRowActions
              onUpdated={refetch}
              person={row.original}
              showRoleChange={false}
            />
          </div>
        ),
      },
    ],
    [locale, refetch, t],
  );

  const facets = React.useMemo(
    () => [
      {
        columnId: 'academy',
        title: t('facet.academy'),
        options: [
          { label: t('facet.no_academy'), value: NO_ACADEMY },
          ...(page?.academyOptions ?? []).map((academy) => ({
            label: academy.name,
            value: academy.id,
          })),
        ],
      },
      {
        // Back in the toolbar, where every other narrowing already lives. It
        // was pulled out when the lens rail owned the role axis; with the rail
        // gone this is the only role control, and a `+` chip is the shape the
        // operator already knows from the three beside it.
        columnId: 'role',
        title: t('facet.role'),
        options: academyRoles.map((role) => ({
          label: t(`role.${role}`),
          value: role,
        })),
      },
      {
        columnId: 'status',
        title: t('facet.account_status'),
        options: userStatuses.map((status) => ({
          label: t(`account_status.${status}`),
          value: status,
        })),
      },
      {
        columnId: 'mstatus',
        title: t('facet.membership_status'),
        options: membershipStatuses.map((status) => ({
          label: t(`membership_status.${status}`),
          value: status,
        })),
      },
    ],
    [page?.academyOptions, t],
  );

  const columnFilters = React.useMemo<ColumnFiltersState>(() => {
    const filters: ColumnFiltersState = [];
    const academy = [
      ...(query.unaffiliatedOnly ? [NO_ACADEMY] : []),
      ...(query.academyIds ?? []),
    ];
    if (academy.length > 0) {
      filters.push({ id: 'academy', value: academy });
    }
    if (query.roles?.length) {
      filters.push({ id: 'role', value: query.roles });
    }
    if (query.accountStatuses?.length) {
      filters.push({ id: 'status', value: query.accountStatuses });
    }
    if (query.membershipStatuses?.length) {
      filters.push({ id: 'mstatus', value: query.membershipStatuses });
    }
    return filters;
  }, [query]);

  const rowCount = page?.total ?? 0;

  return (
    <div className="grid gap-5">
      {page ? <UserComposition composition={page.composition} /> : null}
      <DataTable
        columns={columns}
        data={page?.people ?? []}
        emptyMessage={t('table.empty')}
        layout="fixed"
        loadingLabel={t('table.loading')}
        manual={{
          pageIndex: query.page - 1,
          pageCount: Math.max(1, Math.ceil(rowCount / query.pageSize)),
          rowCount,
          sorting: [],
          globalFilter: query.query ?? '',
          columnFilters,
          pending: result.isFetching,
          onPageIndexChange: (pageIndex) => change({ page: pageIndex + 1 }),
          onSortingChange: () => undefined,
          onGlobalFilterChange: (value) => change({ query: value }),
          onColumnFiltersChange: (filters) => {
            const academy = facetSelection(filters, 'academy');
            change({
              academyIds: academy.filter((value) => value !== NO_ACADEMY),
              unaffiliatedOnly: academy.includes(NO_ACADEMY),
              roles: facetSelection(
                filters,
                'role',
              ) as typeof academyRoles[number][],
              accountStatuses: facetSelection(
                filters,
                'status',
              ) as typeof userStatuses[number][],
              membershipStatuses: facetSelection(
                filters,
                'mstatus',
              ) as typeof membershipStatuses[number][],
            });
          },
        }}
        facets={facets}
        onRowClick={(person) => router.push(`/admin/users/${person.userId}`)}
        searchPlaceholder={t('table.search')}
        showColumnVisibility={false}
        toolbarActions={
          <UserExportButton composition={page?.composition} query={query} />
        }
      />
    </div>
  );
}

/**
 * The Role cell and the dialogs its menu opens, per row.
 *
 * A component rather than an inline cell because the flow holds state: which
 * membership was picked, and whether the per-academy dialog is open. A cell
 * renderer cannot hold a hook, and lifting the state to the table would make
 * one open dialog per page of rows.
 */
function RoleControl({
  onUpdated,
  person,
}: {
  onUpdated: () => void;
  person: PlatformUserSummary;
}) {
  const role = useRoleChange(person, onUpdated);
  return (
    <>
      <UserRoleCell
        onPick={role.pick}
        onPickMany={role.pickMany}
        person={person}
      />
      {role.dialogs}
    </>
  );
}
