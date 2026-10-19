# Multiple reference solutions for programming exercises

Date: 2026-10-19
Status: Approved by user implementation request; implemented and locally verified
Branch: `feat/ignore-python-input-prompts` (retain its name)
Evidence: [reference research](../../research/2026-10-19-multiple-reference-solutions.md)

Verification: [local implementation and test report](../../research/2026-10-19-multiple-solutions-local-verification.md)

## Decision and purpose

Let an author add separately labeled, ordered Python reference solutions to one
programming exercise. A teacher's existing **Show Answer / 해설 보기** modal
shows each solution as an independent code block with its own Copy action.

Example: one exercise can contain **Answer 1 · Using a loop** and **Answer 2 ·
Using integer division**. Each is a complete standalone program for the same
problem. Teachers can compare methods and copy exactly one implementation.

These are teaching references. Student acceptance continues to depend on the
exercise's existing tests and grading profile, including input-prompt policy.
No source-code matching against these solutions is added. Multiple acceptable
output strings, quiz answer choices, turtle/manual-material solution files,
and student answer reveal are outside this feature.

The user confirmed teacher-only viewing. Existing authorized content authors
can still edit/read the private solutions under `exercises.manage`; read-only
curriculum reviewers do not gain access. Teacher viewing remains restricted to
the assigned student's exact active monitoring visit.

This design supersedes the single-solution contract and the multiple-solutions
non-goal of the [2026-08-31 answer modal design](2026-08-31-teacher-answer-code-modal-design.md).
Its remaining permission and confidentiality requirements continue to apply.

## Alternatives considered

| Approach | Benefit | Cost / limitation |
| --- | --- | --- |
| **Structured solution entries — recommended** | Independent programs, labels, ordering, exact Copy per method, reliable import/export. | Requires collection storage, authoring, migration and workbook changes. |
| One code field with `# 방법 1`, `# 방법 2` | Can be used immediately without development. | Both implementations copy as one program and may read input twice or print duplicate output. Comment headings provide no reliable structural boundary. |
| Rich explanation document with headings and code fences | Flexible narrative presentation similar to the accessible Elice content editor. | Adds document editing/rendering and export concerns beyond the current plain-code feature. |

Comments remain valid ordinary Python text inside any solution. Cove does not
split existing code by comments or automatically interpret method headings.
Rich prose explanations, generated answers, and automatic solution execution
are deferred.

## Authoring experience

Replace the singular Correct answer code section with **Reference solutions /
정답 코드** in the existing programming-exercise editor.

- A new Python exercise starts with one blank entry.
- Each entry has an automatically numbered heading **Answer 1 / 답안 1**, an
  optional **Method name / 풀이 이름**, a Python Monaco editor, and Move up,
  Move down, and Remove actions.
- **Add solution / 정답 코드 추가** appends a blank entry and focuses its code
  editor. Numbering follows display order; removing/reordering renumbers it.
- Method names are optional plain text, trimmed, 1–80 characters when present.
  A blank name is stored as null. Display names supplement the numbered heading;
  duplicate method names are allowed because numbering distinguishes them.
- Persist at most 10 solutions, at most 100,000 characters per code string,
  and at most 500,000 code characters in total per exercise. Preserve code bytes
  as represented by application strings, including whitespace and comments.
  Whitespace-only code is invalid. Existing encoded-request limits still apply.
- A normal Python manual save needs at least one valid solution and every
  displayed entry must be valid. Adding an empty second entry blocks save until
  it is completed or removed. Inline errors identify the entry and field.
- Removing a blank entry is immediate. Removing nonblank code asks for local
  confirmation; nothing is persisted until Save. The final remaining editor
  cannot be removed; its code can be changed or cleared in the draft.
- Adding, editing, renaming, reordering, and removing participate in dirty state,
  unsaved-navigation handling, completeness, and existing optimistic locking.
- Legacy exercises with no solution open with one blank entry and the existing
  missing-answer state. Deliberate manual saves still require an answer.
  Visibility-only actions retain their current behavior.
- Native quizzes do not show Python solution editors and cannot store these
  entries. PDF-linked Python exercises use exactly the same solution collection.
- Apply this experience to academy Studio, platform academy-content editing,
  and platform library editing. Read-only review receives no private collection.

## Teacher modal

Keep the existing explicit Show Answer click and lazy HTTP request. The live
context retains only `hasSolution`, computed from nonblank stored entries.
Do not preload titles, code, or the collection into that context.

Inside the existing modal, show ordered sections vertically, following the
supplied screenshot: numbered heading, optional method name, read-only dark
Python code block, and its own Copy button. One solution uses the same layout
as multiple solutions, without empty placeholder sections or tabs.

Use one bounded scrolling modal body and bounded code-editor heights so long
solutions do not make Close unreachable. Mount Monaco blocks lazily as they
approach the scroll viewport to avoid initializing ten large editors at once.
Keep current editor font/theme/font-size behavior. At narrow widths, code may
scroll horizontally; headings, Copy and Close remain reachable without page
horizontal overflow. Each Copy button has an accessible name identifying its
answer and copies only that entry's exact code, without its title or siblings.

Copy feedback is local to the clicked entry. Provide loading, error with Retry,
and missing-answer states; no previous answer remains visible while loading.
Escape closes the dialog and focus returns to Show Answer. Keyboard order follows
visual order. Do not run code, replace student files, or send it to the terminal.

Live watch updates continue behind the modal. On student, class, academy,
material, visit or authorization changes, close the modal, clear every solution
and copy state, invalidate outstanding requests, and discard late responses.
Closing/reopening fetches fresh data; no persistent browser cache stores code.

## Storage and migration

Introduce `ProgrammingExerciseSolution` child rows owned by the exercise:

| Field | Rule |
| --- | --- |
| `id` | UUID primary key, internal identity. |
| `materialId` | UUID FK to `ProgrammingExercise.materialId`, cascade on delete. |
| `position` | Zero-based integer; unique together with `materialId`. |
| `title` | Nullable text, maximum 80 characters validated on writes. |
| `code` | Required text, nonblank and size bounds validated on writes. |

Collection order is explicit; always read with `orderBy: position`. Child row IDs
are internal and not accepted as cross-exercise update targets. Writes replace
the bounded collection atomically under the existing exercise/course transaction
and optimistic lock, assigning contiguous positions. The UI uses stable local
keys so reorder does not attach an editor's undo state to a different solution.

Migrate each nonblank legacy `solutionCode` to exactly one row at position 0,
null title, preserving its original text. Null/whitespace-only legacy values
produce no row. Migration changes neither exercise timestamps, course revisions,
grading revisions nor progress. Do not split commented methods automatically.

Retain the old `solution_code` column temporarily as a compatibility projection
of the first entry. All new application collection writes update that projection
in the same transaction, or set it null when there are no entries. It is never
the canonical read source after backfill. Keep synchronization in one private
persistence helper shared by manual writes and import commit; copy operations
must use the same invariant. There must be no remaining scalar-only writer.

Deploy migration before the coordinated API/web/worker release. Do not enable
collection editing during a mixed old/new writer deployment. Retaining the old
column preserves data for investigation; it does not make an old application
safe for editing exercises with alternatives. Rollback must keep content writes
blocked until a collection-aware release is restored. Removing the old column is
a separate follow-up after all readers/writers are migrated.

## Contracts, authorization, and revisions

Author-only read returns `{ materialId, solutions: [{ title, code }] }` in order;
an unanswered legacy exercise returns an empty collection. Manual create/update
replace `solutionCode` with `solutions`. The strict contract rejects old singular
write payloads instead of silently deleting alternatives. A stale page must
reload before editing. Quiz writes use an empty collection.

The monitoring lazy read returns the same collection shape, with at least one
entry on success. Preserve existing authorization on every request: academy,
strict monitoring teacher role, effective class assignment, active student
membership/enrollment, assigned/reachable material, and the exact open visit
matching teacher/student/class/material. Missing answers keep the existing
unavailable error family. Do not reveal which failed scope predicate exists.

The author read remains gated by `exercises.manage`. General exercise, course
tree, student learning, public preview, realtime/Yjs and submission contracts
cannot carry solution titles or code. Authorized private import staging retains
its existing permission, ownership and TTL boundaries.

Solution-only changes update the normal exercise timestamp and course content
revision so concurrent author/import work conflicts. They do not increment
`gradingRevision`, change test cases or input-prompt policy, reset progress,
regrade past submissions, or affect score calculations. Renaming and reordering
are also solution-only changes. Preserve current behavior when other grading
fields change in the same save.

Audit may record operation type, solution count and whether solutions changed.
Do not record raw code or user-authored method names in logs, audit JSON, issue
reports, telemetry, error text or persistent client storage.

## Excel import/export: workbook version 3

A structured feature must round-trip through the supported workbook workflow.
Do not flatten or export only the first solution.

- Increase the template version from 2 to 3. Reject older versions with the
  existing unsupported-version/fresh-template guidance. Do not guess a conversion.
- Remove `solution_code` from the v3 Problems columns. Add a required **Solutions**
  sheet with `problem_key`, `solution_order`, `solution_title`, `solution_code`.
  Title is optional; the other columns are required. Order is a positive integer,
  unique and contiguous starting at 1 per problem, mapped to zero-based storage.
- Every row names a problem included in the same workbook scope. Reject orphan
  keys, duplicate order, gaps, blank code, excess counts and code-size violations
  with sheet/row/column-specific errors that omit sensitive cell values.
- Rows form the complete desired solution collection for an included problem;
  omission of a previously present row explicitly removes that alternative.
  Preview states how many entries are added/changed/removed/reordered, and the
  user commits that staged collection atomically. No hidden merge semantics.
- A new Python problem needs at least one solution. An existing solved problem
  cannot become empty. An unchanged legacy problem with no entries remains a
  valid no-op round trip; any deliberate edit of that problem requires one.
  Existing importer support restrictions for quiz/manual material remain intact.
- Current-course exports contain every solution, exact code, names and order;
  scoped exports include only the selected problems' solutions. Empty legacy
  collections produce no solution rows. Sample templates demonstrate two methods
  for one problem. English snake_case headers are shared across locales.
- Existing sensitive-code decoding/newline policy and upload/expanded/row/cell
  caps remain in force. Add the new sheet to validation and counting. Do not
  silently truncate. Downloads exceeding existing limits must fail explicitly
  with actionable scoped-export guidance, never produce a non-importable file.
- Preview compares ordered collections so names/order/code affect changedFields.
  Render only metadata summaries; private server-side staged plans may contain
  the codes as today. Bump the staged-plan schema/version so an outstanding v2
  preview cannot commit through the new handler; require a fresh upload/preview.
- Import commit rechecks ownership, TTL and course revision and writes the whole
  collection plus first-entry projection in the same transaction as the problem.
  A failed child write rolls back the entire import according to current rules.

## Library adoption and deletion

Academy-library adoption deep-copies all entries, titles, exact code and order to
the newly created destination exercise, using new child UUIDs and destination
material IDs. It never links destination exercises to source solution rows.
Destination grading-revision initialization retains existing copy behavior.

Deleting an exercise or its course subtree cascades its solution rows. Changes
to a source library after adoption do not modify previously adopted answers.
Audit every create/copy/import persistence path during implementation; no path
may preserve only the deprecated first-entry field.

## Implementation boundaries

| Area | Required work |
| --- | --- |
| Prisma and API content | Child model/backfill, one transactional collection writer, author read/write, optimistic locks and safe audit metadata. |
| Shared content and monitoring | Bounded entry/collection schemas; private DTOs; public projections remain private-data-free. |
| Web authoring | Collection draft/editor, validation/completeness, dirty tracking and three edit entry points. |
| Monitoring | Availability query, visit-bound collection response, multi-block modal, cleanup and per-entry Copy. |
| Import subsystem | Workbook v3, Solutions reader/exporter, collection planner/staged payload, redaction and transactional commit. |
| Library | Full deep-copy coverage. |
| Localization | Matching English/Korean authoring, modal, validation and workbook instructions; use existing namespace conventions. |

Reuse existing editor and modal primitives. No new service, grading subsystem,
permission flag, student reveal policy or unrelated architectural refactor is
required. Implementation planning follows user review of this draft.

## Acceptance and verification

1. Author saves two independently complete programs, reopens them, renames and
   reorders them, removes one, and sees exactly the saved collection. Both admin
   editing routes behave consistently with Studio.
2. Schemas cover empty/whitespace code, exact whitespace preservation, blank
   optional titles, 80/100,000/500,000-character boundaries, 10-entry limit,
   quiz exclusion, and legacy empty collections. Failed writes persist nothing.
3. Migration fixtures cover null, whitespace-only, commented multi-method and
   nonblank legacy code; backfill is exact and changes no grading/progress data.
4. Manual and import solution-only add/edit/remove/reorder preserve grading
   revision, existing attempts, score and input-prompt policy; stale edits and
   previews conflict without partial child changes.
5. Workbook v3 round-trips two solutions, names and order; tests cover removal,
   unknown keys, duplicate/gapped order, legacy no-op, missing required answers,
   old/staged versions, limits and sensitive-value redaction.
6. Adoption copies all methods with independent destination ownership; delete
   cascades; later source edits do not alter adopted methods.
7. Local browser E2E uses separate author/teacher/student contexts: author two
   distinguishable methods; teacher opens the exact live student's modal and
   copies each independently; student network/API/realtime data contain neither
   method. Reject wrong teacher/class/student/material/visit and ended visits.
8. Browser tests cover no prefetch before click, watch continuation, material
   switching during fetch, close/reopen, keyboard focus/Escape, clipboard failure,
   retry, no-answer legacy state, and narrow-screen scrolling. No answer enters
   student code or a running terminal when the modal opens or Copy is used.
9. Run appropriate migration/integration, shared/API/web/import tests, i18n,
   route lint, typecheck and build checks. Run relevant Chromium and WebKit E2E
   locally, record commands/results and distinguish blocked tests from passes.

## Review status

The specification has been checked for scope, missing lifecycle paths, data
loss in import/copy, legacy compatibility, permissions and grading invariants.
The proposed solution cap, optional method names, ordered blocks and workbook
v3 are explicit design defaults for user review. No application implementation,
database migration, deployment or production edit is authorized by this document.
