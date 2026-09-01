'use client';

import type {
  ListPlatformUsersResult,
  UserLens,
  PlatformUserSummary,
} from '@cove/shared';
import {
  academyRoles,
  membershipStatuses,
  userStatuses,
} from '@cove/shared';
import type { ColumnDef, ColumnFiltersState } from '@tanstack/react-table';
import { formatShortDate } from '@cove/i18n/format';
import { ArrowRight, Shield } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { DataTable } from '@/components/studio/data-table';
import { facetSelection } from '@/components/studio/data-table-state';
import { useLocale } from '@/i18n';

import {
  usePlatformUsersQuery,
  usePlatformUsersState,
} from '../_hooks/use-platform-users';
import { affiliationOf, userDisplayName } from '../_lib/user-view';
import { UserAvatar } from './user-avatar';
import { UserStatusChip } from './user-status-chip';

/**
 * Every account on Cove, in the table the rest of the product uses.
 *
 * Server-paged, because this list is the whole platform rather than one
 * academy's roster — so the table runs in its manual mode and the address owns
 * the query. Everything else is the `DataTable` a manager already knows: the
 * same search box, the same facet chips, the same paging controls.
 *
 * The two columns that are not obvious are `person` and `affiliation`, and they
 * carry this page's whole design. See their cells.
 */
export function UserTable({
  initialData,
  initialKey,
  lens,
}: {
  initialData: ListPlatformUsersResult | null;
  initialKey: string;
  lens: UserLens;
}) {
  const { t } = useTranslation('platform-users');
  const locale = useLocale();
  const router = useRouter();

  const { query, change } = usePlatformUsersState(lens);
  const result = usePlatformUsersQuery(lens, query, initialData, initialKey);
  const page = result.data;

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
                  {/* A platform operator is a different kind of account from
                      every other row, and mistaking one for a customer is the
                      expensive mistake. Rare enough to cost the column
                      nothing. */}
                  {person.platformRole === 'ADMIN' ? (
                    <Shield
                      aria-label={t('table.operator')}
                      className="size-3.5 shrink-0 text-brand"
                    />
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
        id: 'affiliation',
        header: t('table.affiliation'),
        enableSorting: false,
        size: 220,
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
              <span className="block truncate text-[12px] text-sub">
                {t(`role.${lead.role}`)}
                {lead.status !== 'ACTIVE' ? (
                  <span className="text-danger">
                    {' · '}
                    {t(`membership_status.${lead.status}`)}
                  </span>
                ) : null}
              </span>
            </div>
          );
        },
      },
      {
        id: 'status',
        header: t('table.status'),
        enableSorting: false,
        size: 150,
        cell: ({ row }) => <UserStatusChip status={row.original.status} />,
      },
      {
        id: 'joined',
        header: t('table.joined'),
        enableSorting: false,
        size: 120,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-[13.5px] text-sub">
            {formatShortDate(row.original.createdAt, locale)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: t('table.actions'),
        enableSorting: false,
        size: 110,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Link
              className="group inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg bg-brand-soft px-3.5 text-[13.5px] font-bold text-brand transition-colors hover:bg-brand hover:text-on-brand"
              href={`/admin/users/${row.original.userId}`}
              onClick={(event) => event.stopPropagation()}
            >
              {t('table.open')}
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        ),
      },
    ],
    [locale, t],
  );

  const facets = React.useMemo(() => {
    const list = [
      {
        columnId: 'academy',
        title: t('facet.academy'),
        options: (page?.academyOptions ?? []).map((academy) => ({
          label: academy.name,
          value: academy.id,
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
    ];
    // The role facet is the lens on every page but "everyone", where it is a
    // filter like any other. Offering it twice would let an operator set it to
    // something the path contradicts.
    if (lens === 'everyone') {
      list.splice(1, 0, {
        columnId: 'role',
        title: t('facet.role'),
        options: academyRoles.map((role) => ({
          label: t(`role.${role}`),
          value: role,
        })),
      });
    }
    return list;
  }, [lens, page?.academyOptions, t]);

  const columnFilters = React.useMemo<ColumnFiltersState>(() => {
    const filters: ColumnFiltersState = [];
    if (query.academyIds?.length) {
      filters.push({ id: 'academy', value: query.academyIds });
    }
    if (lens === 'everyone' && query.roles?.length) {
      filters.push({ id: 'role', value: query.roles });
    }
    if (query.accountStatuses?.length) {
      filters.push({ id: 'status', value: query.accountStatuses });
    }
    if (query.membershipStatuses?.length) {
      filters.push({ id: 'mstatus', value: query.membershipStatuses });
    }
    return filters;
  }, [lens, query]);

  const rowCount = page?.total ?? 0;

  return (
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
        onColumnFiltersChange: (filters) =>
          change({
            academyIds: facetSelection(filters, 'academy'),
            roles:
              lens === 'everyone'
                ? (facetSelection(filters, 'role') as typeof academyRoles[number][])
                : query.roles,
            accountStatuses: facetSelection(
              filters,
              'status',
            ) as typeof userStatuses[number][],
            membershipStatuses: facetSelection(
              filters,
              'mstatus',
            ) as typeof membershipStatuses[number][],
          }),
      }}
      facets={facets}
      onRowClick={(person) => router.push(`/admin/users/${person.userId}`)}
      searchPlaceholder={t('table.search')}
      showColumnVisibility={false}
    />
  );
}
