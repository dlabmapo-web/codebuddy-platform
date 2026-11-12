# Manual programming grading and inherited teaching access

Date: 2026-11-12 (Asia/Seoul)
Status: implemented locally; [verification evidence](../../research/2026-11-12-manual-review-submissions-verification.md). Not deployed.
Feature branch: `feat/manual-review-submissions`
Base: `feat/cove-studio-v2` at `0b7f810d`.

## 1. Outcome and scope

Authors can create a runnable programming exercise that accepts code submissions
and directs students to their teacher instead of assigning an automatic score.
Authorized teaching staff inspect the submitted code, publish a score and optional
feedback, mark the work complete, and correct a published assessment. Students
see the teacher's result in their workspace and submission history.

Managers can perform Team Lead and Teacher work. Team Leads can perform Teacher
work. Teachers assess work within their assigned classes. Authorization uses
actual current memberships and class scope; changing the selected sidebar role
is not required to use inherited teaching capabilities.

This specification includes submission persistence, grading/correction,
student-visible feedback, score inclusion settings, history, realtime refresh,
and staff self-test isolation. Automatic score overrides, bulk grading, rubric
builders, external notifications, custom messages, arbitrary grader scripts, and
automatic fallback to manual grading are outside scope. Existing automatic
graders and other manual material types retain their behavior.

## 2. Elice evidence and intended parity

Inspected through the authenticated Elice UI during this conversation on
2026-11-12:

- [Course library](https://dlab.elice.io/my-courses/library/teach?tab=all).
- [CH06 Mission, material 17/18](https://dlab.elice.io/courses/765886/lectures/6637920/lecturepages/54488115).
- [Mission editor](https://dlab.elice.io/courses/765886/lectures/6637920/lecturepages/54488115/edit).

The rock-paper-scissors Mission exposes Run, Submit, last submission score, and
last submission time. Basic Info has **Don't include in score** checked. Grader
Code enables a 100-point STDIO contains-text case. Its **Begin grading** message
contains the sentence shown in the user's screenshot:

```text
해당 문제는 채점이 불가하므로 담당 선생님에게 수동으로 채점을 받으세요.
```

This establishes a custom message alongside an automatic grader, not a built-in
score-free Elice mode. No Run or Submit was performed and no Elice configuration
was saved during inspection.

Elice's [manual grading documentation](https://help.elice.io/help/en/docs/elicelxp/for-admin/material/exercise/grading/manual)
describes selecting a student through Tutoring, inspecting code, opening score
adjustment, entering an addition/subtraction, and applying it. At least one
student submission must exist before assigning a manual score.

Cove implements the full human-assessment workflow for MANUAL_REVIEW exercises:
Submit -> notice -> staff inspection -> score -> Apply -> student-visible result.
Final-score entry is the primary control, with an adjustment option after the
first assessment. Pending work has no grade; a published zero is a real grade.
Attempt selection, completion, audit, role and score-inclusion rules below are
explicit Cove decisions, not claims about unverified Elice behavior. Retain
Cove's components and themes.

Extend the existing programming submission path. A custom message on automatic
grading would still generate grader scores; using a written-response material
would lose the programming workspace. Neither meets this scope.

## 3. Role inheritance and class scope

Follow the implemented [Team Lead and Manager teaching policy](2026-10-22-team-lead-academy-teaching-access-design.md)
and [Manager teaching policy](2026-10-22-manager-academy-teaching-access-design.md).
These supersede older grading documents requiring an extra Teacher role or
assignment for Managers/Team Leads.

| Capability | Teacher | Team Lead | Manager |
| --- | --- | --- | --- |
| Configure exercise mode, maximum and inclusion | Existing curriculum review only; no new authoring right | Existing author/publish authority | Same author/publish authority |
| Inspect submitted student code | Assigned homeroom/assistant classes | All active own-academy classes | All active own-academy classes |
| Publish/correct score, feedback and completion | Same assigned classes | Same academy-wide teaching scope | Same academy-wide teaching scope |
| Personal practice/authorized preview | Existing practice/review rights | Existing practice/review rights | Existing practice/review rights |
| Manager-only settings/credentials | No | No | Existing Manager permissions |

Managers and Team Leads need no additional TEACHER grant, class assignment,
view-role switch, Manager approval, or special grading role. Stored roles and
actual staffing records do not change. Team Lead teaching access does not grant
Manager-only administration. Effective multi-role membership uses its real role
union. Teacher-only users need a homeroom or assistant assignment.

Use `submissions.assigned.review`, `rolesHavePermission`, `roleCanTeachAcademy`,
`requireAssignedTeacherActor`, and `assignedClassWhere` with existing
`academy-staff` scope. Reuse the academy-access reader and resolved actor. Avoid
rank comparisons and duplicated role allowlists. Return server-authorized
`canReview`/`canPublishReview` capabilities for all shared routes/components.

Every read/write checks active user, membership, academy/class, student enrollment,
and the visible course/material assigned to the class. Derive the class from the
stored submission; client context cannot redirect a review. Managers/Team Leads
can grade an active own-academy class without an assigned teacher. All roles are
denied foreign-academy and archived-class writes. Losing both academy-wide roles
falls back to assigned Teacher scope only if Teacher is still held. Recheck
revocation when publishing/correcting, not only when opening the panel.

Platform/support inspection and assumed roles gain no grading writes. A real
same-academy teaching membership must independently authorize publication.
Existing inspection reads remain subject to their own access rules.

## 4. Authoring and assessment settings

Extend `submissionPolicy` independently of `grading.mode`:

| Policy | Korean label | Behavior |
| --- | --- | --- |
| `PRACTICE_ONLY` | 자유 연습 | Run; no submission or grade. |
| `AUTOMATIC` | 자동 채점 | Existing configured test-case grading. |
| `MANUAL_REVIEW` | 수동 채점 | Submit code for teacher assessment. |

Help: `코드를 제출하면 담당 선생님이 확인한 후 점수와 피드백을 등록합니다.`

Use the shared academy/console/library exercise editor. Support ordinary Python,
C/C++, and already valid PDF-backed exercises without new PDF/language
combinations. Legacy coding quizzes remain Automatic, enforced client/server.
Other material types keep existing settings.

Expose a dedicated `manualAssessment` configuration with persisted exercise fields:

- `maximumHundredths`: positive integer hundredths, default 10000 (100 points),
  maximum 1000000, matching current manual-material bounds.
- `includeInScore`: default false, labeled `성적에 포함`. When false show
  `성적 제외`; explain that an individual teacher score remains visible.
- Completion is explicitly selected by the reviewer, independently of full marks.

Keep these separate from automatic grader maximum/scoring settings. Practice and
Automatic retain but ignore manual settings. Omitted new settings use these
defaults; omitted update settings preserve stored values.

Manual review requires no tests, solution, or executable grading profile. Hide
automatic controls but retain saved/draft tests and configuration. Keep ordinary
code/body/file/language validation. Returning to Automatic restores its controls
and validation; changing modes never invents or discards tests.

Policy, maximum and inclusion changes are audited, increment the existing
assessment/grading revision, and invalidate affected authoring/bootstrap/outline
caches. They apply to new attempts; existing submissions retain frozen settings.
Do not silently regrade or rescale old work.

## 5. Student and staff workflows

### 5.1 Student submission and results

| Mode | Run | Test run | Submit |
| --- | --- | --- | --- |
| Practice | Existing runtime rules | Hidden | Hidden |
| Automatic | Existing runtime rules | Existing sample-case rules | Existing grader rules |
| Manual review | Existing runtime rules | Hidden | Current student participation rules |

Manual Submit depends on code and authorized participation, not interpreter
warm-up or native judge health. Preserve mutual exclusion during active
execution/save/submit. A failed Run does not prohibit submitting code for human
review. Run retains its own output/errors.

After commit, open the existing result/output pane with
`제출이 완료되었습니다.` and the exact Korean notice in section 2. Until review,
show `수동 채점 대기`, submission time, and no numeric score, pass/fail verdict,
case progress, runtime metric, or compilation verdict. A draft save or failed
request must never show a submitted receipt.

After publication show `수동 채점 완료`, exact score/maximum, optional feedback,
completion, reviewer display name and review time. Submission time remains
separate. Published zero displays `0 / maximum`, never pending. Keep the original
notice as context; the published assessment is the primary result.

The latest strip describes the newest accepted submission, pending or graded.
Never pair an older score with a newer timestamp. Selecting an older attempt
changes only the selected result pane. Reload restores both selected and latest
results. A newer unreviewed submission displays pending even when older work has
a grade.

### 5.2 Staff grading and correction

Use My classes -> student work/history -> submission detail. Add a pending/manual
filter to existing paginated history, not a separate dashboard. Link the same
panel from tutoring/live observation when a saved submission exists. Manager and
Team Lead use these routes without changing roles.

1. Open a specific immutable attempt. Show student/class, saved code, language,
   submission time, frozen maximum/inclusion, existing review, and whether this
   is the latest/current-revision attempt.
2. Enter final score (0 to frozen maximum, at most two decimal places), optional
   plain-text feedback (maximum 10000 characters), and `학습 완료`.
3. Preview score/maximum and click `적용`. No extra approval dialog or Manager
   approval is needed. Disable duplicate in-flight publishing.
4. Persist assessment/audit atomically; refresh staff and student projections.
   Show success only after commit.

First publication requires an explicitly entered score; an untouched field is
not zero. `학습 완료` defaults false and is explicit. Any published score is a
reviewed assessment even when completion is false. Opening code does not complete
review.

After publication offer `점수 수정` with final-score input and optional
`점수 조정`. Adjustment accepts a signed amount with two decimal places, previews
old -> new score, and enforces the same bounds. First publication has no delta
option because no previous grade exists. The server derives the delta from its
previous review and the requested final score, never a client-reported old score.
Corrections require a nonempty reason (maximum 1000 characters). Feedback and
completion corrections use this same audited operation. Authorized staff can
inspect review versions, actor/time, reason and score/completion changes.

Edits remain local until Apply; no server-side grading-draft workflow is added.
Conflicts preserve input and show the current saved review for reconciliation.
If a new attempt arrives while grading, do not retarget the panel or lose input:
publish to the opened attempt and indicate that the newer one still needs review.

### 5.3 Private practice and presentation

Teacher/Team Lead/Manager self-tests use existing private live/preview stores.
Show `연습 제출 저장됨` without a numeric grade or a teacher-review task. The
student-review endpoint cannot grade staff practice. Practice never enters
student assessment lists, scores, progress or rewards.

Use existing Cove components, themes, locale-aware dates, keyboard controls,
accessible status announcements, decimal validation, and responsive panels.
Provide English/Korean messages, errors and empty states. Keep results in the
output pane; do not execute code or fabricate terminal process messages merely
to print the notice.

## 6. Persistence and contracts

### 6.1 Immutable admission

Use student `Submission` and private `StaffPracticeAttempt`. Add `RECORDED` to
SubmissionStatus: terminal for execution, not terminal for human assessment.
A manual student's immutable attempt contains:

- MANUAL_REVIEW policy and RECORDED status.
- Exact code/language, owner/class/course/material/source IDs, grading revision,
  frozen hierarchy labels/positions, server creation time and validated solve
  timing when supplied.
- Frozen manual maximum, inclusion and message version; no retained hidden tests.
- Raw `score = null`, zero case counts, no grader/case-result rows, awarded weights,
  execution runtime/queue, runtime or compiler result; raw `gradedAt = null`.

Make raw Submission.score nullable while preserving automatic defaults/behavior.
Constrain manual raw score to null and automatic score to nonnull. Enforce policy/
status/zero-case invariants in admission and persistence tests. Human reviews do
not mutate code, raw score/status or automatic execution fields. Workers never
receive these attempts.

Use a versioned manual snapshot in the existing JSON facility, with
`engineVersion = manual-record-v1` solely as a receipt-format identifier. Staff
practice keeps the existing automatic v1 parser branch and adds manual v2 with
frozen context/settings, no cases/runtime, and an atomically stored private
RECORDED result.

### 6.2 Append-only programming reviews

Add ProgrammingSubmissionReview related to student Submission. Reuse ManualReview
semantics without moving code attempts into ManualSubmission or making its
existing relation polymorphic. Each immutable version stores:

- ID, submission ID, reviewer user ID, frozen reviewer display name, server time.
- Monotonic version, exact scoreHundredths, completed, feedback and change reason.
- Previous score and server-derived delta, both null on first publication.
- Review request UUID, unique per publishing user.

Use unique `(submissionId, version)` and Submission.reviewVersion (initially 0).
The highest committed version is the attempt's effective assessment. Retain every
version; correction never destroys an old review or reruns an automatic grader.
Render feedback safely as text. Derive current human-assessment progress from
these reviews in the existing read projections; no new progress table or manual
write to automatic ExerciseProgress is required.

Publish input: submission ID, academy/class context, expectedVersion, request UUID,
final score, completion, feedback and correction reason. One transaction checks
the current real teaching grant and stored class/material/student scope,
compare-and-swaps reviewVersion, inserts the next review, and writes audit.
A stale version conflicts
without partial writes. Recheck revocation in that transaction using existing
access-change locking conventions, not a stale open-page capability.

Idempotent retries revalidate access and return the original version for the same
request/payload before checking expectedVersion again. Reused UUID with changed
payload/submission conflicts; deliberate corrections use new UUIDs. Audit actor,
academy/class/student/submission, review version, before/after score/completion
and reason. Do not duplicate full code/feedback into unnecessary audit payloads.

### 6.3 Public result and latest projection

Expose recorded policy and a manualAssessment object: state AWAITING_REVIEW or
GRADED, frozen maximum/inclusion, exact nullable scoreHundredths, completion,
feedback, reviewer display name, review time and version. Pending score,
completion, reviewer/time are null and version is 0. Reviewed data comes from the
effective published version. Pending feedback is an empty string; a published
review may also have empty optional feedback. Private practice has RECORDED presentation and no
student review object.

Raw result.score stays null for manual policy even after review. Read exact human
points from manualAssessment; update student/teacher contracts and renderers
together. Never coerce null to zero or round human points into an integer percent.
Automatic shapes and case disclosure keep existing semantics. Teacher accepted
is not applicable; completed comes from the published review.

Allow zero cases only on manual acceptance and return its committed receipt/
pending assessment, seeding the client without judge SSE or a redundant fetch.
Latest student summary maps the newest submission to AWAITING_REVIEW or GRADED,
using its frozen maximum and effective exact score. Staff practice maps to
RECORDED. Order latest by submission creation time/ID, never review time.

Add pending/manual-graded answer-record filters using policy and review presence:
a RECORDED row can have either assessment state. Extend existing status-only filter
mappings accordingly; lists/counts must agree. Preserve automatic-attempt and
acceptance-rate meanings; manual grades are never automatic passes/failures.

### 6.4 Admission retry identity

Add optional student request UUID and nullable stored request key with unique
`(userId, requestId)`. New clients send it; manual admission requires it. Existing
automatic callers may omit it. Staff retains current request identity.

After access checks, identical key/code/material/class returns the same attempt,
even after policy changes or review. Conflicting payload/context conflicts.
Handle uniqueness races separately from SUBMISSION_IN_FLIGHT. An intentional new
submission uses a new key; fresh admissions consume rate limits, idempotent retry
does not consume them twice. Preserve keys after uncertain writes.

## 7. Admission and read authorization

Resolve actor and participation permission once. Validate material reachability,
type/visibility and class enrollment/assignment; preserve material locking and
transactional configuration snapshots against edits. Resolve retries and apply
abuse limits. Reject Practice. Manual admission validates code/request/solve
session and commits the frozen assessment. Only Automatic reads active tests,
validates a grader, selects runtime, snapshots tests and enqueues execution.

Class/ownership checks cannot remain only in the automatic branch. Rate limiting
may remain outside a held connection without weakening atomic configuration and
access checks. Separate the Redis-backed limiter from optional execution
admission as needed: manual work requires working auth/storage/abuse controls,
but not judge workers/native admission/BullMQ enqueue. Limiter failure fails
closed with a submission-unavailable error and preserved code/request identity.

Student assessment reads require current owner/material/academy/class access.
Review reads/writes use section 3's actual membership scope and stored class,
student and material. Apply this to list/count/detail/correction/subscriptions.
Read code only for authorized detail. Sidebar role or cached canReview never
authorizes publication.

An older manual attempt remains reviewable after a mode/revision change while
its current class/material/course/student are reachable. Show a stale indicator;
grade frozen settings/history, without altering current-revision assessment.
Archived class or revoked assignment/course/enrollment prevents new protected
reads/writes under current access rules.

## 8. Effective grade, completion and refresh

### 8.1 Attempt selection

Each attempt retains its effective review. Current material assessment uses the
latest accepted submission for the student/class/current applicable grading
revision, never highest score or latest review time. A new pending attempt makes
current assessment pending while preserving older grades. Reviewing old work
never grades the latest attempt.

Reviewed is distinct from complete: zero is valid, partial credit can be complete,
and full marks can be incomplete when explicitly selected. Only a published
review changes completion.

### 8.2 Course inclusion and progress

Individual teacher scores are visible regardless of includeInScore. False shows
성적 제외 and omits the material from assessed course totals and graded-progress
denominators, while preserving its review/history. True includes it in existing
human/manual assessment summaries using its maximum. Pending is shown as pending,
not an awarded zero; explicit completion supplies manual assessed-progress state.

Do not count manual grading in automatic best-score, failures, judge attempts or
acceptance rate. Included human grades may enter existing mixed student assessment
totals through manual-grade semantics. No new automatic correctness rewards or
ranking points are granted; a new reward policy is outside scope.

Current revision/settings determine assessment applicability. For a selected
current-revision attempt use its frozen maximum/inclusion; before such an attempt
use authored settings. Changing assessment settings advances revision, leaving
old attempts historical without silently rescaling/counting them under new
settings. Warn authors of this effect before Save. Reuse manual-grade summaries
rather than including manual exercises in automatic correctness totals.

### 8.3 Events and recovery

Manual admission finishes execution processing immediately: no judge SSE or
waiting interval. A directly requested grading stream authorizes then returns
RECORDED without worker subscriptions or recurring reads.

After review commit, publish an authenticated assessment-change event through
Cove's existing realtime transport, extended with owner/class/material
subscriptions. Send identifiers/version; authorized reads supply feedback and
score. Refresh affected student workspace, teacher observation, history, latest
and manual-summary caches only. Recheck grants for subscriptions/reads; stale
sockets do not preserve revoked access.

Add a policy-aware shared latest-hook option: manual AWAITING_REVIEW must not
inherit its existing 15-second polling. Refresh on grade events, reconnect,
window focus and explicit Refresh. Next authorized read recovers missed events.
An event failure does not roll back a committed grade or produce a retryable
publish error. Existing automatic SSE and other manual-material polling remain.

Automatic in-flight jobs finish their immutable snapshots. Regrading, stale-job
repair, runtime conversion and worker reconciliation exclude manual RECORDED
attempts/reviews. Mode switches never rewrite historical grades or private work.

## 9. Migration, round trips and deployment

Round-trip policy/manual settings through create/update/context, bootstrap,
outline/navigator, publishing/version restore, course copy, library adoption and
workbook rows/plan/export. Preserve automatic semantics. Intentional manual
no-test exercises must not trigger missing-automatic-tests readiness diagnostics.

Migrate policy/status enum values, nullable raw score, frozen assessment snapshot,
request identity, reviewVersion, review table/constraints/indexes, and exercise
manual settings. Index review version lookup and scoped history. Pending counts
use bounded joins/anti-joins, not queries per attempt. Do not rewrite old grades,
roles or staffing records. Omitted updates preserve policy/settings; old creates
and imports keep Practice/Automatic inference. Never infer Manual from no tests.

Deploy database and compatible API/web/worker readers before enabling this mode
or admitting attempts/reviews. New submit requests carry explicit manual-
assessment capability version; unsupported old callers get refresh-required
errors, not unparseable results. Request identity alone is not capability proof.
Commit new PostgreSQL enum values before constraints/statements use them.

After real manual records exist, rollback must retain compatible enum/null-score/
review readers. Never delete reviews or convert receipts to automatic failures
to enable rollback. This spec authorizes no deployment, bulk production content
conversion or real student test submission.

## 10. Read performance and evidence

Follow AGENTS.md: no material/student/attempt loop queries. Reuse curriculum and
academy-access readers, resolved actors/classes and shared assessment projections.
Join latest reviews or read them in one bounded bulk statement; avoid deep
relation includes. Lists select metadata; detail selects only required code/
feedback. Start independent reads together.

Server-render policy/current/latest assessment, selected result and navigator
inside existing bootstrap. Preserve React request caching/server-read freshness.
Submission/review responses seed scoped caches. Add no manual waiting poller.

Count complete changed service reads with Prisma query events on disposable
Docker PostgreSQL through COVE_INTEGRATION_DATABASE_URL, following
`packages/api/src/content/navigation-performance.integration.spec.ts`. Compare v2
baseline and feature with 1/20 materials/students/attempts/review versions:

- Learner bootstrap, selected result, latest and history.
- Teacher pending/graded counts/list, detail and review versions.
- Team Lead/Manager without extra Teacher grants/assignments.
- Staff live/preview, authoring, outline and manual summary.
- Publication/correction authorization and response reads, including retries.

Metadata propagation adds no statement. Existing paths retain baseline statement
counts by joining reviews into existing reads; genuinely new paths have a fixed
measured count independent of row/version count. Publish/correct transactions
have fixed counts; report writes separately from reads. Record actual counts and
deltas in commits/evidence. Never run fixtures on shared Supabase or report an
unmeasured count as a result.

## 11. Implementation boundaries and sequence

| Area | Implementation to extend |
| --- | --- |
| Policy/settings/results | Shared course, learn, submission, latest-submission, answer-records and teacher contracts; oRPC definitions |
| Persistence | Prisma schema/migrations; ProgrammingSubmissionReview relation and request/version constraints |
| Role scope | Shared auth/roles/monitoring, assigned-class-access, resolved academy/teacher scopes |
| Admission | Learn submission/staff-practice services and repositories; policy-discriminated practice snapshots |
| Assessment writes | Focused programming-review service/router; existing manual-review concurrency/audit patterns |
| History/progress | Teacher progress/access/repository, student-work-history, learn records and curriculum/manual-grade projections |
| Authoring/distribution | Shared author UI/drafts, course serializers, library/adoption, versions and workbook paths |
| Grading UI | Existing teacher submission detail/live observation, learner/staff result panels, latest/history components |
| Refresh/localization | Existing realtime transport and scoped caches; English/Korean assessment/status/error copy |

Implement in dependency order:

1. Contracts, settings/receipt/review invariants, migrations and role matrix tests.
2. Idempotent authorized student/staff admission and versioned review publication/
   correction, audit and revocation checks.
3. Authoring/distribution round trips, current assessment and score inclusion reads.
4. Shared staff grading/correction panel, student results/history, live observation
   and event refresh with private-practice isolation.
5. Disposable integration/query-count, regressions, browser and release evidence.

Read installed Next.js guides under
`packages/web/node_modules/next/dist/docs/` before web code changes. Share role,
assessment-selection and result helpers across roles; no separate Manager grader.

## 12. Acceptance criteria

1. Create Manual no-test Python/C/C++/valid PDF exercises. Persist maximum and
   inclusion; round-trip editor/library/workbook/versions. Reject manual quizzes;
   preserve Practice and Automatic behavior.
2. Submit exact code while judge execution is unavailable but auth/storage/
   limiter work. Verify notice, pending and timestamp, no fake score/cases/job/
   runtime request/judge SSE or waiting interval.
3. Assigned Teacher publishes 80/100 with feedback and completion. Student sees
   exact grade, feedback, completion, reviewer and separate times through event,
   reload or Refresh. Also publish zero and partial/full marks with either
   completion state.
4. Correct 80 -> 90 by final score and +10 adjustment, then feedback/completion
   with reason. Retain review/audit history. Reject blank first score, invalid
   bounds/precision, missing correction reasons and forged previous scores.
5. Concurrent reviewers at the same version: one commits, one conflicts without
   data loss. Same-request retry after response loss returns that version;
   changed payload conflicts without partial writes.
6. New pending submission supersedes current grade, not historical grades.
   Reviewing old work does not grade/retarget new work. Latest and selected views
   remain separate across reload/navigation.
7. Teacher-only grades homeroom/assistant classes but not unrelated ones.
   Team Lead-only and Manager-only each grade/correct any active own-academy
   class, including unassigned classes, with no role switch or TEACHER grant.
8. Test effective role unions in navigation/direct URL/API. Team Lead still cannot
   use Manager-only settings/credentials. Teacher gets no publish-authoring right.
9. Revoke role, assignment, enrollment, course assignment, membership or academy
   activity while panels/sockets are open. Subsequent read/publish/correct is
   denied. Foreign/archived classes, forged IDs, students and platform/support
   inspection cannot publish grades.
10. Staff live/authorized-preview self-test creates isolated RECORDED practice,
    not student reviews, grades, progress or rewards.
11. Excluded material shows its individual grade and 성적 제외 without assessed
    totals/denominators. Included material reflects pending/reviewed zero/partial/
    full grade and explicit completion in manual summaries, without automatic
    failure/acceptance-rate/reward changes.
12. Change mode/maximum/inclusion/revision after admission. Historical review
    uses frozen settings; it cannot rescale old work or update the new revision.
    Automatic in-flight jobs/regrades remain isolated from manual receipts.
13. Check admission races, storage/limiter failures, invalid solve sessions,
    review conflicts, missed events/reconnect and cache isolation. Preserve input,
    prevent false success and recover committed results.
14. Verify fixed SQL counts with small/expanded real PostgreSQL fixtures and
    migration constraints from the v2 base. Run focused contracts/API/UI and
    relevant Python/C/C++ automatic grading regressions.
15. Browser-check student and all staff roles, inherited teaching routes,
    grading/correction/result persistence in Chromium/WebKit, mobile, keyboard,
    both themes and Korean/English, with no redundant hydration fetch.

When implemented, record commands/results, screenshots, role matrix and SQL
counts in `docs/research/2026-11-12-manual-review-submissions-verification.md`.
Distinguish executed/unrun checks and local/production evidence. The linked evidence distinguishes implemented behavior and executed local checks from production deployment.


## 13. Implementation notes

The implementation preserves append-only review rows and atomically projects the current assessment onto the immutable receipt in the same transaction. Existing history/latest readers select that projection without another relation-level query. Database triggers protect submitted code/settings and review rows; a scoped index supports latest manual assessment/history reads.

Manual client capability is explicitly `manualAssessmentVersion: 1`. Older callers receive the existing localized `SAMPLE_CHECK_STALE` refresh-required conflict, preserving the layout translation payload budget. Teacher grading uses the mixed Student history/review surface; the automatic Solution status dashboard excludes manual exercises from judge metrics. Private staff receipts carry no student assessment. Review history reads return the latest 100 versions while retaining every version in the database.
