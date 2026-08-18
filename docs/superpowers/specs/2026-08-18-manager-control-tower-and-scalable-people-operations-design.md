# Manager Control Tower and Scalable People Operations

**Status:** Approved design  
**Date:** 2026-08-18  
**Scope:** Cove Studio manager overview and academy people operations

## 1. Purpose

Replace the Manager's placeholder academy overview with an operational control
tower, then make people administration safe and responsive for large academies.
The approved design ships in two stages:

1. the control tower and server-controlled people directory; and
2. import, bulk mutations, invitation delivery, and conflict reporting.

Both stages belong to this design. Staging controls delivery risk; it does not
remove any requested capability.

## 2. Current state

The academy root currently shows only the academy name, the Manager role, and a
hint linking to Applications, Members, and Invitations. Existing modules already
provide strong foundations:

- membership applications, invitations, role changes, suspension, and restore;
- academy-scoped member profiles;
- class lifecycle, teacher assignment, course assignment, and enrollment;
- teacher-scoped learning facts, progress, attention, and difficult problems;
- academy-scoped audit writes; and
- private media assets.

The missing leverage is a manager read model. Managers must visit separate pages
to discover urgent work, and the current member interfaces return complete arrays
that the browser searches, filters, and pages locally.

## 3. Goals

- Give a Manager one truthful picture of academy identity, scale, growth,
  operational exceptions, and learning health.
- Turn every overview exception into a direct action or drill-down.
- Reuse existing learning definitions without weakening teacher-only access.
- Move people pagination, filtering, sorting, validation, and bulk policy to the
  server.
- Make import and bulk mutations previewable, atomic, idempotent, and auditable.
- Deliver invitations by email and report delivery state honestly.
- Keep English and Korean experiences equivalent and accessible.

## 4. Non-goals

- Attendance, schedules, rooms, makeup lessons, billing, or guardian accounts.
- A general-purpose report builder.
- Predictive student risk scoring or permanent student ranking.
- Combining participation, completion, and mastery into one opaque score.
- Allowing imports to silently update an existing membership.
- Giving platform administrators routine academy access.

## 5. Roles and authorization

All new overview, academy-profile editing, import, bulk, and invitation-delivery
interfaces require an active `MANAGER` membership in the requested academy.
They use existing named permissions:

- `academy.read` for academy identity;
- `academy.settings.manage` for academy profile changes;
- `academy.members.manage` for people reads and mutations;
- `academy.analytics.read` for academy-scoped learning aggregates;
- `classes.manage`, `class-enrollments.manage`, and
  `class-teachers.manage` for relevant class actions.

Every query and mutation carries an explicit `academyId`. A platform `ADMIN`
without an active Manager membership receives no normal access. Cross-academy
identifiers fail closed. Permission checks happen before cached or computed data
is returned.

## 6. Delivery stages

### 6.1 Stage 1 — control tower and scalable reads

- Academy profile header and manager editing.
- Role and class totals.
- Operational attention queue.
- Student growth and recently joined members.
- Active learner rate and class comparison.
- Difficult problems and factual student-attention preview.
- Recent class and membership changes.
- Quick actions.
- Server-controlled people directory using TanStack Table.

### 6.2 Stage 2 — scalable mutations and delivery

- CSV/XLSX member import and localized templates.
- Server-side validation preview.
- Bulk invitations, class enrollment, role changes, and suspension.
- Duplicate and conflict reporting.
- Durable bulk-operation results and audit summaries.
- Invitation email queue, resend, and delivery status.

## 7. Module architecture

### 7.1 `AcademyOperationsOverview`

This is the deep read module for the manager page. Its interface returns one
bounded snapshot containing academy profile, totals, action counts and previews,
growth, learning health, class comparison, difficult problems, and recent
activity. The page never joins five existing interfaces in the browser.

The implementation collaborates internally with academy profile, memberships,
classes, learning facts, and audit modules. These internal seams do not expand
the page interface.

### 7.2 `AcademyProfile`

This module owns manager-editable academy presentation and contact data. It
reuses private `MediaAsset` records for cover and gallery images and owns signed
read access. Profile image authorization depends on academy membership, never on
the uploader.

### 7.3 `PeopleDirectory`

This module owns page queries, stable sorting, search, role/status filters,
facets, and exact filtered counts. Its interface is the test surface shared by
the manager table and eligible-member selectors that later migrate to it.

### 7.4 `ManagerLearningAnalytics`

This module adds a Manager adapter at the existing analytics seam. It reuses the
current pure measurement and attention implementations but resolves all active
classes in the academy. The teacher adapter remains restricted to assigned
classes. Manager access is not implemented by branching around the teacher
authorization module.

### 7.5 `BulkPeopleOperations`

This deep module owns workbook parsing, row normalization, preview lifetime,
duplicate detection, conflict rules, authorization, atomic commit, idempotency,
results, and audit summaries. The browser never orchestrates row-by-row writes.

### 7.6 `InvitationDelivery`

This module owns durable delivery attempts and provider callbacks. Production
email and a local-development sink are two adapters at the delivery seam. An
invitation's lifecycle and an email attempt's delivery state remain distinct.

## 8. Data model

### 8.1 Academy profile

Extend `Academy` with nullable `addressLine1`, `addressLine2`, `locality`,
`region`, `postalCode`, `countryCode`, `contactPhone`, `contactEmail`,
`timeZone`, and `profileUpdatedAt`, plus integer `peopleRevision` defaulting to
zero. `timeZone` defaults to `Asia/Seoul` for existing academies but becomes the
authoritative academy-local time seam. Membership, invitation, and enrollment
mutations increment `peopleRevision` in their transaction. Directory selections
and import previews carry the revision so a concurrent people change cannot be
silently overwritten.

Add `AcademyMedia` with `academyId`, `assetId`, `kind` (`COVER` or `GALLERY`),
`position`, `createdAt`, and `updatedAt`. One academy has at most one cover.
Gallery positions are unique per academy. Replacing an image follows existing
immutable-object and delayed-cleanup behavior. Extend `MediaAssetPurpose` with
academy cover and gallery purposes so upload validation cannot confuse member
avatars with academy media.

Add nullable `displayNameHint` to `AcademyInvitation`. Import never changes a
global account name. On acceptance, the hint initializes the academy-scoped
display-name override only when the recipient has not supplied one.

### 8.2 Import sessions

Add `PeopleImportSession` with academy, actor, original filename, checksum,
status (`PREVIEW_READY`, `COMMITTING`, `COMPLETED`, `EXPIRED`, `FAILED`), row
counts, normalized preview payload, captured `peopleRevision`, expiry, idempotency
key, and timestamps. Preview payloads expire after 30 minutes.

### 8.3 Bulk operations

Add `PeopleBulkOperation` with academy, actor, kind, normalized selection,
requested count, succeeded count, failed count, status, idempotency key, result
artifact metadata, and timestamps. The idempotency key is unique within an
academy and operation kind.

### 8.4 Invitation delivery

Add `InvitationDeliveryAttempt` with invitation, attempt number, provider
message identifier, state (`QUEUED`, `SENT`, `DELIVERED`, `BOUNCED`, `FAILED`),
failure code, queued/sent/delivered/failed timestamps, and provider-event
deduplication key. Delivery state never replaces `InvitationStatus`.

## 9. Manager overview

The existing route remains:

`/studio/academies/:academyId`

The default range is the last 30 academy-local calendar days. `7d`, `30d`, and
`all` are URL-backed. The response states the timezone, exact period,
`generatedAt`, and `activityTrackedSince`.

### 9.1 Page hierarchy

1. **Academy profile:** name, address, contact, timezone, cover, and gallery.
   Missing required profile information produces a Manager-only completion
   action.
2. **Scale ledger:** active Students, Teachers, Team Leads, Managers, active
   Classes, suspended memberships, and Active learner rate.
3. **Needs attention:** pending applications, invitations expiring within seven
   days, incomplete classes, and students with factual learning reasons.
4. **Student growth:** new active Student memberships by academy-local day and
   recently joined members.
5. **Learning health:** Active learner rate, class comparison, and trends.
6. **Difficult problems and class highlight.**
7. **Recent academy changes:** bounded membership and class audit history.
8. **Quick actions:** invite, import, create class, bulk enroll, and complete
   academy profile, shown only when authorized.

On narrow screens this order becomes one column. Operational actions remain
above analytical detail.

### 9.2 Counts

Role totals include only active memberships and are mutually exclusive because
an academy membership has one role. Suspended memberships appear separately.
Active classes exclude archived classes. A member enrolled in multiple classes
is counted once in academy-wide person totals and once in each class row.

### 9.3 Incomplete classes

An active class enters the action queue when it has:

- no assigned active `TEACHER` membership;
- no active Student enrollment; or
- no assigned course.

One class may contribute several reasons but appears once with all reasons.

### 9.4 Student growth

Growth counts memberships whose `joinedAt` falls inside each academy-local day.
It shows the selected period and previous equal-period comparison. `all` has no
comparison. Restores do not count as new joins.

### 9.5 Active learner rate

The UI uses **Active learner rate**, not the ambiguous label “learning rate”:

```text
distinct active Students enrolled in active Classes with counted activity
or a submission during the selected period
÷ distinct active Students enrolled in active Classes
```

The numerator and denominator are always displayed. A zero denominator returns
“No enrolled students,” not `0%`. Concept mastery and completion remain separate.

### 9.6 Class comparison and highlight

Each active class row contains enrolled Students, active Students, Active learner
rate, median active learning time, exercise completion, concept mastery, Students
requiring attention, and latest learning activity.

The highlighted class is the eligible class with the highest Active learner
rate. Eligibility requires at least five active enrolled Students. Ties use
concept mastery, then class name, then class id. The label names the selected
metric and period; it never claims an overall permanent “best class.” Managers
may sort the class TanStack Table by any visible metric.

### 9.7 Difficult problems

Return at most five visible exercises with at least three attempting Students,
ordered by lowest solve rate, most attempting Students, most unsuccessful
attempts, curriculum position, then material id. Show course/module/lecture path,
attempting and solved Students, solve rate, counted submissions, and drill-down.

### 9.8 Students requiring attention

Reuse existing factual reasons and thresholds:

- at least three consecutive failed attempts;
- in-progress work stalled for seven full days;
- latest failed attempt with at least 30 measured solve minutes;
- no counted activity or submission in the selected period; or
- active learning below the existing period-adjusted participation floor.

Every label carries the triggering measurement. Order by repeated failures,
stalled work, inactivity, low participation, long failed solve, oldest activity,
display name, then membership id. Return an exact distinct count and at most five
preview Students. No opaque risk score is stored or returned.

### 9.9 Recent activity

Return at most five recent joins and five safe audit summaries concerning
membership or class changes. Each summary includes actor display name, action,
target label, and timestamp. Raw before/after values remain in a future protected
audit-detail interface and never appear on this overview.

## 10. People directory and TanStack Table

All manager directory tables use TanStack Table with manual pagination, manual
sorting, and manual filtering. Table state is URL-controlled.

Input includes `academyId`, one-based `page`, `pageSize` (`25`, `50`, or `100`),
trimmed `search`, zero or more roles, zero or more statuses, `sort`, and
`direction`. Allowed sort fields are display name, email, role, status,
`joinedAt`, and `updatedAt`. Default order is `updatedAt desc, id asc`.

The output returns `rows`, exact `total`, `page`, `pageSize`, `pageCount`, and
role/status facets. Search matches normalized display name and email. Invalid
URL state falls back to defaults and canonicalizes with `replace`, not an error.
Changing search, filters, or sorting resets the table to page one.

Selection supports visible-page selection and explicit “select all filtered
results.” The latter sends the normalized filter plus exclusions to the server;
the browser never expands every matching id. Confirmation resolves and displays
the exact affected count before mutation.

## 11. Import and validation preview

Member import is create-only. CSV and XLSX templates contain `email`, `role`,
optional `display_name`, and optional `send_invitation` (default `true`). Roles
use stable enum values with localized instructions. Maximum size is 5 MB and
500 data rows.

The server parses the workbook and treats formulas as inert text. It normalizes
emails and roles, then labels every row `READY`, `WARNING`, or `ERROR`.

Errors include invalid/missing email, invalid role, conflicting duplicate rows,
an existing membership, unsupported workbook shape, or unsafe cell size.
Warnings include an existing pending invitation or a normalized display-name
difference. The preview shows original and normalized values and requires explicit
warning acknowledgement. Any error blocks commit.

Commit revalidates authorization, preview expiry, academy revision, and every
row. A changed academy produces a conflict and a fresh preview. Database writes
are atomic. Delivery is queued only after commit. A downloadable result CSV
contains row status, stable code, and safe explanation.

## 12. Bulk mutation rules

Supported kinds are invitations, class enrollment, role change, and suspension.
Each request carries an idempotency key and either explicit membership ids or a
normalized filter selection with exclusions.

- Enrollment accepts active Students and an active class only.
- Role change preserves the last-active-manager rule.
- Suspension preserves the last-active-manager rule.
- Cross-academy ids fail the complete operation.
- Consequences such as stale teacher assignment or Student enrollment appear in
  preview before confirmation.
- Monitoring revocation publishes only after commit.

Database mutations are atomic: all validated targets change or none do. Email
delivery is intentionally outside this transaction and reports recipient-level
outcomes. Audit history writes one operation summary and affected-record entries
inside the same transaction.

## 13. Invitation delivery and resend

Creating or importing an invitation queues an email after commit. The UI states
`SENT` only after provider acceptance and `DELIVERED` only after an authenticated,
idempotent provider event. Bounces and terminal failures remain visible.

Resend is a Manager mutation. It locks the pending invitation, rotates the token
and hash, invalidates the prior link, extends expiry by seven days, creates a new
delivery attempt, and writes an audit record. Accepted, revoked, or otherwise
terminal invitations cannot be resent. Delivery retry never creates a second
invitation.

## 14. Failure and empty states

Academy identity and operational totals are core. Their failure produces a
retryable page-level error. Analytics, growth, difficult problems, and recent
activity may fail independently; the affected panel says data is unavailable
while successful sections remain. A failed section never renders a fabricated
zero.

No-measurement, no-data, loading, authorization, conflict, expired-preview, and
provider-failure states use distinct stable codes and localized copy. Retrying a
commit with the same idempotency key returns the original result.

## 15. Performance and observability

- Preview lists contain at most five records.
- Class comparison contains at most 100 active classes.
- Aggregates execute in PostgreSQL and do not load complete memberships or
  submissions into application memory.
- Overview and directory target p95 below 1.5 seconds with 2,000 members and 100
  classes under representative submission volume.
- Structured timings identify each overview section, total count, selected
  range, and failure code without member PII.
- Import, commit, delivery, and provider-event logs carry request and operation
  ids but never tokens or workbook contents.

## 16. Accessibility, responsive behavior, and localization

- English and Korean copy ship together.
- Every chart has an equivalent table and concise text summary.
- All interactive data tables use TanStack Table.
- Color is never the only status signal.
- Filters, row selection, menus, confirmation, and drill-down are keyboard
  accessible and retain visible focus.
- Mobile preserves the approved information hierarchy in one column; wide
  tables scroll inside labelled regions.
- Cover and gallery images require alt text or an explicit decorative choice.

## 17. Security

- Validate workbook MIME, extension, size, row count, sheet count, and cell
  length on the server.
- Never execute formulas, macros, or external workbook links.
- Escape CSV export cells beginning with `=`, `+`, `-`, `@`, tab, or carriage
  return.
- Authenticate and deduplicate delivery webhooks.
- Store invitation tokens only as hashes and never log plaintext links.
- Rate-limit import preview, commit, invitation creation, and resend.
- Continue transaction locking and serialization for Manager-role mutations.

## 18. Verification

### 18.1 Pure and contract tests

- Period boundaries, Active learner rate, denominators, growth, incomplete-class
  reasons, attention ordering, class-highlight eligibility, and difficult-problem
  ordering.
- Overview bounds, partial-section failures, generation metadata, filters,
  pagination, stable sorting, and facets.
- CSV/XLSX normalization, formula handling, duplicates, conflicts, warnings,
  expiry, and export escaping.

### 18.2 Authorization and integration tests

- Active Manager success; Teacher, Team Lead, Student, suspended Manager,
  platform Admin, and cross-academy denial.
- Atomic bulk success/failure, idempotent retry, concurrent preview invalidation,
  and last-active-manager protection.
- Enrollment eligibility, archived class rejection, audit writes, and monitoring
  revocation after commit.
- Resend token rotation, old-link rejection, provider webhook authentication,
  event deduplication, delivered/bounced transitions, and retry safety.

### 18.3 Web and end-to-end tests

- Approved overview hierarchy, responsive order, filters, drill-downs, section
  errors, no-measurement states, and chart/table equality.
- TanStack Table URL state, manual pagination/sorting/filtering, filtered
  selection across pages, and focus restoration.
- Download template, upload, preview, warning acknowledgement, commit, result
  export, bulk enrollment, bulk role change, suspension, resend, and recovery.
- Korean and English journeys and automated accessibility checks.

### 18.4 Performance tests

Seed at least 2,000 members, 100 classes, realistic enrollments, progress,
submissions, and audit history. Verify p95 targets, bounded response shapes, and
the absence of per-row query growth.

## 19. Implementation order

1. Academy profile schema, private media relations, and editing.
2. Shared manager-overview definitions and `ManagerLearningAnalytics` adapter.
3. `AcademyOperationsOverview` and the approved page.
4. `PeopleDirectory` contracts and TanStack Table migration.
5. Import sessions, templates, parsing, and validation preview.
6. Bulk-operation persistence, preview, commit, audit, and result export.
7. Invitation delivery, resend, and provider events.
8. Performance, accessibility, localization, and full end-to-end hardening.

## 20. Acceptance criteria

- The academy root gives a Manager the approved academy profile, scale, action,
  growth, learning, class, problem, join, and recent-change views.
- Counts and rates follow the definitions in this document and expose their
  denominators and period.
- Every overview exception has a direct authorized action or drill-down.
- Manager analytics do not expand Teacher access.
- People tables remain responsive and URL-shareable without loading all rows.
- Every interactive table is implemented with TanStack Table and server state.
- Imports cannot commit with errors or stale previews.
- Bulk database mutations are atomic, idempotent, and audited.
- Invitation resend invalidates the old link and delivery status never overclaims
  provider evidence.
- Partial analytics failure cannot masquerade as zero activity.
- English, Korean, keyboard, screen-reader, mobile, authorization, concurrency,
  and performance verification pass before release.
