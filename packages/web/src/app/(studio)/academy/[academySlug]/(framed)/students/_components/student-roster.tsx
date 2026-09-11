'use client';

import type {
  MembershipStatus,
  StudentRosterPage,
  StudentRosterRow,
  StudentRosterSortField,
} from '@cove/shared';
import {
  formatPhoneForDisplay,
  membershipStatuses,
  studentRosterSortFields,
} from '@cove/shared';
import type { ColumnDef } from '@tanstack/react-table';
import { GraduationCap, UserPen } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useAcademySlug } from '@/components/studio/academy-route-provider';
import { DataTable } from '@/components/studio/data-table';
import { FacetedFilter } from '@/components/studio/faceted-filter';
import { ProfileAvatar } from '@/components/studio/profile-avatar';
import { useErrorText } from '@/i18n/client/use-error-text';
import { routes } from '@/lib/routes';

import { PageSizePicker } from '../../_components/page-size-picker';
import {
  ClassChips,
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
import {
  useStudentRosterQuery,
  useStudentRosterState,
} from '../_hooks/use-student-roster';

/**
 * Every student in the academy, one server page at a time.
 *
 * The questions an office answers from here are "what is this child's ID",
 * "which class are they in", and "who do I call" — so those are the columns,
 * and each row opens the profile where anything can be changed. The table
 * itself changes nothing: every edit has one home, with its own permission and
 * audit trail, and a second way to make it would be a second place to check.
 */
export function StudentRoster({
  academyId,
  initialData,
  initialKey,
}: {
  academyId: string;
  initialData: StudentRosterPage | null;
  initialKey: string;
}) {
  const academySlug = useAcademySlug();
  const { t, i18n } = useTranslation('people-rosters');
  const { t: tManager } = useTranslation('manager');
  const errorText = useErrorText();
  const { query, change } = useStudentRosterState();
  const page = useStudentRosterQuery(academyId, query, initialData, initialKey);

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

  const columns = React.useMemo<ColumnDef<StudentRosterRow>[]>(
    () => [
      {
        id: 'displayName',
        accessorFn: (row) => row.displayName,
        header: t('students.column.student'),
        // Unsized: every other column is fixed, so this one absorbs the slack
        // and truncates rather than pushing the table into a scrollbar.
        cell: ({ row }) => (
          <Link
            className="flex min-w-0 items-center gap-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            href={routes.academyPerson(academySlug, row.original.membershipId)}
          >
            <ProfileAvatar
              academyImageUrl={row.original.academyImageUrl}
              externalAvatarUrl={row.original.externalAvatarUrl}
              globalImageUrl={row.original.globalImageUrl}
              name={row.original.displayName}
              size="sm"
            />
            <span className="block min-w-0 truncate font-bold text-ink">
              {row.original.displayName}
            </span>
          </Link>
        ),
      },
      {
        id: 'username',
        accessorFn: (row) => row.username,
        header: t('students.column.id'),
        size: 128,
        enableHiding: false,
        cell: ({ row }) => <UsernameCell username={row.original.username} />,
      },
      {
        id: 'studentNumber',
        accessorFn: (row) => row.studentNumber,
        header: t('students.column.number'),
        size: 104,
        cell: ({ row }) => (
          <span className="block truncate font-mono text-[12.5px] tabular-nums text-sub">
            {row.original.studentNumber ?? t('not_set')}
          </span>
        ),
      },
      {
        id: 'classes',
        accessorFn: (row) => row.classes.length,
        header: t('students.column.classes'),
        enableSorting: false,
        size: 180,
        meta: { hideable: true },
        cell: ({ row }) => (
          <ClassChips
            classes={row.original.classes}
            emptyLabel={t('students.no_class')}
          />
        ),
      },
      {
        // Sorted by grade, which is what "school · grade" is looked up by;
        // the school name rides along as context.
        id: 'schoolGrade',
        accessorFn: (row) => row.schoolGrade,
        header: t('students.column.school'),
        size: 160,
        cell: ({ row }) => {
          const parts = [row.original.schoolName, row.original.schoolGrade]
            .map((part) => part?.trim())
            .filter(Boolean);
          return (
            <span
              className="block truncate text-[13px] text-ink"
              title={parts.join(' · ')}
            >
              {parts.length > 0 ? parts.join(' · ') : (
                <span className="text-sub">{t('not_set')}</span>
              )}
            </span>
          );
        },
      },
      {
        id: 'guardian',
        accessorFn: (row) => row.guardianName,
        header: t('students.column.guardian'),
        enableSorting: false,
        size: 160,
        meta: { hideable: true },
        cell: ({ row }) =>
          row.original.guardianName || row.original.guardianPhone ? (
            <span className="block min-w-0">
              <span className="block truncate text-[13px] text-ink">
                {row.original.guardianName ?? t('not_set')}
              </span>
              {row.original.guardianPhone ? (
                <span className="block truncate font-mono text-[12px] tabular-nums text-sub">
                  {formatPhoneForDisplay(row.original.guardianPhone)}
                </span>
              ) : null}
            </span>
          ) : (
            <span className="text-sub">{t('not_set')}</span>
          ),
      },
      {
        id: 'status',
        accessorFn: (row) => row.status,
        header: t('students.column.status'),
        size: 104,
        enableHiding: false,
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'joinedAt',
        accessorFn: (row) => row.joinedAt,
        header: t('students.column.joined'),
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
        cell: ({ row }) => (
          <ProfileLinkCell
            href={routes.academyPerson(academySlug, row.original.membershipId)}
            label={t('view_profile', { name: row.original.displayName })}
            icon={UserPen}
          />
        ),
      },
    ],
    [academySlug, i18n.language, t, tManager],
  );

  if (page.isError && !data) {
    return (
      <RosterFailure
        message={errorText(page.error, t('failed'))}
        onRetry={() => void page.refetch()}
        retryLabel={tManager('retry')}
        title={t('students.title')}
      />
    );
  }

  const unfiltered =
    query.search === '' &&
    query.statuses.length === 0 &&
    query.classIds.length === 0;

  return (
    <div className="flex flex-col gap-3">
      <DataTable
        columns={columns}
        data={rows}
        emptyMessage={
          unfiltered
            ? t('students.empty_academy_title')
            : t('students.empty_title')
        }
        initialColumnVisibility={{ joinedAt: false }}
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
            const sort = studentRosterSortFields.find(
              (field): field is StudentRosterSortField => field === first.id,
            );
            if (!sort) return;
            change({ sort, direction: first.desc ? 'desc' : 'asc' });
          },
          onGlobalFilterChange: setSearchInput,
          onColumnFiltersChange: () => {},
        }}
        pageSize={query.pageSize}
        searchPlaceholder={t('students.search_placeholder')}
        toolbarFilters={
          <>
            <FacetedFilter
              onSelectedChange={(values) => change({ classIds: values })}
              options={(data?.facets.classes ?? []).map((facet) => ({
                label: facet.name,
                value: facet.id,
                count: facet.count,
              }))}
              selected={query.classIds}
              showCounts
              title={t('students.filter_class')}
            />
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
              title={t('students.filter_status')}
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
          unfiltered ? t('students.empty_academy_body') : t('students.empty_body')
        }
        emptyIcon={GraduationCap}
        emptyTitle={
          unfiltered
            ? t('students.empty_academy_title')
            : t('students.empty_title')
        }
        page={data ?? null}
        rowCount={rows.length}
        showingLabel={(from, to) => t('showing', { from, to, total })}
        title={t('students.title')}
      />
    </div>
  );
}
