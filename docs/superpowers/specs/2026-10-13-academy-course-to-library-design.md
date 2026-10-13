# Copy academy courses into the platform library

Date: 2026-10-13
Status: Implemented on `feat/academy-course-to-library`; user approval received on 2026-10-13.
Code reviewed: `feat/cove-studio-v2` at `81a510e3`.

## Purpose and confirmed decision

A platform admin can select an existing academy course and copy its curriculum
into the platform content library. The result is an independent draft that the
admin reviews and publishes through the existing library editor. The user
confirmed this behavior: **independent draft copy**, with no ongoing updates
from the academy.

Example: an academy improves “Python Level 1.” An admin copies that academy's
course as “Python Level 1 — revised,” reviews its answers and assets, then
publishes it. Other academies can adopt this new library course using the
existing library flow. The original academy continues teaching its original
course with its existing class assignments and student history.

This spec is based primarily on source code and database migrations. It does
not claim that the checked-out revision exactly matches the deployed release,
or that any new behavior has been tested in production.

## What the code implements today

Paths below are relative to the repository root.

| Evidence | Implemented behavior and implication |
| --- | --- |
| `packages/api/prisma/schema.prisma`, `Academy`, `Course` | Library courses are ordinary courses owned by an academy with `kind = LIBRARY`. No separate library curriculum model is needed. |
| `packages/api/src/platform/platform-library.service.ts` | Admins can list, create, retire and inspect copies of library courses. Creation resolves the library lazily and creates drafts. No academy-to-library operation exists. |
| `packages/api/src/content/library/academy-library.service.ts` | `adopt` copies modules, lectures, materials, programming exercises, cases, hints, PDFs, manual materials and videos. It generates new curriculum IDs and bulk inserts inside a transaction. |
| `packages/shared/src/platform/library.ts` and `packages/api/src/content/course.service.ts` | `sourceCourseId`, `sourceContentRevision`, `baselineRevision` and provenance chips specifically describe academy adoption from a library master. Reusing these fields for reverse imports would produce misleading synchronization status and deletion restrictions. |
| `packages/api/src/platform/library-academy.ts`, `platform-organization.ts` | The current platform uses a configured organization; one library per organization is enforced by a partial database index. Academy library discovery follows the academy's organization. |
| `packages/api/src/platform/platform-content.service.ts` | The admin's existing searchable, paginated academy-course browser excludes library academies. It is the natural source-selection surface. |
| `packages/shared/src/auth/roles.ts`, `packages/api/src/authorization/academy-access.service.ts` | `ADMIN` currently has every platform permission. Source curriculum review and destination library management are distinct capabilities. Platform reads can work without a write support grant. |
| `packages/api/src/documents/pdf-document.service.ts` | READY PDF assets can be referenced by copied documents. Asset locks protect against cleanup, and cleanup checks remaining document references. |
| `packages/api/src/videos/video.service.ts` | Video access checks the destination lesson, then resolves media and captions through the referenced asset. Copies can share immutable media without changing upload ownership. |
| `packages/api/src/manual/manual.service.ts`, `manual-assets.service.ts` | Copied configuration can retain existing asset references. Editor saves accept foreign-origin assets already referenced by that material; reads use authorized material configuration. |
| `packages/api/prisma/migrations/20260803150000_direct_editable_curriculum/migration.sql` | The case-insensitive title index applies only to visible courses. Service checks cover draft names, but the database index alone cannot prevent simultaneous duplicate draft imports. |

Important copy differences: the current adoption path sets modules and lectures
visible, keeps the destination course hidden, and leaves video, short-answer
and multiple-choice materials hidden. Reverse imports must preserve source
descendant visibility instead of applying academy adoption's delivery policy.

The existing programming-exercise copy includes the grading profile but omits
the schema's `feedbackPolicy`. The shared copier must preserve that field too.
The existing adoption code reads its source tree before the write transaction;
the new reverse-import operation must capture a coherent snapshot inside its
transaction rather than inheriting that concurrency gap.

## Approaches considered

1. **Independent draft copy — selected.** Reuse curriculum-copy machinery with
   explicit policies for each direction. Adds a small provenance/receipt table;
   fits existing authoring and adoption flows and protects live teaching.
2. **Move the academy course into the library.** Small ownership change but
   breaks the academy/course boundary used by classes and learner access. It
   removes the course the academy is teaching. Rejected.
3. **Linked course with synchronization.** Requires version management,
   conflict resolution and clear rules for changes during teaching. Larger
   scope and contrary to the confirmed independent-copy decision. Rejected.

## Functional requirements

- Only a platform admin with library-management authority and source-review
  authority can execute the operation. Academy managers, team leads, teachers
  and students do not gain permission through their academy role.
- Accept courses from real `ACADEMY` academies in the configured platform
  organization. Reject `LIBRARY` sources and organization mismatches.
- Permit visible and hidden source courses, including courses originally
  adopted from the library. Include all source modules, lectures and materials,
  including hidden content. Explain this explicitly in the dialog.
- Apply the existing academy-access lifecycle checks; do not introduce a bypass
  for archived or suspended academies.
- The admin can edit the destination title; default to the source title.
  Trim it and require 1–200 characters. Copy the source description.
- Create a new library course with `isVisible = false`, `retiredAt = null`,
  `contentRevision = 1`, and the importing admin as creator.
- Keep `sourceCourseId`, `sourceContentRevision` and `baselineRevision` null on
  the new library master. Do not inherit the source's adoption relationship or
  reparent the source academy course to the new master.
- Preserve source module, lecture and material visibility, positions,
  required flags and external keys. The draft course gate prevents adoption
  until publication. Existing library-to-academy visibility rules still apply
  when another academy later adopts the published master.
- Do not overwrite an existing library course. Repeated intentional imports
  require a new request key and an available title.
- Later edits or deletion of the academy source must not modify or invalidate
  the copied curriculum. Immutable media references can remain shared.

## Admin experience

Add **Copy to library** to the course row actions at
`/admin/content/courses`. Reuse its existing search and academy filters; do not
build another source picker in the library page for this first release.

The approved follow-up supersedes that initial limitation: see
[Library academy picker](2026-10-13-library-academy-picker-design.md). It adds
a second entry point using the existing TanStack table and shared copy dialog.

Opening the action fetches a copy preview and displays the source academy,
course title, captured revision, full outline including hidden items, and
counts by material type. It shows an editable destination title and this
explanation: “Creates an independent draft in the library, including hidden
content. Student work and class assignments are not copied.”

The preview contains structure and asset readiness, not answer keys, solution
files, test inputs or other private answer configuration. Admins can inspect
that content through the existing authorized source editor before copying.

Disable submission while the request is running. Retain title and dialog
state on failure. On success, invalidate library course/academy queries and
navigate to `/admin/content/library/{newCourseId}`. Show “Copied to library as
a draft.” Refresh any cached library list so navigating back shows the new row.

Show an origin note in the destination library editor: source academy name,
source course title, revision and copy time. Do not display “Up to date,”
“Update available,” or “Customized” for this origin. A missing source is shown
using the saved origin names, with no broken navigation link.

Use the existing modal, row-action and error patterns. Add text in the existing
English and Korean locale namespaces and include those namespaces in the
affected page payloads. No visual redesign is required.

## Contracts and authorization

Extend `platformLibrary` with two authenticated oRPC procedures:

| Procedure | Input | Output |
| --- | --- | --- |
| `previewAcademyCourse` | `sourceAcademyId`, `sourceCourseId` (UUIDs) | Source identity, revision, ordered outline, counts by all six material types, readiness blockers |
| `importAcademyCourse` | Source IDs, `expectedSourceContentRevision` (positive integer), `title` (trimmed 1–200 characters), `requestKey` (UUID) | Destination library academy ID and `LibraryCourse` |

Both procedures check `platform.library.manage`, `platform.content.read`,
and `platform.academies.inspect` using the existing platform access service.
Preview and fresh imports additionally check source academy
`curriculum.review` through academy access. A completed receipt replay checks
current platform and destination authority without reopening the source.
Resolve and validate the actual source academy/course relationship after
authorization when reading a source. Destination management does not confer
unrestricted source reads. A support write grant is unnecessary because the source is read only
and the only writes are platform-owned library content and audit records.

Use the existing library course editor response to expose optional import
origin only to authorized library readers; extend the corresponding shared
schema and serializer. Avoid a new public academy endpoint for reverse copying.

The destination is resolved server-side from the configured organization using
`resolveContentLibrary`. Never accept a caller-specified destination academy
or organization. Verify that the source belongs to that organization.

## Copy boundary and material fidelity

Extract a focused internal course-tree copier from `AcademyLibraryService`.
It accepts an already-authorized source snapshot, transaction, destination
identity and explicit copy policy. It has no responsibility for permissions,
library discovery, audit events or API serialization. The academy adoption
service and platform import orchestration retain those responsibilities.

| Content | Copy behavior |
| --- | --- |
| Course tree | Generate fresh IDs for course, modules, lectures and materials; preserve titles, descriptions, positions, external keys and required flags. Never reuse source curriculum IDs. |
| Programming exercises | Copy descriptions, formats, constraints, starter/solution code, optional legacy quiz JSON, language, resource limits, AI setting, complete grading profile and `feedbackPolicy`. Reset grading revision to 1; omit `legacyProblemNo`. |
| Test cases and hints | Generate fresh row IDs; preserve ordering, sample/private visibility, inputs, expected outputs, comparators, weights, overrides, penalties, labels and hint triggers. |
| Turtle and written responses | Copy complete authored configuration, runtime version, files, solution files, public/solution assets, model answer, hint, submit/scoring settings and short-answer definition. Reset manual revision to 1. Preserve the authored runtime version. |
| Multiple choice | Copy configuration, private explanation and correctness rules; generate fresh option IDs and remap correct-option IDs consistently. Preserve shuffle and scoring behavior. |
| PDF documents | New document rows with revision 1; retain READY immutable asset IDs and placement. |
| Video lessons | New lesson rows with revision 1 and fresh request keys; retain READY asset IDs, description, placement, scoring threshold, captions and instruction-image manifests. |

All six current material types are in scope: `PROGRAMMING_EXERCISE`,
`PDF_DOCUMENT`, `TURTLE_EXERCISE`, `WRITTEN_RESPONSE`, `MULTIPLE_CHOICE`,
`VIDEO_LESSON`. Reject a malformed or unsupported material rather than silently
dropping it. Preserve associated PDF/video records if attached to other
material rows; copy based on supported relations as well as type.

Do not copy class/course assignments, enrollments, users, drafts, collaboration
documents, submissions, reviews, assessment results/jobs, help requests,
feedback, learning-day records, monitoring visits, solve sessions, progress,
video watch history or workbook import sessions. Student-specific data is not
part of the source snapshot loaded for the copier.

## Assets and retention

Retain immutable assets and storage objects instead of uploading duplicates or
changing their original academy/course ownership. This follows the current
adoption design. New material configuration authorizes access to those assets.

- Lock PDF and video assets in a stable order inside the import transaction;
  require READY state and insert destination references before committing.
- Validate every referenced manual/instruction/solution asset exists and its
  manifest name and byte size match. Validate caption references against the
  video asset. Readiness failures block the entire copy, including failures in
  hidden content.
- Check supported JSON definitions before inserting. A malformed definition
  is an explicit copy failure, never a partial success.
- Do not grant access based on asset ID or original academy ownership alone.
  Existing material authorization and answer-hiding rules remain the access
  boundary. Student APIs must not expose solution assets or answer definitions.
- Verify editing copied manual/video configuration retains the existing
  referenced assets. New uploads must still belong to the destination course.
- A PDF with a remaining library reference must survive deletion of its source
  document. Manual assets are retained under the current immutable-asset policy;
  video assets remain referenceable under the existing retention policy.
  Any cleanup involved in this feature must account for destination references.

## Origin and retry receipt

Add `LibraryCourseImport`, a separate table with one row per imported master:

| Field | Purpose |
| --- | --- |
| `id` | UUID primary key |
| `libraryCourseId` | Unique FK to the destination Course, cascade on destination deletion |
| `requestKey` | Unique UUID for safe retries |
| `actorUserId` | Importing User FK with restrict behavior |
| `sourceAcademyId`, `sourceCourseId` | UUID snapshots; no source FK |
| `sourceAcademyName`, `sourceCourseTitle` | Displayable snapshots even after source deletion |
| `sourceContentRevision` | Positive revision copied |
| `destinationTitle` | Normalized submitted title, also used to validate replay input |
| `createdAt` | Import time |

Source IDs are informational snapshots. No source FK may prevent an academy
from deleting its course or create a dependency cycle when an adopted academy
course is copied back into a new master. The destination's existing `copies`
relation continues to mean academies adopting that master, and starts empty.

Commit the receipt in the same transaction as curriculum and audit records.
While the destination exists, replaying a request key with the same actor and
identical source IDs, expected revision and title returns that destination.
Reusing a key with different input or a different actor returns a conflict.
Authorize the caller before returning any replay result. A committed replay
does not require the source to still exist: it returns the already-created
destination after checking current destination management authority.

The UI generates one key per copy attempt and retains it on uncertain network
failure. Intentional new imports use fresh keys. Changing title or re-previewing
a newer revision starts a new attempt. Deleting the destination also deletes
its receipt; retry protection is scoped to retained destination courses, not
to permanently deleted history.

## Transaction and concurrency behavior

Use a synchronous bulk-copy operation as today; no media encoding or external
storage network call belongs inside the database transaction.

1. Authorize, normalize input and check for a completed receipt replay.
2. Start a serializable transaction. Resolve the destination library and take
   a lock on its academy row. If first-use creation races, retry using the
   library that won the unique-index race.
3. Recheck the receipt inside the transaction. Validate source kind,
   organization and course ownership, lock the source course, and load the
   complete authored tree inside this transaction's snapshot.
4. Compare `contentRevision` with the preview revision. On mismatch, return a
   stale-source conflict; the admin must refresh the preview before submitting.
5. Check the destination title case-insensitively across all library courses,
   including drafts and retired courses. A conflict creates no rows.
6. Validate content, lock assets, and insert the new course and all descendant
   rows using bulk writes. Insert origin/receipt and audit rows atomically.
7. Commit, then return the destination summary and academy ID.

The library academy-row lock must also be used by existing library creation
and library-course rename paths, including library-scoped `CourseService`
create/update calls, with the duplicate check inside the same
transaction. This is a targeted fix to library title writes, not a global
change to academy title rules. Keep lock order consistent: destination library
academy, source/destination course if needed, then assets in stable order.

Bound serialization/deadlock/first-use retries to three total attempts. Reload
the source within each fresh transaction and retain the original expected
revision. A concurrent source edit must yield either a coherent accepted
snapshot at that revision or a stale-source conflict, never a mixed tree.
After retry exhaustion return a retryable busy conflict. Start with a
30-second transaction timeout and a five-second maximum transaction-acquisition
wait. Apply a 40-second overall import budget: start another retry only while
budget remains, and limit its timeout to the remaining budget. Confirm deployed
request/proxy limits accommodate that budget before release. A timeout rolls
everything back; increasing limits requires representative large-course
measurements and a matching request-budget change.

No source update, origin reassignment, publication, student-history insertion
or background job dispatch is part of this transaction.

## Errors and audit

| Condition | Required response |
| --- | --- |
| Missing account/permission or inaccessible source academy | Existing authorization errors; no mutation |
| Missing source, wrong source academy, library source or organization mismatch | One source-not-found response, without exposing another tenant's identity |
| Source changed since preview | `LIBRARY_IMPORT_SOURCE_CHANGED`, 409; refresh preview |
| Destination title taken | Existing `COURSE_TITLE_CONFLICT`, 409; edit title |
| Unsupported/malformed content, missing assets, non-READY PDF/video, invalid caption references | `LIBRARY_IMPORT_CONTENT_INVALID`, 409, with an authorized material title and reason; repair source and retry |
| Request key reused with different input/actor | `LIBRARY_IMPORT_REQUEST_CONFLICT`, 409 |
| Exhausted transaction contention retries | `LIBRARY_IMPORT_BUSY`, 409; retry with the same key |
| Connection failure/transaction timeout | Existing transport/server error handling; keep the key for retry and create no partial tree |

Register new application errors in shared error schemas and English/Korean
translations. Never include solution text, correct answers or object keys in
error messages.

Write `platform.library.course.imported_from_academy` with destination Course
as target, platform scope (`academyId = null`), actor ID, source academy/course
IDs and revision, destination title, request key and counts by material type.
Write the existing `platform.library.created` event if this operation creates
the library. Retries returning a receipt do not write another import event.
Follow existing request/support attribution where present. Audit records must
exclude test inputs, solutions, answer keys and student information.

## Implementation boundaries

- Shared: input/output schemas, import-origin schema, oRPC contract, exports,
  application error codes and locale messages.
- Database: additive receipt/origin table, indexes and destination relation;
  leave current adoption provenance and title-index semantics intact.
- API content: internal tree copier and explicit policies for adoption versus
  reverse import. Existing adoption behavior must remain covered by tests.
- API platform: preview/import orchestration, authorization, organization
  resolution, replay, audit, router wiring and dependency injection.
- API course/library services: transactional serialization of library title
  creation/renames and optional origin in library-editor responses.
- Web: one row action, copy dialog, mutation/cache handling and origin note.
  Prefer explicit capability checks over new raw role comparisons.

Read the installed guides under `packages/web/node_modules/next/dist/docs/`
before implementing web changes, as required by repository `AGENTS.md`.
No Next.js code is changed by this spec.

## Acceptance and validation

1. An admin copies a visible or hidden academy course and lands in the existing
   library editor with a hidden, non-retired master. The course is absent from
   academy adoption listings until explicitly published.
2. A mixed fixture contains all six material types, hidden descendants,
   supplementary/main assets, private programming cases/hints, weighted
   grading, feedback policy, captions, solution assets/files, multiple-choice
   shuffling and a short-answer definition. The copy preserves every authored
   field and source visibility except the intentionally reset IDs/revisions.
3. New curriculum IDs, option IDs and video request keys differ from source.
   External keys and sibling order remain valid; fresh assessment revisions
   start at 1. No copied record references a source curriculum parent.
4. Source student drafts, submissions, grades/reviews, watch history and class
   assignments exist in the fixture and none appear under the destination.
   Source row counts, content and assignment ownership are unchanged.
5. The admin can preview PDFs, play videos with captions, load instruction
   images, run turtle content and save existing copied configurations from
   the destination. Asset access remains denied without destination access.
6. Publish the copied master and adopt it into a second academy. That copy
   points to the new library master, has the expected original adoption
   visibility policy, works with all six materials, and starts with no learner
   history. Private solutions remain hidden from student APIs.
7. Editing the source after import does not change the master or show adoption
   sync chips on it. Deleting a disposable source course with no learner work
   does not delete the master or its referenced media.
8. Reject non-admin callers, wrong academy/course pairs, library sources,
   cross-organization sources, invalid titles and inaccessible academies.
   Also prove a read-only source context can copy when destination management
   is authorized, without requiring a source write grant.
9. A source edit after preview returns the stale-source conflict. A source
   edit racing the copy never produces a mixed revision/tree. An injected
   insertion, validation or audit failure leaves no new course, receipt or
   descendants.
10. Same-key parallel requests create exactly one destination and one import
    event. Different-key requests with the same title create one course and
    return a title conflict for the other. Include races with existing library
    creation/rename and lazy first-library creation.
11. READY asset checks race safely with PDF cleanup; unavailable hidden assets
    block the whole copy. Replay after a lost response returns the existing
    destination, including after the source was deleted. Different input
    under the same key is rejected.
12. Existing library authoring, retirement, adoption, provenance chips and
    copies counts retain their behavior. Specifically test feedback-policy
    fidelity through both copy directions.

Use unit tests for authorization, policy mapping, receipt replay and errors;
database integration tests for snapshot consistency, rollback, asset locks,
title races and first-library creation; browser tests for the admin dialog,
navigation/cache behavior and publish/adopt round trip. Verify additive
migration, Prisma schema, generated types, relevant package type checks and
targeted lint. Run existing adoption regression tests after extraction.
Measure a representative large course with thousands of rows to confirm bulk
writes complete within the configured request/transaction limits.

Production verification, if separately authorized, uses a synthetic academy
course and a new library draft. It must not publish or alter existing customer
courses as part of this feature's test.

## Release scope

Deploy the additive migration before enabling the new API/UI. Existing rows
need no backfill. Rolling back the UI/API leaves existing content and the
additive table usable; do not drop receipts or copied curriculum as a rollback
step. Existing academy-to-library copies created by this feature remain
ordinary library courses.

Excluded from this release: moving courses, replacing existing masters,
automatic synchronization, merging edits, partial module/material imports,
bulk academy imports, academy approval workflows, source-content deletion,
automatic publication, media re-upload and asynchronous copy jobs.

The user approved implementing this spec on 2026-10-13, including the admin
entry point, copying hidden content, preserved visibility and origin display.


## Implementation verification — 2026-10-13

- 61 API tests pass, including 13 integration tests against disposable PostgreSQL.
  Coverage includes all six material types, independent origin, private authored
  configuration, no learner history, publish/adopt round trip, source deletion,
  duplicate/replayed requests, title races, concurrent source edits and rollback.
- 14 targeted UI tests, 18 shared library tests and 126 locale tests pass.
- API/web and browser-test type checks, targeted web lint, Prisma validation,
  whitespace checks and the API production build pass.
- All migrations apply on a fresh disposable database. The new receipt table
  matches its Prisma schema and disallows direct reads by `anon`/`authenticated`.
  Prisma migration comparison also reports existing foreign-key action
  differences in PDF and assessment tables; comparison with the pre-feature
  schema confirms those differences are unrelated to this change.
- All four signed-in Chromium Playwright tests in
  `e2e/specs/content-library.spec.ts` pass locally (28.3 seconds). API and studio
  ran on localhost with a disposable PostgreSQL database and the existing pinned
  development Supabase authentication accounts. No remote authentication accounts
  or remote course data were modified. The tests cover library authoring access,
  adoption/publishing/provenance, academy-to-library draft copying and origin
  display, source-course retention, and library exclusion from customer lists.
- Updated obsolete browser selectors for table rows and visibility switches,
  used exact title/status matches and unique copy titles, waited for the actual
  admin landing route, and allowed cold dev-route compilation in the new flow.
  Browser-test type checking passes. Real storage downloads, video playback and
  GUI broker execution remain outside this programming-course browser fixture.
- No production database, customer content or deployment was changed. Apply
  the additive migration before deploying the feature's API/UI.
