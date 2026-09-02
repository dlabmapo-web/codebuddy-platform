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
  type TableOptions,
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
import {
  applyUpdater,
  facetSelection,
  hideableColumnsOf,
  isTableFiltered,
  showsFacetCounts,
  singleSort,
  tableModelFlags,
  withFacetSelection,
  type DataTableManualMode,
} from './data-table-state';
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
  /** Hides the column-visibility menu for pages with a fixed table layout. */
  showColumnVisibility?: boolean;
  /**
   * Columns hidden until a reader asks for them, by id.
   *
   * For a wide table whose last columns would otherwise be cut off at the card
   * edge with nothing saying so. The column still exists and still appears in
   * the Columns menu — this only decides where it starts.
   */
  initialColumnVisibility?: VisibilityState;
  onRowClick?: (row: TData) => void;
  /**
   * Emphasis one row carries because of what it *is*, not what it holds.
   *
   * For the rare table where one row is the reader's own — their position in a
   * class standing, their entry in a list of many — and losing it in a sorted
   * page defeats the point of showing the page at all. Returns classes for
   * that row's `<tr>`; every other row is untouched.
   *
   * Deliberately not a per-row style hook in general. A table that colours
   * rows by their values is a table that has started grading them, and the
   * cells are where a value belongs.
   */
  rowClassName?: (row: TData) => string | undefined;
  /**
   * Server-owned sorting, filtering, and paging.
   *
   * Omit it — as every existing consumer does — and the table keeps its
   * uncontrolled client behavior exactly. Supplying it hands all three to the
   * caller; see `data-table-state.ts` for why it is all three or none.
   */
  manual?: DataTableManualMode;
  /** Announced beside a pending server query, for the polite live region. */
  loadingLabel?: string;
  /**
   * Drops the table's own card, for a table rendered inside one already. The
   * header rule and row dividers stay, so it still reads as a table.
   */
  frameless?: boolean;
  /**
   * Sizes columns from their declared `size` instead of from their content.
   *
   * Opt-in, because it changes what a table does when it runs out of room. The
   * default `auto` layout widens columns to fit their longest unbreakable token
   * — a 35-character email address, a date set `whitespace-nowrap` — and once
   * the sum of those exceeds the container the table grows a horizontal
   * scrollbar, which on a people directory is the worst outcome: the reader
   * loses the name column the moment they go looking for the last column.
   *
   * With `fixed`, declared widths are honoured and the one unsized column
   * absorbs the slack and truncates. Every column must then declare a `size`
   * except that one.
   */
  layout?: 'auto' | 'fixed';
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
  showColumnVisibility = true,
  initialColumnVisibility,
  onRowClick,
  rowClassName,
  manual,
  loadingLabel,
  frameless = false,
  layout = 'auto',
  className,
}: DataTableProps<TData, TValue>) {
  const { t } = useLayoutTranslation('common');
  const [clientSorting, setClientSorting] = React.useState<SortingState>([]);
  const [clientGlobalFilter, setClientGlobalFilter] = React.useState('');
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>(
    () => initialColumnVisibility ?? {},
  );

  const sorting = manual ? manual.sorting : clientSorting;
  const globalFilter = manual ? manual.globalFilter : clientGlobalFilter;
  const flags = tableModelFlags(manual);
  // Fixed while a server owns the page: the caller's contract already names
  // the size, and a local override would slice the page it was handed.
  const serverPageSize = data.length > 0 ? data.length : 1;

  // Assembled rather than spread inline: the conditional shapes below would
  // make the argument a union and cost `TData` its inference, which the column
  // definitions a caller passes are typed against.
  const options: TableOptions<TData> = {
    data,
    columns,
    state: { sorting, globalFilter, columnVisibility },
    onSortingChange: (updater) => {
      const next = singleSort(applyUpdater(updater, sorting));
      if (manual) manual.onSortingChange(next);
      else setClientSorting(next);
    },
    onGlobalFilterChange: (updater) => {
      const next = applyUpdater(updater, globalFilter);
      if (manual) manual.onGlobalFilterChange(next);
      else setClientGlobalFilter(next);
    },
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
  };

  if (flags.clientSorting) options.getSortedRowModel = getSortedRowModel();
  if (flags.clientFiltering) options.getFilteredRowModel = getFilteredRowModel();
  if (flags.clientFaceting) {
    options.getFacetedRowModel = getFacetedRowModel();
    options.getFacetedUniqueValues = getFacetedUniqueValues();
  }

  if (manual) {
    const pagination = {
      pageIndex: manual.pageIndex,
      pageSize: pageSize ?? serverPageSize,
    };
    // Deliberately without `columnFilters`: in manual mode those ids name
    // facets, not columns, and handing them to a table that has no filtering
    // to do only makes it warn about columns that were never meant to exist.
    options.state = { ...options.state, pagination };
    options.manualPagination = true;
    options.manualSorting = true;
    options.manualFiltering = true;
    // At least one, so an empty result still renders "Page 1 of 1" rather
    // than a paginator that reads as broken.
    options.pageCount = Math.max(manual.pageCount, 1);
    options.rowCount = manual.rowCount;
    options.onPaginationChange = (updater) =>
      manual.onPageIndexChange(applyUpdater(updater, pagination).pageIndex);
  } else if (pageSize) {
    options.getPaginationRowModel = getPaginationRowModel();
    options.initialState = { pagination: { pageSize } };
  }

  const table = useReactTable(options);

  const rows = table.getRowModel().rows;
  const hideableColumns = hideableColumnsOf(table.getAllLeafColumns());

  /** A plain-string header doubles as its own label; anything else says so. */
  const columnLabel = (id: string) => {
    const column = table.getColumn(id)?.columnDef;
    if (column?.meta?.label) return column.meta.label;
    return typeof column?.header === 'string' ? column.header : id;
  };

  const filtered = isTableFiltered({
    globalFilter,
    columnFilters: manual
      ? manual.columnFilters
      : table.getState().columnFilters,
  });
  const showToolbar = Boolean(
    searchPlaceholder ||
      facets?.length ||
      toolbarFilters ||
      (showColumnVisibility && hideableColumns.length > 0) ||
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
                onChange={(event) => table.setGlobalFilter(event.target.value)}
                placeholder={searchPlaceholder}
                value={globalFilter}
              />
            </div>
          ) : null}

          {toolbarFilters}

          {facets?.map((facet) => (
            <FacetedFilter
              // Controlled by the owner in manual mode, where a facet id names
              // a server-side filter rather than a rendered column.
              column={manual ? undefined : table.getColumn(facet.columnId)}
              key={facet.columnId}
              onSelectedChange={
                manual
                  ? (values) =>
                      manual.onColumnFiltersChange(
                        withFacetSelection(
                          manual.columnFilters,
                          facet.columnId,
                          values,
                        ),
                      )
                  : undefined
              }
              options={facet.options}
              selected={
                manual
                  ? facetSelection(manual.columnFilters, facet.columnId)
                  : undefined
              }
              showCounts={showsFacetCounts(manual)}
              title={facet.title}
            />
          ))}

          {filtered ? (
            <button
              className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-[13.5px] font-bold text-sub transition-colors hover:text-ink"
              onClick={() => {
                if (manual) manual.onColumnFiltersChange([]);
                else table.resetColumnFilters();
                table.setGlobalFilter('');
              }}
              type="button"
            >
              <X className="size-4" />
              {t('filter.reset')}
            </button>
          ) : null}

          <div className="ml-auto flex items-center gap-2">
          {/* Without this, hiding a column from its header would be one-way. */}
          {showColumnVisibility && hideableColumns.length > 0 ? (
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

      {/* Kept out of the table so a results-count change is announced without
          moving focus away from the control that caused it. */}
      {manual ? (
        <p aria-live="polite" className="sr-only">
          {manual.pending
            ? (loadingLabel ?? t('state.loading'))
            : t('pagination.rows', { count: manual.rowCount })}
        </p>
      ) : null}

      <div
        // Pending keeps the current rows on screen rather than swapping them
        // for a spinner: a table that empties on every page turn jumps, and
        // the reader loses the row they were reading.
        aria-busy={manual?.pending || undefined}
        className={cn(
          'overflow-x-auto rounded-card border border-border bg-card transition-opacity motion-reduce:transition-none',
          frameless && 'rounded-none border-0 bg-transparent',
          manual?.pending && 'opacity-60',
        )}
      >
        <table
          className={cn(
            'w-full border-collapse text-left',
            layout === 'fixed' && 'table-fixed',
          )}
        >
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr className="border-b border-border bg-canvas" key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const sortable = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  const meta = header.column.columnDef.meta;
                  const alignRight = meta?.align === 'right';
                  return (
                    <th
                      className={cn(
                        'whitespace-nowrap px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider text-sub',
                        layout === 'fixed' && 'overflow-hidden',
                        // A measurement column's header sits over its digits.
                        // Left-aligned above right-aligned figures, the label
                        // and the number it names are at opposite ends of the
                        // cell, and the reader has to pair them by counting.
                        alignRight && 'text-right',
                        meta?.className,
                      )}
                      key={header.id}
                      style={{ width: header.getSize() === 150 ? undefined : header.getSize() }}
                    >
                      {header.isPlaceholder ? null : sortable ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            {/* Preflight resets text-transform on buttons, so
                                headers restate it to match the rest. */}
                            <button
                              className={cn(
                                'inline-flex h-8 items-center gap-1.5 rounded-md px-2 uppercase tracking-wider transition-colors hover:bg-card hover:text-ink data-[state=open]:bg-card data-[state=open]:text-ink',
                                // The negative margin pulls the label back to
                                // the cell edge it is aligned to, so a sortable
                                // header lines up with the plain ones beside it.
                                alignRight ? '-mr-2' : '-ml-2',
                              )}
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
                    rowClassName?.(row.original),
                  )}
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      className={cn(
                        'px-4 py-3 align-middle text-[14px]',
                        // Without this a fixed-layout cell still paints its
                        // content past its own box, so `truncate` on the child
                        // would ellipsise nothing and the column would overlap
                        // the next one.
                        layout === 'fixed' && 'overflow-hidden',
                        cell.column.columnDef.meta?.align === 'right' &&
                          'text-right',
                        cell.column.columnDef.meta?.className,
                      )}
                      key={cell.id}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {(manual ? manual.rowCount > 0 : pageSize && rows.length > 0) ? (
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <p className="text-[13px] text-sub">
            {t('pagination.rows', {
              count: manual
                ? manual.rowCount
                : table.getFilteredRowModel().rows.length,
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
