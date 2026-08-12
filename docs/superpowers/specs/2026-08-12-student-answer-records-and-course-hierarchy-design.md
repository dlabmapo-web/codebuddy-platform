# Student Answer Records and Guided Course Hierarchy Design

**Date:** 2026-08-12

**Status:** Confirmed design

**Scope:** V2 student answer history, editable historical-submission entry, and
student course-outline improvements

**Companion designs:**

- `2026-07-31-student-learning-experience-design.md`
- `2026-08-03-problem-workspace-verdict-and-scoring-design.md`
- `2026-08-03-direct-editable-curriculum-visibility-design.md`
- `2026-08-11-student-class-pages-design.md`

## 1. Decision

Add an academy-wide **Answer records** page to the student Learning area. It
lists every submission attempt by the signed-in student, newest first, using
the studio's shared TanStack `DataTable`, plus-icon faceted filters, sortable
headers, and First/Previous/Next/Last pagination.

A record is not a read-only dead end. Its problem title and **Review** action
open the normal exercise workspace with that submission's code and result
selected. The student may edit, run, submit, reset, reveal hints, use the
terminal, navigate the curriculum, and receive teacher feedback exactly as
when entering through My Classes or My Courses. A new submission creates a new
immutable record.

Improve the existing student course outline with the approved **guided
hierarchy** layout: keep v2's module accordions and problem rows, while making
each lecture an Elice-inspired card with its description, solved count, and
progress bar. The hierarchy remains course → module → lecture → problem on
both surfaces.

The shared `DataTable` gains an optional controlled/manual server mode. Every
existing client-side table keeps its current behavior and API defaults.

## 2. Reference findings

The Cove v1 `/me` page establishes the useful answer-history behavior:

- academy-wide summary metrics;
- all, accepted, and not-accepted result filters;
- newest-first attempts, including repeated attempts for one problem;
- curriculum filtering;
- twenty records at a time; and
- a record link that carries its return location into the solver.

Its filters are persisted in the URL. Its curriculum selectors cascade, but
the v1 page uses a separate select implementation and incremental **See more**
control. V2 keeps the behavior, not that furniture: the established studio
pattern is `FacetedFilter` plus the shared TanStack table paginator.

The referenced Elice course page contributes the lecture-level scan pattern:
lecture title, description, completed/total count, visible progress, and clear
previous/next continuity. V2 retains its module layer instead of flattening a
large course into one long lecture stream.

## 3. Goals

- Give a student one academy-wide history of every submission attempt.
- Default to deterministic newest-first ordering.
- Show total submissions, distinct solved problems, and accepted rate.
- Search by problem title and filter with the existing plus-icon facet UI.
- Filter by result, class, course, module, and lecture.
- Sort supported columns and paginate on the server without loading the full
  history into the browser.
- Persist table search, filters, sorting, and page in the URL.
- Show the actual time spent solving before each submission.
- Let a student reopen historical code in the fully functional workspace.
- Preserve a pre-existing current draft until the student changes or submits
  the historical code.
- Keep hidden test inputs and outputs structurally absent from student
  contracts.
- Improve course scanning without introducing a second curriculum structure.
- Preserve English/Korean parity, keyboard access, mobile usability, and
  light/dark theme behavior.

## 4. Non-goals

- Teacher or manager access to another student's answer records.
- Comparing students, rankings, leaderboards, badges, or class analytics.
- Editing or deleting a historical submission.
- Regrading old submissions after curriculum or judge changes.
- Showing hidden test inputs, expected outputs, or actual outputs.
- Showing program runtime as an Answer records table column.
- Adding a page-size selector; v2 uses a fixed twenty records per server page.
- Replacing the existing problem workspace or building a separate submission
  detail page.
- Flattening modules out of the course outline.
- Copying Elice branding, admin controls, or navigation.

Program runtime may remain inside the existing detailed judge-result
presentation. It is deliberately absent from the history table because the
student asked to compare learning time, not execution-engine performance.

## 5. Navigation and routes

The student-only Learning group is ordered:

1. **My courses**
2. **My classes**
3. **Answer records**

Staff curriculum preview does not gain Answer records. The route is:

```text
/studio/academies/:academyId/learn/records
```

It uses `StudioShell` with the standard title and description. My Courses
remains the student landing destination.

Historical workspace entry uses the existing exercise route:

```text
/studio/academies/:academyId/learn/exercises/:materialId
  ?submission=:submissionId
  &returnTo=:encodedRecordsPath
```

`returnTo` accepts only a same-academy `/studio/.../learn/records` path. An
invalid value is ignored and falls back to that academy's records root. This
prevents an open redirect and keeps Back behavior deterministic.

## 6. Answer records experience

### 6.1 Page summary

Three compact cards appear before the table:

- **Total submissions** — `PASSED` and `FAILED` attempts. Judge faults and
  cancelled work are not student attempts.
- **Problems solved** — distinct `sourceMaterialId` values with at least one
  `PASSED` submission.
- **Accepted rate** — `PASSED / (PASSED + FAILED)`, rounded to the nearest
  whole percent; zero when the denominator is zero.

These metrics describe the whole academy-visible history and do not change
with table filters. Stable top-level metrics let a student filter the table
without making their overall progress appear to change.

### 6.2 Toolbar and faceted filtering

The toolbar reuses the shared table search and `FacetedFilter` component. Each
facet is the established dashed chip with `PlusCircle`; opening it shows a
searchable multi-select popover, selected values appear inside the chip, and
the common Reset action clears all search and facets.

Facets are:

- **Result:** Accepted, Not accepted, Judge error, Cancelled, and In progress
  where such a row still exists.
- **Class:** current active classes through which a listed record's course is
  currently available.
- **Course**
- **Module**
- **Lecture**

Class is an access-path filter, not historical provenance. A submission does
not currently capture which class link led to the course, and the same course
may be assigned to two classes. Selecting a class therefore means “records
from courses this class currently provides.” A record may match more than one
class. This avoids inventing false historical class ownership.

Course, module, and lecture options narrow from the selected parent facets.
Removing a parent removes now-invalid child selections. The server returns
the available facet options for the current academy scope; the browser never
derives global counts from one page of rows. Facet result counts are omitted in
manual mode so the UI cannot display misleading current-page counts.

Search matches problem title and its visible course/module/lecture path. It is
trimmed, case-insensitive, debounced, and limited by the contract. A search or
filter change resets `page` to 1.

### 6.3 Columns

| Column | Content | Server sort |
|---|---|---|
| Problem | Outline number, title, and course › module › lecture path | Title |
| Result | Student-safe status badge | Status |
| Score | `0–100` | Numeric |
| Tests | Passed count / total count | Not sortable |
| Solve time | Time from opening the problem to this submission | Numeric |
| Submitted | Localized submission date and time | Timestamp |
| — | Explicit **Review →** link | Not sortable |

The problem title is also a link to the same destination as Review. The table
does not depend on whole-row click: explicit links remain understandable,
focusable, and usable alongside header and facet controls.

Program runtime is not rendered in this table.

### 6.4 Sorting and pagination

Default ordering is `createdAt DESC, id DESC`. The ID tie-breaker prevents
rows from changing pages when two submissions share a timestamp.

Sortable headers use the existing table header menu: ascending, descending,
clear sort, and hide column where allowed. Only one server sort is active at a
time. Clearing it restores newest first.

Server pagination uses a fixed page size of 20 and the existing controls:

- First
- Previous
- `Page X of Y`
- Next
- Last
- total matching row count

The server returns `totalCount` and `pageCount`. A page beyond the last valid
page canonicalizes to the last page when results exist and page 1 when none
exist.

### 6.5 URL state and return continuity

The URL is the table's shareable source of truth. Supported parameters are:

```text
q
result (repeatable)
class (repeatable)
course (repeatable)
module (repeatable)
lecture (repeatable)
sort
direction
page
```

Missing values mean the default. Unknown IDs, unsupported sort keys, malformed
directions, and non-positive pages are discarded during parsing. Query keys
are emitted in a stable order so equivalent table states produce one URL.

The Review link encodes the complete current records path as `returnTo`.
Returning restores the same search, facet selections, sorting, and page. The
browser's native scroll restoration is used; no custom scroll-position store
is introduced.

## 7. Solve time

### 7.1 Why the current values cannot be reused

`ExerciseTimer` is currently display-only and starts from `Date.now()` when
the workspace mounts. Its value is not attached to `submit`. Meanwhile,
`Submission.elapsedSec` is currently derived from submission creation to
grading completion, which measures queue/judge latency, not the time a student
spent solving. The history must not relabel either value as solve time.

### 7.2 Server-owned solve session

Add an `ExerciseSolveSession`:

```prisma
model ExerciseSolveSession {
  id         String   @id @default(uuid()) @db.Uuid
  userId     String   @map("user_id") @db.Uuid
  materialId String   @map("material_id") @db.Uuid
  startedAt  DateTime @default(now()) @map("started_at") @db.Timestamptz(6)
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  user        User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  material    Material     @relation(fields: [materialId], references: [id], onDelete: Cascade)
  submissions Submission[]

  @@index([userId, materialId, startedAt(sort: Desc)])
  @@map("exercise_solve_sessions")
}
```

`Submission` gains:

```prisma
solveSessionId  String? @map("solve_session_id") @db.Uuid
solveElapsedSec Int?    @map("solve_elapsed_sec")
solveSession ExerciseSolveSession? @relation(fields: [solveSessionId], references: [id], onDelete: SetNull)
```

Opening an ordinary or historical workspace calls
`learn.startSolveSession({ academyId, materialId })`. The server first applies
the normal learning authorization and returns `{ solveSessionId, startedAt }`.
The visible timer is based on that server timestamp, not a separate browser
origin.

`learn.submit` adds `solveSessionId`. In the same transaction that snapshots
the grading input, the server verifies the session belongs to the actor and
material, then writes:

```text
solveElapsedSec = floor((serverNow - solveSession.startedAt) / 1000)
```

The browser never supplies elapsed seconds. A missing, mismatched, or expired
session is rejected as `SOLVE_SESSION_INVALID`; the workspace obtains a fresh
session and asks the student to submit again. A session expires after 24 hours
to bound accidentally abandoned tabs. The visible timer stops at 23:59:59 and
the next submit starts a fresh session rather than storing an implausible
duration.

Repeated submissions without leaving the workspace share the session and
therefore show increasing solve times. Reopening or navigating back to the
problem starts a new session. Historical rows created before this migration
show an em dash for Solve time; old judge latency is never backfilled into the
new field.

## 8. Historical submission in the editable workspace

### 8.1 Bootstrap and authorization

The exercise page accepts optional `submissionId`. Its server bootstrap loads
the ordinary authorized workspace and, when present, the selected owned
submission in parallel. The submission must:

- belong to the authenticated user's academy membership;
- belong to the route's `materialId` through `sourceMaterialId`; and
- belong to a course in the route academy.

Another student's ID and a route/submission mismatch both return the existing
student-safe not-found result. Hidden grading data never enters the contract.

The selected payload contains the immutable submitted code and existing
student-safe `SubmissionResult`. It does not replace the current `ExerciseDraft`
in the database during bootstrap.

### 8.2 Editor behavior

When a historical submission is selected:

- the editor initially shows its submitted code;
- the Result tab initially shows that submission's verdict and safe case data;
- a compact context label identifies the submission date and attempt;
- Edit, Run, Submit, Reset, hints, terminal, monitoring, feedback, and
  curriculum controls remain enabled;
- Reset retains the normal meaning and restores the exercise starter code;
- Previous/Next opens the neighboring ordinary workspace and clears the
  selected historical submission; and
- Back uses the validated records `returnTo` location.

Merely opening and leaving does not overwrite an existing current draft.
Changing the historical code makes the changed buffer the active draft and
normal autosave begins. Submitting without first editing also promotes that
buffer by flushing it before submission, matching the current submit rule.

A Run never mutates the historical submission. A Submit always inserts a new
submission and leaves the original immutable. The new result replaces the
selected historical verdict in the active Result panel, just as an ordinary
submission does.

If the current problem is no longer reachable because it was hidden, removed,
or unassigned, the history row remains visible but its Review action is
disabled with **Problem no longer available**. This feature does not bypass
current learning authorization to recreate an editable problem from an old
snapshot.

## 9. Stable record labels

History must stay readable after ordinary curriculum edits. `Submission`
therefore snapshots the student-visible labels and positions used by the row at
submission time:

```prisma
problemTitle    String @map("problem_title")
courseTitle     String @map("course_title")
moduleTitle     String @map("module_title")
lectureTitle    String @map("lecture_title")
modulePosition  Int    @map("module_position")
lecturePosition Int    @map("lecture_position")
problemPosition Int    @map("problem_position")
```

New submissions populate them in the same transaction as the grading
snapshot. The migration backfills existing rows from their current material
graph before making the fields required. If an already-orphaned development
row cannot be backfilled, it receives neutral **Unavailable problem** labels
and zero positions; no hidden or management-only text is synthesized.

The row uses snapshot labels, while filters use the current visible curriculum
IDs when those relations remain reachable. Thus an old title remains honest
without letting a hidden course appear as a selectable current filter.

## 10. API contract

Add student-only schemas and procedures:

```ts
learn.listAnswerRecords({
  academyId,
  q?,
  results?,
  classIds?,
  courseIds?,
  moduleIds?,
  lectureIds?,
  sort?,          // problem | result | score | solveTime | submitted
  direction?,     // asc | desc
  page?,          // default 1
}) -> {
  summary: {
    totalSubmissions,
    solvedProblems,
    acceptedRate,
  },
  rows: AnswerRecordRow[],
  facets: {
    results,
    classes,
    courses,
    modules,
    lectures,
  },
  pagination: { page, pageSize: 20, totalCount, pageCount },
}

learn.startSolveSession({ academyId, materialId })
  -> { solveSessionId, startedAt, expiresAt }

learn.getExerciseBootstrap({ academyId, materialId, submissionId? })
  -> { workspace, navigator, selectedSubmission? }

learn.submit({ academyId, materialId, code, solveSessionId })
  -> { submissionId, totalCount }
```

`AnswerRecordRow` carries IDs, snapshot labels/positions, status, score,
passed/total counts, `solveElapsedSec`, `createdAt`, and `canOpenExercise`. It
does not carry source code; code is fetched only for the one authorized
workspace bootstrap.

The service begins with `requirePermission(..., "curriculum.read")`, resolves
the student's learning scope, and always filters `Submission.userId` to the
actor. The records read does not use a caller-provided user ID.

Rows are academy-bound through `Submission.course.academyId`. Current class
and curriculum filters join through the same `learningScopeFor` and reachable
content predicates as My Courses. Historical ownership never grants current
exercise access.

## 11. Shared TanStack table extension

`DataTable` retains its existing uncontrolled client mode by default. Add one
optional controlled configuration for server consumers containing:

- `manualPagination`, `manualSorting`, and `manualFiltering`;
- controlled pagination, sorting, global-filter, and column-filter state;
- `rowCount` and `pageCount`;
- state-change callbacks; and
- a pending/loading signal.

When omitted, the current `getSortedRowModel`, `getFilteredRowModel`, faceted
unique values, and `getPaginationRowModel` behavior remains byte-for-byte in
effect for members, invitations, applications, courses, classes, and other
existing tables.

In manual mode:

- TanStack models and renders only the returned server page;
- header/facet/pager state changes update the records URL;
- false current-page facet counts are suppressed;
- pending navigation keeps the current rows visible with an accessible loading
  state, preventing layout jumps; and
- column visibility remains local UI state because it does not affect the
  query.

The records component supplies an explicit Review link. It does not use
`onRowClick`.

## 12. Guided course hierarchy improvement

The existing `CourseOutline` keeps module accordions and nested lecture
collapsibles. Each lecture header becomes a stronger card that displays:

- lecture title;
- authored lecture description, clamped to two lines;
- solved problems / total visible problems;
- a compact progress bar; and
- the current expand/collapse affordance.

The course header keeps total solved/total progress and search. Module headers
keep their number, title, lecture/problem counts, and expand state. Expanded
lectures keep the existing numbered problem rows and status/score behavior.

Lecture progress is derived from the progress already present on the course
outline's exercises. It is not aggregated from submissions on read and adds no
new database query. Zero-problem lectures preserve the existing empty state
and do not show a misleading percentage.

The layout collapses to one column on mobile. Progress text remains visible;
the bar may shorten but is not the only carrier of completion information.

## 13. Loading, empty, and error states

- **No history:** explain that submitted solutions will appear here and link
  to My Courses.
- **No filtered rows:** say no records match and offer Reset filters.
- **Initial load failure:** render the standard permission-aware page error
  with Retry.
- **Subsequent query failure:** retain current rows, announce the failure, and
  offer Retry without erasing URL state.
- **Invalid URL state:** normalize it as described in §6.5 rather than fail the
  page.
- **Judge error:** show a distinct system-error badge; do not describe it as a
  wrong answer or count it in student metrics.
- **Queued/running row:** show its live status. A refresh can reveal the final
  result; this design adds no academy-wide realtime stream.
- **Missing solve time:** render an em dash with an accessible “Not recorded”
  label.
- **Problem unavailable:** preserve the history row and disable Review without
  leaking why the content became unreachable.
- **Selected submission unavailable:** show the ordinary workspace without
  replacing its draft and a focused “Submission could not be loaded” message.

## 14. Accessibility and responsive behavior

- Facets retain `Popover`, `Command`, checkbox state, keyboard search, and
  focus behavior from the shared component.
- Header sorting remains button-driven and announces active direction through
  TanStack-compatible ARIA state.
- Review and problem title are real links with visible focus rings.
- Status never relies on color alone.
- Solve time uses localized human-readable duration and a precise accessible
  label.
- Loading and errors use polite live regions; results count changes are
  announced without moving focus.
- The table retains horizontal overflow on narrow screens. Problem, Result,
  Solve time, Submitted, and Review are the essential columns; Score and Tests
  may be hidden by the existing Columns control.
- Course lecture progress always pairs a numeric count with its bar.
- Reduced-motion preferences govern pending and progress transitions.

## 15. Internationalization

Add English and Korean `learn` strings for:

- Answer records navigation, title, description, summary, columns, facets,
  statuses, actions, and states;
- solve-session expiration and retry guidance;
- historical-submission context and unavailable problem copy; and
- lecture progress descriptions.

Common table pagination, sorting, columns, Reset, and facet strings continue to
come from `common`. Dates and durations use the existing locale helpers rather
than page-specific formatting.

## 16. Verification

### 16.1 Pure and schema tests

- URL parsing rejects unsupported values and emits canonical stable URLs.
- Any query-changing control resets page 1; column visibility does not.
- Result-to-badge mapping distinguishes judge error from not accepted.
- Summary metrics exclude system faults and count distinct solved materials.
- Duration formatting covers zero, minutes, hours, null, and the 24-hour cap.
- Shared answer-record and selected-submission schemas cannot carry hidden
  grading fields.

### 16.2 API and service tests

- A student reads only their own submissions in the requested academy.
- Another student's submission ID behaves as not found.
- Cross-academy, route/material mismatch, inactive membership, and inaccessible
  course cases are refused.
- Default and every supported server sort are deterministic.
- Search, multi-select result filters, and each curriculum facet compose.
- The class facet follows current class-to-course access and does not duplicate
  rows when two classes provide one course.
- Total/page counts match the filtered query, including empty and out-of-range
  pages.
- Summary metrics remain unfiltered.
- Solve-session creation enforces learning access.
- Submit accepts only an owned session for the same material, computes elapsed
  time from the server clock, shares elapsed origin across repeated
  submissions, and rejects expired/mismatched sessions.
- Existing rows with null solve time remain valid.
- Snapshot labels are written atomically with the submission.

### 16.3 Web component tests

- Existing `DataTable` consumers retain client search, facets, sorting,
  pagination, columns, and empty states.
- Manual mode calls the owner for sort/filter/page changes and never paginates
  the current page locally.
- Manual facets do not show misleading page-only counts.
- Review links contain the selected submission and complete validated return
  location.
- Opening a historical attempt shows its code/result without overwriting the
  saved draft.
- First edit or Submit promotes historical code into the normal draft flow.
- Run, Submit, Reset, hints, terminal, navigation, monitoring, and feedback are
  enabled for historical entry.
- A new submission does not mutate the historical one.
- Previous/Next clears historical selection.
- Lecture cards render description and accessible solved/total progress.

### 16.4 End-to-end acceptance

1. A student submits the same problem incorrectly and then correctly; both
   attempts appear newest first.
2. The records summary reports two submissions, one solved problem, and 50%
   accepted rate.
3. Result and curriculum plus-icon facets narrow server results and survive a
   reload.
4. Header sorting and First/Previous/Next/Last paging update the URL and render
   the expected page.
5. Review opens the selected code and result in the normal fully editable
   workspace.
6. Editing and submitting creates a third record; Back returns to the exact
   table state.
7. A pre-existing draft is unchanged when a historical submission is opened
   and closed without editing.
8. Solve time matches the server-issued workspace timer at submission and is
   distinct from program runtime.
9. A student cannot open another student's selected submission by changing the
   URL.
10. An unavailable problem leaves a readable record with no usable Review
    action.
11. English and Korean layouts pass at desktop and mobile widths in light and
    dark themes.

Run the relevant package typechecks and tests, `i18n:check`, and the student
journey Playwright coverage. The implementation plan must name the exact
commands after checking the package scripts current at implementation time.

## 17. Delivery boundaries

Implement in vertical slices:

1. data migration, solve sessions, stable submission labels, and contracts;
2. academy-wide records query and tests;
3. shared controlled `DataTable` mode with regression coverage;
4. records route, URL state, facets, columns, pagination, and empty/errors;
5. editable historical workspace entry and solve-time integration;
6. guided lecture cards and course-progress verification;
7. i18n, responsive/accessibility QA, and end-to-end acceptance.

Each slice leaves existing ordinary course → problem solving usable. No v1
route is removed by this feature.
