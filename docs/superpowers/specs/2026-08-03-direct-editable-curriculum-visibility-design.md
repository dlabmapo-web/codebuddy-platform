# Direct Editable Curriculum and Hierarchical Visibility Design

**Date:** 2026-08-03

**Status:** Implemented

**Scope:** Team Lead curriculum authoring, student content visibility, grading consistency, and migration away from course versions

## Summary

Replace the Draft → Publish → new Draft lifecycle with one directly editable curriculum per course. Team Leads can edit courses, modules, lectures, and programming problems at any time. A simple Visible/Hidden setting at each level controls student access.

New content starts hidden. Saving an edit to visible content changes the student experience immediately; there is no separate release step. Hiding a parent makes all descendants effectively hidden without overwriting their own saved settings. Showing the parent restores each descendant's previous visibility.

The active content model no longer contains course versions, version numbers, draft states, publishing, or archiving. Submission-time grading snapshots and exercise grading revisions replace the correctness guarantees previously provided by immutable published versions.

## Goals

- Give Team Leads one obvious place to edit each course and its curriculum.
- Allow direct editing regardless of whether content is visible to students.
- Use the same Visible/Hidden concept for courses, modules, lectures, and problems.
- Make parent visibility cascade downward without mutating child settings.
- Prevent hidden content from leaking through lists, direct URLs, runs, drafts, or submissions.
- Preserve student work and submission history while content is hidden.
- Keep queued grading deterministic when a Team Lead edits a live problem.
- Reset current progress when a grading change makes previous completion stale.
- Migrate existing content without losing the newest Team Lead work or historical submissions.

## Non-goals

- Revision history, rollback, scheduled releases, approvals, or change review.
- A replacement archival workflow. Hidden is the only course availability state.
- Permanent deletion of content that has student submission history.
- Changing the distinction between SAMPLE and HIDDEN grading test cases.
- Retroactively regrading historical submissions after a problem changes.
- Expanding authoring beyond programming exercises.

## Product decisions

1. There is exactly one editable curriculum tree per course.
2. Every new course, module, lecture, and problem starts hidden.
3. Team Leads can edit visible and hidden content.
4. Saving visible content affects students immediately.
5. Hide/Show is available from each row's Actions menu.
6. An eye or eye-off icon indicates the item's own visibility setting.
7. A child hidden only by an ancestor is visually dimmed, but its own icon remains unchanged. A tooltip explains the effective state.
8. Student progress and code are preserved while content is hidden.
9. Grading-affecting edits reset current progress but preserve submission history.
10. Draft, Publish, Archive, Restore, and course-version UI are removed.

## Domain model

The active hierarchy becomes:

```text
Course
└── CourseModule
    └── Lecture
        └── Material
            └── ProgrammingExercise
```

`CourseVersion` is not part of the active hierarchy. `CourseModule` belongs directly to `Course`. `ProgrammingExercise` no longer needs a `courseVersionId`; its course is resolved through Material → Lecture → CourseModule → Course.

### Visibility fields

Use `isVisible Boolean @default(false)` on:

- `Course`
- `CourseModule`
- `Lecture`
- `Material`

Rename the current module, lecture, and material `isPublished` fields to `isVisible`. Replace `Course.status` (`ACTIVE`/`ARCHIVED`) with `Course.isVisible`.

`ProgrammingExercise` inherits the Material visibility setting and does not duplicate it.

`ExerciseTestCase.visibility` remains `SAMPLE` or `HIDDEN`. That field controls whether a test case is shown to a student; it is unrelated to curriculum visibility and must not be renamed.

### Effective visibility

A problem is available to a student only when all four stored flags are true:

```text
course.isVisible
AND module.isVisible
AND lecture.isVisible
AND material.isVisible
```

The effective state is computed on reads. Hiding a parent changes only that parent's flag. It never updates descendant records.

Example:

1. A problem's own `isVisible` is true.
2. Its lecture is hidden, so the problem is effectively hidden.
3. The problem keeps its own true value while unavailable.
4. Showing the lecture makes the problem available again, provided the course and module are also visible.

## Team Lead experience

### Courses list

- Replace Active/Archived status with an eye or eye-off indicator.
- The Actions menu contains Open, Edit course, and Hide or Show.
- Remove Archive and Restore actions.
- Open always leads to the single course builder route.
- Course creation redirects to the builder and the course starts hidden.

### Course builder

- Use a versionless route:

  ```text
  /studio/academies/:academyId/content/courses/:courseId
  ```

- Remove version labels, read-only published state, validation-for-publish, and the Publish button.
- Team Leads with `curriculum.manage` can always create, reorder, rename, edit, hide, and show modules and lectures.
- Team Leads with `exercises.manage` can always create, reorder, edit, hide, and show problems.
- Each course/module/lecture/problem displays an eye or eye-off icon.
- Edit and Hide/Show live inside the item's Actions menu.
- A row becomes dimmed when an ancestor makes it effectively hidden.
- Hovering or focusing the visibility icon shows one of:
  - “Visible to students”
  - “Hidden from students”
  - “Hidden because a parent is hidden; this item’s own setting is visible”
- Hiding a visible course, module, or lecture requires confirmation explaining the affected descendants. Showing does not require confirmation.
- New descendants display Hidden immediately after creation.

### Problem authoring

- Use a versionless route beneath the course:

  ```text
  /studio/academies/:academyId/content/courses/:courseId/lectures/:lectureId/exercises/:materialId
  ```

- Remove “Read-only review” for Team Leads who have edit permission.
- Save writes directly to the active problem.
- Keep `expectedUpdatedAt` optimistic concurrency protection for the multi-field problem form.
- Preview uses the unsaved form state and clearly indicates the problem's own and effective visibility.

### Legacy authoring URLs

Existing URLs containing `/versions/:versionId` should redirect only when the requested content maps to the selected live tree. The redirect removes the version segment. A URL for a discarded historical version returns not found rather than opening unrelated content.

## API design

Replace version-oriented contracts with tree-oriented contracts.

### Remove

- `academyCourses.createDraft`
- `academyCourses.validateVersion`
- `academyCourses.publishVersion`
- Draft/published version summaries in course list responses
- `versionId` from curriculum mutation inputs
- Publish validation result types and version status types used only by this feature

### Rename or replace

- `getDraftTree` → `getTree`
- `CourseDraftTree` → `CourseTree`
- `isPublished` curriculum fields → `isVisible`
- Course archive/restore mutations → `setCourseVisibility`
- Module and lecture visibility updates continue through their update mutations using `isVisible`
- `setExerciseVisibility` uses `isVisible`

### Course summary

The course summary contains:

- course ID
- title and description
- `isVisible`
- content counts from the one live tree
- created and updated timestamps

It contains no draft version, published version, version number, or published timestamp.

### Authorization

Keep existing academy permission boundaries:

- `curriculum.review`: view the Team Lead curriculum tree
- `curriculum.manage`: edit course/module/lecture structure and visibility
- `exercises.manage`: edit programming problems and problem visibility

Student APIs continue requiring their current learner permissions and apply effective visibility independently of Team Lead permissions.

## Student reads and writes

Define one shared Prisma predicate/helper for effective problem visibility and reuse it in:

- course listing
- course outline
- exercise workspace
- neighboring-problem navigation
- code draft reads and saves
- local/sample run inputs
- submission creation
- submission listing scoped to an active problem

Course listing includes only visible courses. Outlines include only visible modules, lectures, and materials. Empty visible parents may remain visible in Team Lead views but are omitted from student course outlines when they contain no visible learning material.

A hidden or nonexistent resource produces the same student-facing not-found error. A student cannot infer hidden content IDs or titles through error differences.

Hiding content does not delete:

- `ExerciseDraft`
- `Submission`
- `SubmissionCase`
- `StudentExerciseProgress`

Showing it again restores access to the same records.

## Deterministic grading without published versions

Direct editing creates two race conditions that immutable published versions previously prevented:

1. Test cases could change after a submission is queued but before the worker claims it.
2. A verdict for old tests could update progress after a newer grading definition is saved.

Both must be resolved explicitly.

### Exercise grading revision

Add `gradingRevision Int @default(1)` to `ProgrammingExercise`.

Increment it transactionally when any grading-affecting field changes:

- test-case input
- expected output
- test-case order, count, or SAMPLE/HIDDEN classification
- language/runtime selection
- time limit
- memory limit

Do not increment it for:

- problem or course titles
- prose description
- input/output format prose
- constraints prose
- starter code
- hints
- AI feedback preference
- curriculum visibility

Any SAMPLE test-case edit is still grading-affecting because sample cases are executed by the judge.

### Submission grading snapshot

At submission creation, one database transaction must:

1. Recheck effective visibility.
2. Read the exercise and its current grading revision.
3. Create the Submission.
4. Copy ordered grading cases into immutable snapshot rows.
5. Store the revision, language/runtime, time limit, and memory limit on the Submission.

Introduce a submission-owned snapshot model, for example `SubmissionGradingCase`, containing:

- submission ID
- position
- input
- expected output
- `isSample`

The judge reads only the submission snapshot. It must not load current `ExerciseTestCase` rows to grade queued work.

Submission-result APIs read sample input and expected output from the submission snapshot, so historical results do not change when the active problem changes. Hidden snapshot data is never returned.

### Progress revisions

Store the applicable `gradingRevision` on `Submission` and `StudentExerciseProgress`.

When grading-affecting content changes, the same transaction:

1. increments `ProgrammingExercise.gradingRevision`;
2. resets current progress for that material to NOT_STARTED, zero attempts, zero best passed, and zero best score for the new revision;
3. clears current-revision solved timestamps;
4. retains all submissions and snapshot rows.

A judge verdict always completes its Submission. It updates `StudentExerciseProgress` only when the Submission revision still equals the exercise's current revision. A stale-revision verdict remains historical and cannot restore an obsolete solved state.

Judge faults continue not counting as student attempts. Within one revision, SOLVED remains permanent and `bestScore` never decreases.

## Deletion behavior

Hide is the normal way to remove content from students.

- A problem with submissions cannot be hard-deleted.
- A lecture or module with any descendant submission cannot be hard-deleted.
- Deletion remains allowed for unused hidden content after confirmation.
- Course hard deletion is out of scope; a course can be hidden.
- A blocked delete returns a conflict error directing the Team Lead to hide the content instead.

## Concurrency and errors

- Problem saves keep optimistic concurrency through `expectedUpdatedAt` and return a conflict when another editor saved first.
- Visibility mutations are atomic field updates and do not require the full editor payload.
- Structural mutations validate academy ownership and the complete parent chain.
- Invalid or incomplete grading data returns validation errors on Save, not through a later publish check.
- A problem must retain at least one executable test case and at least one SAMPLE case.
- Hidden student resources return the existing not-found/unavailable error family.
- A failure to enqueue leaves the snapshotted Submission queued for the existing sweeper.
- The job worker's duplicate-claim behavior remains unchanged.

## Audit logging

Record:

- direct course/module/lecture/problem edits
- visibility changes with previous and new values
- grading revision increments
- the number of progress records reset
- blocked destructive actions
- migration source selection and record counts

Do not put hidden expected outputs or student code into audit JSON.

## Migration strategy

Use a staged, forward-only migration rather than deleting version structures in one step.

### Phase 1: additive schema

- Add new course/module visibility and direct-parent fields.
- Add grading revisions and submission snapshot storage.
- Add submission fields needed to retain historical identity independently of `CourseVersion`.
- Add exercise-draft source identity and optional live-material mapping so unmatched historical student code is retained without an obsolete Material foreign key.
- Keep existing version columns temporarily while backfill runs.

### Phase 2: select one live tree per course

Select the source deterministically:

| Existing state | Selected live source | New course visibility |
| --- | --- | --- |
| Published only | newest published version | Visible |
| Draft only | newest draft version | Hidden |
| Published plus newer draft | newest draft version | Hidden |
| Archived versions only | newest version | Hidden |
| No version | empty course | Hidden |

If corrupted data contains more than one draft or published candidate at the same highest version number, abort that course's migration and report it. Do not guess.

Reparent the selected source's modules directly to the Course while preserving IDs and positions wherever possible.

### Phase 3: preserve student data

- Backfill immutable grading snapshots for every historical Submission from the exact version/material it references.
- Add an immutable source material ID and course ID to submission history before removing version foreign keys.
- Match copied versions of the same logical problem by `externalKey`.
- Reassociate the most recent student code draft to the selected live material with that external key.
- Retain unmatched student code drafts as historical records with their immutable source course/material identity; do not expose them through an unrelated active problem.
- Preserve progress without reset only when the previous published problem and selected live problem have the same canonical grading fingerprint.
- If the grading fingerprint differs, retain submissions but initialize current progress for the selected problem at its new revision.
- Historical problems absent from the selected tree keep submission history but do not become active curriculum items.
- Resolve any per-user draft collision by keeping the most recently updated code.

The canonical grading fingerprint covers every field listed under “Exercise grading revision” and ignores presentation-only fields.

### Phase 4: verify before cutover

For every academy and course, verify:

- exactly one active direct curriculum tree
- matching module/lecture/material counts between the selected source tree and its direct-tree target
- stable positions and parent relationships
- every active exercise has test cases and a SAMPLE case
- every Submission has a grading snapshot
- every problem reported as effectively visible has all four visibility flags enabled; stored child flags may remain enabled beneath a hidden parent
- every Submission and historical student code draft retains immutable source identity, and every active mapping points to an existing live material
- migrated course visibility matches the selection table

The cutover must stop if these invariants fail.

### Phase 5: application cutover and cleanup

- Deploy versionless APIs and routes.
- Switch student reads and submissions to hierarchical visibility and grading snapshots.
- Keep temporary compatibility redirects for live authoring URLs.
- After verification, remove version-state contracts, status columns, obsolete indexes, `CourseVersion`, and version foreign keys.
- Remove obsolete Draft/Publish/Archive translations and UI.

## Testing strategy

### Pure unit tests

- Effective visibility truth table for every ancestor combination.
- Visibility restoration without child mutation.
- Canonical grading fingerprint inclusions and exclusions.
- Grading revision comparison and stale-verdict behavior.
- Migration source-selection matrix.
- Duplicate external-key and corrupt-version failure handling.

### API and service tests

- Every created entity defaults hidden.
- Team Leads edit visible and hidden records.
- Saving visible presentation content is immediately readable by students.
- Student lists omit hidden courses and descendants.
- Direct workspace, draft, run, and submit calls reject effectively hidden problems.
- Hiding and showing preserves code, submissions, and progress.
- Grading-affecting saves increment revision and reset current progress.
- Presentation-only saves do not reset progress.
- A queued submission uses its snapshot after active tests change.
- A stale-revision verdict does not update current progress.
- Historical sample results use snapshot data.
- Deletes with descendant submissions return conflict.
- Permission boundaries remain enforced.

### Migration tests

Fixture databases cover all source-selection rows, including:

- published-only content with progress
- draft-only content
- published plus changed draft
- published plus unchanged copied draft
- deleted problems with historical submissions
- renamed/reordered problems sharing an external key
- student draft collisions
- corrupted duplicate version candidates

Migration tests compare record counts, mappings, visibility, fingerprints, snapshot completeness, and orphan counts before allowing cleanup.

### Web component and browser tests

- Eye and eye-off indicators are accessible by tooltip and screen-reader label.
- Actions menus expose Edit and the correct Hide/Show command.
- Hidden-by-parent rows are dimmed without changing their own eye state.
- Parent-hide confirmation explains descendant impact.
- Team Lead edits the previously published Manual Testing Sandbox course and problem without creating a draft.
- A student sees a saved visible edit immediately.
- A student loses access when any ancestor is hidden and regains prior progress when shown.
- New content remains absent from student views until explicitly shown.

## Acceptance criteria

The feature is complete when:

1. No Team Lead workflow or active API exposes Draft, Publish, Archive, Restore, or course version numbers.
2. A Team Lead can directly edit the Manual Testing Sandbox course, its module, lecture, and FizzBuzz problem.
3. New courses, modules, lectures, and problems start hidden.
4. Each level has an eye/eye-off state and Hide/Show in its Actions menu.
5. Parent visibility cascades only for effective student access and never overwrites child settings.
6. Students can list, open, run, draft, and submit only effectively visible problems.
7. Hiding and showing content preserves student work and progress.
8. Visible presentation edits appear immediately.
9. Grading changes reset current progress while retaining historical submissions.
10. Queued submissions are graded against immutable submission-owned snapshots.
11. Existing content and student data pass the migration verification suite.
12. All affected unit, API, migration, component, and browser tests pass.
