# Teacher Answer Code Modal Design

**Date:** 2026-08-31  
**Status:** Approved for implementation planning  
**Target branch:** `fix/turnstile-false-timeout`  
**Merge target:** `feat/cove-studio-v2`

## Summary

Cove Studio will let a problem author store one complete Python reference
solution for each programming exercise. While an assigned teacher is actively
monitoring a student, the teacher can click **Show Answer** / **해설 보기** for
the student's current exercise and open that solution in a centered modal.

The modal follows the Elice interaction supplied as the product reference: the
workspace is dimmed, the answer appears in a dark read-only code editor, and
the teacher has **Copy** and **Close** actions. The solution uses the same
Monaco font, syntax theme, and current font size as the live editor.

The reference solution is privileged curriculum data. It is authored manually
or through the versioned Excel problem workbook, fetched only after the teacher
clicks the button, and never enters a student response, student browser,
collaboration document, presence event, terminal stream, submission, or grading
payload.

## Product reference

Elice separates the code a learner starts with from teacher-authored answer or
grading material. Its exercise authoring documentation describes a dedicated
execution/grading area, and its teacher UI uses a **해설 보기** modal to display
the correct code without replacing the learner's editor.

The Cove feature copies the interaction model, not Elice's grading-script data
model. Cove's `solutionCode` is a readable model solution. It is not a hidden
test case and does not participate in judging.

References:

- <https://help.elice.io/help/en/docs/elicelxp/for-admin/material/exercise/grading/script/>
- <https://help.elice.io/help/docs/elicelxp/for-admin/material/exercise/skeleton/>
- User-supplied Elice **해설 보기** screenshot dated 2026-08-31

## Goals

- Give every newly created or deliberately updated programming exercise one
  author-written reference solution.
- Support the field in both manual authoring and Excel import/export.
- Let only the effective assigned teacher view it while actively monitoring the
  enrolled student who is solving that exercise.
- Load the code only after an explicit **Show Answer** click.
- Match the existing monitoring editor's Python typography and preferences.
- Preserve all existing exercises without a production backfill.
- Make missing answers visible and actionable without breaking legacy content.

## Non-goals

- Showing the answer to students.
- Revealing hidden test inputs, expected outputs, grading scripts, or grader
  internals in the answer modal.
- Running the reference solution, proving that it passes the tests, or using it
  for authoritative grading.
- Supporting multiple alternative solutions or languages other than the
  existing Python exercise language.
- Adding answer access to curriculum previews, historical submission review,
  manager pages, Team Lead monitoring, or the normal student exercise page.
- Automatically generating reference solutions for the existing curriculum.
- Accepting old version-1 content workbooks after the workbook contract moves
  to version 2.

## Roles and authorization

| Actor | Manual authoring | Excel workbook | Monitoring answer modal |
|---|---:|---:|---:|
| Student | No | No | No |
| Teacher | No | No | Yes, only for their effective assigned class and active watch |
| Team Lead | Create and edit | Download, preview, and commit | No |
| Manager | Yes | Yes | No |
| Platform admin without academy membership | No | No | No |

> **Amended 2026-08-31.** Manager originally held none of these. The manager
> inherits team lead permissions design makes `MANAGER` a permission superset
> of `TEAM_LEAD`, so a Manager now authors problems and imports workbooks —
> and therefore reads and writes model solutions — through the same
> `exercises.manage` and `content.import` boundaries a Team Lead uses. The
> monitoring column is unchanged: that surface needs an open teaching visit,
> which no Manager has.

The authoring boundary is `exercises.manage`. The monitoring boundary remains
the existing strict teacher predicate plus class assignment, active academy and
membership checks, enrollment, material reachability through that class, and
an active monitoring visit for the same teacher, student, and material.

Holding `curriculum.review` is not enough to receive `solutionCode`. This is
important because teachers and managers can currently review exercise details.
The solution must not be added to the general course tree or general exercise
authoring projection that those roles already read.

## User experience

### Manual problem authoring

The Team Lead problem form adds a **Correct answer code** section immediately
after **Initial code** and before **Answers** (test cases). It uses Monaco with
the existing Python theme and editor conventions.

Rules:

- Maximum length: 100,000 characters.
- Whitespace is preserved exactly.
- A value containing only whitespace is missing.
- New problems cannot be saved without a solution.
- Opening an existing problem without a solution is allowed, but any manual
  save requires the Team Lead to add one.
- The completeness checklist names **Correct answer code** when it is missing.
- Read-only curriculum reviewers do not see this section and do not receive its
  value from the server.
- Changing only the reference solution updates the exercise timestamp and
  course content revision, but it does not increment `gradingRevision` or reset
  student progress because judging did not change.

The first release validates presence and length only. Correctness remains the
author's responsibility; automatic execution or comparison would be a separate
feature.

### Teacher monitoring

The live monitoring header adds **Show Answer** / **해설 보기** for the
student's current live exercise.

Button states:

- **Enabled:** the active visit and exercise have a stored solution.
- **Loading:** a click is fetching the solution; repeated clicks do nothing.
- **Disabled:** the current live exercise has no solution. The control explains
  **No answer added yet**.
- **Unavailable:** the student is not in an exercise, the teacher is reading a
  curriculum preview, or the watch is reconnecting/ended. No answer request is
  made.

The answer control never follows a previewed exercise. It is bound to the
material and visit acknowledged by the current live watch so the code in the
modal cannot be mistaken for the answer to a different student program.

### Answer modal

Opening the modal dims the live workspace without stopping the watch. Live
document, cursor, terminal, and presence updates continue behind it.

The modal contains:

- **Show Answer** / **해설 보기** title.
- **Correct answer · Teacher only** supporting copy.
- `solution.py · READ ONLY` editor label.
- A read-only Monaco Python editor.
- The same font family, syntax theme, and current `fontSize` from
  `useEditorPreferences()` as the live code editor.
- Line numbers, no minimap, no editing, and internal scrolling for long code.
- **Copy**, which writes the exact stored string to the teacher's clipboard.
- A short **Copied** confirmation or an accessible copy-failure message.
- **Close**.

The modal also closes through Escape and its close icon/backdrop if the shared
dialog primitive supports those conventions. Focus moves into the dialog when
it opens and returns to **Show Answer** when it closes. Copy and Close are
keyboard accessible.

Closing the modal clears the displayed solution from component state. Query
configuration must not persist it to browser storage. The server cannot prevent
a teacher who is authorized to view the answer from retaining clipboard text;
the permission boundary controls disclosure, not DRM.

If the visit ends or authorization is revoked while the modal is open, Cove
closes the modal, clears the code, and shows the existing monitoring-ended or
access-revoked state.

## Data model and migration

Add one nullable column to `ProgrammingExercise`:

```prisma
solutionCode String? @map("solution_code") @db.Text
```

The production migration adds `programming_exercises.solution_code TEXT NULL`.
It has no default and performs no backfill. A nullable additive column keeps all
existing problems and deployments valid while authors fill solutions over
time.

The application-level create and update contracts enforce the new requirement.
Database nullability is retained for legacy records and rolling deployment
safety.

No index is needed: solution code is selected only after an already indexed
material lookup. The raw value must never be placed in an audit JSON document,
application log, metric label, exception, or tracing attribute. Audit metadata
may record only `hadSolution`, `hasSolution`, and `solutionChanged`.

## Contract boundaries

### Authoring writes

Add `solutionCode` to manual exercise create and update inputs. Its schema:

- accepts a string up to 100,000 characters;
- rejects a value whose trimmed length is zero;
- persists the original untrimmed value.

The general `programmingExerciseSchema`, `materialSchema`, course tree, and
`learnExerciseSchema` remain incapable of carrying the solution.

Existing exercise editing gets a dedicated author-only read operation, for
example `academyCourses.getExerciseSolution`, guarded by `exercises.manage`.
It returns `{ materialId, solutionCode }`. The Team Lead edit page calls it in
addition to the existing authoring-context read. A Teacher or Manager opening a
read-only exercise review therefore receives no solution field.

Create/update responses may continue returning the ordinary authoring context;
the client already holds the submitted solution draft and redirects after a
successful save.

### Monitoring availability

The teacher-only monitoring exercise context gains a boolean outside the reused
student exercise projection:

```ts
{
  ...monitoringPublicExercise,
  draftId: string | null,
  hasSolution: boolean
}
```

`hasSolution` is computed from non-null, non-whitespace `solutionCode`. It lets
the UI render the disabled legacy state without sending the code early. It is
not added to the student exercise schema.

### Lazy monitoring read

Add a monitoring operation equivalent to:

```ts
getExerciseSolution({
  academyId,
  classId,
  membershipId,
  materialId,
  visitId,
}) -> {
  materialId,
  solutionCode,
}
```

The server performs all checks on every request:

1. Authenticated academy identity.
2. Exact `TEACHER` role and enabled live-monitoring feature.
3. Effective assignment to `classId`.
4. Active enrolled student named by `membershipId`.
5. Material reachable through a course assigned to that class.
6. Open `TeacherMonitoringVisit` matching the visit, teacher membership,
   student membership, class, academy, and material.
7. Non-empty stored solution.

Missing solution returns a stable not-found-style application error without
returning null code. Failed assignment, stale visit, different material,
revocation, and probing another student's identifiers resolve to the existing
monitoring denial/unavailable family rather than revealing which individual
predicate failed.

The handler records a metadata-only audit event such as
`monitoring.exercise_solution.viewed`, naming actor, academy, class, student
membership reference, material, visit, and timestamp. It never records code.

The client invokes this operation only on click. It must not prefetch it, seed
it into server-rendered state, persist it in local storage, place it in a query
cache with a long lifetime, or transmit it over the monitoring socket.

## Excel workbook version 2

### Column contract

Increase `CONTENT_IMPORT_TEMPLATE_VERSION` from `1` to `2` and add
`solution_code` to the `Problems` sheet immediately after `starter_code`.
Sheet and column names remain English snake_case for both localized workbooks.

The instructions sheet explains:

- `starter_code` is what a student receives initially;
- `solution_code` is the private correct answer used by teachers;
- new or changed problems require it;
- it is sensitive curriculum data and must not be shared with students.

The blank sample workbook contains runnable solution code for every sample
problem. A current-course workbook exports the exact stored solution or a blank
cell for a legacy problem.

Current-course downloads already require `content.import` and already contain
hidden tests. They remain Team Lead-only. No student-facing download gains this
column.

### Reading and validation

`NormalizedProblemRow` gains `solutionCode: string | null`. The reader:

- preserves exact line endings according to the importer's existing newline
  normalization policy;
- enforces the existing 100,000-character code-cell limit;
- treats blank/whitespace-only content as missing;
- never attempts to execute formulas or code.

Version-1 workbooks are rejected by the existing version gate with the normal
unsupported-template message. The user must download a fresh template.

### Planning rules

`CourseProjection`, `PlannedProblem`, comparison helpers, session schemas, and
commit payloads gain `solutionCode`.

The planner applies these rules after it knows the row action:

- **CREATE:** missing solution is an error.
- **UPDATE:** if any problem field or child collection changes, the resulting
  problem must have a non-empty solution.
- **UNCHANGED legacy problem:** an existing null solution and blank workbook
  cell remain valid and unchanged.
- **Existing solution + blank cell:** error; import cannot clear a solution.
- **Existing solution + same value:** unchanged.
- **Existing solution + different value:** update with
  `solution_code` in `changedFields`.
- **Legacy problem + new solution only:** update with
  `solution_code` in `changedFields`.

These rules preserve the invariant that Cove never generates a current-course
workbook that its own importer rejects unchanged. A workbook containing many
legacy blank solutions can round-trip with no changes; only a row that is
created or deliberately changed must become complete.

The preview UI may say **Solution added** or **Solution changed** and list the
canonical field name, but it does not render the before/after code in grids,
details, result receipts, or analytics. The authenticated `getPreview` contract
and server-side staged plan may carry the raw value because the existing import
architecture commits the stored plan; both remain protected by the import
session's Team Lead ownership and TTL. Logs, audit records, metrics, traces,
issue `received` values, and downloadable issue reports must mask or omit it.

### Import commit

Create and update operations persist `solutionCode` atomically with the rest of
the problem. A solution-only update:

- bumps the exercise `updatedAt` and course content revision;
- does not increment `gradingRevision`;
- does not reset progress;
- records only metadata-safe audit fields.

## Data flow

```text
Team Lead manual editor or workbook v2
                |
                v
     exercises.manage validation
                |
                v
 programming_exercises.solution_code
                |
     hasSolution only in live context
                |
Teacher clicks Show Answer during active visit
                |
                v
 assigned-teacher + visit-bound HTTP authorization
                |
                v
 read-only Monaco modal -> optional clipboard copy

Student learn APIs / Yjs / socket / terminal / submissions
                X  (no solution path)
```

## Error handling

- **Missing legacy answer:** disabled button and **No answer added yet**.
- **Fetch pending:** keep modal closed or show a modal-local loading state; do
  not show stale code from a prior exercise.
- **Fetch failed:** show a modal-local failure with Retry and Close. Do not
  downgrade an authorization failure into cached code.
- **Visit ended or replaced:** clear the code and close the modal.
- **Material changed while fetching:** discard a response whose visit or
  material no longer matches the active live session.
- **Clipboard rejected:** keep the modal open and show a non-destructive error.
- **Authoring conflict:** reuse `CONTENT_EDIT_CONFLICT`; the solution participates
  in the exercise's optimistic lock.
- **Workbook missing solution:** attach the error to the Problems row and
  `solution_code` column with the problem key.
- **Old workbook:** existing template-version error and fresh-download action.

## Localization

Add matching English and Korean keys in the content, monitoring, and content
import namespaces. Required concepts include:

- Correct answer code.
- Correct answer help and required-field error.
- Show Answer / 해설 보기.
- Correct answer · Teacher only.
- No answer added yet.
- Copy, Copied, copy failed, Close.
- Loading and answer-load failure/retry.
- Workbook `solution_code` instructions and validation issue.
- Solution added/changed preview labels.

Run the existing locale parity and stale-key checks.

## Security and privacy requirements

- Student contracts remain structurally unable to carry `solutionCode`.
- The monitoring socket never carries answer code.
- The answer endpoint is visit-bound, not merely role-bound or academy-bound.
- No answer is returned to Team Leads or Managers through monitoring.
- `curriculum.review` does not grant the authoring solution read.
- Raw answer code is absent from rendered import preview rows, result receipts,
  logs, audit JSON, metrics, traces, issue reports, and error messages. The
  authorized import preview API may carry it only as part of the private staged
  plan used for commit.
- HTTP responses use the platform's normal private authenticated behavior and
  must not be publicly cached.
- The modal clears code when closed, when the material changes, and when access
  is revoked.
- Clipboard copy is an explicit teacher action; Cove does not copy on open.

## Testing strategy

### Shared contracts and pure logic

- Manual create/update schemas reject missing and whitespace-only solutions,
  preserve exact code, and enforce 100,000 characters.
- Student and general curriculum schemas have no solution field.
- Monitoring context exposes only `hasSolution` until the lazy read.
- Workbook header/version/sample/current-course round trips include
  `solution_code` correctly, while preview presentation masks it.
- Planner covers create, update, unchanged legacy, attempted clear,
  solution-only update, and masked preview values.
- Workbook v1 receives the expected version rejection.

### API services

- Team Lead can read/write authoring solution; Teacher, Manager, Student, and
  unaffiliated platform admin cannot use the author read.
- Assigned Teacher with the exact active visit can read the exact solution.
- Wrong class, student, material, visit, assignment, role, academy, feature
  state, enrollment, ended visit, or hidden/unassigned material is denied.
- Missing solution returns the designed error without leaking another fact.
- Solution-only manual and import updates do not change grading revision or
  reset progress.
- Audit records contain identifiers and booleans, never code.

### Web components

- Manual editor renders only for `exercises.manage`, participates in dirty and
  completeness state, and blocks an incomplete save.
- Show Answer is enabled only for the active live exercise with a solution.
- The modal renders exact code read-only with the current editor font size.
- Copy writes exact code and reports success/failure.
- Close, Escape, focus return, and keyboard navigation work.
- Switching material, ending the watch, and revocation clear and close the
  modal.
- Student workspace bundles and queries never request the answer endpoint.

### End-to-end

1. Team Lead creates a problem manually with a solution.
2. Team Lead exports workbook v2, changes the solution, previews a masked
   solution change, and commits it.
3. Teacher opens an assigned student's live exercise, clicks **Show Answer**,
   sees the new code, copies it, and closes the modal.
4. Student cannot call the endpoint or observe the code in their network data.
5. A legacy problem renders the disabled **No answer added yet** state.
6. Editing that legacy problem manually or through Excel requires a solution.

## Deployment and rollout

This feature uses the existing `TEACHER_LIVE_MONITORING` academy feature flag;
it does not add another flag.

The migration is additive and nullable, so the normal release process in
`docs/operations/deployment-guide.local.md` applies:

1. Implement and test on `fix/turnstile-false-timeout`.
2. Run the complete CI command sequence locally.
3. Push the branch and merge it into `feat/cove-studio-v2` after CI passes.
4. Tag the next `v2.x.y` release from the merged v2 branch.
5. Approve the production deployment.
6. Verify Team Lead authoring/export and Teacher monitoring with development
   data first, then smoke-test production with a non-student test problem.

The deployment migration runs automatically. No production data script or
solution backfill is required. Database rollback does not drop the nullable
column; application rollback simply leaves it unused.

## Acceptance criteria

- A new manually authored or Excel-created problem cannot be committed without
  non-empty answer code.
- An unchanged legacy problem with no answer remains valid.
- Any deliberate edit of a legacy problem requires an answer.
- Workbook v2 losslessly exports and reimports stored solutions and masks them
  in preview/audit surfaces.
- Only the exact assigned Teacher in the exact active monitoring visit can load
  the current exercise's answer.
- The answer is fetched only after clicking **Show Answer**.
- The modal matches the approved Elice-style interaction and contains the
  read-only Monaco solution, Copy, and Close.
- The modal follows the live editor's font and font size.
- No student-facing payload, realtime event, browser storage, terminal output,
  submission, log, or audit record contains answer code.
- Missing legacy answers produce a disabled, explained control.
- Solution changes do not alter grading revision or student progress.
- Full typecheck, lint, route lint, i18n check, tests, and builds pass before
  merge and deployment.
