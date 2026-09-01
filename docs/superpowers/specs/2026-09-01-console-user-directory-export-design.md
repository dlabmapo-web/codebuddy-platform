# Console User Directory Export

**Date:** 2026-09-01
**Status:** Implemented
**Scope:** Downloading the platform user directory as a spreadsheet
**Branch:** `feat/platform-admin-console` (continues)

**Builds on:** `docs/superpowers/specs/2026-09-01-console-people-operations-design.md`

---

## 1. Summary

An operator can read the directory and cannot take it anywhere. Every question
that ends in a spreadsheet — reconcile our accounts against the academy's own
list, send a campus its roster, count seats for an invoice — currently ends in
copying rows out of a browser twenty-five at a time.

This adds one download: `GET /platform-users/export` returns an `.xlsx` of
every account matching the filter the operator is looking at, one row per
membership, with the columns the table shows.

### 1.1 What this is not

It is **not a second view of the data.** The export runs the directory's own
`buildUsersWhere` over the directory's own select. If it can ever return a row
the table would not show, it is wrong.

It is **not a second XLSX writer.** `content-workbook-writer.ts` already writes
one by hand and its own header explains why there must be only one. §4 moves it
rather than copying it.

It is **not a widening.** Every column is a field already on screen. §3.3.

---

## 2. Decisions

### 2.1 The export follows the filter, and the button says what it will do

The directory already has one control for "which people": the facet row. The
export uses whatever it is set to — search, academy, role, account status,
membership status, and the no-academy flag — so an operator who can see the
rows they want can download exactly those.

The one addition is a role shortcut on the button itself, because "just the
students" is the request this feature exists for and setting a chip first is a
detour:

```
┌──────────────────────────────┐
│ Everything in this view   49 │
├──────────────────────────────┤
│ 🎓 Students               34 │
│ 👤 Teachers                7 │
│ 🛡  Team leads              3 │
│ ⚙  Managers                3 │
└──────────────────────────────┘
```

This is not the lens rail returning. It is not a filter — it changes nothing
on screen, sets no state, and is gone the moment the file is written. And the
counts are not new: they are `composition`, already computed for the summary
strip under exactly these semantics — every other facet applied, the role
narrowing dropped — so the number beside "Students" is the number of rows the
file will hold.

A picked role **replaces** the filter's roles for that download rather than
intersecting with them. Intersecting would silently produce an empty file
whenever the two disagreed, and an empty spreadsheet is the least debuggable
possible answer.

### 2.2 One row per membership

An account holding a role in two academies is two rows.

The table has to collapse that — a row four lines tall cannot be scanned — but
a spreadsheet has the opposite constraint. One academy and one role per row is
what makes Excel's own filters and pivot tables work, which is the reason to
want a spreadsheet instead of a screenshot.

An account belonging to **no** academy is still one row, with the academy and
role columns empty. Dropping them would make the file disagree with the total
the operator just read, and "accounts in no academy" is a set they specifically
go looking for.

The consequence to state plainly: **the row count is not the account count.**
The file's first sheet is named for what a row is, and §5 puts the account
count in the filename rather than implying it.

### 2.3 The export is audited; it needs no new permission

`platform.users.read` already lets the caller page through every one of these
rows. A separate `platform.users.export` would grant nothing that
`platform.users.read` does not, and a permission that cannot be withheld
independently is theatre.

What is genuinely different is that the rows leave the system in bulk, in a
file that outlives the session and gets forwarded. So the act is recorded:
one `AuditLog` row per export — `platform.users.exported`, `academyId: null`,
carrying the resolved filter and the row count in `after`.

Not deduplicated, unlike the participation read (§3.5 of the people operations
design). That one is deduped because a page refresh is not a second look; this
one is deduped by nothing because a second download **is** a second extraction.

### 2.4 Refuse a file too large rather than truncate one

`PLATFORM_USERS_EXPORT_MAX_ACCOUNTS = 5000`. Past it the request fails with
`PLATFORM_EXPORT_TOO_LARGE` and the interface says to narrow the filter.

The alternative — writing the first five thousand — hands the operator a file
that looks complete and is not, and the reconciliation it was pulled for
silently comes out wrong. This is the rule `ContentImportService.buildTemplate`
already applies to an oversized course, in the words its comment uses: Cove
never offers a file its own reader would have to be told to distrust.

The cap exists because the response is built synchronously inside the request.
A background job with an emailed link is the answer past that scale, and this
is not that.

### 2.5 Bytes over a controller, not over oRPC

The same reasoning `content-import.controller.ts` gives, in the same direction:
the contract layer carries JSON, and a spreadsheet base64-encoded into a JSON
string is a third larger and gets decoded twice.

A `GET` with the filter in the query string, so the browser can be handed a URL
and the download is an ordinary navigation-free `fetch` + `Blob` — the pattern
`downloadCsv` already uses in the academy people directory.

---

## 3. What is in the file

### 3.1 Columns

| Column | Source | Note |
|---|---|---|
| Name | `userDisplayName(person)` | account name, then username, then email — the console's own naming rule |
| Email | `user.email` | |
| Username | `user.username` | |
| Account | `UserStatus` | localized label |
| Platform access | `platformRole` | the operator label, or empty |
| Signed up | `user.createdAt` | `YYYY-MM-DD` |
| Academy | `membership.academyName` | empty for an unaffiliated account |
| Academy address | `membership.academySlug` | the operator's handle for an academy |
| Role | `membership.role` | localized label |
| Membership | `membership.status` | localized label |
| Member since | `membership.joinedAt` | empty while invited |

### 3.2 What is deliberately absent

**Student and employee numbers.** The directory *searches* them and does not
*show* them. They live on the academy-local profile, and an export is the
wrong place to quietly promote a field from searchable to distributed.

**Everything behind the participation permission.** No class, no course, no
solve count, no active time. §3.4 of the people operations design gates those
on their own permission and audits them per student; a directory export holding
them would be that permission bypassed by a filename.

**Last sign-in.** It is on the account page, not the table, and §1.1 says the
export is the table.

### 3.3 Dates are `YYYY-MM-DD`, always

Not the reader's locale format. A column of `08/29/2026` is ambiguous between
two continents, sorts as text, and is the single most common way a date column
arrives wrong in a spreadsheet somebody else opens.

### 3.4 Every cell is an inline string, which is also the injection answer

The writer emits `t="inlineStr"`. A display name of `=IMPORTSMLXML(...)` — the
classic spreadsheet formula injection — is therefore text in the cell rather
than a formula Excel evaluates on open.

This is worth stating because it is the concrete reason this feature ships
`.xlsx` and not CSV. A CSV has no cell type: the same name in a CSV *is* a
formula, and the usual mitigation is prefixing cells with an apostrophe, which
corrupts the value for every legitimate reader in exchange.

---

## 4. One writer, moved

`content-workbook-writer.ts` needs nothing from content import. It takes sheet
names and rows of strings and emits a zip. Only its location and the type of
its parameter tie it to one feature.

It moves to `packages/api/src/common/workbook-writer.ts` as
`writeWorkbook(workbook: WorkbookData)`, where `WorkbookData` is structural:

```ts
export type WorkbookData = {
  sheets: readonly { name: string; rows: readonly (readonly string[])[] }[];
};
```

`GeneratedWorkbook` satisfies it, so content import calls the moved function
unchanged. Its own header already argues that a second XLSX implementation in
this process is the thing to avoid; this keeps that true while giving the
second caller what it needs.

The writer still cannot read. That is the property §7.2 of the Excel import
design depends on, and moving the file does not change it.

---

## 5. Shaping lives in `@cove/shared`

`packages/shared/src/platform/user-export.ts`, in the shape of
`content/import/workbook-template.ts`:

- `PLATFORM_USERS_EXPORT_MAX_ACCOUNTS`
- `UserExportRow` — one flat membership row, already stringified
- `userExportCopy: Record<WorkbookLocale, …>` — headers and enum labels
- `buildUserExportSheet(rows, locale): string[][]`
- `userExportFilename({ locale, accounts, role })`

Headers and enum values are **localized**, unlike the content import workbook.
That file is localized only in its instructions because it round-trips back
into a reader that matches on English keys. This one never round-trips: it is
read by a person, and a Korean operator should not be handed `TEAM_LEAD`.

Putting the shaping here rather than in the service is what makes it testable
without a database — the row-per-membership expansion, the empty-academy case,
and the date format are all pure.

Filename: `cove-users-2026-09-01-49-accounts.xlsx`, or
`cove-students-2026-09-01-34-accounts.xlsx` when a role was picked. The count
is in the name because §2.2 makes the row count and the account count
different numbers, and the one the operator has in their head is the account
count.

---

## 6. API

### 6.1 `PlatformUsersService.exportDirectory`

```ts
async exportDirectory(
  identity: SupabaseIdentity,
  input: ResolvedListPlatformUsersInput & { locale: WorkbookLocale },
): Promise<{ filename: string; bytes: Buffer }>
```

1. `requirePermission("platform.users.read")`.
2. Count under `buildUsersWhere`; refuse over the cap.
3. Read with `userSummarySelect` — the directory's own select, no paging.
4. Expand to membership rows, ordered by account then by the console's own
   membership order, so the file's order matches the page's.
5. `writeWorkbook`.
6. Audit.

The count and the read are one `$transaction`, so a file cannot be written
against a set that grew past the cap between the two statements.

### 6.2 `PlatformUsersController`

`@Controller("platform-users")`, `@Get("export")`, bearer auth through
`SupabaseAuthService`, `AppExceptionFilter` for the coded body, and
`RateLimitService.assert('platform-users-export:<user>', 10, 60_000)` — the
same shape as the content import template route, which is the only other
place in this codebase that hands out a generated workbook.

Query parameters are the serialized directory query plus `locale`, parsed by
`parsePlatformUsersQuery` — the same function the page and the redirect use, so
a hand-edited export URL degrades to a default exactly as a hand-edited
directory URL does.

---

## 7. Web

A split button in the table's `toolbarActions`: pressing it exports the current
view, and the caret opens the role shortcut of §2.1.

`downloadUserExport()` in `_lib/download-export.ts`, in the shape of
`upload-workbook.ts`: attach the bearer token, `fetch`, `Blob`,
`URL.createObjectURL`, click, revoke. The filename comes from
`Content-Disposition` rather than being rebuilt in the browser, so the server
stays the one authority on what the file is called.

States: pending disables the button and says so; a refusal renders the coded
error through `useErrorText`, so `PLATFORM_EXPORT_TOO_LARGE` reads as "narrow
the filter" rather than as a failed download.

---

## 8. Tests

### 8.1 Unit — `@cove/shared`
- One account with two memberships becomes two rows carrying the same account
  columns.
- An account with no membership becomes one row with empty academy and role.
- Dates render `YYYY-MM-DD`; a null `joinedAt` renders empty, not `Invalid Date`.
- Every column has a header in both locales.

### 8.2 Unit — `@cove/api`
- `writeWorkbook` still round-trips through the existing reader after the move
  (the existing `content-workbook.spec.ts`, retargeted).
- A cell value starting with `=` survives as text, not as a formula element.

### 8.3 Authorization
- The export refuses without `platform.users.read`.
- The export contains no participation column and no academy-profile field,
  asserted on the built sheet rather than on the mapper.

---

## 9. Phases

| # | Work | Done when | Status |
|---|---|---|---|
| 1 | Move the writer; retarget content import and its spec | `pnpm -r test` green with one XLSX writer | Done |
| 2 | `user-export.ts` shaping + tests | Rows and headers are right without a database | Done |
| 3 | Service, controller, permission check, audit, cap | `curl` returns a file that opens | Done |
| 4 | Toolbar split button + download helper | An operator downloads students in two clicks | Done |

---

## 10. Where the build differs

**The date column takes a time zone.** §3.3 said `YYYY-MM-DD` and stopped
there, which would have meant UTC. An account created at 23:00 UTC is the next
day in Seoul, so the file would have disagreed with the page it came from by a
day — read as a bug in the export, not as a time zone. The browser sends
`Intl.DateTimeFormat().resolvedOptions().timeZone`; an unusable value falls
back to UTC rather than failing a download over a query parameter.

**The filename names a role only when exactly one is selected.** Two roles have
no shorter honest name than "users", and a file called
`cove-students-…` holding teachers would be worse than a generic name.

**`AuthModule` joins `PlatformModule`.** A route that streams bytes arrives
outside the oRPC pipeline and verifies its own bearer token, exactly as the
content importer's does. Nest resolves this at boot rather than at compile, so
it is worth naming: the route was verified live returning
`AUTHENTICATION_REQUIRED` before the UI existed.

**`Access-Control-Expose-Headers` is set on the response.** The browser reads
the filename out of `Content-Disposition`, and a cross-origin `fetch` cannot
see a header it is not offered — the global CORS config exposes none.

### 10.1 Still open

**Nothing verifies the whole route end to end.** The workbook is round-tripped
through the member importer's reader (a different implementation, so it is a
real round trip), the shaping is unit-tested, and the route was exercised
unauthenticated. What is untested is `exportDirectory` itself — the cap, the
audit row, and the permission refusal — which needs the database harness.
