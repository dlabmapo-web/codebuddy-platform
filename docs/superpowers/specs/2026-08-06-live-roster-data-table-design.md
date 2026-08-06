# Live Roster as a Data Table

**Date:** 2026-08-06
**Status:** Proposed
**Scope:** The teacher's class roster at
`/studio/academies/[academyId]/teach/classes/[classId]`. The academy-wide
student list is explicitly not built here — see "Why the columns stop where
they do".

## Problem

Every other list in the studio — classes, courses, members, applications,
invitations — is the shared [`DataTable`](packages/web/src/components/studio/data-table.tsx).
The live roster is a hand-rolled `<ul>`
([live-roster.tsx:153-206](packages/web/src/app/(v2-studio)/studio/academies/[academyId]/teach/classes/[classId]/_components/live-roster.tsx#L153-L206)),
so it has no sortable headers, no column visibility, and a search box that is a
second implementation of something `DataTable` already does.

It also cannot show a username, because the roster payload has never carried
one: [`monitoringRosterStudentSchema`](packages/shared/src/monitoring/monitoring.ts#L500)
selects `displayName` and `email` only. A teacher reading a roster identifies a
student the way the student identifies themselves at sign-in, and that is now a
username.

## Why the columns stop where they do

This page is one class. `roster.class` is a single group and `roster.courses` is
that group's assigned course list, so a Group column would print "E2E Cohort" on
every row and a Course column would repeat the same chips on every row. Columns
that never vary are noise in a table and cost horizontal space the live columns
need.

Both answers still belong on the page, just once rather than per row: the class
name is already the page title, and the assigned courses — which the payload
carries today and nothing renders — are added to the header beside it.

Group and Course become real columns only on an academy-wide list, where a
student's row belongs to a different class and a different course than the row
above it. That page does not exist in v2 and is not built here.

## Design

### The username the table needs

`monitoringRosterStudentSchema` gains `username: z.string().nullable()`, and
`getClassRoster` selects it alongside `displayName` and `email`
([monitoring.service.ts:116-123](packages/api/src/monitoring/monitoring.service.ts#L116-L123)).
Nullable, because an OAuth account never passed through the signup form and a
teacher's roster must still render that student rather than omit them.

Nothing else in the monitoring stack changes. Presence deltas stay identical —
the username is durable enrollment data, and putting it on the socket payload
would mean a rename could arrive as a presence event.

### Columns

| Column | Content | Sorts on |
|---|---|---|
| Student | Display name in bold, `@username` beneath it | Display name |
| Status | `LiveStateBadge` | Attention order, not alphabetical |
| Exercise | "In an exercise" / "Not in an exercise" | Whether a material is open |
| Last seen | "1 hour ago", relative | The underlying timestamp |
| Result | Latest run outcome, when there is one | Not sortable |
| — | "Open live", only when `canOpenLive` | Not sortable |

The Student column's `accessorFn` concatenates display name, username, and
email. That single choice is what makes all three searchable through the
table's own global filter, which is why the component's separate `<input>` is
removed rather than reimplemented.

Two behaviours from the current list are kept because they are not decoration:
a row whose membership no longer grants access says so in place of the email,
and the relative timestamp keeps `suppressHydrationWarning` — it is computed
against the reader's clock, so server and browser legitimately disagree by
whatever time the response spent in flight.

### Ordering, and why the default is not a column

`sortRoster` puts students who need attention first — solving, then idle,
online, reconnecting, offline — because a teacher opens this page to find
somebody to help and alphabetical order buries them
([roster.ts:117-133](packages/web/src/lib/monitoring/roster.ts#L117-L133)).

That default survives by construction: `DataTable` starts with empty sorting
state, and TanStack renders rows in input order until a header is clicked. So
the component keeps passing `sortRoster(...)` output and the deliberate order is
what a teacher sees on arrival, while clicking a header still re-sorts.

The Status column's own sort must use the same attention order rather than the
enum's alphabetical one, or clicking it would scatter the students who matter.

### Filtering

The state pills stay. They are not redundant with the table's search: they
encode a product decision the table cannot express, that `online` means any live
connection and therefore includes solving and idle
([roster.ts:63-76](packages/web/src/lib/monitoring/roster.ts#L63-L76)). A
faceted filter over the raw state would offer five checkboxes and lose that.

So the split is: pills decide which rows are handed to the table, and the table
owns text search. `matchesFilter` keeps its caller.

`filterRoster` and `matchesSearch` lose theirs and are deleted along with their
tests. `matchesSearch` searched name and email only; leaving it in place would
mean two search implementations disagreeing about whether a username counts.

### Pagination

Deliberately none — `pageSize` is omitted, which `DataTable` already documents
as "render every row".

A page size would let a student start solving on page two and stay invisible,
which defeats what the page is for. The roster is already bounded by
`monitoringLimits.rosterMaxEnrollments`, and the payload's `truncated` flag
still warns when a class exceeds it.

### Counts

The summary cards keep counting `rows`, not the filtered set, so a card can
never disagree with what a filter is showing beneath it. This is existing
behaviour and the table must not quietly change it.

### Strings

New `monitoring` keys in `en` and `ko` for the column headers, plus a header
label for the assigned course list. Enforced by
`pnpm --filter @cove/web i18n:check`.

## Verification

- `roster.spec.ts` drops the `filterRoster` and `matchesSearch` cases and keeps
  its `matchesFilter`, `countRoster`, and `sortRoster` coverage.
- A test proving the Status column's comparator produces the attention order
  rather than the alphabetical one.
- A test proving a roster row with a null username still renders and still
  matches a search on its display name.
- The monitoring service test covers `username` reaching the roster payload.
- `teacher-live-monitoring.spec.ts` scopes the live assertion with
  `getByRole('listitem')` and must move to `getByRole('row')`. The scoping
  itself is load-bearing and its comment says why: the summary card and the
  filter pill also read "Solving", and an unscoped assertion once passed while
  the student sat visibly offline.
- `pnpm typecheck`, `pnpm --filter @cove/web test`, and the i18n check.
