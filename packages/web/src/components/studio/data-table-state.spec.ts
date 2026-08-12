import { describe, expect, it, vi } from 'vitest';

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

function manualMode(
  overrides: Partial<DataTableManualMode> = {},
): DataTableManualMode {
  return {
    pageIndex: 0,
    pageCount: 3,
    rowCount: 45,
    sorting: [],
    globalFilter: '',
    columnFilters: [],
    pending: false,
    onPageIndexChange: vi.fn(),
    onSortingChange: vi.fn(),
    onGlobalFilterChange: vi.fn(),
    onColumnFiltersChange: vi.fn(),
    ...overrides,
  };
}

/**
 * The regression that matters is silent: an existing client table acquiring
 * server behavior because manual mode became the default somewhere.
 */
describe('client mode is what a consumer gets by default', () => {
  it('keeps every browser row model when no manual config is supplied', () => {
    expect(tableModelFlags(undefined)).toEqual({
      manualPagination: false,
      manualSorting: false,
      manualFiltering: false,
      clientSorting: true,
      clientFiltering: true,
      clientFaceting: true,
      clientPagination: true,
    });
  });

  it('still counts facet occurrences for a client table', () => {
    expect(showsFacetCounts(undefined)).toBe(true);
  });
});

describe('manual mode hands all three responsibilities over at once', () => {
  it('turns off every browser row model together', () => {
    expect(tableModelFlags(manualMode())).toEqual({
      manualPagination: true,
      manualSorting: true,
      manualFiltering: true,
      clientSorting: false,
      clientFiltering: false,
      clientFaceting: false,
      clientPagination: false,
    });
  });

  /** Twenty rows cannot be counted into a statement about a whole history. */
  it('suppresses facet counts that would describe only the current page', () => {
    expect(showsFacetCounts(manualMode())).toBe(false);
  });
});

describe('state updates reaching the owner', () => {
  it('resolves a functional updater against the current value', () => {
    expect(applyUpdater((current: number) => current + 1, 1)).toBe(2);
    expect(applyUpdater(5, 1)).toBe(5);
  });

  it('keeps one active server sort so the header cannot outrun the query', () => {
    expect(
      singleSort([
        { id: 'problem', desc: false },
        { id: 'score', desc: true },
      ]),
    ).toEqual([{ id: 'score', desc: true }]);
    expect(singleSort([{ id: 'problem', desc: false }])).toEqual([
      { id: 'problem', desc: false },
    ]);
    expect(singleSort([])).toEqual([]);
  });
});

describe('reset visibility', () => {
  it('appears for a search, a facet, or both', () => {
    expect(isTableFiltered({ globalFilter: '', columnFilters: [] })).toBe(false);
    expect(isTableFiltered({ globalFilter: 'sum', columnFilters: [] })).toBe(true);
    expect(
      isTableFiltered({
        globalFilter: '',
        columnFilters: [{ id: 'result', value: ['ACCEPTED'] }],
      }),
    ).toBe(true);
  });
});

/**
 * Server-side facets are not columns.
 *
 * Class, Course, Module, and Lecture narrow the records query without any of
 * them being something the table renders, so their selections are keyed by
 * facet id and never handed to TanStack — asking it for a column that does not
 * exist produces a warning and an inert chip.
 */
describe('facet selections in manual mode', () => {
  const filters = [
    { id: 'result', value: ['ACCEPTED'] },
    { id: 'course', value: ['course-1', 'course-2'] },
  ];

  it('reads a selection by facet id', () => {
    expect(facetSelection(filters, 'course')).toEqual(['course-1', 'course-2']);
    expect(facetSelection(filters, 'result')).toEqual(['ACCEPTED']);
  });

  it('reads an untouched facet as empty rather than undefined', () => {
    expect(facetSelection(filters, 'lecture')).toEqual([]);
    expect(facetSelection([], 'course')).toEqual([]);
  });

  it('survives a malformed entry instead of handing back a non-array', () => {
    expect(facetSelection([{ id: 'course', value: 'course-1' }], 'course')).toEqual(
      [],
    );
  });

  it('replaces one facet without disturbing the others', () => {
    expect(withFacetSelection(filters, 'course', ['course-3'])).toEqual([
      { id: 'result', value: ['ACCEPTED'] },
      { id: 'course', value: ['course-3'] },
    ]);
  });

  it('adds a facet that had no selection yet', () => {
    expect(withFacetSelection(filters, 'lecture', ['lecture-1'])).toEqual([
      ...filters,
      { id: 'lecture', value: ['lecture-1'] },
    ]);
  });

  /** An emptied facet leaves no trace, so Reset and the URL agree. */
  it('removes an emptied facet rather than storing an empty list', () => {
    const next = withFacetSelection(filters, 'course', []);
    expect(next).toEqual([{ id: 'result', value: ['ACCEPTED'] }]);
    expect(isTableFiltered({ globalFilter: '', columnFilters: next })).toBe(true);
    expect(
      isTableFiltered({
        globalFilter: '',
        columnFilters: withFacetSelection(next, 'result', []),
      }),
    ).toBe(false);
  });

  it('round-trips a selection through both helpers', () => {
    const next = withFacetSelection([], 'module', ['module-1']);
    expect(facetSelection(next, 'module')).toEqual(['module-1']);
  });
});

/**
 * The Columns menu.
 *
 * Sortability is the default proxy for "a data column", which is what keeps
 * every management table's Actions column out of the menu. Loosening that rule
 * globally would have added Actions to five existing tables, so a non-sortable
 * data column opts in instead.
 */
describe('columns offered in the Columns menu', () => {
  const column = (options: {
    id: string;
    canHide?: boolean;
    canSort?: boolean;
    hideable?: boolean;
  }) =>
    ({
      id: options.id,
      getCanHide: () => options.canHide ?? true,
      getCanSort: () => options.canSort ?? true,
      columnDef:
        options.hideable === undefined ? {} : { meta: { hideable: options.hideable } },
    }) as never;

  it('offers sortable, hideable columns', () => {
    expect(
      hideableColumnsOf([column({ id: 'problem' }), column({ id: 'score' })]).map(
        (item) => item.id,
      ),
    ).toEqual(['problem', 'score']);
  });

  it('keeps a non-sortable actions column out, as before', () => {
    expect(
      hideableColumnsOf([column({ id: 'actions', canSort: false })]),
    ).toEqual([]);
  });

  it('offers a non-sortable column that opts in', () => {
    expect(
      hideableColumnsOf([
        column({ id: 'tests', canSort: false, hideable: true }),
      ]).map((item) => item.id),
    ).toEqual(['tests']);
  });

  it('never offers a column that refuses to be hidden', () => {
    expect(
      hideableColumnsOf([
        column({ id: 'result', canHide: false }),
        column({ id: 'solveTime', canHide: false, canSort: false, hideable: true }),
      ]),
    ).toEqual([]);
  });
});
