import type {
  Column,
  ColumnFiltersState,
  SortingState,
  Updater,
} from '@tanstack/react-table';

declare module '@tanstack/react-table' {
  // The two parameters are TanStack's own; this augmentation uses neither.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    /**
     * Offers this column in the Columns menu even though it cannot be sorted.
     *
     * The menu otherwise lists sortable columns only, which is what keeps an
     * Actions column — non-sortable, and useless once hidden — out of it. A
     * data column that simply has no meaningful order, like Tests, opts in
     * here rather than by loosening that rule for every table.
     */
    hideable?: boolean;
    /**
     * The column's name in the Columns menu.
     *
     * Needed once a header renders more than a bare string — an icon beside a
     * label is still one column with one name, and without this the menu falls
     * back to the column id and offers a teacher "activeTime" to hide.
     */
    label?: string;
    /**
     * Right-aligns the header and every cell in the column.
     *
     * For measurements. A column of figures aligned left forces the eye to
     * re-find the digits on every row, and a manager comparing ten class rates
     * down a column is doing exactly that comparison — the decimal points have
     * to line up for it to be one glance rather than ten readings.
     */
    align?: 'right';
    /**
     * Extra classes for this column's header and every one of its cells.
     *
     * For a column that answers a secondary question and can be dropped when
     * the table runs out of room — `max-xl:hidden` on Updated, so the columns
     * the operator came for keep their width on a narrow screen. Declared on
     * the column rather than applied by position from outside, because a
     * `nth-child` rule hides whichever column happens to be seventh today and
     * says nothing when one is inserted before it.
     */
    className?: string;
  }
}

/**
 * The state rules behind `DataTable`'s two modes, kept out of the component.
 *
 * The table renders the same in both; what differs is who owns sorting,
 * filtering, and paging. Deciding that here means the regression that matters
 * — an existing client table quietly acquiring server behavior — is a unit
 * test rather than a page somebody has to click through.
 */

/**
 * Everything a server-paged consumer owns, in one prop.
 *
 * Passing it is what switches the table into manual mode; omitting it leaves
 * every existing consumer byte-for-byte as it was. A partial version of this
 * object is deliberately impossible: a table that paginated on the server but
 * sorted in the browser would sort one page and call it an ordering.
 */
export type DataTableManualMode = {
  /** Zero-based, to match TanStack's own pagination state. */
  pageIndex: number;
  pageCount: number;
  /** Rows matching the current query across every page, not on this one. */
  rowCount: number;
  sorting: SortingState;
  globalFilter: string;
  /**
   * Facet selections, keyed by facet id.
   *
   * `ColumnFiltersState` is reused for its shape, not its meaning: in manual
   * mode these ids name facets, and a facet need not correspond to a rendered
   * column. They are never handed to TanStack, which has no filtering to do.
   */
  columnFilters: ColumnFiltersState;
  /** A query is in flight. The current rows stay on screen while it is. */
  pending: boolean;
  onPageIndexChange: (pageIndex: number) => void;
  onSortingChange: (sorting: SortingState) => void;
  onGlobalFilterChange: (value: string) => void;
  onColumnFiltersChange: (filters: ColumnFiltersState) => void;
};

/**
 * TanStack hands state changes as either a value or a function of the previous
 * one. Owners of controlled state need the resolved value.
 */
export function applyUpdater<T>(updater: Updater<T>, current: T): T {
  return typeof updater === 'function'
    ? (updater as (old: T) => T)(current)
    : updater;
}

/**
 * Only one server sort is active at a time.
 *
 * TanStack will happily accumulate a multi-sort; a server that orders by one
 * column and a header that claims two would disagree about what the reader is
 * looking at, and the reader would believe the header.
 */
export function singleSort(sorting: SortingState): SortingState {
  return sorting.length > 1 ? [sorting[sorting.length - 1]!] : sorting;
}

/** Whether the Reset control has anything to clear. */
export function isTableFiltered(input: {
  globalFilter: string;
  columnFilters: ColumnFiltersState;
}): boolean {
  return input.globalFilter.length > 0 || input.columnFilters.length > 0;
}

/**
 * A facet's current selection, by facet id.
 *
 * In manual mode a facet is not backed by a column — the server filters, and
 * Class, Course, Module, and Lecture narrow rows without any of them being
 * something the table renders. So the selection is read out of the owner's
 * state by id rather than from `column.getFilterValue()`, which would ask
 * TanStack about a column that does not exist.
 */
export function facetSelection(
  filters: ColumnFiltersState,
  facetId: string,
): string[] {
  const value = filters.find((filter) => filter.id === facetId)?.value;
  return Array.isArray(value) ? (value as string[]) : [];
}

/**
 * The same list with one facet's selection replaced.
 *
 * An emptied facet is removed rather than stored as `[]`, so "is anything
 * filtered" stays a length check and the URL a cleared facet produces is the
 * same one an untouched table produces.
 */
export function withFacetSelection(
  filters: ColumnFiltersState,
  facetId: string,
  values: string[],
): ColumnFiltersState {
  const rest = filters.filter((filter) => filter.id !== facetId);
  return values.length > 0 ? [...rest, { id: facetId, value: values }] : rest;
}

/**
 * The row models a mode may use.
 *
 * In manual mode the server already sorted, filtered, and sliced, so running
 * the browser's models over the returned page would filter a filtered page and
 * paginate a single page of twenty into pages of ten.
 */
export function tableModelFlags(manual: DataTableManualMode | undefined): {
  manualPagination: boolean;
  manualSorting: boolean;
  manualFiltering: boolean;
  clientSorting: boolean;
  clientFiltering: boolean;
  clientFaceting: boolean;
  clientPagination: boolean;
} {
  const isManual = manual !== undefined;
  return {
    manualPagination: isManual,
    manualSorting: isManual,
    manualFiltering: isManual,
    clientSorting: !isManual,
    clientFiltering: !isManual,
    clientFaceting: !isManual,
    clientPagination: !isManual,
  };
}

/**
 * Whether facet chips may print occurrence counts.
 *
 * Never in manual mode: the browser holds one server page, so a count taken
 * from it describes twenty rows while appearing to describe a whole history.
 */
export function showsFacetCounts(manual: DataTableManualMode | undefined) {
  return manual === undefined;
}

/**
 * The columns the Columns menu offers.
 *
 * Sortable ones by default: it is the closest available proxy for "a data
 * column", and it is what keeps the Actions column of every management table
 * out of the menu. A non-sortable data column opts in through `meta.hideable`,
 * so no existing table changes by adding the escape hatch.
 */
export function hideableColumnsOf<TData>(
  columns: ReadonlyArray<Column<TData, unknown>>,
): Column<TData, unknown>[] {
  return columns.filter(
    (column) =>
      column.getCanHide() &&
      (column.getCanSort() || column.columnDef.meta?.hideable === true),
  );
}
