'use client';

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown, Search } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';
import { Button } from './button';

export type DataTableProps<TData, TValue> = {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  /** Shows a search box that filters across every column. */
  searchPlaceholder?: string;
  emptyMessage?: string;
  /** Row count per page. Omit to render every row without pagination. */
  pageSize?: number;
  onRowClick?: (row: TData) => void;
  className?: string;
};

export function DataTable<TData, TValue>({
  columns,
  data,
  searchPlaceholder,
  emptyMessage = 'Nothing to show yet.',
  pageSize,
  onRowClick,
  className,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = React.useState('');

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    ...(pageSize
      ? {
          getPaginationRowModel: getPaginationRowModel(),
          initialState: { pagination: { pageSize } },
        }
      : {}),
  });

  const rows = table.getRowModel().rows;

  return (
    <div className={cn('space-y-3', className)}>
      {searchPlaceholder ? (
        <div className="relative max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-sub" />
          <input
            aria-label={searchPlaceholder}
            className="h-10 w-full rounded-lg border border-border bg-white pl-9 pr-3 text-[14px] outline-none transition-colors placeholder:text-sub/60 focus:border-brand focus:ring-2 focus:ring-brand/20"
            onChange={(event) => setGlobalFilter(event.target.value)}
            placeholder={searchPlaceholder}
            value={globalFilter}
          />
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-card border border-border bg-white">
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
                        <button
                          // Preflight resets text-transform on buttons, so the
                          // sortable headers must restate it to match the rest.
                          className="inline-flex items-center gap-1.5 rounded uppercase tracking-wider transition-colors hover:text-ink"
                          onClick={header.column.getToggleSortingHandler()}
                          type="button"
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          {sorted === 'asc' ? (
                            <ArrowUp className="size-3.5" />
                          ) : sorted === 'desc' ? (
                            <ArrowDown className="size-3.5" />
                          ) : (
                            <ChevronsUpDown className="size-3.5 opacity-40" />
                          )}
                        </button>
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
                  {emptyMessage}
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

      {pageSize && table.getPageCount() > 1 ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] text-sub">
            Page{' '}
            <span className="font-mono font-semibold text-ink">
              {table.getState().pagination.pageIndex + 1}
            </span>{' '}
            of{' '}
            <span className="font-mono font-semibold text-ink">
              {table.getPageCount()}
            </span>
          </p>
          <div className="flex gap-2">
            <Button
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
              size="sm"
              variant="outline"
            >
              Previous
            </Button>
            <Button
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
              size="sm"
              variant="outline"
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
