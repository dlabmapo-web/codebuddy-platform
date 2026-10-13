'use client';

import type { ContentSortKey, PlatformCourse } from '@cove/shared';
import { formatShortDate } from '@cove/i18n/format';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/studio/button';
import { DataTable } from '@/components/studio/data-table';
import { facetSelection } from '@/components/studio/data-table-state';
import { Modal, ModalContent } from '@/components/studio/primitives';
import { useLocale } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';
import { orpc } from '@/lib/orpc';

import { parseContentQuery, type ContentQuery } from '../../../_lib/content-query';
import { AcademyCourseImportDialog } from '../../_components/academy-course-import-dialog';

export function AcademyCoursePicker({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('platform-library');
  const { t: contentT } = useTranslation('platform-content');
  const locale = useLocale();
  const errorText = useErrorText();
  const [query, setQuery] = React.useState<ContentQuery>(() => ({
    ...parseContentQuery(''), pageSize: 10,
  }));
  const [source, setSource] = React.useState<PlatformCourse | null>(null);
  const result = useQuery({
    queryKey: ['library-source-courses', query],
    queryFn: () => orpc.platformContent.courses(query),
    placeholderData: keepPreviousData,
    retry: false,
  });
  const change = (partial: Partial<ContentQuery>) =>
    setQuery((current) => ({ ...current, page: 1, ...partial }));
  const columns: ColumnDef<PlatformCourse>[] = [
    {
      id: 'title', accessorKey: 'title', header: contentT('table.course'),
      enableHiding: false,
      cell: ({ row }) => <span className="font-bold">{row.original.title}</span>,
    },
    {
      id: 'academy', accessorKey: 'academyName', header: contentT('table.academy'),
      enableSorting: false,
    },
    {
      id: 'modules', accessorKey: 'moduleCount', header: contentT('table.modules'),
    },
    {
      id: 'lectures', accessorKey: 'lectureCount', header: contentT('table.lectures'),
      enableSorting: false,
    },
    {
      id: 'problems', accessorKey: 'exerciseCount', header: contentT('table.problems'),
      enableSorting: false,
    },
    {
      id: 'updatedAt', accessorKey: 'updatedAt', header: contentT('table.updated'),
      cell: ({ row }) => formatShortDate(row.original.updatedAt, locale),
    },
    {
      id: 'actions', header: '', enableSorting: false, enableHiding: false,
      cell: ({ row }) => (
        <Button size="sm" variant="outline" disabled={result.isFetching || result.isError} onClick={() => setSource(row.original)}>
          {t('picker.select')}
        </Button>
      ),
    },
  ];

  if (source) return (
    <AcademyCourseImportDialog
      source={source}
      onClose={() => setSource(null)}
      onCopied={onClose}
    />
  );

  return (
    <Modal open onOpenChange={(open) => { if (!open) onClose(); }}>
      <ModalContent title={t('picker.action')} description={t('picker.description')} className="max-w-6xl">
        <div className="min-h-0 overflow-y-auto px-6 py-5">
          {result.error ? (
            <div className="mb-3" role="alert">
              <p className="text-sm text-danger">{errorText(result.error)}</p>
              <Button variant="ghost" disabled={result.isFetching} onClick={() => void result.refetch()}>
                {t('picker.retry')}
              </Button>
            </div>
          ) : null}
          <DataTable
            columns={columns}
            data={result.data?.rows ?? []}
            searchPlaceholder={contentT('table.search_courses')}
            emptyMessage={result.isFetching ? contentT('table.loading') : contentT('table.empty')}
            loadingLabel={contentT('table.loading')}
            pageSize={query.pageSize}
            facets={[{
              columnId: 'academy', title: contentT('table.academy'),
              options: (result.data?.academyOptions ?? []).map((academy) => ({
                label: academy.name, value: academy.id,
              })),
            }]}
            manual={{
              pageIndex: query.page - 1,
              pageCount: Math.max(1, Math.ceil((result.data?.total ?? 0) / query.pageSize)),
              rowCount: result.data?.total ?? 0,
              sorting: [{ id: query.sort, desc: query.direction === 'desc' }],
              globalFilter: query.query ?? '',
              columnFilters: query.academyIds?.length
                ? [{ id: 'academy', value: query.academyIds }]
                : [],
              pending: result.isFetching,
              onPageIndexChange: (pageIndex) => change({ page: pageIndex + 1 }),
              onSortingChange: (sorting) => {
                const next = sorting[0];
                change({
                  sort: (next?.id as ContentSortKey | undefined) ?? 'updatedAt',
                  direction: next?.desc === false ? 'asc' : 'desc',
                });
              },
              onGlobalFilterChange: (value) => change({ query: value.slice(0, 120) || undefined }),
              onColumnFiltersChange: (filters) => change({ academyIds: facetSelection(filters, 'academy') }),
            }}
          />
        </div>
        <div className="flex justify-end border-t border-border px-6 py-4">
          <Button variant="ghost" onClick={onClose}>{t('import.cancel')}</Button>
        </div>
      </ModalContent>
    </Modal>
  );
}
