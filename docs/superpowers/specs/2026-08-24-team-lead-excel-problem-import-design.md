# Team Lead Excel Problem Import Design

**Status:** Awaiting written specification review  
**Date:** 2026-08-24  
**Scope:** Let a Team Lead import and safely re-import modules, lectures,
programming problems, test cases, and hints from a versioned Excel workbook
inside one existing academy course.

## 1. Purpose

Creating programming problems one at a time is too slow when a Team Lead is
preparing a complete course. This feature adds a production-grade Excel import
without creating a second, weaker content system.

The Team Lead creates or selects the course in Cove. The workbook describes the
structure and problems inside that course. Uploading produces a read-only
preview; only an explicit confirmation changes the curriculum.

The target workflow is:

```text
Open an existing course
    -> download its current import workbook
    -> edit Structure, Problems, Test Cases, and Hints sheets
    -> upload .xlsx
    -> review Create / Update / No change / Warning / Conflict
    -> confirm
    -> one atomic commit
    -> review new hidden content in the existing course builder
```

This specification follows the current versionless v2 curriculum model. It
does not restore the earlier draft/version/publish model described in older
content documents.

## 2. Decisions

The approved design makes the following decisions explicit:

- A Team Lead creates the course manually before importing.
- Every upload is scoped to exactly one selected academy course.
- The workbook may create or update modules, lectures, programming problems,
  test cases, and hints inside that course.
- Problems do not repeat module or lecture definitions. They reference a
  lecture through a stable `lecture_key`.
- Stable keys, not titles or row positions, determine identity on re-upload.
- A matching stable key is previewed as Update or No change.
- Re-uploading the same workbook is idempotent and produces no curriculum
  changes.
- Top-level curriculum entities omitted from a workbook are never deleted.
- An existing module, lecture, or problem cannot be silently moved to another
  parent by changing a reference in Excel.
- New imported modules, lectures, and problems start hidden from students.
- Updated items retain their current visibility. Visibility is not an import
  column.
- Importing changes to visible content requires an explicit warning
  acknowledgement.
- Team Lead is the only academy role allowed to import. Manager remains a
  read-only content reviewer.
- `.xlsx` is the only accepted file format in this slice. CSV cannot represent
  the required multi-sheet relationships, and legacy `.xls` adds a second,
  unsafe parser without improving the workflow.
- English canonical column names form the machine interface. The Instructions
  sheet and surrounding UI are localized in English and Korean.

## 3. Why the main-branch importer is not reused

The previous implementation on `main` is useful as a behavioral reference and
template example, but its architecture is incompatible with v2.

It currently:

- Parses the workbook in the browser with `xlsx` and sends trusted-looking JSON
  to a Next.js Route Handler.
- Defaults unknown difficulty and boolean values instead of rejecting them.
- Writes directly to the global v1 Supabase tables as a platform administrator.
- Has no academy or selected-course boundary.
- Creates only; re-uploading produces duplicates or title/order conflicts.
- Uses titles and positions to guess identity for hierarchy records.
- Fetches the entire global curriculum before importing.
- Performs many independent writes and simulates rollback with later delete
  requests rather than using one database transaction.
- Can leave partial data if cleanup fails or another request races the import.
- Has no durable preview, expiry, idempotency, stale-content detection, or audit
  summary.
- Returns server-authored Korean strings instead of stable localized error
  codes.
- Targets the old Subject -> Stage -> Chapter -> Problem model rather than the
  current Course -> Module -> Lecture -> Material model.

The v1 routes, component, and sample workbook remain untouched. The new feature
uses the NestJS API, shared contracts, Prisma transactions, academy permissions,
and the `(v2-studio)` Content Studio.

## 4. User experience

### 4.1 Entry point

An editable Team Lead course builder adds **Import from Excel** beside the
existing course-level actions.

The action is absent for Manager, Teacher, and Student. Hiding it is only a UI
convenience; every server operation independently requires `content.import`.

The import opens a dedicated full-page wizard at:

```text
/studio/academies/[academyId]/content/courses/[courseId]/imports/new
```

A full page is preferred to the old modal because a grouped preview, row-level
issues, warning acknowledgement, and final results need enough space to remain
readable.

### 4.2 Wizard stages

The wizard has four visible stages:

1. **Prepare** — download a workbook and read short instructions.
2. **Upload** — choose or drag one `.xlsx` file.
3. **Review** — inspect planned changes and resolve blockers.
4. **Result** — see committed outcomes and return to the course.

The user cannot skip Review. Uploading never mutates curriculum content.

### 4.3 Workbook downloads

The Prepare stage provides:

- **Download current course workbook** — generated from the current complete
  authoring projection, including stable keys, structure, problems, Sample and
  Hidden test cases, and hints.
- **Download blank sample workbook** — the same schema with localized
  instructions and representative data only.

The current-course download is the recommended path. It lets the Team Lead add
or correct rows without inventing keys for content that already exists and
prevents an update from accidentally omitting a problem's current tests or
hints.

When a course contains more than the 200-problem import limit, Prepare requires
the Team Lead to select one or more module or lecture branches whose combined
problem count is at most 200. A large module can therefore be exported lecture
by lecture. The generated workbook remains scoped to the course but contains
only that selected structure. Cove never offers a generated workbook that the
same importer cannot accept again.

Both downloads require `content.import`, because they can include Hidden test
inputs and expected outputs. They are never exposed through learner routes.

### 4.4 Preview presentation

The Review stage begins with totals:

```text
Create 48 · Update 4 · No change 12 · Warnings 2 · Conflicts 0
```

The main preview is grouped by the actual target hierarchy:

```text
Python Basics                         Create module
├── Variables                        Create lecture
│   ├── VAR-001 Create a variable    Create problem
│   └── VAR-002 Swap values          Update problem
└── Loops                            No change
    └── LOOP-001 Repeat a message    No change
```

Each update can expand to show changed fields and child-collection counts.
Large source text and expected outputs are truncated in the table and available
in an accessible detail panel.

Filters allow the Team Lead to show all rows or only Creates, Updates,
Warnings, or Conflicts. Searching matches stable key and title.

### 4.5 Issues and correction

A blocker identifies:

- Sheet name.
- Excel row number, counting the visible header.
- Canonical column name.
- Stable issue code.
- Received value, truncated and escaped for display.
- Localized correction guidance.

No commit action is available while any Conflict or validation Error exists.
The Team Lead corrects the workbook and uploads it again. A downloadable UTF-8
CSV issue report is provided for large error sets and escapes spreadsheet
formula prefixes.

Warnings do not block by themselves. The Team Lead must acknowledge warnings
before confirmation. Updating content currently visible to students is always
a warning.

### 4.6 Confirmation and result

Confirmation repeats the exact counts and states that:

- No course, module, lecture, or problem will be deleted.
- New content will be hidden.
- Existing visibility will not change.
- Included tests and hints are the complete replacement collections for each
  updated problem.
- The operation succeeds completely or changes nothing.

After commit, the Result stage displays created, updated, unchanged, and failed
counts plus links to created or updated problems. The course-tree query is
invalidated, and **Return to course** opens the existing builder with imported
branches expanded.

If the response is lost after a successful commit, retrying the same session
returns the stored result rather than running the import again.

## 5. Workbook contract

### 5.1 Versioning and sheet names

The workbook contains these sheets:

| Sheet | Required | Purpose |
|---|:---:|---|
| `Instructions` | Yes | Human instructions and `template_version` |
| `Structure` | Yes | Module and lecture definitions |
| `Problems` | Yes | Programming-problem definitions |
| `Test Cases` | Yes | Ordered Sample and Hidden cases |
| `Hints` | No | Ordered optional hints |

The initial `template_version` is `1`. A missing or unsupported version rejects
the file before row planning. Future formats receive a new version rather than
silently changing the meaning of an old column.

Canonical sheet and column names are not localized. Generated Instructions
content is localized so an English and Korean Team Lead can exchange one
workbook without changing its machine-readable interface.

Unknown sheets and unknown columns are ignored and shown as warnings. Required
sheets or columns cannot be inferred from approximate spelling.

### 5.2 Stable keys

`module_key`, `lecture_key`, and `problem_key` are stable import identities
inside the selected course.

Keys are normalized by:

1. Converting Unicode to NFKC.
2. Trimming leading and trailing whitespace.
3. Applying locale-independent uppercase normalization.

A valid key is 1–80 characters and contains only Unicode letters or numbers,
ASCII `_`, `-`, or `.`. Spaces and path-like separators are rejected. The
canonical normalized value is persisted and returned in generated workbooks.

Key rules:

- `module_key` is unique in the selected course.
- `lecture_key` is unique in the selected course, even across modules, because
  Problems references it without a module column.
- `problem_key` is unique in the selected course.
- Two differently written keys that normalize to the same value conflict.
- A title match with a different key is a conflict; the importer never guesses
  that the rows are the same entity.

Manually created modules, lectures, and problems receive server-generated
stable keys. The generated current-course workbook exposes those keys so the
Team Lead can safely update manual content through Excel.

### 5.3 Structure sheet

One row represents one lecture and its parent module:

| Column | Required | Rule |
|---|:---:|---|
| `module_key` | Yes | Stable module identity |
| `module_order` | No | Positive integer; blank preserves or appends |
| `module_title` | Yes | 1–200 characters |
| `module_description` | No | At most 10,000 characters |
| `lecture_key` | Yes | Stable lecture identity |
| `lecture_order` | No | Positive integer; blank preserves or appends |
| `lecture_title` | Yes | 1–200 characters |
| `lecture_description` | No | At most 10,000 characters |

A module may appear in several Structure rows. Every repeated value for the
same `module_key` must agree after normalization. Conflicting titles,
descriptions, or explicit order values are errors rather than last-row-wins.

For a new entity, a blank order appends after current siblings in workbook
order. For an existing entity, a blank order preserves its current position.
Explicit order values must be unique within the parent after combining workbook
and omitted existing entities. The preview reports collisions.

An existing `lecture_key` supplied under a different `module_key` is a parent
conflict. Import does not move lectures.

### 5.4 Problems sheet

One row represents one programming problem:

| Column | Required | Rule |
|---|:---:|---|
| `problem_key` | Yes | Stable problem identity |
| `lecture_key` | Yes | Must resolve in Structure or the selected course |
| `problem_order` | No | Positive integer; blank preserves or appends |
| `title` | Yes | 1–200 characters |
| `difficulty` | Yes | `EASY`, `MEDIUM`, or `HARD` |
| `description` | Yes | Plain text or safe Rich Editor HTML, at most 10,000 characters |
| `description_format` | No | `PLAIN_TEXT` or `RICH_TEXT_HTML`; default `PLAIN_TEXT` |
| `input_format` | No | At most 10,000 characters |
| `output_format` | No | At most 10,000 characters |
| `constraints` | No | At most 10,000 characters |
| `starter_code` | No | Python source, at most 100,000 characters |
| `ai_feedback_enabled` | No | Strict boolean; blank means `false` for create and preserve for update |

For `PLAIN_TEXT`, descriptions are escaped and converted to the same safe
paragraph/line-break representation used by the Rich Editor. For
`RICH_TEXT_HTML`, the server applies the same allowlist sanitizer and
empty-content normalization as manual authoring. Generated current-course
workbooks use `RICH_TEXT_HTML` and preserve the stored sanitized value, making
an unchanged download/upload round trip lossless. Untrusted workbook HTML is
never stored without sanitization.

New problems use the existing manual defaults:

- Language: Python.
- Time limit: 3,000 ms.
- Memory limit: 256 MB.
- Required: true.
- Visible: false.
- Legacy problem number: null.

An existing `problem_key` supplied under another `lecture_key` is a parent
conflict. Import does not move problems.

### 5.5 Test Cases sheet

One row represents one complete test case:

| Column | Required | Rule |
|---|:---:|---|
| `problem_key` | Yes | Must resolve in Problems or the selected course |
| `test_order` | Yes | Unique positive integer for the problem |
| `input` | No | At most 100,000 characters |
| `expected_output` | Yes | Non-empty, at most 100,000 characters |
| `visibility` | Yes | `SAMPLE` or `HIDDEN` |

Every created or updated problem must have at least one test and at least one
non-empty Sample test. A problem included in Problems owns the complete set of
test rows associated with its key. On Update, the confirmed import replaces
that problem's current tests atomically, using the same grading-revision rule as
manual editing.

Test inputs and expected outputs are preserved exactly except for workbook
newline normalization from CRLF to LF. They are not trimmed.

### 5.6 Hints sheet

One row represents one optional hint:

| Column | Required | Rule |
|---|:---:|---|
| `problem_key` | Yes | Must resolve in Problems or the selected course |
| `hint_order` | Yes | Unique positive integer for the problem |
| `content` | Yes | 1–10,000 characters |
| `trigger_expression` | No | At most 2,000 characters |

Hints work like tests: for each problem included in Problems, its workbook hint
rows are the complete replacement collection. No rows means that the confirmed
update removes all hints for that problem. The preview calls this out as a
warning when the existing problem currently has hints.

### 5.7 Strict values

The importer never silently guesses:

- Unknown difficulty is an error, not `EASY`.
- Unknown boolean text is an error, not `false`.
- Accepted booleans are `TRUE`, `FALSE`, `Y`, `N`, `YES`, `NO`, `1`, `0`,
  `예`, and `아니요`, case-insensitively after normalization.
- Invalid or fractional orders are errors.
- Duplicate rows and orphan references are errors.
- Actual Excel formula cells in data sheets are rejected. A literal text or
  Python cell beginning with `=`, `+`, `-`, or `@` remains literal text.

## 6. Planning semantics

The preview planner compares the normalized workbook with one consistent read
of the selected course.

Every module, lecture, and problem receives one planned action:

- `CREATE` — the stable key does not exist and has no title/order collision.
- `UPDATE` — the stable key exists under the declared parent and one or more
  imported fields differ.
- `UNCHANGED` — the persisted and normalized definitions are equal.

Warnings and Conflicts are issue annotations on those actions, not alternative
actions. For example, a visible problem may be `UPDATE` with a visible-content
Warning. An action with any Error or Conflict cannot be committed.

Warnings include:

- Updating an effectively visible module, lecture, or problem.
- Replacing tests and advancing a problem's grading revision.
- Clearing existing hints because the included problem has no hint rows.
- Unknown ignored sheets or columns.

Conflicts include:

- Same key under another parent.
- Same normalized title or explicit order occupied by another key.
- Duplicate normalized key in the workbook.
- Orphan lecture, problem, test, or hint reference.
- Contradictory repeated Structure values.
- A malformed field or missing required test.
- A persisted relationship that cannot produce one unambiguous plan.

The planner does not create a partial committable subset. Any Error or Conflict
blocks the entire session.

## 7. Architecture and boundaries

### 7.1 Shared package

`packages/shared` owns:

- Workbook limits and template version.
- Canonical sheet and column names.
- Stable-key and value normalization.
- Row schemas and stable issue codes.
- Planned-action, preview-summary, session, commit-input, and result schemas.
- Warning acknowledgement rules.
- CSV issue/result escaping.
- oRPC contracts for preview retrieval, commit, and result retrieval.

Shared code accepts already extracted cell values. It does not read ZIP or XLSX
bytes and has no Prisma dependency.

### 7.2 API package

The NestJS API adds a focused content-import module:

- `ContentImportController` streams raw workbook upload and generated workbook
  download.
- `ContentWorkbookReader` safely reads named XLSX sheets without evaluating
  formulas.
- `ContentImportPlanner` normalizes rows and builds deterministic actions.
- `ContentImportService` owns authorization, durable sessions, preview,
  concurrency, commit, results, and audit.
- Extracted content write/validation helpers are shared with `CourseService` so
  manual and imported exercises use the same invariants.

The existing hardened member `workbook-reader` should be generalized or reused
for ZIP/XML safety, format sniffing, string decoding, and resource limits. The
content reader extends it to named multi-sheet output rather than introducing a
browser parser or a second unbounded XLSX library.

Next.js never reads the workbook or writes curriculum tables.

### 7.3 Web package

The v2 web feature contains:

- A server-rendered import route protected by the existing academy account
  boundary.
- A small wizard component for Prepare, Upload, Review, and Result.
- A raw-body upload helper using the current Supabase access token, matching the
  established member-import upload boundary.
- TanStack Query hooks for typed preview, commit, and result operations.
- Grouped preview, issue table, warning acknowledgement, and result report.
- English and Korean `content-import` translations and stable error mappings.

The web client never decides whether a row creates or updates something. It
renders the stored server plan.

## 8. API shape

Binary endpoints use ordinary NestJS controllers:

```text
GET  /content-imports/template
     ?academyId=...&courseId=...&kind=current|blank&locale=en|ko
     &moduleIds=...&lectureIds=...
     (optional bounded current-course export scope)

POST /content-imports
     ?academyId=...&courseId=...&filename=...
     Body: raw .xlsx bytes
```

The upload response is the newly stored preview.

Typed oRPC procedures handle JSON operations:

```text
academyContentImports.getPreview({ academyId, courseId, sessionId })
academyContentImports.commit({
  academyId,
  courseId,
  sessionId,
  contentRevision,
  acknowledgeWarnings
})
academyContentImports.getResult({ academyId, courseId, sessionId })
```

Every operation verifies the session, academy, course, actor, and permission.
`CONTENT_IMPORT_SESSION_NOT_FOUND` deliberately covers a missing session,
another course's session, and another academy's session to avoid an existence
oracle.

## 9. Persistence

### 9.1 Stable entity keys

`CourseModule` and `Lecture` gain required `externalKey` fields. Existing rows
are backfilled with server-generated UUID keys before the columns become
required. Manual create paths generate keys server-side.

`ProgrammingExercise.externalKey` remains the problem identity. Its current
index is retained. Existing problem keys are normalized in the migration after
a collision scan, and new manual UUID keys use the same canonical form as
imported keys. Course-scoped uniqueness is enforced while resolving the full
Material -> Lecture -> Module -> Course chain.

The database enforces module uniqueness with `(courseId, externalKey)`. Lecture
and problem course-wide uniqueness is enforced by the import service while
holding the course lock; direct manual paths can only generate UUID keys and do
not accept an author-supplied external key.

### 9.2 Course revision

`Course` gains:

```text
contentRevision Int @default(1)
```

Every mutation to the course, module, lecture, material, exercise, test, hint,
order, or visibility increments this revision in the same transaction. Import
preview captures it. Commit requires the session revision, browser revision,
and locked database revision to agree.

This closes the gap left by `Course.updatedAt`, which does not necessarily
change when a child record changes.

### 9.3 Import session

A durable `ContentImportSession` stores:

- `id`
- `academyId`
- `courseId`
- `actorUserId`
- `originalFilename`
- SHA-256 workbook checksum
- Template version
- Status: `PREVIEW_READY`, `COMMITTING`, `COMPLETED`, `FAILED`, or `EXPIRED`
- Total/Create/Update/Unchanged/Warning/Conflict counts
- Bounded normalized preview and planned actions as JSON
- Captured `contentRevision`
- Server-generated idempotency key
- Expiration time
- Commit time
- Bounded row-level result JSON
- Stable failure code
- Created and updated timestamps

The session is academy- and course-owned. Preview expires 30 minutes after
upload. Completed sessions return their stored result on retry.

## 10. Upload and parser safety

Limits are enforced while receiving or expanding the file, before planning:

- Maximum compressed upload: 10 MiB.
- Maximum expanded workbook XML: 30 MiB.
- Maximum sheets: 8.
- Maximum problems: 200.
- Maximum tests per problem: 50.
- Maximum hints per problem: 20.
- Maximum total data rows across sheets: 12,000.
- Maximum aggregate decoded cell characters: 20 million.
- Per-cell limits follow the target shared content schemas.

The reader:

- Sniffs XLSX ZIP signatures rather than trusting filename or content type.
- Rejects legacy `.xls`, CSV, encrypted workbooks, macros, external links,
  malformed XML, path traversal entries, duplicate ZIP entries, and excessive
  compression ratios.
- Reads only required workbook, relationship, shared-string, style, and
  worksheet parts.
- Never evaluates formulas and rejects actual formula cells in data sheets.
- Does not load images, charts, comments, pivot tables, or embedded objects.
- Normalizes workbook newlines deterministically.
- Preserves code, input, and expected-output whitespace as specified.

Upload and preview are rate-limited per actor and academy. Commit has a stricter
academy limit.

## 11. Commit and concurrency

Commit performs these steps in order:

1. Require authenticated `content.import` permission in the named academy.
2. Load the session through academy and course scope.
3. Return the stored result when status is `COMPLETED`.
4. Reject `COMMITTING`, failed, or expired sessions with stable codes.
5. Reject a preview containing any Error or Conflict.
6. Require warning acknowledgement when warnings exist.
7. Compare the browser and captured course revisions.
8. Atomically claim `PREVIEW_READY -> COMMITTING`.
9. Begin one Prisma transaction.
10. Lock the selected Course row with `FOR UPDATE`.
11. Re-read course content and require the captured revision to remain current.
12. Re-resolve every stable key and revalidate every planned parent.
13. Create or update modules and lectures in dependency order.
14. Create or update problem Materials and ProgrammingExercises.
15. Replace tests and hints for included problems in deterministic order.
16. Increment grading revision only when the grading definition changed.
17. Apply positions through the existing collision-safe rewrite strategy.
18. Increment `Course.contentRevision` once for the complete import.
19. Write per-entity audit entries and one import summary audit entry.
20. Commit the transaction and store the durable result.

If any content write or audit write fails, the transaction rolls back. The
academy course remains unchanged, and the session becomes `FAILED`. No manual
delete-based rollback is used.

Two tabs cannot commit the same preview: only one conditional status claim can
succeed. Two different imports for the same course serialize on the Course row,
and the later stale preview must be regenerated.

## 12. Update behavior and learner safety

For an existing matching key:

- Module and lecture title, description, and explicitly supplied order may
  update.
- Problem authoring fields may update.
- Blank optional fields mean the value described by the column rule; they do
  not all share one generic blank behavior.
- Tests and hints are complete replacement collections for every included
  problem.
- Existing Material, exercise, and progress identifiers remain stable.
- Existing submissions, drafts, progress, solve sessions, points, and feedback
  are not deleted or reassigned.
- Grading-definition changes increment `gradingRevision`, matching manual edit
  behavior.
- Visibility is preserved.

New content is hidden at every created hierarchy level. The Team Lead reviews
it in the existing builder and deliberately makes the appropriate course,
module, lecture, and problem levels visible.

The import authoring and preview procedures may return Hidden tests only to a
caller with `content.import`. Learner contracts remain unchanged and never
serialize Hidden expected outputs.

## 13. Audit and observability

Each commit writes:

- Bounded per-entity before/after audit records using the existing content
  action vocabulary.
- One `content.curriculum_import.committed` summary with session ID, workbook
  checksum, course ID, actor, request ID, and action counts.

Raw workbook bytes are never logged or stored. Logs contain identifiers,
duration, byte/row counts, action counts, and stable failure codes, but no code,
test input, expected output, hint text, or problem description.

Metrics cover:

- Upload and parse duration.
- Preview outcome counts.
- Commit duration and outcome.
- Stale-preview, parser-rejection, and conflict rates.
- Workbook byte and row distributions.

## 14. Stable errors and localization

New application codes include:

- `CONTENT_IMPORT_FILE_REJECTED`
- `CONTENT_IMPORT_TEMPLATE_UNSUPPORTED`
- `CONTENT_IMPORT_SESSION_NOT_FOUND`
- `CONTENT_IMPORT_PREVIEW_EXPIRED`
- `CONTENT_IMPORT_NOT_COMMITTABLE`
- `CONTENT_IMPORT_IN_PROGRESS`
- `CONTENT_IMPORT_REVISION_CONFLICT`
- `CONTENT_IMPORT_PARENT_CONFLICT`
- `CONTENT_IMPORT_KEY_CONFLICT`
- `CONTENT_IMPORT_ORDER_CONFLICT`
- `CONTENT_IMPORT_VALIDATION_FAILED`

Row issue codes are more specific and remain data, not display sentences. The
web maps them through complete English and Korean catalogs. API message text is
not used to determine UI behavior.

All new user-visible copy belongs to a focused `content-import` namespace or a
bounded subtree of the existing content namespace. Typed-key, extraction,
missing-translation, and payload-budget checks remain green.

## 15. Testing strategy

### 15.1 Shared package

- Key normalization, Unicode, allowed characters, and collision tests.
- Header, difficulty, boolean, order, and blank-value normalization tests.
- Orphan and duplicate relationship tests.
- Deterministic Create/Update/Unchanged/Warning/Conflict planning tests.
- Complete replacement semantics for tests and hints.
- Warning acknowledgement and commit-readiness tests.
- Result CSV formula-injection escaping.

### 15.2 API package

- Real multi-sheet XLSX parsing, including shared and inline strings.
- Formula, macro, encrypted, malformed, oversized, excessive-ratio, duplicate
  ZIP entry, traversal, sheet-count, row-count, and aggregate-cell rejection.
- Team Lead success and Manager/Teacher/Student rejection.
- Cross-academy and cross-course session non-disclosure.
- Generated current-course workbook round trip.
- Existing manual keys exported and safely re-imported.
- Strict rejection of unknown values; no silent defaults.
- Create, update, unchanged, title conflict, order conflict, and parent conflict.
- New content hidden and updated visibility preserved.
- Visible-content warning enforcement.
- Atomic module/lecture/problem/test/hint writes and rollback on each failure
  point.
- Test replacement and grading-revision increment.
- No deletion of submissions, drafts, progress, or other learner history.
- Course revision increments for every manual and import content mutation.
- Stale preview rejection after manual edit or another import.
- One-winner concurrency for same-session and same-course commits.
- Idempotent result replay after a lost response.
- Per-entity and summary audit records.
- Hidden tests unavailable through learner procedures.

### 15.3 Web package

- Import action visible only for editable Team Leads.
- Prepare, Upload, Review, and Result states.
- Client-side size/type feedback without replacing server enforcement.
- Grouped hierarchy preview and action filters.
- Exact issue sheet/row/column rendering.
- Conflict disables confirmation.
- Warning acknowledgement enables confirmation.
- Failed upload and commit preserve the current screen and actionable state.
- Stale preview directs the user to upload again.
- Successful commit refreshes the course tree and links to affected problems.
- English/Korean, keyboard, focus, screen-reader, contrast, and narrow-screen
  coverage.

### 15.4 End-to-end acceptance

1. A Team Lead creates and opens a course.
2. They download the current-course workbook.
3. They add two modules, several lectures, and problems with Sample/Hidden
   tests and hints.
4. Upload changes nothing and shows the exact grouped plan.
5. Confirmation commits the complete import atomically.
6. Every newly created level is hidden and reviewable in the course builder.
7. The Team Lead edits one workbook problem and uploads again.
8. Preview shows one Update and the rest Unchanged; commit creates no duplicate.
9. Re-uploading the identical workbook produces only Unchanged outcomes.
10. Changing an existing problem to another lecture blocks as a parent conflict.
11. A manual course edit after preview causes a revision conflict at commit.
12. A Manager can review content but cannot download, upload, preview, or commit
    an import.
13. A Team Lead from Academy A cannot discover or affect Academy B sessions or
    courses.
14. A forced mid-commit failure leaves the course exactly as it was before.

## 16. Delivery phases

### Phase A: contracts and safe workbook foundation

- Shared import schemas, limits, normalization, actions, codes, and contracts.
- Generalized safe multi-sheet workbook reader.
- Versioned blank/current-course workbook generation.

### Phase B: persistence and domain import

- Stable module/lecture keys and backfill.
- Course content revision across every current content mutation.
- Import-session model and migration.
- Planner, durable preview, transactional commit, idempotency, audit, and tests.

### Phase C: Team Lead workflow

- Course-builder entry point and full-page wizard.
- Upload, grouped preview, issue report, warning confirmation, and results.
- English/Korean localization and browser acceptance coverage.

The phases are implementation order, not independently releasable partial
features. The production UI is enabled only after atomic commit, authorization,
parser-security, and end-to-end tests pass.

## 17. Out of scope

This slice does not add:

- Course creation from Excel.
- Cross-course or cross-academy imports.
- CSV or legacy `.xls` support.
- Images or file attachments embedded in problem descriptions.
- New programming languages or author-controlled execution limits.
- Content deletion from workbook omission.
- Moving existing modules, lectures, or problems between parents.
- Importing quizzes, videos, documents, or other Material types.
- Scheduled imports, background job queues, or email completion notifications.
- Restoration of course drafts, versions, or publishing.
- Changes to v1 admin import files or behavior.

## 18. Acceptance criteria

The feature is complete when:

- A Team Lead can import up to 200 Python problems into one manually selected
  course without creating each problem individually.
- Module/lecture definitions are separated from problem definitions and linked
  through stable keys.
- The generated current-course workbook is a safe round-trip format.
- Upload never writes curriculum content.
- Preview clearly distinguishes Create, Update, Unchanged, Warning, and
  Conflict at the correct hierarchy location.
- Re-upload uses stable keys, updates matching content, skips unchanged content,
  and creates no duplicates.
- Missing top-level workbook rows never delete existing curriculum entities.
- Tests and hints use explicit complete-replacement semantics for included
  problems.
- Commit is authorized, tenant-scoped, stale-safe, idempotent, audited, and
  atomic.
- New content is hidden and existing visibility is preserved.
- Existing learner history survives problem updates.
- Hidden expected outputs never cross into learner-facing contracts.
- Parser limits and hostile-workbook tests pass.
- English and Korean interfaces are complete and accessible.
- Existing v1 import behavior remains untouched.
