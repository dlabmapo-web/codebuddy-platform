# Console Operations — One Button, and the Snapshot It Must Not Overwrite

**Date:** 2026-09-09

**Branch:** `docs/admin-console-roadmap`

**Status:** Implemented on `docs/admin-console-roadmap`. §17 records where the build corrected this document.

**Implements:** §5.B of [The platform console, next phase](2026-09-08-platform-console-next-phase-design.md),
whose §3 gap classes, §4 decisions, and §7 document contract this follows.

## 1. Purpose

A page of maintenance operations an operator dispatches onto the queue, and the
first operation on it: **re-grade a problem's submissions after its grading
changed.**

The parent document called this "smaller than it looks," on the grounds that
re-grading is modelled end to end and only the trigger is missing. That is half
right. The trigger is missing, and the consequences were thought through — but
five mechanisms built for other, good reasons stand in a re-grade's way, and
every one of them fails quietly rather than loudly. §4.1 names them, §5 decides
around them. None is a reason not to build this. All five are reasons to have
written it down first.

Every claim below was read out of the code rather than out of an earlier
document, per the parent's §1: *where a design document and the codebase
disagree, the codebase wins.* Where this document contradicts something the
parent asserted, §13 says so.

The operation is not a convenience. §4.2 records a live defect that only this
surface can repair, and §4.3 a second population — students marked failed by a
test case that was wrong — whom it can pay for the first time.

### 1.1 In scope

| # | Change |
|---|---|
| 1 | An **Operations** rail group and page in the console, scoped by an academy |
| 2 | One operation on it: re-grade a problem's stale submissions |
| 3 | A durable record of every run — who, what, when, how far, what it found |
| 4 | A re-grade path through the judge that does not disturb live grading |
| 5 | Repair submissions excluded from the histories they would otherwise pollute |
| 6 | The correlation identifier §4.3 of the parent requires, from click to worker log |
| 7 | The **Operations** → **Accountability** rail rename the parent's §8.1 owes |

### 1.2 Deferred

- **Every other operation.** Balance rebuild, invitation redelivery and per-row
  retry are named in §14 with what they would cost once this shape exists. One
  operation, end to end, is the point of the first version.
- **The stuck list.** §5.C of the parent. This document produces the rows it
  would read — `PlatformOperationRun`, and the staleness predicate in §5.10 —
  and stops there.
- **Alerting.** The parent's §8.4 left it open and it stays open.
- **Progress in the browser.** §5.12 decides against streaming for v1 and says
  what would change that.

## 2. Which gap class this closes

**A surface gap (§3.2 of the parent), with one correction.**

The parent classified re-grading as a surface gap — the authority and machinery
exist, no screen asks for it. That is right about the machinery and wrong that
nothing but a screen is missing: §5.1, §5.2 and §5.5 are new code in the API,
the judge, and three existing services. The parent's build order should be read
as days rather than hours.

It is emphatically *not* a capability gap. No new permission is declared;
§5.13 uses `platform.health.read`, which exists and guards nothing yet.

## 3. The questions, in the words of whoever asks them

| Who | What they say |
|---|---|
| A teacher | "I fixed a wrong test case and now none of my students have that problem checked off. Can you put it back?" |
| A teacher | "That test case was wrong, so it failed people who were right. Do they get their points?" |
| An operator | "Which problems are sitting on a broken answer key right now?" |
| An operator, mid-run | "I pressed it four minutes ago. Is it doing anything?" |
| An operator, next week | "Who re-graded module 3, and when?" |
| A student | Nothing. They never learn this happened, which §5.5 makes true rather than assumes. |

## 4. What exists today

| Fact | Evidence |
|---|---|
| `gradingRevision` increments when an author changes grading | `packages/api/src/content/course.service.ts:855,868` |
| …and when a content import changes it | `packages/api/src/content/import/content-import.service.ts:956` |
| A submission carries its own **immutable** `SubmissionGradingCase[]` | `packages/api/src/learn/submission.service.ts:174-181`, `schema.prisma:1565,1606` |
| …along with the limits, language, and titles of that moment | `submission.service.ts:154-172`, `schema.prisma:1552-1558` |
| `Submission.materialId` is nullable and set null when a material is deleted | `schema.prisma:1561` |
| An academy is reached from a submission in one hop: `courseId` → `Course.academyId` | `schema.prisma:1512,1135` |
| `@@index([materialId, userId, createdAt DESC])` exists, for reads that start from a problem | `schema.prisma:1576` |
| Grading claims work with a conditional update on `status: "QUEUED"` | `packages/api/src/judge/grading.service.ts:44` |
| Progress is **not written** when the submission's revision is not the problem's current one | `grading.service.ts:164-170` |
| A student's status falls back to their draft when the revisions disagree | `packages/api/src/learn/learn.service.ts:322-327` |
| `attemptCount` increments unconditionally on every graded attempt | `packages/api/src/judge/grading.ts:131` |
| `SOLVED` is permanent, and `bestScore` never decreases | `grading.ts:128,134` |
| Points are paid only on the `solvedNow` branch, and only with a `classId` | `grading.service.ts:222-230` |
| The solve dedupe key is `${membership.id}:${material.id}:SOLVE` — no revision, no submission | `packages/api/src/points/point-award.service.ts:256` |
| …and a first solve can also pay lecture, module and course completions | `point-award.service.ts:328,345,363` |
| Enqueue uses `jobId: submissionId`, so a repeat is deduplicated | `packages/api/src/judge/judge.queue.ts` |
| …and completed jobs are kept only one hour | `judge.queue.ts` — `removeOnComplete: { age: 3_600 }` |
| The Pyodide engine is a **bounded pool with a waiter queue**, sized to `JUDGE_CONCURRENCY` | `packages/api/src/judge/pyodide-engine.ts:108-153` |
| The judge is its own process, booting without Nest | `packages/api/src/judge/judge.main.ts:18-25` |
| …and already sweeps its own stale work every 60s | `judge.main.ts:71-82` |
| `ERRORED` is documented as *"Judge fault. Never counted against the student's attempts."* | `schema.prisma:185` |
| A teacher's attempt history already filters to *"counted attempts only"* | `packages/api/src/teach/teacher-progress.repository.ts:442-452` |
| `AuditService.write(tx, input)` takes an optional `requestId` | `packages/api/src/academies/audit.service.ts:31-48` |
| …and reads `supportGrantId` from an AsyncLocalStorage that is **empty outside a request** | `packages/api/src/common/request-context.ts:47-58` |
| `AuditLog.requestId` is populated from `x-request-id`, else a fresh UUID | `schema.prisma:1052`, `packages/api/src/orpc/context.ts:135-138` |
| An audit action is a dotted string whose **last segment is a verb** | `packages/web/src/app/(platform)/admin/audit/_lib/audit-action.ts` |
| Partial unique indexes are house practice, in hand-written migration SQL | `migrations/20260722140000_auth_foundation/migration.sql:131,134` |
| `AcademyField` exists: *"which academy a console form is about to write into"* | `packages/web/src/app/(platform)/admin/_components/academy-field.tsx` |
| `platform.health.read` is declared and enforced nowhere | `packages/shared/src/auth/roles.ts:136` |
| The rail group named **Operations** holds Support access and Audit trail | `packages/web/src/app/(platform)/admin/_components/platform-sidebar.tsx:158-165` |
| Rankings are recomputed per request, with nowhere to store a position | `packages/api/src/points/leaderboard.repository.ts:21-27` |

### 4.1 The five mechanisms in the way

Each was built correctly for its own purpose. Each breaks a naive re-grade
without producing an error.

**The snapshot is immutable.** A submission owns its `SubmissionGradingCase`
rows, its limits, its language, and the titles that were true when it was made —
with the comment *"a renamed module must not rewrite what a student solved last
term."* Re-running a submission in place would grade it against the **old**
cases and prove nothing; overwriting the snapshot would destroy the history that
comment protects. §5.1.

**The queue deduplicates by submission id.** `enqueue` passes
`jobId: submissionId` precisely so a double-clicked submit cannot grade twice.
A re-grade naming the same submission inside the one-hour retention window is
accepted by the API, dropped by BullMQ, and reported to the operator as started.
§5.2.

**Claiming requires `QUEUED`.** `grade()` opens with a conditional update from
`QUEUED` to `RUNNING` and returns quietly when it claims nothing. A finished
submission is `PASSED` or `FAILED`, so a job naming it does nothing at all.
§5.1 removes this rather than working around it.

**The interpreter pool is shared and bounded.** `PyodideExecutionEngine` holds
`JUDGE_CONCURRENCY` threads and queues waiters. A separate BullMQ queue gets a
re-grade its own concurrency but *not* its own interpreters — it still competes
for the pool that live student submissions run in. §5.3.

**Every submission is a row in somebody's history.** `answer-records.service.ts`
lists and counts a student's submissions; `teacher-progress.repository.ts`
counts their attempts; `submission.service.ts:list` shows their last twenty on
the problem. A repair submission created today would appear in all three as
something the student did. §5.5.

### 4.2 The defect this repairs

A teacher corrects one wrong test case. `gradingRevision` goes 1 → 2.

Every `StudentExerciseProgress` row for that problem still says `SOLVED` and
still says revision 1. `learn.service.ts:322-327` compares the two revisions
and, on a mismatch, discards the stored status in favour of one derived from the
student's draft. Every student who solved that problem sees it as unsolved, from
the moment the teacher saves.

It is not one surface but four, and two of them were found only by putting the
platform into this state on purpose. `student-overview.repository.ts:305` and `teacher-overview.repository.ts:330`
both scope their counted work to `e.grading_revision = s.grading_revision` —
*"only work graded the way the problem grades today counts toward today's
score."* So a revision bump also empties the student's own overview score and
the teacher's view of it, silently, at the same instant.

The fourth was broken the other way, and was worse for it.
`curriculum-outline.service.ts` — behind **My Courses** and every class detail
page — selected `status` and `bestScore` and never read `gradingRevision` at
all, so it went on reporting *"Solved, 100/100"* from a record the problem page
had already stopped trusting. A student in the stale window could open a row
marked solved and land on a page saying they had not solved it, with nothing on
either screen explaining the difference. Fixed alongside this work: a record
whose revision has been superseded now falls back to the draft-derived status
there too, exactly as `LearnService` does, so the two surfaces cannot disagree
and a re-grade restores both at once.

Nothing repairs any of it. `grading.service.ts:164-170` refuses to write progress
for a submission graded against a superseded revision, so even a fresh submission
of identical code cannot heal the row until it is graded at the current revision
— which is what this operation arranges. The points survive, because the ledger
is append-only, so the student sees points for a problem the page says they have
not solved.

### 4.3 The second population, which the parent did not notice

The case above is a student wrongly *un*-marked. There is another, and it is the
one with money attached.

A test case with a wrong expected output fails correct programs. Those students
are `FAILED` at revision 1, `wasSolved` is false, and they were never paid. When
the teacher corrects the case and the operation re-grades them at revision 2,
`nextProgress` returns `solvedNow: true` — and `grading.service.ts:222-230`
takes the branch that pays. They earn the solve award, and, if it was their last
unsolved problem in the lecture, module or course, the completion awards at
`point-award.service.ts:328,345,363`.

This is correct. It is also the only part of the operation that *creates*
rather than restores, and it is why §5.10 rule 3 includes `FAILED` submissions
and why §9's copy has a sentence about points being earned.

## 5. Decisions

### 5.1 A re-grade creates a new submission. It never re-runs an old one

The unit of re-grading is a **new `Submission` row** carrying the student's
original `code`, the problem's **current** snapshot — cases, limits, language,
titles — and `gradingRevision` set to the current revision. The historical row
is read for `code`, `userId`, `materialId`, `courseId` and `classId`, and is
never written to.

This follows from §4.1 and is a recognition rather than a choice. It also
disposes of the claiming problem: a new row is `QUEUED` by default, so
`grade()`'s conditional update succeeds with no change to it.

Consequences, each of which somebody will ask about:

- **The old submission is untouched.** It is what they submitted and how it was
  judged that day. The design that made the snapshot immutable is the design
  that makes this the right answer.
- **The new submission is attributed to the student, not the operator.** It is
  their code and their solve; `userId` is theirs. The operator's name is on the
  run and the audit row, which is where an act of administration belongs.
- **`classId` is copied**, so class-scoped point attribution and rankings keep
  describing the class the work was done in. A submission written before class
  attribution has a null `classId`, and `grading.service.ts:222` pays nothing
  without one — so those students' records are repaired and their points are
  not. That is the existing rule, unchanged, and §9's copy does not promise
  otherwise.
- **`solveSessionId` and `solveElapsedSec` are null.** Nobody solved anything;
  a synthetic solve time would corrupt the teacher analytics that read them.
- **`regradeRunId` is set**, which is what §5.4 and §5.5 read.

### 5.2 A re-grade job is identified by run and submission, never by submission alone

The job id is `regrade:${runId}:${submissionId}`.

It cannot collide with the live queue's `jobId: submissionId`, so §4.1's silent
drop cannot happen; and it *does* collide with itself, so a retried dispatch
inside one run deduplicates exactly as the live path does — which is the
behaviour that rule was written for.

### 5.3 Re-grading gets its own queue and its own concurrency, but shares the interpreter pool

A new queue, `cove-regrade`, with its own `Worker` constructed in
`judge.main.ts` beside the existing one, at `REGRADE_CONCURRENCY` — a new
variable in `env.schema.ts` beside `JUDGE_CONCURRENCY` (`env.schema.ts:105`),
**defaulting to 1**.

Why a separate queue: BullMQ shares concurrency across one queue's worker, so a
re-grade of four thousand submissions on `cove-grading` would put every live
submission behind four thousand jobs. A student waiting two minutes on a queue
they cannot see is a worse failure than the one being repaired. Per-job
`priority` would also solve it and is rejected — it changes the ordering
behaviour of a live path that currently has none, to fix a problem the live path
does not have.

Why the same process, and the same interpreter pool: the expensive thing in the
judge is the warmed Pyodide runtime, and `PyodideExecutionEngine` is a bounded
pool with a FIFO waiter queue (`pyodide-engine.ts:147-153`). A separate queue
does **not** get separate interpreters, so a re-grade still takes a slot — with
the defaults, one of four — while it runs. That is the deliberate trade:
25% of judge capacity during a repair, and interleaved fairly by the pool's own
waiter queue, in exchange for no extra memory and no second warm-up.

The escape hatch, if that ever hurts: give the re-grade worker its own
single-thread `PyodideExecutionEngine`. It costs one more interpreter's memory
and is a two-line change, and it should be made when somebody observes live
latency during a run — not before.

> **Deployment.** No new container. `REGRADE_CONCURRENCY` is optional with a
> default, so `docs/operations/deployment-guide.local.md` gains a row in the
> secrets table and a line in the container notes, and no new step.

### 5.4 The student is not charged an attempt

`nextProgress` increments `attemptCount` unconditionally (`grading.ts:131`).
Left alone, a repair the student never asked for would add an attempt, and
re-grading twice would add two.

`grade()` reads `regradeRunId` off the submission it already loaded and, when it
is set, passes the previous `attemptCount` through unchanged. The flag is read
from the row rather than passed by the caller, so no dispatch path can forget
it.

This is not a new principle. `SubmissionStatus.ERRORED` is already documented as
*"Judge fault. Never counted against the student's attempts"* and `nextProgress`
already implements it at `grading.ts:118-126`. A repair is the same kind of
thing: a row the platform wrote, not an attempt the student made.

Nothing else about the progress write changes — same transaction, same points
call, same revision guard, which now passes because §5.1 stamped the current
revision.

### 5.5 A repair submission is excluded from the histories a person reads

The mechanism is `Submission.regradeRunId String? @db.Uuid`, indexed. The rule
is **not** a global filter, because several readers should count repairs and one
must.

> **Corrected during the build.** The enumeration below originally came from a
> grep for `prisma.submission.`, which misses every reader that reaches the
> table through raw SQL — thirteen query sites across five files. What made that
> survivable is that each of those repositories already funnels its raw queries
> through a single scope helper, so the exclusion is one line per helper rather
> than thirteen edits. The classification is also not uniform, and the reason is
> worth stating: **an aggregate that already gates on `grading_revision` must
> include repairs**, because the revision bump is what broke it and the repair
> is what mends it. Excluding repairs there would leave the number permanently
> at zero.

| Reader | Repairs | Why |
|---|---|---|
| `answer-records.service.ts` — list, count, `groupBy` facets, summary (`:75,82,217,222,284`) | **Excluded** | A student's own history. A row dated today for code they wrote in March is a lie, and the PASSED/FAILED summary counts would drift by one per repair |
| `submission.service.ts:list` (`:339`) | **Excluded** | Their last twenty attempts on the problem, in the workspace. A repair would push a real attempt off the end |
| `teacher-progress.repository.ts` — `attemptWhere` (`:442`), attempts list (`:353`) | **Excluded** | Extends a filter that already exists for exactly this reason: *"a queued, cancelled, or judge-faulted row is not something the student did, so it never appears in a history a teacher reads back to them"* |
| `team-lead-overview.repository.ts:activeStudentsByCourse` (`:826`) | **Excluded** | Counts distinct students with a submission in a window. A repair is dated today for a student who may not have opened anything, and counting it would report them active |
| `grading.service.ts:sweepStale` (`:254`) | **Included** | A repair job can be orphaned by a crash like any other, and must be swept |
| `course.service.ts:477,1167`, `classes.service.ts:331` | **Included** | Deletion guards — "does anything reference this?" A repair row is a row, and excluding it would let a delete cascade over one |
| `student-overview.repository.ts:countedScope` (`:305`) | **Included** | Gates on `e.grading_revision = s.grading_revision`, so the student's score already read zero after the bump. The repair is what restores it; excluding it would leave the overview permanently broken |
| `teacher-overview.repository.ts:countedScope` (`:330`) | **Included** | Same gate, same reason |
| `monitoring.gateway.ts` | Untouched | Live presence, not history |

Adding `regradeRunId: null` to `attemptWhere` is the single most important line
in this section, because that helper is already the shared definition of "an
attempt the student made" and everything downstream of it inherits the fix.

The alternative — showing repairs, labelled — is rejected. It would require
student-facing copy explaining an administrative act they did not cause and
cannot act on, in two languages, on a page whose purpose is their own work.

### 5.6 A re-grade cannot take a checkmark away

`nextProgress` computes `solved` as `wasSolved || input.status === "PASSED"`,
and `bestScore`/`bestPassed` with `Math.max`. `SOLVED` is permanent by design,
with the stated reason that *"experimenting after succeeding must not cost
anything."*

So a student who solved against a broken answer key and would now fail keeps
their mark. The operation restores and pays; it never withdraws.

This is the safest possible behaviour and it is what makes §9's copy short. It
is also a product decision worth seeing rather than inheriting — §16.1 puts it
as an open question, and until that is answered this document specifies the
inherited behaviour and no special case.

### 5.7 The operation is scoped to one problem, in one academy, chosen explicitly

`AcademyField` for the academy — the console's own control, documented as
*"which academy a console form is about to write into"* and deliberately drawn
as a form control rather than a filter chip, *"because two controls that look
alike while doing different things is how a course, or an invitation, ends up in
the wrong customer's academy."* That reasoning is this page's reasoning. When
the operator arrived from the stale board (§8) the academy is already answered,
and the field is passed `locked`.

Then one problem. There is no "all academies" and no "all problems in a course"
in v1 — not from caution about scale, but because the operator's real question
is *"a teacher told me problem X is broken"*, and a course-wide re-grade cannot
be narrowed once dispatched. The parent's §8.3 requires that "all of them" be a
deliberate choice on the page rather than the default when a selector is left
alone; v1 avoids the question by not offering it.

### 5.8 A run is a row, not a job

`PlatformOperationRun` — the record docquery's operations page has no equivalent
of, and the absence of which is why its only feedback is a toast.

| Column | Why |
|---|---|
| `id` | The `runId` in every job id and every log line |
| `academyId` | What it was scoped to |
| `operation` | `REGRADE_STALE_SUBMISSIONS` — an enum, not free text |
| `targetType`, `targetId` | The problem's material id |
| `actorUserId` | Who pressed it |
| `requestId` | §5.9's correlation id |
| `supportGrantId` | §5.9's second half; null for an ordinary act |
| `status` | `PLANNING` → `RUNNING` → `COMPLETED` / `FAILED` |
| `plannedCount`, `studentCount` | What the plan found |
| `dispatchedCount`, `completedCount`, `failedCount` | Counters the worker advances |
| `startedAt`, `finishedAt`, `failureReason` | |

**One in-flight run per target, enforced by the database.** A unique index on
`(operation, target_id)` filtered to `status IN ('PLANNING','RUNNING')`. That is
the answer to the parent's "what happens when two operators start the same
operation at once": the second insert fails and the page names the first
operator.

It must be hand-written SQL in the migration — Prisma's `@@unique` cannot
express a filtered index. There is house precedent for exactly this shape:

```sql
CREATE UNIQUE INDEX "platform_operation_runs_one_in_flight_key"
  ON "platform_operation_runs" ("operation", "target_id")
  WHERE "status" IN ('PLANNING', 'RUNNING');
```

compare `academy_join_requests_one_pending_key ... WHERE "status" = 'PENDING'`
and `academy_invitations_one_pending_email_key`, both in
`20260722140000_auth_foundation`. The reasoning is `PointAward.dedupeKey`'s: the
database enforces it, not a service somebody has to remember to call.

### 5.9 The correlation identifier already has a column — and a hole

`AuditLog.requestId` exists and is populated from `x-request-id` or a fresh UUID
by `requestId(context.req)`. The parent's §4.3 asks where the identifier is
minted and what carries it; the answer is *it is already minted, and nothing
carries it past the request.*

So the dispatching request's `requestId` is written to the run and rides on
every job as `{ runId, requestId, submissionId }`. The re-grade worker logs it
as `[${requestId}]`, matching the shape docquery's `corrId` established. No new
identifier and no second concept.

**The hole:** `AuditService` reads `supportGrantId` from an AsyncLocalStorage
that is deliberately empty outside a request — *"a background job, a socket
frame, a unit test."* Correct for everything that exists today, and wrong here.
If an operator dispatches a re-grade while standing in an academy under a
support grant, the `started` row carries the grant and the `completed` row,
written by the judge, would not. An audit trail whose whole purpose is to make
the platform's grant page and the academy's audit page tell the same story would
tell two.

So the run row carries `supportGrantId`, copied at dispatch, and the judge
passes it explicitly to `AuditService.write`. This is the first background writer
of an audit row and it is why the field is on `AuditInput` as an override at all.

### 5.10 What "stale" means, precisely

A submission is stale, and in a run's plan, when **all** hold:

1. Its `materialId` is the target problem. Null means the material was deleted
   (`onDelete: SetNull`) and there is nothing to repair — `grade()` would fail
   it `EXERCISE_UNAVAILABLE` anyway.
2. Its `gradingRevision` is less than the problem's current `gradingRevision`.
3. Its `status` is `PASSED` **or** `FAILED`. `FAILED` is not completeness — it
   is §4.3's population, the students a wrong test case marked down. `QUEUED`
   and `RUNNING` are live work; `ERRORED` and `CANCELLED` never produced a
   verdict and are §14's per-row retry, not this.
4. It is the student's **most recent** such submission for that problem. Earlier
   attempts are history, and re-grading them repairs nothing the latest does not,
   at N times the cost.
5. ~~Its `regradeRunId` is null.~~ **Withdrawn during the build.** Excluding
   repairs from the window left a student's original submission as the newest
   row that matched, so they came back stale after being repaired and every
   later run re-graded them again — visible as a board still reporting one
   affected student directly after a run reported one record repaired. A repair
   is an ordinary row inside the window; rule 4 picks it as the student's
   latest, and rule 2 then finds it current. That also makes a second revision
   bump behave correctly: the repair becomes stale in its turn.

Rules 1-4 are applied inside the window; rule 2's comparison happens on its
result, which is what makes the set self-correcting rather than something a run
has to remember it already did.

Rule 4 keeps the operation proportional — one job per affected student, not one
per attempt they ever made — and is served by the existing
`@@index([materialId, userId, createdAt DESC])`, which exists because "the
By-problem views start from a set of materials."

The academy filter is `course: { academyId }`, one hop, not a walk up through
lecture and module.

This predicate is written once, in `RegradeService.planFor`, because §5.C's
stuck list is the same query with the problem filter dropped.

### 5.11 The plan is counted before anything is dispatched

Pressing the button does not dispatch. It creates the run in `PLANNING`, counts
the stale submissions and distinct students, and returns both to the page, which
asks again with the numbers shown. Then the run moves to `RUNNING` and the jobs
go out.

This is §4.4 of the parent applied literally — the blast radius stated on the
page, in numbers, before the irreversible step — and it is the shape
`academy-row-actions.tsx` already uses for an academy purge. An operator who
sees `0 submissions` learns the problem was not the one they thought, before
doing anything.

### 5.12 v1 reports progress by polling its own row, not by streaming

The run row carries counters the worker advances; the page reads them on an
interval while a run is `RUNNING`.

`GradingProgress` and `QueueEvents` exist, and the live path already streams
per-case progress to a student over SSE. Reusing that was considered and
deferred: a second streaming surface, with its own reconnection and fan-out
questions, for one person watching a job that takes minutes and has no per-case
detail worth watching. Counters answer §3's actual questions.

What would change this: an operation whose *individual* items matter to the
operator as they land. None of §14's do.

### 5.13 The permission is `platform.health.read`

`platform.health.read` is declared and guards nothing (`roles.ts:136`). The
parent's §5.C keeps the name for the stuck list; this document uses the same
permission, because the two surfaces are one audience and one authority, and
inventing `platform.operations.manage` would add a fifth dead permission to the
four the parent's §2 complains about.

### 5.14 The rail gains a sixth group, and the fourth is renamed and moved

The parent's §8.1 proposed a five-group rail. The build has six, because 5.D
added a **Settings** group the parent's table did not anticipate — correctly, and
its own comment says why: both its rows are boards across every academy, and *"a
row that had to ask 'which academy?' before it could show anything would not
belong in it."*

Today, from `platform-sidebar.tsx:92-186`:

| # | Group | Rows |
|---|---|---|
| 1 | Platform | Academies |
| 2 | People | Users, Applications, Invitations |
| 3 | Curriculum | Library, Academy courses, Classes, Ranking |
| 4 | **Operations** | Support access, Audit trail |
| 5 | Settings | Features, Point policies |

Note that the parent's other §8.1 rename is already done: `nav.group.content`
reads **"Curriculum"**. Only the fourth group's name is still owed.

Proposed:

| # | Group | Rows | Question it answers |
|---|---|---|---|
| 1 | Platform | Academies | Who is on the platform |
| 2 | People | Users, Applications, Invitations | Who are the people |
| 3 | Curriculum | Library, Academy courses, Classes, Ranking | What is being taught |
| 4 | Settings | Features, Point policies | How each academy is configured |
| 5 | **Operations** *(new)* | Maintenance | What needs doing |
| 6 | **Accountability** *(renamed from Operations, moved from 4)* | Support access, Audit trail | What did operators do, and under what authority |

Three changes, and the reasoning for each:

**The rename.** The word *Operations* is currently spent on Support access and
Audit trail, which are not operations — they are the operator's own authority
and the record of its use. *Accountability* is the honest name for what that
group already holds, and it frees the word for work that is actually
operational. This is the parent's §8.1 recommendation, unchanged.

**The move to last.** Accountability is the record of everything in the five
groups above it, and it is the group an operator opens *after* the fact rather
than to do something. The rail's own comment already orders groups by what a row
acts on — *"the tenants themselves, the people in them, the curriculum they
share, and the operator's own trail through it"* — and the trail belongs at the
end of that sentence, not in the middle of it. It also puts the two groups an
operator *acts* through, Settings and Operations, next to each other.

**Operations at 5, not 2.** It is the newest and least-used group. A rail is
read top to bottom by frequency, and a maintenance page an operator opens when a
teacher reports something does not belong above the academy list they open every
day.

When §5.C's stuck list lands it becomes the second row in group 5, which is why
the group is created now rather than the page being hung off Settings.

### 5.15 The page is one route, and the rail needs nothing new to light it

`activeNavHref` (`packages/web/src/lib/nav-active.ts`) is longest-match, so
`/admin/operations` beats the `/admin` row of group 1 with no special case. The
`contentLensFromReferrer` override applies only to the content lenses and is not
consulted for this row.

So unlike the content browser — whose rail row is reconstructed from a `from`
parameter because one editor is mounted under several routes — this page is one
address with one row, and needs no referrer machinery. A run is a row on the
page rather than a route of its own (§5.12 polls the run in place), which is
what keeps it that way.

`routes.ts` gains one entry beside `adminSettings`:

```ts
/** Maintenance work an operator dispatches. Platform-wide with an academy
 *  selector, so it is `adminOperations` and not an academy's own route. */
adminOperations: '/admin/operations',
```

The naming follows the distinction `routes.ts:72` already draws between
`adminSettings` and `adminAcademySettings` — platform-wide against one
academy's.

## 6. Data model

```
model PlatformOperationRun    // §5.8
Submission.regradeRunId       // String? @db.Uuid, indexed — §5.1, §5.4, §5.5
```

Both additive. The filtered unique index is hand-written SQL (§5.8).

## 7. API surface

A new contract, `packages/shared/src/api/orpc/platform-operations.contract.ts`,
in the shape `platform-settings.contract.ts` established, registered in
`orpc/router.ts` beside `createPlatformAuditRouters`.

| Procedure | In | Out |
|---|---|---|
| `planRegrade` | `{ academyId, materialId }` | `{ runId, plannedCount, studentCount, currentRevision }` |
| `startRegrade` | `{ runId }` | `{ status }` |
| `run` | `{ runId }` | the run row, for polling |
| `runs` | `{ academyId?, limit, cursor }` | recent runs, newest first |
| `staleProblems` | `{ academyId }` | problems with stale submissions, and how many |

`staleProblems` is what makes the page usable without a teacher's report — §3's
third question — and it is one aggregate over §5.10's predicate.

Every procedure guards with
`PlatformAccessService.requirePermission(authUserId, "platform.health.read")`.

Note the deliberate difference from `platform-settings.contract.ts`, which is
two reads and no writes because the academy owns the change. This one writes,
because the parent's §8.3 settles that a repair across a cohort is the
operator's job and has no academy-side page to send them to.

`RegradeService` lives in `packages/api/src/platform/`, not `judge/`: the judge
is the process that runs untrusted code, and the planner is a query. The judge's
re-grade worker calls `GradingService.grade()` unchanged.

## 8. Web surface

### 8.1 Files

```
packages/web/src/app/(platform)/admin/operations/
  page.tsx                          RSC: reads staleProblems, renders the shell
  _components/
    stale-board.tsx                 'use client' — the default view
    regrade-card.tsx                'use client' — selectors, plan, confirm
    run-table.tsx                   'use client' — recent runs, polls a live one
    run-status.spec.tsx
  _lib/
    run-progress.ts                 counters → a sentence; pure, unit-tested
    run-progress.spec.ts
```

Sidebar and routes:

```
_components/platform-sidebar.tsx    §5.14's group changes
packages/web/src/lib/routes.ts      adminOperations
packages/i18n/src/locales/{en,ko}/platform.json            nav.group.* keys
packages/i18n/src/locales/{en,ko}/platform-operations.json §9's copy
```

### 8.2 The shell, and where the copy lives

`page.tsx` follows `admin/settings/page.tsx` exactly: an RSC that builds a
`createPlatformServerORPCClient()`, reads its board inside a `try`/`catch` —
*"the client owns the retry and can say what happened"* — and hands the result
to a client component as `initialBoard`.

```tsx
<PlatformShell
  bleed
  description={t('operations.description')}
  namespaces={['platform-operations']}
  title={t('operations.title')}
>
```

`bleed` because the page lays out its own panels — a board, a card, a table —
rather than one white content card.

`namespaces` is the prop that matters here, and it exists for exactly this case.
Its own comment: *"For copy too large or too specific to ride in every console
page's RSC payload — the delivery vocabulary, for instance, which one page reads
and which would otherwise put an explanation of what a bounce is into every
operator's Academies page."* §9's blast-radius paragraph is that kind of copy —
four sentences about grading revisions that no other console page needs — so it
lives in `platform-operations.json` and loads on this route alone. Only the nav
labels go in `platform.json`, because the rail is on every page.

### 8.3 The page, top to bottom

**The stale board**, first and default. `staleProblems` for the selected
academy: problem, course, current revision, stale submissions, affected
students. A row's action is *Re-grade*, which fills the card below it and passes
the academy `locked`.

It is first because an operator arriving with no ticket should still learn
something, and because it is the only part of the page that answers a question
without being asked one.

Empty state: *"Nothing needs re-grading."*

**The operation card** — title, blast-radius paragraph, `AcademyField`, problem
selector, one button. Deliberately the shape docquery's `operations/page.tsx`
uses, and the right one: a paragraph of consequence attached to an action, which
is what the parent's §4.4 asks for.

**The confirmation dialog**, showing §5.11's counts and requiring the problem's
title typed back — the pattern `academy-row-actions.tsx` uses for an academy
purge, which is the console's existing precedent for an irreversible act.

**Recent runs**, a table: when, who, what, the counters, the status. A run that
is `RUNNING` polls (§5.12) and shows a progress sentence from `run-progress.ts`;
the rest are static rows. This is the operator's answer to "did that work" an
hour later, and the reason a run is a row rather than a toast.

### 8.4 The icon

`Wrench` from `lucide-react`, imported into `platform-sidebar.tsx`'s existing
alphabetical block. `SlidersHorizontal` is taken by Features, and the rail's
convention is *"the icons the pages and their summary tiles already wear"* — a
maintenance page has no icon yet, so this one sets it.

When the stuck list arrives it takes its own row and its own icon in the same
group; nothing about this row changes.

### 8.5 What is not a clone of a studio page

Nothing here, because no studio page exists for it. The parent's §4.1 test —
*if a console page reads the same as its studio twin, the question was never
identified* — is satisfied trivially, which is itself evidence the operation
belongs in the console rather than behind `enterAcademyAs`. A manager has no
page to re-grade from, should not have one, and per the parent's §8.3 this is
the operator's job rather than the academy staff's.

## 9. Copy

Designed text, per §7.4 of the parent. English shown; Korean lands with it in
`platform-operations.json`.

**Card title:** Re-grade a problem's submissions

**Card description:**

> When a test case is corrected, two things happen quietly. Every student who
> had solved that problem stops seeing it as solved. And any student the old
> test case marked wrong stays marked wrong, even if their code was right.
>
> This re-runs each affected student's most recent submission against the
> corrected test cases. Solved marks come back. Students who should have passed
> are recorded as passing and earn the points for it, including any lecture or
> course they complete by it.
>
> Their original submission is kept exactly as it was, and does not change in
> their records. No student loses a solved mark or a score they already earned,
> no points are paid twice, and nothing appears as a new attempt of theirs.

**Confirmation:**

> Re-grade **{problem}** in **{academy}**?
>
> **{n} students'** most recent submissions will be re-run at revision
> {revision}. This usually takes a few minutes and cannot be stopped once
> started.
>
> Type the problem's title to confirm.

> **Corrected during the build.** This originally read *"{n} submissions from
> {m} students"*. Rule 4 of §5.10 re-grades one submission per student, so those
> two numbers are always the same one, and printing both implied more work than
> the operation does. The board above still shows both — there, `staleCount` and
> `studentCount` genuinely differ and together say how much history is affected.

**Empty plan:**

> Nothing to re-grade. Every submission for this problem was already graded at
> revision {revision}.

**Already running:**

> {operator} started a re-grade of this problem {time}. Wait for it to finish.

Four properties of that copy, deliberate. It names the consequence before the
mechanism. It states that points can be *earned*, because that is the only
irreversible thing the operation does and burying it would be dishonest. It
states the four things that do not happen, because an operator's hesitation is
about damage rather than function. And it never says "all submissions", because
§5.10 rule 4 means it does not.

## 10. Audit vocabulary

Actions are dotted strings ending in a verb; `audit-action.ts` derives its
family from that last segment.

| Action | Family | When | Written by |
|---|---|---|---|
| `platform.regrade.planned` | `changed` (fallback) | A run is created and counted | API |
| `platform.regrade.started` | `changed` (fallback) | Jobs are dispatched | API |
| `platform.regrade.completed` | `changed` (fallback) | The last job lands | **Judge** |
| `platform.regrade.failed` | `destroyed` | The run could not finish | Judge |

`before` is `{ revision, plannedCount, studentCount }`; `after` the final
counters. `targetType` is `"material"`, `targetId` the problem's material id,
`academyId` the scoped academy, `requestId` and `supportGrantId` copied from the
run per §5.9 — the judge has neither in context and must be handed both.

`planned`, `started` and `completed` are not in `familyVerbs` and fall back to
`changed`, which that module's own comment says is *"true of anything written to
an audit log."* Acceptable; no vocabulary change needed. `failed` is already a
`destroyed` verb, the right weight for an operation that stopped halfway.

Whether `planned` deserves a row is a judgement: it records an operator looking,
which `audit-action.ts` argues is a distinct kind of event worth keeping apart.
Kept — a plan counted and then abandoned is exactly the trace that explains a
question nobody asked out loud.

## 11. Build order

1. **`PlatformOperationRun` and `Submission.regradeRunId`**, with the filtered
   unique index as hand-written SQL (§5.8). Migration first; everything reads it.
2. **`RegradeService.planFor`** and its unit tests. A pure query, no dispatch,
   testable against seed data — and the same predicate §5.C will call.
3. **The `cove-regrade` queue and its worker** in `judge.main.ts`. Dispatch by
   hand from a script and confirm the whole repair: a new submission is created,
   graded at the current revision, and the student's progress row heals.
4. **The repair's two behaviours** — §5.4's attempt count, §5.5's exclusions.
   Do §5.5 as one change across `answer-records.service.ts`,
   `submission.service.ts:list` and `attemptWhere`, because a partial exclusion
   is worse than none: the numbers on two pages would disagree.
5. **The contract, router, and audit rows**, including §5.9's support-grant
   hand-off to the judge.
6. **The rail** — §5.14's rename, move, and new group — then the page.
7. **Copy** in `en` and `ko` (§9), then E2E.

Steps 1–4 are the substance and are testable with no UI at all. Step 3 is where
§4.1's five mechanisms are proven handled, and it is worth stopping there to
confirm before any of the surface is built.

Step 6 is the only step that touches a file another workstream is likely to be
in at the same time. If §5.C starts before this lands, the two share
`platform-sidebar.tsx` and should agree who does the rename.

## 12. Testing

| Level | What |
|---|---|
| Unit | `planFor` — §5.10's five rules, one test each; especially rule 4 (latest attempt only) and rule 5 (a repair is never repaired) |
| Unit | `nextProgress` with a repair — attempt count unchanged, everything else identical |
| Unit | The job id — a re-grade of a submission whose id equals a live job's does not collide |
| Integration | **Restore:** solve, bump the revision, assert the student reads unsolved, run the operation, assert they read solved |
| Integration | **§4.3's payment:** fail against a wrong case, correct it, run, assert `solvedNow` paid once and the completion awards landed |
| Integration | **Points idempotency:** the same solve re-graded three times pays once. Asserts `dedupeKey` in the situation its comment anticipates |
| Integration | **§5.5's exclusions:** after a repair, the student's answer-record count, their last-twenty list, and the teacher's attempt count are all unchanged |
| Integration | The filtered unique index: two `startRegrade` calls on one problem, the second rejected with the first operator's name |
| Integration | Rule 4 arithmetic: a student with six attempts contributes exactly one job |
| Integration | A repair dispatched under a support grant carries it onto the `completed` row (§5.9) |
| E2E | Select, plan, see the counts, type the title, watch counters, find the run in the table |

The idempotency test is the one that would have caught the whole class of
double-payment bug the `dedupeKey` comment anticipates, and it has never had a
caller that could trigger it.

## 13. Where this contradicts the parent

Per the parent's own §1, the codebase wins. Three places:

1. **"Only the trigger is missing."** §4.1 finds five mechanisms in the way, two
   of which (the shared interpreter pool, and repairs polluting history) the
   parent did not consider at all. The estimate should be days.
2. **"Rebuild a ranking."** Listed as an operation in the parent's §5.B. It is
   not one — see §14.
3. **"Recompute point balances after a policy change."** The phrasing implies
   re-pricing history, which the ledger cannot do: `amount` is positive by check
   constraint and no method subtracts. The honest operation is a cache rebuild —
   see §14.

## 14. What this deliberately does not do

- **Rebuild a class ranking.** `leaderboard.repository.ts:21-27`: *"recomputed
  per request. There is no stored standing, no cached position, and no table a
  rank could persist in."* There is nothing to rebuild. Strike it from the
  parent's §5.B.
- **Recompute point balances.** Real but rare and differently shaped:
  `StudentPointBalance` is upserted in the same transaction as the `PointAward`
  it derives from, so the two can only drift after a defect. It is a repair tool
  for a bug that has not happened. Worth a card once this page exists; not worth
  the page.
- **Per-row retry of an `ERRORED` submission.** The cheapest thing on the
  parent's list and genuinely wanted, but a row action in the answer records and
  teacher surfaces, not a card here. It also needs none of §5.1: an `ERRORED`
  submission never produced a verdict, so re-running it in place is correct, and
  only §5.2's `jobId` rule applies. A separate, small document.
- **Invitation redelivery.** `InvitationDeliveryState` already carries `BOUNCED`
  and `FAILED`, and a retry sweep already runs. What is missing is a list, which
  is §5.C's.
- **Stopping a running operation.** No cancel. At `REGRADE_CONCURRENCY: 1` and
  one job per student, a run is minutes, and a cancel path would have to reason
  about half-repaired cohorts. If runs grow long enough that this hurts, the
  answer is queue draining, and it gets its own paragraph then.
- **Telling students.** A repair restores what was already true, and §5.5 makes
  it invisible. A notification would explain a bug they never saw. The exception
  is §4.3's newly-paid students, whose point balance changes without explanation
  — noted in §16.2.

## 15. Deployment

No new container, no new service, one optional variable.

| | |
|---|---|
| `REGRADE_CONCURRENCY` | Optional, default 1, `judge-worker` only. Beside `JUDGE_CONCURRENCY` in `env.schema.ts` |
| Migration | `PlatformOperationRun`, `Submission.regradeRunId`, the filtered unique index as raw SQL |
| Rollout | Additive, and the queue is new, so API and judge deploy in either order. A judge running ahead of the console consumes an empty queue |

## 16. Open questions

### 16.1 Should a student who would now fail keep their mark?

§5.6 inherits `SOLVED` being permanent, so they do. The argument for is already
in the code: succeeding and then experimenting must not cost anything, and a
student who solved the problem as it was written did nothing wrong.

The argument against is narrower than it first looks and worth stating so it is
decided rather than defaulted: if the original case was wrong enough that an
*incorrect* program passed it, the mark is a false statement about that
student's work, and a curriculum whose records are knowingly false is worse than
one that occasionally withdraws a mark.

Answering "yes" costs nothing — it is what the code does. Answering "no" means a
`withdrawSolvedOnFailure` flag on the run, a second confirmation, and copy
telling the operator how many students would lose a mark before they press
anything. Not v1 either way; v1 must not foreclose it, and `regradeRunId` on the
submission is what keeps the door open.

### 16.2 Should §4.3's newly-paid students be told?

§14 says students are not notified, and for a restored mark that is right — they
never saw it break. But a student who was marked wrong, and is now marked right
and paid for it, sees a point balance move for no reason they can name.

The honest answer is probably a line in whatever the platform eventually has for
student notifications, which is nothing today. Raising it here so the next
person to build that has one concrete case to design against.

### 16.3 Should `staleProblems` be visible to a teacher?

The operator's board answers "which problems are broken". The teacher who broke
one, by correcting it, is the person who would most like to know — and today
they find out from a student. A banner on the studio's problem page — *"this
problem's grading changed; 47 students' records are waiting on a re-grade"* —
would be the honest place for it.

Out of scope here because it is a studio surface and this is a console document
(§1.2 of the parent). But it is the natural next question, and §5.C's stuck list
should be designed knowing a teacher-facing sibling may follow.

## 17. What the build corrected

Written after the fact, per the parent's §1: where this document and the
codebase disagreed, the codebase won. Each of these is already reflected above;
they are collected here so the next reader knows which decisions were made
against real code rather than against a plan.

### 17.1 The exclusion list was drawn from the wrong grep

§5.5 named three readers. There are more, and five of them reach `submissions`
through raw SQL that a `prisma.submission.` grep cannot see. The correction is
in §5.5's table, and the load-bearing detail is that **the classification is not
uniform**: a revision-gated aggregate has to *include* repairs, because the
revision bump is what emptied it.

### 17.2 Expansion is synchronous, and capped

The document said `startRegrade` dispatches. The build makes it write the repairs
too, in transactions of a hundred, inside the request — because rule 4 makes a
plan one row per affected student at one problem, which is tens to low hundreds.
`REGRADE_MAX_SUBMISSIONS` (2,000) refuses anything that is not, so an upstream
mistake surfaces as a refusal an operator can read rather than a transaction
that takes the database down. No fan-out job type, and §5.2's job id is unchanged.

The plan is **re-read** at `startRegrade` rather than trusted from
`planRegrade`. A student may have resubmitted while the confirmation dialog was
open, and repairing a record with code the student has already superseded would
be worse than not repairing it.

### 17.3 Completing a run needs two guards, not one

Repairs are dispatched in chunks, so `settled >= dispatched` is true at the end
of the first chunk while the second is still being written. `RegradeRunner`
therefore waits for `dispatchedCount === plannedCount` as well, and elects the
finisher with an `updateMany` filtered on `status: "RUNNING"` — several workers
can settle their last job at the same instant, and exactly one changes a row.

### 17.4 The confirmation is the existing dialog, with a tone

`DeleteConfirmDialog` already describes itself as *"the one shape every
irreversible act in Cove asks for"*, so the build gave it a `tone` prop rather
than a near-copy. `danger` stays the default; this surface passes `brand`,
because §5.6 means a re-grade takes nothing away and a red button would ask an
operator to brace for damage that is not coming. What earns the typed
confirmation is irreversibility, not destruction.

### 17.5 Two guard rails caught real omissions

Both were written by earlier work and both did their job:

- `audit-vocabulary.spec.ts` — from `4dba06a`, *"stop trusting a grep to find
  them"* — failed until all three `platform.regrade.*` actions had console copy
  in both languages.
- The typed oRPC contract refused to compile the router until every procedure in
  `platformOperationsContract` had an implementation.

### 17.6 Left alone deliberately

- **`ko/platform.json` is over its size budget** — 16,203 bytes against a 15,360
  ceiling, failing at `HEAD` before this work and now 77 bytes worse for two nav
  labels the rail genuinely needs. The fix that test asks for is splitting the
  namespace, which is its own change and touches every console page.
- **`docs/operations/deployment-guide.local.md`** still needs its
  `REGRADE_CONCURRENCY` row. It is untracked and machine-local, so it was not
  edited here.
