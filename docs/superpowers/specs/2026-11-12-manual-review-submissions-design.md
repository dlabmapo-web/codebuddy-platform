# Programming submissions with a manual-review message

Date: 2026-11-12 (Asia/Seoul)
Status: proposed implementation specification; no application changes implemented.
Feature branch: `feat/manual-review-submissions`
Base: `feat/cove-studio-v2` at `0b7f810d`.

## 1. Requested outcome and release boundary

An exercise author can choose a mode in which students still have Run and Submit,
but submitting saves their code and displays a message directing them to their
teacher instead of assigning an automatic score. This is distinct from 자유 연습,
which has no submission. The user explicitly selected **Save code + show message
first** on 2026-11-12 and then requested a new branch from v2 and this specification.

This release includes immutable submissions, student history, assigned-teacher
access to saved code, staff self-test parity, and the exact Korean message below.
Teacher score entry, teacher feedback authoring, review completion, review queues,
notifications, custom message authoring, arbitrary grader scripts, and automatic
fallback from failed grading to manual review are outside this release.

## 2. Elice evidence and intended parity

Inspected through the authenticated Elice UI during this conversation on
2026-11-12:

- [Course library](https://dlab.elice.io/my-courses/library/teach?tab=all).
- [CH06 Mission, material 17/18](https://dlab.elice.io/courses/765886/lectures/6637920/lecturepages/54488115).
- [The Mission editor](https://dlab.elice.io/courses/765886/lectures/6637920/lecturepages/54488115/edit).

The Mission is the rock-paper-scissors while-loop exercise in the supplied
screenshot. Its learning workspace exposes Run, Submit, last submission score,
and last submission time. Basic Info has **Don't include in score** checked.
Grader Code has grading enabled and one STDIO contains-text case worth 100 points.
Under Grading Messages, **Begin grading** contains:

```text
해당 문제는 채점이 불가하므로 담당 선생님에게 수동으로 채점을 받으세요.
```

The supplied screenshot shows this sentence in the terminal/output area. The
inspected configuration establishes a custom message alongside a configured
automatic grader; it does not establish a built-in Elice mode that suppresses all
automatic scores. No Run or Submit was performed during this inspection, and no
course configuration was saved.

Elice also documents a separate [manual score adjustment workflow through
Tutoring](https://help.elice.io/help/en/docs/elicelxp/for-admin/material/exercise/grading/manual),
which requires an existing student submission. That workflow is reference
context, not part of this release.

Cove matches the requested learner experience: an ordinary runnable programming
exercise, an available Submit action, a saved code snapshot, and the same message
in the output pane. Cove explicitly models this as unscored submission rather
than introducing a dummy automatic test. Retain Cove's components, themes, and
access rules. The screenshot's numeric zero is not reproduced as a grade.

## 3. Approach and alternatives

Extend the existing programming exercise `submissionPolicy` with `MANUAL_REVIEW`.
Keep `PRACTICE_ONLY` and `AUTOMATIC` behavior intact. Keep this policy independent
of `grading.mode`, which chooses LEGACY_STDIO or ELICE_STDIO engine semantics.

Two alternatives were considered:

1. Add a message to automatic grading, as in the inspected Elice configuration.
   This still admits grading jobs and can produce scores, contrary to the feedback.
2. Use a written-response/manual material. This would move the activity out of
   the existing programming editor and execution workflow.

The policy extension reuses programming authoring, submission ownership, history,
and teacher code inspection without either limitation.

## 4. Author and learner behavior

### 4.1 Authoring

Show three choices in the existing grading-policy section on academy, console,
and library authoring surfaces that share the exercise editor:

| Policy | Korean label | Meaning |
| --- | --- | --- |
| `PRACTICE_ONLY` | 자유 연습 | Run code without submitting or receiving a score. |
| `AUTOMATIC` | 자동 채점 | Submit code for configured test-case grading. |
| `MANUAL_REVIEW` | 수동 채점 안내 | Save submitted code and direct the student to their teacher. |

Manual-mode help: `코드를 제출하면 저장되며, 자동 점수 대신 담당 선생님에게 수동 채점을 받으라는 안내가 표시됩니다.`

Support ordinary Python, C, C++, and existing PDF-backed programming exercises
where currently valid. Do not add new PDF/language combinations. Legacy coding
quizzes remain automatic; reject a manual policy for a quiz on both client and
server. Other material types keep their existing policies.

Manual mode requires no test cases, solution, or executable grading configuration.
Hide automatic test and grading controls while retaining their saved/draft data.
The normal body, code-size, language, PDF access, and safe-content validations
still apply. Switching back to Automatic restores controls and requires its
existing configuration validation. Do not silently create or remove test cases.

Save the policy explicitly. A policy change is audited, increments the existing
grading configuration revision, and invalidates affected authoring/bootstrap and
outline caches. Explain that it applies to future submissions; historical
submissions retain their recorded policy and results.

### 4.2 Workspace and result

| Mode | Run | Test run | Submit | Result |
| --- | --- | --- | --- | --- |
| Practice | Existing runtime rules | Hidden | Hidden | Existing execution output |
| Automatic | Existing runtime rules | Existing sample-case rules | Existing grading rules | Existing scored result |
| Manual review | Existing runtime rules | Hidden | Available under participation rules | Saved receipt and manual-review message |

Manual Submit depends on code availability, valid participation, and an active
save/submit operation, not on interpreter warm-up or native judge availability.
Retain existing mutual exclusion while a run, sample test, or submission is active.
A failing Run does not prevent the student from submitting their code for human
inspection. Run continues to show its own normal output/errors.

Submit opens the existing result area in the output pane. After the server commits
the code, show a neutral receipt headed `제출이 완료되었습니다.` and the exact
sentence from section 2. Do not display a success receipt after only saving a draft
or after a rejected/failed request. Show no pass/fail icon, numeric score, maximum,
case progress, runtime metric, or compilation verdict for this receipt.

The toolbar's latest-submission value is `수동 확인 필요` and its server timestamp.
Before the first submission, retain `—`. Reopening an older attempt changes the
result pane but never replaces the latest-submission strip with that old attempt.
Reload and exercise navigation restore the receipt and exact saved code through
the existing server bootstrap/history mechanism.

The message belongs in the result/output pane, not a modal or toast that
disappears. Live teacher observation must render the same saved result through
the existing authorized result channel. Do not fabricate terminal execution
start/finish messages or run student code merely to print the notice.

Provide English translations, including: `This problem cannot be automatically
graded. Please ask your assigned teacher to grade it manually.` Use the existing
locale-aware timestamp formatter. Verify keyboard navigation across all three
policy choices, screen-reader status announcements, mobile wrapping, and both
themes. Staff receipts say their private practice was saved and is not
automatically graded; they must not imply a student teacher-review task exists.

## 5. Data and public contracts

### 5.1 Persistent receipt

Use the existing student `Submission` and private `StaffPracticeAttempt` stores.
Add `RECORDED` to `SubmissionStatus`. It is terminal for submission processing;
it is neither a judge verdict nor an indication that teacher grading is complete.

Student receipt invariants:

- `submissionPolicy = MANUAL_REVIEW`, `status = RECORDED`.
- Exact code, language, owner, academy/course context, class, material/source ID,
  grading revision, frozen hierarchy labels/positions, and server creation time.
- Retain the existing server-validated solve-session timing when supplied.
- `score = null`; `passedCount = 0`, `totalCount = 0`, and no case/result rows.
- No awarded weights, applied score, material maximum, runtime, failure reason,
  compile diagnostics, execution runtime snapshot, or execution queue.
- `gradedAt = null`; an unscored receipt was not graded.

Make `Submission.score` nullable, retaining its existing default and numeric
behavior for automatic records. Add a database constraint that requires null for
manual receipts and disallows null for automatic records. Preserve existing
automatic in-progress defaults; do not rewrite historical scores. Enforce the
manual policy/status pairing and zero-case receipt shape in the admission path
and meaningful persistence tests. Automatic workers must never receive a manual
receipt or reinterpret a null score as zero.

Store a small versioned manual receipt marker in the existing JSON snapshot
facility, including `messageVersion: 1`. Use `engineVersion = manual-record-v1`
only as a storage-format identifier for this nonexecuted receipt; it must never
be selected as an execution engine. Do not copy retained hidden tests or an
automatic grading-policy bundle into a manual receipt.

For staff practice, preserve the existing automatic v1 snapshot parser unchanged
as one branch of a policy-discriminated union. Add a manual snapshot branch with
version 2, frozen language/course/revision context, and message version, without
grader cases or a runtime descriptor. Store a completed unscored result and
`RECORDED` status atomically. All staff readers must recognize the new branch
before parsing automatic-only snapshot fields.

### 5.2 Result, acceptance, history, and latest-summary contracts

Expose the recorded policy in result/history projections; legacy projections
that omit it continue to mean Automatic. Extend result and history score fields
to allow null for manual receipts and discriminate validation by policy/status.
Automatic score ranges and existing case-disclosure rules remain unchanged.
Teacher inspection's `accepted`/`completed` fields must be nullable or explicitly
not applicable for manual receipts; do not map them to a false correctness verdict.

Allow acceptance with `totalCount: 0` only for a manual receipt. Return its
terminal receipt in the acceptance response so the new client does not open an
SSE stream or issue a follow-up fetch merely to display a committed message.
Automatic acceptance retains its existing fields and SSE behavior. Do not make
zero cases valid for ordinary automatic code submissions.

If a caller directly requests the existing grading stream for a recorded manual
receipt, authorize it and finish with its durable terminal state. Do not attach
worker listeners or start recurring status reads for that receipt.

Project the latest summary as `RECORDED`, with `scoreHundredths: null` and
`maximumHundredths: null`, plus the recorded policy. Widen the maximum field only
where an unscored receipt needs null; retain existing maxima for scored and
existing manual-material results. Use the policy to render `수동 확인 필요` for
students and private-practice wording for staff. Do not use `AWAITING_REVIEW` for
this first-release receipt: that existing state triggers background polling and
there is no new teacher grading transition to wait for in this release.

Add a `MANUAL_REVIEW` answer-record category/filter mapped to `RECORDED`.
Include these records in normal paginated history. Preserve the meanings of
existing automatic-attempt/acceptance summary metrics; label them clearly as
graded metrics where the mixed table would otherwise be misleading.

### 5.3 Retry identity

Add an optional UUID `requestId` to the student submit input and a nullable
student request-key column with a unique `(userId, requestId)` constraint.
Existing automatic callers may omit it. New clients always send it; manual
admission requires it and rejects a missing key as a validation error before
writing. Staff practice continues using its existing request identity.

Reuse a key for retries of the same code/material/class/participation request.
After rechecking current ownership and curriculum/class access, return the same
receipt for the same key and payload, even if the exercise policy/revision has
since changed. A changed payload or context with the same key returns conflict.
An intentional new submission receives a new key. Handle uniqueness races
specifically; do not mislabel a request-key collision as `SUBMISSION_IN_FLIGHT`.
Apply abuse limits to fresh admissions, without charging an idempotent retry as
another accepted submission. Do not silently retry an uncertain write with a new
key; keep the key until the request is resolved or the student changes the draft.

## 6. Admission, authorization, and runtime boundaries

Refactor the existing submit flow around a common authorized admission context:

1. Resolve the actor and required participation permission once.
2. Validate reachability, material type, visibility, ownership context, and class
   enrollment/assignment. Preserve the existing material lock and transactional
   policy snapshot protection against concurrent hide, edit, or conversion.
3. Resolve an idempotent retry as defined above. For a fresh admission, apply
   rate limiting and the current exercise policy.
4. Reject Practice-only. For Manual review, validate request identity and code,
   resolve any supplied solve session, and commit the receipt atomically.
5. Only Automatic proceeds to active test reads, grading-profile validation,
   native runtime admission, grading snapshots, and enqueueing.

The actual transaction boundaries may keep rate limiting outside a held database
connection, but must not weaken the atomic authorization/configuration snapshot
or allow a policy race to write an automatic attempt as a manual receipt. Access
and class checks must not live only in the automatic branch. A forged manual
request cannot bypass any of them.

Decouple the existing Redis-backed submission token limiter from the optional
judge execution dependency as needed. Manual admission requires working storage,
authentication, and abuse controls; it requires no healthy judge worker, native
runtime admission, or BullMQ enqueue. Do not silently fail open when the limiter
is unavailable. Return an appropriate save/submission-unavailable error while
preserving code and retry identity, rather than claiming the work was recorded.

Reuse current owner/material/academy predicates for student receipt reads. Apply
existing assigned-class/assigned-student checks for teacher inspection. New mode
support grants no new authoring rights, enrollment bypass, support participation,
or access to private solutions and hidden test data.

Actual staff self-test uses the existing academy/user/material/live-or-preview
context and revision protection. A staff receipt never enters student history,
teacher review lists, grades, points, ranking, or student progress. Platform and
support inspection remain read-only.

## 7. History, teacher observation, and progress

Include receipts in the student's per-exercise history, Answer records, selected
historical workspace, and latest summary. Add them to assigned-teacher student
work history and code inspection, which currently filter automatic attempts by
`PASSED`/`FAILED`. Update list and count predicates together so pagination and
filters agree. Lists select metadata only; fetch code for the one authorized
detail workspace.

Carry submission policy in the existing teacher exercise scope and projections
so availability, badges, and graded aggregates use the same policy without
additional per-exercise reads.

Use a neutral `수동 확인 필요` badge. Teachers can open the immutable submitted
snapshot and continue using existing live-observation tools; live draft content
is never substituted for submitted code. Observation's result projections must
carry the new unscored shape without displaying a score or triggering grading.
No new score/feedback/review-complete action appears.

For this release, Manual review exercises do not increase the automatic graded
progress denominator. New receipts may mark participation as started but must not
mark an exercise SOLVED, grant correctness points, enter score averages/rankings,
or count as automatic failures. Existing grade, attempt, and solve metrics keep
their automatic meaning. Do not reuse `ExerciseProgress.attemptCount` for the
manual receipt count; derive paginated receipt history through bounded queries.

Switching an exercise's policy does not delete or mutate old attempts/progress.
Current automatic-progress denominators use the current policy; historical
attempt displays use each attempt's frozen policy. Returning to Automatic follows
existing grading-revision applicability rules and does not resurrect stale solved
status. Already accepted automatic jobs finish against their frozen snapshots.
Explicit regrading operations exclude manual receipts. Worker recovery, queue
reconciliation, stale-job repair, and conversion inventory must treat RECORDED as
nonqueued terminal data and leave it untouched.

## 8. Copying, migration, and deployment compatibility

Round-trip MANUAL_REVIEW through create/update, authoring context, exercise
bootstrap, curriculum/navigator projections, publishing/version snapshots,
restore, course copy, library import/adoption, and workbook import/export. Remove
two-value enum assumptions in workbook parsing and planning. Intentionally
unscored materials must not be reported as invalid automatic exercises missing
test cases in console/library readiness diagnostics.

Add migrations for the enum values, nullable student score, receipt constraints,
and request identity. Existing policy defaults/inference remain unchanged:
omitted policy on an update preserves the stored value, and old creates/imports
use existing Practice/Automatic inference. Never infer Manual review from absent
tests, random input, runtime failure, a title, or the presence of a solution.
No bulk conversion of production content is part of this release.

Because enum values and null scores are new to old readers, make the third choice
available only once the database migration, compatible API/web, and affected
worker/recovery readers are deployed. Old browser clients must receive a stable
refresh-required rejection for unsupported manual submission admission rather
than a result their old schema cannot parse. Use the required request identity
and an explicit client receipt-capability version on the new submit request for
this check; do not interpret request identity alone as proof of client support.

Implement migration ordering using the repository's deployment conventions. New
PostgreSQL enum values must be committed before migrations/statements that use
them. Release verification must prove the migration works from the v2 base.
Once real manual receipts exist, rollback must retain readers compatible with
their enum/null-score shapes; do not delete receipts or rewrite them as failed
automatic attempts to enable rollback.

## 9. Read-path and performance requirements

Follow root AGENTS.md. No query per material, history row, student, test, or image.
Use `readCurricula`/`withCurriculum` and the academy-access readers; reuse resolved
actors/classes instead of checking them repeatedly. Start independent reads
together. Do not add a new deep include chain to the existing submission path;
manual admission should not load retained cases or full descriptions/solutions.

Read initial policy, latest receipt, selected historical result, and navigator
data during the existing server render/bootstrap. Preserve React request caching
and server-read freshness. Manual receipt acceptance seeds the client cache
directly. It opens no judge SSE connection and starts no interval polling.
Teacher observation reuses the existing event channel and authorized result read.

Add query-event integration evidence against disposable Docker PostgreSQL through
`COVE_INTEGRATION_DATABASE_URL`, following
`packages/api/src/content/navigation-performance.integration.spec.ts`. Count each
changed complete service read, including authorization/class resolution:

- Learner bootstrap and selected receipt; latest receipt.
- Student history and assigned-teacher history/detail.
- Staff live and unpublished-preview receipt reads.
- Curriculum outline/navigator and authoring context when changed.

Measure the v2 baseline and feature with small and expanded fixtures (1 and 20
materials/receipts/students as appropriate). Counts must remain constant as row
counts grow; metadata-only policy propagation must add no statement. Existing
read paths must not exceed their baseline statement count. For genuinely new
paths, record their fixed measured count and verify it does not grow. Refactor
the touched query when needed to meet these budgets. State actual counts and any
delta in implementation commits and verification evidence; do not invent counts
in this specification. Never run integration fixtures against shared Supabase.

## 10. Implementation boundaries and sequence

| Area | Existing implementation to extend |
| --- | --- |
| Policy, result, latest, and history contracts | `packages/shared/src/content/{course,learn,submission,latest-submission,answer-records}.ts`, relevant teacher/monitoring contracts and oRPC definitions |
| Storage and migration | `packages/api/prisma/schema.prisma`, new ordered Prisma migrations |
| Student admission/results | `packages/api/src/learn/submission.service.ts`, `latest-submission.ts`, `learn.service.ts`, `answer-records.service.ts` |
| Staff receipts | `packages/api/src/learn/staff-practice.service.ts`, `staff-practice.repository.ts`, `packages/api/src/judge/practice-snapshot.ts` |
| Authoring, snapshots, copying and import/export | `packages/api/src/content/course.service.ts`, `content/library/course-tree-copy.ts`, import services, shared workbook rows/plan/template, readiness diagnostics |
| Outline/progress | `packages/api/src/learn/curriculum-read.ts`, `curriculum-outline.service.ts`, web course-outline helpers |
| Teacher history and observation | `packages/api/src/teach/teacher-progress.repository.ts`, `teacher-progress.service.ts`, `student-work-history.service.ts`, monitoring projections and teacher result UI |
| Exercise author UI | Existing exercise `submission-policy-editor.tsx`, `exercise-workspace.tsx`, `exercise-draft.ts`, `use-exercise-authoring.ts` shared across academy/console/library |
| Learner/staff UI | Existing exercise `workspace.tsx`, `staff-workspace.tsx`, `editor-pane.tsx`, `result-panel.tsx`, submission hooks, scoring helpers, shared summary and history workspaces |
| Localized copy | Existing English/Korean grading, practice, submission, history and teacher namespaces |

Implement in these dependency-ordered slices:

1. Receipt invariants, policy/status/result contracts, ordered migrations, and
   compatibility handling for existing automatic readers.
2. Authorized idempotent student and staff receipt admission; preserve automatic
   grading admission and rate limits.
3. Authoring, bootstrap, publishing/copy/import round trips, and readiness rules.
4. Learner/staff result rendering, latest summaries, saved history, and teacher
   inspection/observation with no polling or automatic-grade side effects.
5. Local integration/query-count, regression, and browser acceptance evidence.

Read relevant installed Next.js guides under
`packages/web/node_modules/next/dist/docs/` before changing web code. This document
does not authorize production deployment or test submissions to a real course.

## 11. Acceptance and verification

1. Author a no-test Python manual-review exercise, reload, and confirm the policy
   survives. Repeat for an existing C/C++ exercise and a valid PDF-backed exercise.
2. Student Run retains normal execution. Submit saves exact code and displays the
   exact Korean message in the result/output pane, with timestamp and no score,
   test progress, pass/fail, or compiler verdict.
3. Disable/mock judge execution and native admission: manual Submit still succeeds
   with working auth/storage/limiter. Assert no queue job, grading-case row,
   execution request, grading SSE stream, or receipt polling interval is created.
4. Reload, navigate away/back, select historical attempts, and switch language;
   preserve saved code and newest receipt identity/time. An intentional second
   submission creates a new immutable row and leaves the first intact.
5. Exercise double clicks, concurrent retries, commit-success/response-loss,
   changed-code/key conflicts, and policy-change-after-commit retries. A single
   request identity creates exactly one receipt and no duplicate side effects.
6. Save failures, rate limiting, invalid/expired solve sessions, revoked class
   access, hidden materials, stale previews, and malformed code/requests never
   display a false saved receipt or destroy the draft.
7. Assigned teachers can list/open the saved submission. Wrong-class teachers,
   other students/academies, support inspection, and forged IDs gain no new access.
   Student and teacher views show null/not-applicable correctness for receipts.
8. Verify teacher live observation receives the receipt and snapshot identity
   through the current channel. Verify no saved-draft substitution or hidden test
   or solution disclosure in either student or teacher list payloads.
9. Verify eligible Teacher/Team Lead/Manager live and authorized preview self-tests
   use isolated staff records, neutral practice wording, and existing revision
   checks. No student review task, grade, progress, or reward is created.
10. Verify manual items are excluded from automatic graded denominators/averages;
    receipts affect neither automatic failures nor accepted-rate/solve metrics.
    History pagination, counts, result filters, and latest summaries agree.
11. Exercise Automatic -> Manual -> Practice -> Automatic, including retained
    tests, old historical scores, revision applicability, and an in-flight
    automatic job. Practice still refuses Submit server-side; invalid Automatic
    still refuses submission. Regrade/recovery never picks up a manual receipt.
12. Round-trip through library copy/adoption, workbook export/import, version
    restore, and publishing. Old clients preserve stored policy on updates;
    unsupported old manual-submit clients receive a refresh instruction.
13. Run focused contract/API/UI tests, real PostgreSQL migration/constraint and
    query-count integration tests, and Chromium/WebKit flows for student and staff
    receipt persistence, teacher history, mobile, themes, and Korean/English.
    Run relevant automatic Python/C/C++ grading regression checks once.

Record implementation commands, actual results, screenshots, and SQL counts in
`docs/research/2026-11-12-manual-review-submissions-verification.md` when the feature
is implemented. The verification document must distinguish executed checks from
unrun checks and must not claim production verification from local evidence.
