'use client';

import type {
  MembershipStatus,
  StaffRosterPage,
  StaffRosterRow,
  StaffRosterSortField,
} from '@cove/shared';
import {
  formatPhoneForDisplay,
  membershipStatuses,
  staffRosterSortFields,
} from '@cove/shared';
import type { ColumnDef } from '@tanstack/react-table';
import { BriefcaseBusiness } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useAcademySlug } from '@/components/studio/academy-route-provider';
import { DataTable } from '@/components/studio/data-table';
import { FacetedFilter } from '@/components/studio/faceted-filter';
import { PageSizePicker } from '@/components/studio/page-size-picker';
import { ProfileAvatar } from '@/components/studio/profile-avatar';
import { useErrorText } from '@/i18n/client/use-error-text';
import { routes } from '@/lib/routes';

import {
  ClassChips,
  RoleChips,
  StatusBadge,
  UsernameCell,
} from '../../_components/people-cells';
import {
  ProfileLinkCell,
  RosterFailure,
  RosterFooter,
} from '../../_components/roster-parts';
import { useDebouncedSearch } from '../../_hooks/use-url-table-query';
import { compactDate } from '../../_lib/compact-date';
import { useStaffRosterQuery, useStaffRosterState } from '../_hooks/use-staff-roster';

/**
 * Everyone who teaches here, one server page at a time.
 *
 * Built around people who hold several roles. The fetch asks "holds TEACHER",
 * so the director who also teaches is listed; the role sort orders by the
 * highest role held, so they sit with the managers; and the Roles column shows
 * every chip rather than the highest and a `+1`, because "what else does this
 * person do here" is the question the page is opened to answer.
 *
 * Read-only, like the Students roster: role changes stay on Members and on the
 * profile, which own the confirmation and the audit trail for them.
 */
export function StaffRoster({
  academyId,
  initialData,
  initialKey,
}: {
  academyId: string;
  initialData: StaffRosterPage | null;
  initialKey: string;
}) {
  const academySlug = useAcademySlug();
  const { t, i18n } = useTranslation('people-rosters');
  const { t: tManager } = useTranslation('manager');
  const errorText = useErrorText();
  const { query, change } = useStaffRosterState();
  const page = useStaffRosterQuery(academyId, query, initialData, initialKey);

  const commitSearch = React.useCallback(
    (search: string) => change({ search }),
    [change],
  );
  const [searchInput, setSearchInput] = useDebouncedSearch(
    query.search,
    commitSearch,
  );

  const data = page.data;
  const rows = React.useMemo(() => data?.rows ?? [], [data?.rows]);
  const total = data?.total ?? 0;
  const anyMultiRole = rows.some((row) => row.roles.length > 1);
  /** Withheld until the server says otherwise — see the Students roster. */
  const canManageMembers = data?.viewer.canManageMembers ?? false;

  const columns = React.useMemo<ColumnDef<StaffRosterRow>[]>(
    () => [
      {
        id: 'displayName',
        accessorFn: (row) => row.displayName,
        header: t('teachers.column.teacher'),
        cell: ({ row }) => (
          <Link
            className="flex min-w-0 items-center gap-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            href={routes.academyStaffMember(academySlug, row.original.membershipId)}
          >
            <ProfileAvatar
              academyImageUrl={row.original.academyImageUrl}
              externalAvatarUrl={row.original.externalAvatarUrl}
              globalImageUrl={row.original.globalImageUrl}
              name={row.original.displayName}
              size="sm"
            />
            <span className="min-w-0">
              <span className="block truncate font-bold text-ink">
                {row.original.displayName}
              </span>
              {row.original.email ? (
                <span className="block truncate text-[12px] text-sub">
                  {row.original.email}
                </span>
              ) : null}
            </span>
          </Link>
        ),
      },
      {
        id: 'username',
        accessorFn: (row) => row.username,
        header: t('teachers.column.id'),
        size: 128,
        enableHiding: false,
        cell: ({ row }) => <UsernameCell username={row.original.username} />,
      },
      {
        // Sorts by the highest role held; shows all of them.
        id: 'role',
        accessorFn: (row) => row.role,
        header: t('teachers.column.roles'),
        size: 188,
        enableHiding: false,
        cell: ({ row }) => <RoleChips roles={row.original.roles} />,
      },
      {
        id: 'title',
        accessorFn: (row) => row.academyTitle,
        header: t('teachers.column.title'),
        enableSorting: false,
        size: 132,
        meta: { hideable: true },
        cell: ({ row }) => (
          <span
            className="block truncate text-[13px] text-ink"
            title={row.original.academyTitle ?? undefined}
          >
            {row.original.academyTitle ?? (
              <span className="text-sub">{t('not_set')}</span>
            )}
          </span>
        ),
      },
      {
        id: 'classes',
        accessorFn: (row) =>
          row.homeroomClasses.length + row.assistantClasses.length,
        header: t('teachers.column.classes'),
        enableSorting: false,
        size: 180,
        meta: { hideable: true },
        cell: ({ row }) => (
          <ClassChips
            classes={[
              ...row.original.homeroomClasses,
              ...row.original.assistantClasses.map((entry) => ({
                ...entry,
                suffix: t('teachers.assistant_suffix'),
              })),
            ]}
            emptyLabel={t('teachers.no_class')}
          />
        ),
      },
      /* Withheld from a reader who may not manage members. See the Students
         roster's guardian column for why these are not built rather than
         hidden. */
      ...(canManageMembers
        ? ([
            {
              id: 'phone',
              accessorFn: (row) => row.contactPhone,
              header: t('teachers.column.phone'),
              enableSorting: false,
              size: 136,
              meta: { hideable: true },
              cell: ({ row }) =>
                row.original.contactPhone ? (
                  <span className="block truncate font-mono text-[12.5px] tabular-nums text-ink">
                    {formatPhoneForDisplay(row.original.contactPhone)}
                  </span>
                ) : (
                  <span className="text-sub">{t('not_set')}</span>
                ),
            },
          ] satisfies ColumnDef<StaffRosterRow>[])
        : []),
      {
        id: 'status',
        accessorFn: (row) => row.status,
        header: t('teachers.column.status'),
        size: 104,
        enableHiding: false,
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      ...(canManageMembers
        ? ([
            {
              id: 'employeeNumber',
              accessorFn: (row) => row.employeeNumber,
              header: t('teachers.column.employee_number'),
              size: 104,
              cell: ({ row }) => (
                <span className="block truncate font-mono text-[12.5px] tabular-nums text-sub">
                  {row.original.employeeNumber ?? t('not_set')}
                </span>
              ),
            },
          ] satisfies ColumnDef<StaffRosterRow>[])
        : []),
      {
        id: 'joinedAt',
        accessorFn: (row) => row.joinedAt,
        header: t('teachers.column.joined'),
        size: 112,
        meta: { align: 'right' },
        cell: ({ row }) =>
          row.original.joinedAt ? (
            <span className="whitespace-nowrap font-mono text-[12px] tabular-nums text-sub">
              {compactDate(row.original.joinedAt, i18n.language)}
            </span>
          ) : (
            <span className="text-[12px] italic text-sub">
              {tManager('people.not_joined')}
            </span>
          ),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        enableHiding: false,
        size: 56,
        // §5.1 — the detail page, for every reader. See the Students roster.
        cell: ({ row }) => (
          <ProfileLinkCell
            href={routes.academyStaffMember(
              academySlug,
              row.original.membershipId,
            )}
            label={t('view_profile', { name: row.original.displayName })}
          />
        ),
      },
    ],
    [academySlug, canManageMembers, i18n.language, t, tManager],
  );

  if (page.isError && !data) {
    return (
      <RosterFailure
        message={errorText(page.error, t('failed'))}
        onRetry={() => void page.refetch()}
        retryLabel={tManager('retry')}
        title={t('teachers.title')}
      />
    );
  }

  // `roles` is pinned by the page, not chosen by the reader, so it is not one
  // of the filters an empty table should offer to clear.
  const unfiltered = query.search === '' && query.statuses.length === 0;

  return (
    <div className="flex flex-col gap-3">
      <DataTable
        columns={columns}
        data={rows}
        emptyMessage={
          unfiltered ? t('teachers.empty_academy_title') : t('teachers.empty_title')
        }
        initialColumnVisibility={{ employeeNumber: false, joinedAt: false }}
        layout="fixed"
        loadingLabel={t('loading')}
        manual={{
          pageIndex: (data?.page ?? query.page) - 1,
          pageCount: data?.pageCount ?? 1,
          rowCount: total,
          sorting: [{ id: query.sort, desc: query.direction === 'desc' }],
          globalFilter: searchInput,
          columnFilters: [],
          pending: page.isFetching || page.isPlaceholderData,
          onPageIndexChange: (pageIndex) => change({ page: pageIndex + 1 }),
          onSortingChange: (next) => {
            const first = next[0];
            if (!first) return;
            const sort = staffRosterSortFields.find(
              (field): field is StaffRosterSortField => field === first.id,
            );
            if (!sort) return;
            change({ sort, direction: first.desc ? 'desc' : 'asc' });
          },
          onGlobalFilterChange: setSearchInput,
          onColumnFiltersChange: () => {},
        }}
        pageSize={query.pageSize}
        searchPlaceholder={t('teachers.search_placeholder')}
        toolbarFilters={
          <>
            {/* No role facet. The page is about teaching, so every row holds
                TEACHER and a filter over one value filters nothing — the
                chips in the Roles column still say what else a person is. */}
            <FacetedFilter
              onSelectedChange={(values) =>
                change({
                  statuses: membershipStatuses.filter((status) =>
                    values.includes(status),
                  ) as MembershipStatus[],
                })
              }
              options={membershipStatuses.map((status) => ({
                label: tManager(`status.${status}`),
                value: status,
                count:
                  data?.facets.statuses.find((facet) => facet.value === status)
                    ?.count ?? 0,
              }))}
              selected={query.statuses}
              showCounts
              title={t('teachers.filter_status')}
            />
          </>
        }
        toolbarActions={
          <PageSizePicker
            onChange={(pageSize) => change({ pageSize })}
            value={query.pageSize}
          />
        }
      />

      <RosterFooter
        emptyBody={
          unfiltered ? t('teachers.empty_academy_body') : t('teachers.empty_body')
        }
        emptyIcon={BriefcaseBusiness}
        emptyTitle={
          unfiltered ? t('teachers.empty_academy_title') : t('teachers.empty_title')
        }
        page={data ?? null}
        rowCount={rows.length}
        showingLabel={(from, to) => t('showing', { from, to, total })}
        title={t('teachers.title')}
      />

      {/* Said once, and only when it applies: the role counts add up to more
          than the total because someone on screen holds two roles. */}
      {anyMultiRole ? (
        <p className="text-[12px] text-sub">{t('teachers.multi_role_note')}</p>
      ) : null}
    </div>
  );
}
