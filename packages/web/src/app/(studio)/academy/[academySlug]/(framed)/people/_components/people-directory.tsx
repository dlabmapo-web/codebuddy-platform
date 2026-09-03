'use client';

import { routes } from '@/lib/routes';

import { useAcademySlug } from '@/components/studio/academy-route-provider';

import type {
  AcademyRole,
  MembershipStatus,
  PeoplePage,
  PeopleRow,
  PeopleSelection,
  PeopleSortField,
} from '@cove/shared';
import {
  academyRoles,
  canCombineAcademyRoles,
  membershipStatuses,
  peoplePageSizes,
  peopleSortFields,
} from '@cove/shared';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Check,
  ChevronDown,
  Ellipsis,
  FileSpreadsheet,
  ShieldOff,
  UserCheck,
  UserPen,
  UsersRound,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { DataTable } from '@/components/studio/data-table';
import { ProfileAvatar } from '@/components/studio/profile-avatar';
import { FacetedFilter } from '@/components/studio/faceted-filter';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/studio/overlays';
import { useErrorText } from '@/i18n/client/use-error-text';
import { cn } from '@/lib/utils';

import { roleTones, statusTones } from '../../_lib/manager-view';
import { EmptyState, Panel, toneStyles } from '../../_components/overview-ui/panel';
import {
  usePeopleDirectoryQuery,
  usePeopleDirectoryState,
  usePeopleMutations,
} from '../_hooks/use-people-directory';
import { BulkActions } from './bulk-actions';
import { ImportWizard } from './import-wizard';

/**
 * Every member of the academy, one server-owned page at a time.
 *
 * This replaces a table that fetched the whole membership and searched, sorted,
 * and paged it in the browser. That works at forty members, is slow at four
 * hundred, and at two thousand ships the entire staff and student roster —
 * emails included — into any tab that can open the page. §10 moves all four to
 * the server, and the Studio's `DataTable` already speaks that protocol, so
 * what is here is the wiring rather than a second table.
 *
 * The counts beside each filter come from the server too. They answer "what
 * would this filter give me", which is a different question from "what am I
 * looking at" — and it is the question that makes a filter worth clicking.
 *
 * The bulk-operation toolbar the design describes is not here yet: §6.2 stages
 * import, bulk invitations, enrolment, role changes, and suspension after this,
 * and a selection with nothing to do is worse than none. The selection column
 * arrives with them.
 */
export function PeopleDirectory({
  academyId,
  classes,
  initialData,
  initialKey,
}: {
  academyId: string;
  /** Active classes, for the bulk enrolment picker. */
  classes: { id: string; name: string }[];
  initialData: PeoplePage | null;
  initialKey: string;
}) {
  const academySlug = useAcademySlug();
  const { t, i18n } = useTranslation('manager');
  // The import wizard's copy lives in its own namespace — the control tower's
  // grew past the per-file budget in `@cove/i18n` — and this page mounts both.
  const { t: tOps } = useTranslation('people-ops');
  const errorText = useErrorText();
  const { query, change } = usePeopleDirectoryState(academyId);
  const page = usePeopleDirectoryQuery(academyId, query, initialData, initialKey);
  const mutations = usePeopleMutations(academyId);
  const [importing, setImporting] = React.useState(false);

  /**
   * The selection, as ticked ids or as "everything matching".
   *
   * Two states rather than one set, because they are two different claims.
   * `ids` is the eight rows a manager ticked. `all-filtered` is "the 1,840
   * people this filter matches", which the browser deliberately cannot
   * enumerate — §12 sends the filter to the server and lets it resolve.
   *
   * Both are cleared when the filter changes: a selection made under one
   * question must not be acted on under another.
   */
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [allFiltered, setAllFiltered] = React.useState(false);
  const [excluded, setExcluded] = React.useState<Set<string>>(() => new Set());

  const filterKey = `${query.search}|${query.roles.join()}|${query.statuses.join()}`;
  const [seenFilter, setSeenFilter] = React.useState(filterKey);
  if (seenFilter !== filterKey) {
    setSeenFilter(filterKey);
    setSelectedIds(new Set());
    setAllFiltered(false);
    setExcluded(new Set());
  }

  const clearSelection = React.useCallback(() => {
    setSelectedIds(new Set());
    setAllFiltered(false);
    setExcluded(new Set());
  }, []);

  // Typed locally and pushed to the URL on a pause, so a manager typing "kim"
  // makes one request rather than three.
  //
  // The box adopts the URL during render rather than from an effect. A Back
  // navigation changes the query while the reader is not typing, and syncing it
  // after paint would show the previous search in the box for one frame — on a
  // control the reader is looking straight at.
  const [searchInput, setSearchInput] = React.useState(query.search);
  const [adopted, setAdopted] = React.useState(query.search);
  if (adopted !== query.search) {
    setAdopted(query.search);
    setSearchInput(query.search);
  }

  React.useEffect(() => {
    if (searchInput === query.search) return;
    const timer = window.setTimeout(() => change({ search: searchInput }), 300);
    return () => window.clearTimeout(timer);
  }, [change, query.search, searchInput]);

  const data = page.data;

  // Memoized because the column definitions depend on it. `data?.rows ?? []`
  // produces a fresh array on every render when the query has no data, which
  // would rebuild every column on every keystroke in the search box.
  const rows = React.useMemo(() => data?.rows ?? [], [data?.rows]);
  const total = data?.total ?? 0;

  /** Whether a row counts as selected under whichever mode is active. */
  const isSelected = React.useCallback(
    (membershipId: string) =>
      allFiltered ? !excluded.has(membershipId) : selectedIds.has(membershipId),
    [allFiltered, excluded, selectedIds],
  );

  const toggleRow = React.useCallback(
    (membershipId: string, next: boolean) => {
      if (allFiltered) {
        // Under "all matching", unticking a row is an exclusion rather than a
        // removal from a list the browser does not hold.
        setExcluded((current) => {
          const updated = new Set(current);
          if (next) updated.delete(membershipId);
          else updated.add(membershipId);
          return updated;
        });
        return;
      }
      setSelectedIds((current) => {
        const updated = new Set(current);
        if (next) updated.add(membershipId);
        else updated.delete(membershipId);
        return updated;
      });
    },
    [allFiltered],
  );

  const pageSelected = rows.filter((row) => isSelected(row.membershipId)).length;

  const columns = React.useMemo<ColumnDef<PeopleRow>[]>(
    () => [
      {
        id: 'select',
        // Fixed and narrow. A checkbox column that shares the table's flexible
        // width steals it from the one column that actually needs it.
        size: 56,
        header: () => (
          <SelectAllOnPage
            checked={pageSelected > 0 && pageSelected === rows.length}
            indeterminate={pageSelected > 0 && pageSelected < rows.length}
            onChange={(next) => {
              for (const row of rows) toggleRow(row.membershipId, next);
            }}
          />
        ),
        enableSorting: false,
        cell: ({ row }) => (
          <input
            aria-label={t('people.select_row', {
              name: row.original.displayName,
            })}
            checked={isSelected(row.original.membershipId)}
            className="size-4 accent-[var(--brand)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            onChange={(event) =>
              toggleRow(row.original.membershipId, event.target.checked)
            }
            type="checkbox"
          />
        ),
      },
      {
        id: 'displayName',
        accessorFn: (row) => row.displayName,
        header: t('people.column.person'),
        // Deliberately unsized. Every other column is fixed, so this one
        // absorbs whatever is left and shrinks first — which is why the name
        // and email truncate instead of the table growing a scrollbar.
        cell: ({ row }) => (
          <Link
            className="flex min-w-0 items-center gap-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            href={`${routes.academy(academySlug)}/people/${row.original.membershipId}`}
          >
            {/*
              * The same avatar the header, My Page, and the member profile
              * render, with the same `@cove/shared` fallback order: academy
              * override, global Cove photo, OAuth photo, then initials. The
              * initials-only disc this replaces meant a member who had uploaded
              * a photo still appeared as a letter here — the one place a
              * manager most needs to recognise them.
              */}
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
              <span className="block truncate text-[12px] text-sub">
                {row.original.email}
              </span>
            </span>
          </Link>
        ),
      },
      {
        id: 'role',
        accessorFn: (row) => row.role,
        header: t('people.column.role'),
        size: 140,
        cell: ({ row }) => (
          <RoleCell
            disabled={mutations.pending}
            onGrant={(role) =>
              mutations.grantRole.mutate({
                membershipId: row.original.membershipId,
                role,
              })
            }
            onRevoke={(role) =>
              mutations.revokeRole.mutate({
                membershipId: row.original.membershipId,
                role,
              })
            }
            role={row.original.role}
            roles={row.original.roles}
            status={row.original.status}
          />
        ),
      },
      {
        id: 'status',
        accessorFn: (row) => row.status,
        header: t('people.column.status'),
        size: 112,
        cell: ({ row }) => (
          <span
            className={cn(
              'inline-flex rounded-full px-2.5 py-0.5 text-[11.5px] font-bold',
              statusTones[row.original.status],
            )}
          >
            {t(`status.${row.original.status}`)}
          </span>
        ),
      },
      {
        id: 'classes',
        accessorFn: (row) => row.classCount,
        header: t('people.column.classes'),
        enableSorting: false,
        size: 100,
        meta: { align: 'right', hideable: true },
        cell: ({ row }) => (
          <span className="font-mono tabular-nums text-sub">
            {row.original.classCount}
          </span>
        ),
      },
      {
        id: 'joinedAt',
        accessorFn: (row) => row.joinedAt,
        header: t('people.column.joined'),
        size: 116,
        meta: { align: 'right', hideable: true },
        cell: ({ row }) =>
          row.original.joinedAt ? (
            <span className="whitespace-nowrap font-mono text-[12px] tabular-nums text-sub">
              {compactDate(row.original.joinedAt, i18n.language)}
            </span>
          ) : (
            // An invited member has not joined. "Not yet" is the answer; an em
            // dash would read as data the page failed to load.
            <span className="text-[12px] italic text-sub">
              {t('people.not_joined')}
            </span>
          ),
      },
      {
        id: 'updatedAt',
        accessorFn: (row) => row.updatedAt,
        header: t('people.column.updated'),
        size: 132,
        meta: { align: 'right', hideable: true },
        cell: ({ row }) => (
          <span className="whitespace-nowrap font-mono text-[12px] tabular-nums text-sub">
            {compactDate(row.original.updatedAt, i18n.language)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        size: 64,
        cell: ({ row }) => (
          <RowActions
            academyId={academyId}
            membershipId={row.original.membershipId}
            mutations={mutations}
            status={row.original.status}
          />
        ),
      },
    ],
    [academyId, academySlug, i18n.language, isSelected, mutations, pageSelected, rows, t, toggleRow],
  );

  if (page.isError && !data) {
    return (
      <Panel title={t('people.title')} tone="danger">
        <div className="p-4">
          <p className="text-[13px] text-danger">
            {errorText(page.error, t('people.failed'))}
          </p>
          <button
            className="mt-3 inline-flex h-9 items-center rounded-lg bg-danger px-3.5 text-[13px] font-bold text-on-danger transition-opacity hover:opacity-90"
            onClick={() => void page.refetch()}
            type="button"
          >
            {t('retry')}
          </button>
        </div>
      </Panel>
    );
  }

  const unfiltered =
    query.search === '' && query.roles.length === 0 && query.statuses.length === 0;

  return (
    <div className="flex flex-col gap-3">
      <DataTable
        columns={columns}
        data={rows}
        emptyMessage={
          unfiltered ? t('people.empty_academy_title') : t('people.empty_title')
        }
        // Every column but Person declares a width, so Person takes the slack
        // and truncates. That is what keeps this table inside its card instead
        // of scrolling sideways away from the names.
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
            const sort = peopleSortFields.find(
              (field): field is PeopleSortField => field === first.id,
            );
            if (!sort) return;
            change({ sort, direction: first.desc ? 'desc' : 'asc' });
          },
          onGlobalFilterChange: setSearchInput,
          onColumnFiltersChange: () => {},
        }}
        pageSize={query.pageSize}
        searchPlaceholder={t('people.search_placeholder')}
        toolbarFilters={
          <>
            <FacetedFilter
              onSelectedChange={(values) =>
                change({
                  roles: academyRoles.filter((role) =>
                    values.includes(role),
                  ) as AcademyRole[],
                })
              }
              options={academyRoles.map((role) => ({
                label: t(`role.${role}`),
                value: role,
                count:
                  data?.facets.roles.find((facet) => facet.value === role)
                    ?.count ?? 0,
              }))}
              selected={query.roles}
              showCounts
              title={t('people.filter_role')}
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
                label: t(`status.${status}`),
                value: status,
                count:
                  data?.facets.statuses.find((facet) => facet.value === status)
                    ?.count ?? 0,
              }))}
              selected={query.statuses}
              showCounts
              title={t('people.filter_status')}
            />
          </>
        }
        toolbarActions={
          <>
            <PageSizePicker
              onChange={(pageSize) => change({ pageSize })}
              value={query.pageSize}
            />
            <button
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand px-3.5 text-[13.5px] font-bold text-on-brand transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              onClick={() => setImporting(true)}
              type="button"
            >
              <FileSpreadsheet aria-hidden className="size-4" strokeWidth={2.25} />
              {tOps('import.open')}
            </button>
          </>
        }
      />

      <BulkActions
        academyId={academyId}
        allFilteredSelected={allFiltered}
        classes={classes}
        filteredTotal={total}
        onApplied={() => void page.refetch()}
        onClearSelection={clearSelection}
        onSelectAllFiltered={() => {
          setAllFiltered(true);
          setSelectedIds(new Set());
          setExcluded(new Set());
        }}
        peopleRevision={data?.peopleRevision ?? 0}
        selectedCount={
          allFiltered ? Math.max(0, total - excluded.size) : selectedIds.size
        }
        selection={selectionFor({
          allFiltered,
          excluded,
          query,
          selectedIds,
        })}
      />

      <ImportWizard
        academyId={academyId}
        onClose={() => setImporting(false)}
        onImported={() => void page.refetch()}
        open={importing}
      />

      {mutations.error ? (
        <p
          className="rounded-lg border border-danger/25 bg-danger/5 px-3.5 py-2.5 text-[13px] text-danger"
          role="alert"
        >
          {errorText(mutations.error, t('people.action.update_failed'))}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <Panel title={t('people.title')} tone="brand">
          <EmptyState
            body={
              unfiltered
                ? t('people.empty_academy_body')
                : t('people.empty_body')
            }
            icon={UsersRound}
            title={
              unfiltered
                ? t('people.empty_academy_title')
                : t('people.empty_title')
            }
            tone="brand"
          />
        </Panel>
      ) : (
        <p className="text-[12px] text-sub">
          {t('people.showing', {
            from: (data!.page - 1) * data!.pageSize + 1,
            to: (data!.page - 1) * data!.pageSize + rows.length,
            total,
          })}
        </p>
      )}
    </div>
  );
}

/**
 * The selection, in the shape §12 accepts.
 *
 * The two modes are not interchangeable and the conversion is where that is
 * enforced: ticked rows become an explicit id list, and "everything matching"
 * becomes the normalized filter plus the exclusions. The browser never turns
 * the second into the first — it does not hold those ids, and the set it could
 * assemble would be the set as of the last render rather than as of the write.
 *
 * Null when nothing is selected, so the action bar has one thing to check.
 */
function selectionFor(input: {
  allFiltered: boolean;
  excluded: Set<string>;
  query: { search: string; roles: AcademyRole[]; statuses: MembershipStatus[] };
  selectedIds: Set<string>;
}): PeopleSelection | null {
  if (input.allFiltered) {
    return {
      mode: 'filter',
      search: input.query.search,
      roles: input.query.roles,
      statuses: input.query.statuses,
      excludedMembershipIds: [...input.excluded],
    };
  }
  if (input.selectedIds.size === 0) return null;
  return { mode: 'ids', membershipIds: [...input.selectedIds] };
}

/**
 * The header checkbox, including its third state.
 *
 * `indeterminate` is a DOM property with no HTML attribute, so it has to be set
 * through a ref. Without it a partly-selected page shows an unticked box, and
 * clicking it would read as "select all" while actually clearing the selection
 * the manager just made.
 */
function SelectAllOnPage({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: (next: boolean) => void;
}) {
  const { t } = useTranslation('manager');
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input
      aria-label={t('people.select_page')}
      checked={checked}
      className="size-4 accent-[var(--brand)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      onChange={(event) => onChange(event.target.checked)}
      ref={ref}
      type="checkbox"
    />
  );
}

/**
 * A member's roles: a badge that opens a menu, rather than a select box.
 *
 * The select this replaces was wrong in three ways that only show up in use.
 *
 * It was a *live control on every row*. A native select changes value on
 * arrow-key press and, on desktop, on scroll-wheel over it — so a manager
 * scrolling a roster could demote a teacher without touching anything. A role
 * change reassigns classes and drops enrolments; it is not a thing to do by
 * accident.
 *
 * It *looked* editable for rows that are not. A suspended membership cannot
 * change role, and a control the API would refuse is worse than no control.
 *
 * And it was 144 pixels of chrome per row for a value that is read far more
 * often than it is changed — which is most of why the table needed a horizontal
 * scrollbar.
 *
 * What replaces it reads as the value: the same coloured badge the role wears
 * in the control tower's composition band and everywhere else in the product.
 * It happens to be a button, so changing a role is two deliberate clicks.
 *
 * The menu is a set of checkboxes, not a radio group. A membership can hold
 * several roles — the director who also teaches and also writes the curriculum
 * — so ticking a role grants it and unticking revokes it, in place. The badge
 * carries the highest role and a `+n` for the rest, which is the compact form
 * of the same fact.
 */
function RoleCell({
  disabled,
  onGrant,
  onRevoke,
  role,
  roles,
  status,
}: {
  disabled: boolean;
  onGrant: (role: AcademyRole) => void;
  onRevoke: (role: AcademyRole) => void;
  /** The highest role held, which the badge shows. */
  role: AcademyRole;
  /** Every role held, which the menu ticks. */
  roles: readonly AcademyRole[];
  status: MembershipStatus;
}) {
  const { t } = useTranslation('manager');
  const extras = roles.length - 1;

  const badge = (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold',
        toneStyles[roleTones[role]].chip,
      )}
    >
      {t(`role.${role}`)}
      {extras > 0 ? <span className="opacity-70">+{extras}</span> : null}
    </span>
  );

  // A role only changes while the membership is active. Rendering the plain
  // badge — not a disabled button — is the honest form: there is nothing here
  // to press, so nothing offers to be pressed.
  if (status !== 'ACTIVE') return badge;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={t('people.action.change_role_for', { role: t(`role.${role}`) })}
          className={cn(
            'group inline-flex items-center gap-1 rounded-full py-1 pl-2.5 pr-1.5 text-[12px] font-bold transition-opacity',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
            'disabled:opacity-50',
            toneStyles[roleTones[role]].chip,
          )}
          disabled={disabled}
          type="button"
        >
          {t(`role.${role}`)}
          {extras > 0 ? <span className="opacity-70">+{extras}</span> : null}
          {/* The only affordance the badge carries. Faint until hover, so a
              column of roles reads as values rather than as a row of buttons. */}
          <ChevronDown
            aria-hidden
            className="size-3 opacity-50 transition-opacity group-hover:opacity-100"
            strokeWidth={2.5}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuLabel>{t('people.column.role')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {academyRoles.map((option) => {
          const held = roles.includes(option);
          // Offered only when the result would be a legal set. STUDENT
          // combines with no staff role in either direction, and unticking the
          // last role would leave a membership that grants nothing — the
          // action for that is removing the member, which lives in the row
          // menu with its own confirmation.
          const allowed = held
            ? roles.length > 1
            : canCombineAcademyRoles([...roles, option]);
          return (
            <DropdownMenuCheckboxItem
              checked={held}
              className="gap-2"
              disabled={disabled || !allowed}
              key={option}
              onCheckedChange={(next) =>
                next ? onGrant(option) : onRevoke(option)
              }
              onSelect={(event) => {
                // Keep the menu open: granting two roles is one errand, and a
                // menu that closed after each tick would make it three.
                event.preventDefault();
              }}
            >
              <span
                aria-hidden
                className={cn(
                  'size-2 rounded-full',
                  toneStyles[roleTones[option]].meter,
                )}
              />
              {t(`role.${option}`)}
            </DropdownMenuCheckboxItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Everything else a manager does to one row, behind one glyph.
 *
 * A menu rather than a row of buttons. "Suspend" spelled out was a wide column
 * carrying a destructive verb next to every name — visually loud in proportion
 * to how often it is used, and part of why the table did not fit. Behind a
 * menu it costs 56 pixels, and reaching it is deliberate.
 *
 * The last-active-manager rule stays on the server. The item is offered and the
 * refusal is shown, because a button disabled by a rule the browser guessed at
 * would be wrong the moment a second manager was added in another tab.
 */
function RowActions({
  academyId,
  membershipId,
  mutations,
  status,
}: {
  academyId: string;
  membershipId: string;
  mutations: ReturnType<typeof usePeopleMutations>;
  status: MembershipStatus;
}) {
  const academySlug = useAcademySlug();
  const { t } = useTranslation('manager');

  return (
    <div className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={t('people.action.menu')}
            className="grid size-8 place-items-center rounded-md text-sub transition-colors hover:bg-accent hover:text-ink data-[state=open]:bg-accent data-[state=open]:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40"
            disabled={mutations.pending}
            type="button"
          >
            <Ellipsis className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem asChild>
            <Link
              href={`${routes.academy(academySlug)}/people/${membershipId}`}
            >
              <UserPen className="text-sub" />
              {t('people.action.profile')}
            </Link>
          </DropdownMenuItem>

          {status === 'ACTIVE' ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-danger focus:text-danger"
                onSelect={() => mutations.suspend.mutate(membershipId)}
              >
                <ShieldOff className="text-danger" />
                {t('people.action.suspend')}
              </DropdownMenuItem>
            </>
          ) : status === 'SUSPENDED' ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => mutations.restore.mutate(membershipId)}
              >
                <UserCheck className="text-success" />
                {t('people.action.restore')}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/**
 * How many rows a page holds.
 *
 * Three sizes rather than a free number, because the server accepts three: a
 * control that could ask for 5,000 rows would be a control that sometimes
 * returns an error a manager cannot act on.
 *
 * Changing it deliberately does *not* reset the page. It widens the window on
 * the result the manager is already reading, rather than sending them back to
 * the top of it.
 */
function PageSizePicker({
  onChange,
  value,
}: {
  onChange: (pageSize: (typeof peoplePageSizes)[number]) => void;
  value: number;
}) {
  const { t } = useTranslation('manager');
  const id = React.useId();
  return (
    <span className="flex items-center gap-1.5">
      <label className="text-[12px] font-bold text-sub" htmlFor={id}>
        {t('people.page_size')}
      </label>
      <select
        className="h-10 rounded-lg border border-border bg-card px-2 text-[13px] font-bold outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
        id={id}
        onChange={(event) =>
          onChange(
            Number(event.target.value) as (typeof peoplePageSizes)[number],
          )
        }
        value={value}
      >
        {peoplePageSizes.map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>
    </span>
  );
}

/**
 * A date short enough to fit a fixed column.
 *
 * `2026-07-23` rather than `Jul 23, 2026`: it is a third narrower, it sorts
 * visually, and in tabular figures a column of them lines up so a manager can
 * scan for the recent ones. The long form is what pushed this table into a
 * horizontal scrollbar.
 */
function compactDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date(iso))
    .replace(/\s/g, '');
}
