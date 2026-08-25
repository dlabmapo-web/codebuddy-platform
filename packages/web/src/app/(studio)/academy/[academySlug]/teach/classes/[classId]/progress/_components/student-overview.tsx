'use client';

import {
  teacherProgressStatuses,
  type TeacherAttentionKind,
  type TeacherProgressStatus,
  type TeacherStudentProgressRow,
  type TeacherStudentsResult,
} from '@cove/shared';
import { formatDateTime } from '@cove/i18n/format';
import type { ColumnDef, ColumnFiltersState } from '@tanstack/react-table';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { DataTable } from '@/components/studio/data-table';
import type { TableFacet } from '@/components/studio/faceted-filter';
import { useLocale } from '@/i18n';

import type { ProgressState } from '../_hooks/use-teacher-progress';
import { isFiltered } from '../_lib/progress-view';
import type { ProgressQuery } from '../_lib/progress-url';
import { AttentionSummary } from './attention-reasons';
import { EmptyState, Meter, StaleBanner } from './progress-primitives';

/**
 * The class roster: everybody, with the students who may need a look first.
 *
 * The ordering is stated in words above the table rather than implied by
 * position, because a list that silently sorts people is a ranking whether or
 * not it is called one. §4 rules rankings out; naming the reason is what keeps
 * this a reading order.
 *
 * Every row carries an explicit Open control. Whole-row click is deliberately
 * not wired: a teacher selecting a name to copy it should not be navigated
 * somewhere.
 */

const facetKeys = ['course', 'status', 'attention'] as const;
type FacetKey = (typeof facetKeys)[number];

const facetField: Record<FacetKey, keyof ProgressQuery> = {
  course: 'courseIds',
  status: 'statuses',
  attention: 'attention',
};

export function StudentOverview({
  data,
  failed,
  pending,
  onRetry,
  state,
}: {
  data: TeacherStudentsResult;
  failed: boolean;
  pending: boolean;
  onRetry: () => void;
  state: ProgressState;
}) {
  const { t } = useTranslation('teach');
  const locale = useLocale();
  const { query } = state;

  const columns = React.useMemo<ColumnDef<TeacherStudentProgressRow>[]>(
    () => [
      {
        id: 'student',
        accessorFn: (row) => row.displayName,
        header: t('progress.roster.column_student'),
        enableHiding: false,
        cell: ({ row }) => (
          <StudentCell
            onOpen={() =>
              state.change({ membershipId: row.original.membershipId })
            }
            row={row.original}
            selected={query.membershipId === row.original.membershipId}
          />
        ),
      },
      {
        id: 'completion',
        accessorFn: (row) => row.completionPercent,
        header: t('progress.roster.column_progress'),
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex min-w-[9rem] flex-col gap-1.5">
            <span className="font-mono text-[12.5px] tabular-nums text-sub">
              {t('progress.roster.progress_value', {
                solved: row.original.solvedProblems,
                total: row.original.eligibleProblems,
              })}
            </span>
            <Meter
              label={t('progress.roster.progress_label', {
                name: row.original.displayName,
                solved: row.original.solvedProblems,
                total: row.original.eligibleProblems,
              })}
              percent={row.original.completionPercent}
            />
          </div>
        ),
      },
      {
        id: 'attempts',
        accessorFn: (row) => row.attempts,
        header: t('progress.roster.column_attempts'),
        meta: { hideable: true },
        cell: ({ row }) => (
          <span className="font-mono tabular-nums">{row.original.attempts}</span>
        ),
      },
      {
        id: 'accepted',
        accessorFn: (row) => row.acceptedPercent,
        header: t('progress.roster.column_accepted'),
        meta: { hideable: true },
        cell: ({ row }) => (
          <span className="font-mono tabular-nums">
            {row.original.acceptedPercent}%
          </span>
        ),
      },
      {
        id: 'lastActivity',
        accessorFn: (row) => row.lastActivityAt,
        header: t('progress.roster.column_activity'),
        meta: { hideable: true },
        cell: ({ row }) =>
          row.original.lastActivityAt ? (
            <time
              className="whitespace-nowrap text-sub"
              dateTime={row.original.lastActivityAt}
            >
              {formatDateTime(row.original.lastActivityAt, locale)}
            </time>
          ) : (
            <span className="text-sub">{t('progress.roster.never')}</span>
          ),
      },
      {
        id: 'attention',
        accessorFn: (row) => row.attentionCount,
        header: t('progress.roster.column_attention'),
        enableHiding: false,
        cell: ({ row }) => (
          <AttentionSummary
            count={row.original.attentionCount}
            kinds={row.original.attentionKinds}
          />
        ),
      },
      {
        id: 'open',
        header: '',
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <button
            aria-expanded={query.membershipId === row.original.membershipId}
            className="whitespace-nowrap rounded-md px-1 text-[13px] font-bold text-brand outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand/40"
            data-student-open={row.original.membershipId}
            onClick={() =>
              state.change({
                membershipId:
                  query.membershipId === row.original.membershipId
                    ? null
                    : row.original.membershipId,
              })
            }
            type="button"
          >
            {query.membershipId === row.original.membershipId
              ? t('progress.roster.close')
              : t('progress.roster.open')}
          </button>
        ),
      },
    ],
    [locale, query.membershipId, state, t],
  );

  const facets = React.useMemo<TableFacet[]>(
    () => [
      {
        columnId: 'course',
        title: t('progress.facet.course'),
        options: data.facets.courses.map((course) => ({
          label: course.label,
          value: course.value,
        })),
      },
      {
        columnId: 'status',
        title: t('progress.facet.status'),
        options: teacherProgressStatuses
          .filter((status) => data.facets.statuses.includes(status))
          .map((status) => ({
            label: t(`progress.status.${status}`),
            value: status,
          })),
      },
      {
        columnId: 'attention',
        title: t('progress.facet.attention'),
        // Only the reasons this class currently produces: an option that can
        // never match is a control that does nothing.
        options: data.facets.attention.map((kind) => ({
          label: t(`progress.attention.short_${kind}`),
          value: kind,
        })),
      },
    ],
    [data.facets, t],
  );

  const columnFilters = React.useMemo<ColumnFiltersState>(
    () =>
      facetKeys.flatMap((facet) => {
        const values = query[facetField[facet]] as string[];
        return values.length > 0 ? [{ id: facet, value: values }] : [];
      }),
    [query],
  );

  const applyFilters = React.useCallback(
    (next: ColumnFiltersState) => {
      const byId = new Map(next.map((filter) => [filter.id, filter.value]));
      state.change({
        courseIds: (byId.get('course') as string[]) ?? [],
        statuses: (byId.get('status') as TeacherProgressStatus[]) ?? [],
        attention: (byId.get('attention') as TeacherAttentionKind[]) ?? [],
        // A course change invalidates the module and lecture chosen under it.
        moduleId: null,
        lectureId: null,
      });
    },
    [state],
  );

  const filtered = isFiltered(query);

  // An enrolled-but-idle class and a filtered-to-nothing table are different
  // facts, and only one of them has an action.
  if (data.summary.activeStudents === 0) {
    return (
      <EmptyState
        body={t('progress.empty.no_students_body')}
        title={t('progress.empty.no_students_title')}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {failed ? <StaleBanner onRetry={onRetry} /> : null}

      <p className="text-[12.5px] leading-[1.5] text-sub">
        {t('progress.roster.ordering_note')}
      </p>

      <DataTable
        columns={columns}
        data={data.rows}
        emptyMessage={
          filtered
            ? t('progress.empty.no_results_body')
            : t('progress.empty.no_submissions_body')
        }
        facets={facets}
        loadingLabel={t('progress.loading')}
        manual={{
          pageIndex: data.pagination.page - 1,
          pageCount: data.pagination.pageCount,
          rowCount: data.pagination.totalCount,
          sorting: query.sort
            ? [{ id: query.sort, desc: query.direction === 'desc' }]
            : [],
          globalFilter: query.q,
          columnFilters,
          pending,
          onPageIndexChange: (pageIndex) => state.setPage(pageIndex + 1),
          onSortingChange: (sorting) => {
            const active = sorting[0];
            state.change(
              active
                ? {
                    sort: active.id as ProgressQuery['sort'],
                    direction: active.desc ? 'desc' : 'asc',
                  }
                : { sort: null, direction: 'desc' },
            );
          },
          onGlobalFilterChange: (value) => state.change({ q: value }),
          onColumnFiltersChange: applyFilters,
        }}
        pageSize={data.pagination.pageSize}
        searchPlaceholder={t('progress.search_students')}
        showColumnVisibility={false}
      />
    </div>
  );
}

function StudentCell({
  onOpen,
  row,
  selected,
}: {
  onOpen: () => void;
  row: TeacherStudentProgressRow;
  selected: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {/* An initial, not a photograph: the roster is about work, and a wall
          of avatars would make it about faces. */}
      <span
        aria-hidden
        className={`grid size-8 shrink-0 place-items-center rounded-full text-[12.5px] font-bold ${
          selected ? 'bg-brand text-on-brand' : 'bg-accent text-sub'
        }`}
      >
        {row.displayName.trim().charAt(0).toUpperCase()}
      </span>
      <button
        className="min-w-0 truncate rounded-sm text-left text-[13.5px] font-semibold underline-offset-2 outline-none hover:text-brand hover:underline focus-visible:ring-2 focus-visible:ring-brand/40"
        onClick={onOpen}
        type="button"
      >
        {row.displayName}
      </button>
    </div>
  );
}
