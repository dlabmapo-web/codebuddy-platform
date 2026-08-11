'use client';

import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  Eye,
  EyeOff,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import * as React from 'react';

import { useLayoutTranslation } from '@/i18n';
import { cn } from '@/lib/utils';
import { FacetedFilter, type TableFacet } from './faceted-filter';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './overlays';

function PageButton({
  children,
  disabled,
  label,
  onClick,
}: {
  children: React.ReactNode;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="grid size-8 place-items-center rounded-md border border-border bg-card text-sub transition-colors hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-border disabled:hover:text-sub"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

export type DataTableProps<TData, TValue> = {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  /** Shows a search box that filters across every column. */
  searchPlaceholder?: string;
  emptyMessage?: string;
  /** Row count per page. Omit to render every row without pagination. */
  pageSize?: number;
  /** Per-column multi-select filters, rendered as chips in the toolbar. */
  facets?: TableFacet[];
  /**
   * A caller-owned filter control, placed beside the search box where the
   * facet chips go. For a choice the table cannot make itself — one whose
   * options do not map onto a single column's values.
   */
  toolbarFilters?: React.ReactNode;
  /** Page-level actions ("New course") placed at the end of the toolbar. */
  toolbarActions?: React.ReactNode;
  onRowClick?: (row: TData) => void;
  /**
   * Drops the table's own card, for a table rendered inside one already. The
   * header rule and row dividers stay, so it still reads as a table.
   */
  frameless?: boolean;
  className?: string;
};

export function DataTable<TData, TValue>({
  columns,
  data,
  searchPlaceholder,
  emptyMessage,
  pageSize,
  facets,
  toolbarFilters,
  toolbarActions,
  onRowClick,
  frameless = false,
  className,
}: DataTableProps<TData, TValue>) {
  const { t } = useLayoutTranslation('common');
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter, columnVisibility },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    ...(pageSize
      ? {
          getPaginationRowModel: getPaginationRowModel(),
          initialState: { pagination: { pageSize } },
        }
      : {}),
  });

  const rows = table.getRowModel().rows;
  const hideableColumns = table
    .getAllLeafColumns()
    .filter((column) => column.getCanHide() && column.getCanSort());

  /** Header definitions are plain strings here, so they double as labels. */
  const columnLabel = (id: string) => {
    const header = table.getColumn(id)?.columnDef.header;
    return typeof header === 'string' ? header : id;
  };

  const filtered =
    table.getState().columnFilters.length > 0 || globalFilter.length > 0;
  const showToolbar = Boolean(
    searchPlaceholder ||
      facets?.length ||
      toolbarFilters ||
      hideableColumns.length > 0 ||
      toolbarActions,
  );

  return (
    <div className={cn('space-y-3', className)}>
      {showToolbar ? (
        <div className="flex flex-wrap items-center gap-2">
          {/* Fixed width: a growing search box crowds out the filters. */}
          {searchPlaceholder ? (
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-sub" />
              <input
                aria-label={searchPlaceholder}
                className="h-10 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-[14px] outline-none transition-colors placeholder:text-sub/60 focus:border-brand focus:ring-2 focus:ring-brand/20"
                onChange={(event) => setGlobalFilter(event.target.value)}
                placeholder={searchPlaceholder}
                value={globalFilter}
              />
            </div>
          ) : null}

          {toolbarFilters}

          {facets?.map((facet) => (
            <FacetedFilter
              column={table.getColumn(facet.columnId)}
              key={facet.columnId}
              options={facet.options}
              title={facet.title}
            />
          ))}

          {filtered ? (
            <button
              className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-[13.5px] font-bold text-sub transition-colors hover:text-ink"
              onClick={() => {
                table.resetColumnFilters();
                setGlobalFilter('');
              }}
              type="button"
            >
              <X className="size-4" />
              {t('filter.reset')}
            </button>
          ) : null}

          <div className="ml-auto flex items-center gap-2">
          {/* Without this, hiding a column from its header would be one-way. */}
          {hideableColumns.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-3.5 text-[13.5px] font-bold text-sub transition-colors hover:border-brand hover:text-brand data-[state=open]:border-brand data-[state=open]:text-brand"
                  type="button"
                >
                  <SlidersHorizontal className="size-4" />
                  {t('columns.label')}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>{t('columns.heading')}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {hideableColumns.map((column) => (
                  <DropdownMenuItem
                    key={column.id}
                    onSelect={(event) => {
                      event.preventDefault();
                      column.toggleVisibility(!column.getIsVisible());
                    }}
                  >
                    {column.getIsVisible() ? (
                      <Eye className="text-brand" />
                    ) : (
                      <EyeOff className="text-sub/50" />
                    )}
                    <span
                      className={
                        column.getIsVisible() ? '' : 'text-sub/60'
                      }
                    >
                      {columnLabel(column.id)}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {toolbarActions}
          </div>
        </div>
      ) : null}

      <div
        className={cn(
          'overflow-x-auto rounded-card border border-border bg-card',
          frameless && 'rounded-none border-0 bg-transparent',
        )}
      >
        <table className="w-full border-collapse text-left">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr className="border-b border-border bg-canvas" key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const sortable = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      className="whitespace-nowrap px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider text-sub"
                      key={header.id}
                      style={{ width: header.getSize() === 150 ? undefined : header.getSize() }}
                    >
                      {header.isPlaceholder ? null : sortable ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            {/* Preflight resets text-transform on buttons, so
                                headers restate it to match the rest. */}
                            <button
                              className="-ml-2 inline-flex h-8 items-center gap-1.5 rounded-md px-2 uppercase tracking-wider transition-colors hover:bg-card hover:text-ink data-[state=open]:bg-card data-[state=open]:text-ink"
                              type="button"
                            >
                              {flexRender(
                                header.column.columnDef.header,
                                header.getContext(),
                              )}
                              {sorted === 'asc' ? (
                                <ArrowUp className="size-3.5 text-brand" />
                              ) : sorted === 'desc' ? (
                                <ArrowDown className="size-3.5 text-brand" />
                              ) : (
                                <ChevronsUpDown className="size-3.5 opacity-40" />
                              )}
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-40">
                            <DropdownMenuItem
                              onSelect={() =>
                                header.column.toggleSorting(false)
                              }
                            >
                              <ArrowUp className="text-sub" />
                              {t('sort.asc')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => header.column.toggleSorting(true)}
                            >
                              <ArrowDown className="text-sub" />
                              {t('sort.desc')}
                            </DropdownMenuItem>
                            {sorted ? (
                              <DropdownMenuItem
                                onSelect={() => header.column.clearSorting()}
                              >
                                <ChevronsUpDown className="text-sub" />
                                {t('sort.clear')}
                              </DropdownMenuItem>
                            ) : null}
                            {header.column.getCanHide() ? (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onSelect={() =>
                                    header.column.toggleVisibility(false)
                                  }
                                >
                                  <EyeOff className="text-sub" />
                                  {t('sort.hide')}
                                </DropdownMenuItem>
                              </>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 ? (
              <tr>
                <td
                  className="px-4 py-12 text-center text-[14px] text-sub"
                  colSpan={columns.length}
                >
                  {emptyMessage ?? t('state.empty')}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  className={cn(
                    'transition-colors hover:bg-canvas/70',
                    onRowClick && 'cursor-pointer',
                  )}
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td className="px-4 py-3 align-middle text-[14px]" key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pageSize && rows.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <p className="text-[13px] text-sub">
            {t('pagination.rows', {
              count: table.getFilteredRowModel().rows.length,
            })}
          </p>
          <div className="flex items-center gap-4">
            <p className="text-[13px] font-semibold">
              {t('pagination.label', {
                current: table.getState().pagination.pageIndex + 1,
                total: Math.max(table.getPageCount(), 1),
              })}
            </p>
            <div className="flex items-center gap-1">
              <PageButton
                disabled={!table.getCanPreviousPage()}
                label={t('pagination.first')}
                onClick={() => table.setPageIndex(0)}
              >
                <ChevronsLeft className="size-4" />
              </PageButton>
              <PageButton
                disabled={!table.getCanPreviousPage()}
                label={t('pagination.previous')}
                onClick={() => table.previousPage()}
              >
                <ChevronLeft className="size-4" />
              </PageButton>
              <PageButton
                disabled={!table.getCanNextPage()}
                label={t('pagination.next')}
                onClick={() => table.nextPage()}
              >
                <ChevronRight className="size-4" />
              </PageButton>
              <PageButton
                disabled={!table.getCanNextPage()}
                label={t('pagination.last')}
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              >
                <ChevronsRight className="size-4" />
              </PageButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
