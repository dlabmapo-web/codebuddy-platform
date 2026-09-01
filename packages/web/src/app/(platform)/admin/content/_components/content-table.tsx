'use client';

import type {
  ContentLens,
  PlatformClass,
  PlatformCourse,
  PlatformProblem,
} from '@cove/shared';
import { formatShortDate } from '@cove/i18n/format';
import type { ColumnDef, ColumnFiltersState } from '@tanstack/react-table';
import { PenLine } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { DataTable } from '@/components/studio/data-table';
import { facetSelection } from '@/components/studio/data-table-state';
import { useLocale } from '@/i18n';

import {
  useContentQuery,
  useContentState,
  type ContentPage,
} from '../../_hooks/use-platform-content';
import { contentPaths, editInAcademyHref } from '../../_lib/content-view';

/**
 * Every academy's teaching, in the table the rest of the product uses.
 *
 * One component for all three lenses, because they differ only in their
 * columns: same search, same academy facet, same paging, same Edit action. The
 * alternative — three tables — would give the academy column three places to
 * drift, and the Edit rule is the thing that must never differ.
 */
export function ContentTable({
  initialData,
  initialKey,
  lens,
}: {
  initialData: ContentPage | null;
  initialKey: string;
  lens: ContentLens;
}) {
  const { t } = useTranslation('platform-content');
  const locale = useLocale();

  const { query, change } = useContentState(lens);
  const result = useContentQuery(lens, query, initialData, initialKey);
  const page = result.data;

  const academyColumn = React.useMemo<ColumnDef<never>>(
    () =>
      ({
        id: 'academy',
        header: t('table.academy'),
        enableSorting: false,
        size: 190,
        cell: ({ row }: { row: { original: { academyName: string; academySlug: string } } }) => (
          <div className="min-w-0">
            <span className="block truncate text-[13.5px] font-semibold text-ink">
              {row.original.academyName}
            </span>
            {/* The slug is the operator's handle for an academy, as it is on
                the academies table. Mono so the column scans as one shape. */}
            <span className="block truncate font-mono text-[12px] text-sub">
              /{row.original.academySlug}
            </span>
          </div>
        ),
      }) as unknown as ColumnDef<never>,
    [t],
  );

  const columns = React.useMemo(() => {
    const edit = (
      row: { academyId: string; academySlug: string },
      path: string,
    ) => (
      <div className="flex justify-end">
        <Link
          className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg bg-brand-soft px-3.5 text-[13.5px] font-bold text-brand transition-colors hover:bg-brand hover:text-on-brand"
          href={editInAcademyHref({ ...row, path })}
          onClick={(event) => event.stopPropagation()}
          title={t('table.edit_hint')}
        >
          <PenLine className="size-3.5" />
          {t('table.edit')}
        </Link>
      </div>
    );

    const updated = (value: string) => (
      <span className="whitespace-nowrap text-[13.5px] text-sub">
        {formatShortDate(value, locale)}
      </span>
    );

    if (lens === 'courses') {
      return [
        {
          id: 'title',
          header: t('table.course'),
          enableSorting: false,
          cell: ({ row }) => (
            <div className="min-w-0">
              <span className="block truncate text-[14px] font-bold text-ink">
                {row.original.title}
              </span>
              <span className="block text-[12px] text-sub">
                {row.original.isVisible
                  ? t('table.published')
                  : t('table.draft')}
              </span>
            </div>
          ),
        },
        academyColumn,
        {
          id: 'contents',
          header: t('table.contents'),
          enableSorting: false,
          size: 200,
          cell: ({ row }) => (
            <span className="whitespace-nowrap font-mono text-[13px] tabular-nums text-sub">
              {t('table.module_count', { count: row.original.moduleCount })}
              {' · '}
              {t('table.exercise_count', { count: row.original.exerciseCount })}
            </span>
          ),
        },
        {
          id: 'classes',
          header: t('table.taught_by'),
          enableSorting: false,
          size: 120,
          cell: ({ row }) => (
            <span
              className={`font-mono text-[15px] tabular-nums ${
                row.original.classCount === 0
                  ? 'text-sub/50'
                  : 'font-bold text-ink'
              }`}
            >
              {row.original.classCount}
            </span>
          ),
        },
        {
          id: 'updated',
          header: t('table.updated'),
          enableSorting: false,
          size: 120,
          cell: ({ row }) => updated(row.original.updatedAt),
        },
        {
          id: 'actions',
          header: t('table.actions'),
          enableSorting: false,
          size: 110,
          cell: ({ row }) =>
            edit(row.original, contentPaths.course(row.original.id)),
        },
      ] as ColumnDef<PlatformCourse>[];
    }

    if (lens === 'classes') {
      return [
        {
          id: 'name',
          header: t('table.class'),
          enableSorting: false,
          cell: ({ row }) => (
            <div className="min-w-0">
              <span className="block truncate text-[14px] font-bold text-ink">
                {row.original.name}
              </span>
              <span className="block text-[12px] text-sub">
                {t(`table.class_status.${row.original.status}`)}
              </span>
            </div>
          ),
        },
        academyColumn,
        {
          id: 'teacher',
          header: t('table.teacher'),
          enableSorting: false,
          size: 170,
          cell: ({ row }) =>
            row.original.teacherName ? (
              <span className="truncate text-[13.5px] text-ink">
                {row.original.teacherName}
              </span>
            ) : (
              // The one condition on this table worth colour: a running class
              // with nobody teaching it is what an operator is looking for.
              <span className="whitespace-nowrap rounded-md bg-danger/10 px-2 py-0.5 text-[12.5px] font-bold text-danger">
                {t('table.no_teacher')}
              </span>
            ),
        },
        {
          id: 'roster',
          header: t('table.students'),
          enableSorting: false,
          size: 120,
          cell: ({ row }) => (
            <span
              className={`font-mono text-[15px] tabular-nums ${
                row.original.studentCount === 0
                  ? 'text-sub/50'
                  : 'font-bold text-ink'
              }`}
            >
              {row.original.studentCount}
            </span>
          ),
        },
        {
          id: 'updated',
          header: t('table.updated'),
          enableSorting: false,
          size: 120,
          cell: ({ row }) => updated(row.original.updatedAt),
        },
        {
          id: 'actions',
          header: t('table.actions'),
          enableSorting: false,
          size: 110,
          cell: ({ row }) =>
            edit(row.original, contentPaths.class(row.original.id)),
        },
      ] as ColumnDef<PlatformClass>[];
    }

    return [
      {
        id: 'title',
        header: t('table.problem'),
        enableSorting: false,
        cell: ({ row }) => (
          <div className="min-w-0">
            <span className="block truncate text-[14px] font-bold text-ink">
              {row.original.title}
            </span>
            {/* Where it sits. A problem title alone is not enough to identify
                one — academies reuse "Exercise 3" in every course. */}
            <span className="block truncate text-[12px] text-sub">
              {row.original.courseTitle} · {row.original.lectureTitle}
            </span>
          </div>
        ),
      },
      academyColumn,
      {
        id: 'difficulty',
        header: t('table.difficulty'),
        enableSorting: false,
        size: 130,
        cell: ({ row }) => (
          <span className="text-[13.5px] text-sub">
            {row.original.difficulty
              ? t(`table.difficulty_value.${row.original.difficulty}`)
              : '—'}
          </span>
        ),
      },
      {
        id: 'tests',
        header: t('table.tests'),
        enableSorting: false,
        size: 120,
        cell: ({ row }) => (
          // Zero test cases means the problem cannot grade anything, which is
          // the single most common "this problem is broken" report.
          <span
            className={`font-mono text-[15px] tabular-nums ${
              row.original.testCaseCount === 0
                ? 'font-bold text-danger'
                : 'font-bold text-ink'
            }`}
          >
            {row.original.testCaseCount}
          </span>
        ),
      },
      {
        id: 'actions',
        header: t('table.actions'),
        enableSorting: false,
        size: 110,
        cell: ({ row }) =>
          edit(
            row.original,
            contentPaths.problem(
              row.original.courseId,
              row.original.lectureId,
              row.original.materialId,
            ),
          ),
      },
    ] as ColumnDef<PlatformProblem>[];
  }, [academyColumn, lens, locale, t]);

  const facets = React.useMemo(
    () => [
      {
        columnId: 'academy',
        title: t('table.academy'),
        options: (page?.academyOptions ?? []).map((academy) => ({
          label: academy.name,
          value: academy.id,
        })),
      },
    ],
    [page?.academyOptions, t],
  );

  const columnFilters = React.useMemo<ColumnFiltersState>(
    () =>
      query.academyIds?.length
        ? [{ id: 'academy', value: query.academyIds }]
        : [],
    [query.academyIds],
  );

  const rowCount = page?.total ?? 0;

  return (
    <DataTable
      columns={columns as ColumnDef<never>[]}
      data={(page?.rows ?? []) as never[]}
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
          change({ academyIds: facetSelection(filters, 'academy') }),
      }}
      facets={facets}
      searchPlaceholder={t(`table.search_${lens}`)}
      showColumnVisibility={false}
    />
  );
}
