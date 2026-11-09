# Official solution check

Date: 2026-11-09. Status: implemented and tested on `feat/solution-check`
(branched from `feat/cove-studio-v2`). Parked: the owner decided on
2026-11-09 not to merge or deploy it for now.

## User direction

Imported problems reach students with broken test data, and nobody notices
until students report "Runtime error" on correct code. The owner asked Cove to
**run each problem's official solution against its test cases automatically
whenever the problem is saved or imported**, and to **warn staff, not block
saving or publishing**, when a case fails. The owner chose the background-job
approach (below) over reusing staff practice or checking inside the save
request.

## Evidence: 탑

Material `c71fc00f-247d-4e27-803c-2ec939621d75` ("[도전 기출문제] 탑",
`dlab-mapo`), imported 2026-09-11. Cases 8 and 9 are stored cut at exactly
50,000 characters ([QA record](../../qa/2026-10-06-grading-deadlines.md)):

| Case | Declared N | Stored heights | Stored input |
| --- | ---: | ---: | ---: |
| 8 | 10,000 | 5,623 | 50,000 characters |
| 9 | 500,000 | 5,626 | 50,000 characters |

Every correct `input()`-based program raises `IndexError` on both cases, on the
Pyodide grader and on the native grader alike. The same program passes on
Elice, which keeps big cases as grader files. 50,000 is both Google Sheets' cell
limit and Elice's case-box limit. Cove's import and editor never cut text (they
refuse over 8 Mi characters). The saved official solution fails these two
cases too, so this check would have flagged the problem on the day it was
imported.

## What staff see

**Problem editor.** An "Official solution check" card under the solutions
editor shows one state:

| State | Shown |
| --- | --- |
| Queued / running | "Checking with the official solution…" |
| Passed | "All 9 cases passed with 2 solutions." Slowest case: time / limit. |
| Failed | One row per failing case: case number, Sample/Hidden, outcome, the error line (`IndexError: list index out of range`, line 11) and a hint. |
| No solution | "No official solution saved, so this problem can't be checked." |
| Not checkable | Quiz problems, problems without test cases, or an unsupported grading profile. |
| Error | "The check couldn't run (grader unavailable)." |
| Not checked yet | Problems saved before this feature. |

Every state except "Queued / running" has a **Run check again** button.

**Hints on a failed case.**
- When the case's input or expected output is **exactly 32,767 or 50,000
  characters**: "This test data is exactly 50,000 characters. A spreadsheet
  probably cut it. Paste the full data in Edit."
- Time limit: "The official solution is slower than this case's limit."
- Wrong answer: "The expected output may be wrong, or the solution is."

**Course content list.** A problem whose latest check failed shows a red
warning icon with the tooltip "Official solution fails case 8". A queued or
running check shows a small spinner, since saving returns the editor to this
list. Other states show nothing.

**Import result.** One line: "Imported problems are being checked with their
official solutions. Failures appear as warnings in the course."

Only staff with `exercises.manage` (the people who can edit problems) see
results; students never do. Saving and publishing are never blocked.

## When a check runs

A check is queued, inside the same transaction as the write, when:

1. a programming exercise is **created** (`CourseService.createExercise`);
2. an exercise is **updated** and its `gradingRevision` changed or its
   solutions changed (`updateExercise`);
3. an **import** commit creates or updates an exercise (`ContentImportService.commit`);
4. staff press **Run check again** (`exercises.manage`, the permission
   `requireExerciseManager` already checks for editing).

Edits that change neither (statement text, title, hints, visibility) queue
nothing, so the last result stays valid. Library course copies and existing
problems get no automatic check; they show "Not checked yet" with the button.

"Solutions changed" compares a **solutions digest**: SHA-256 over the ordered
solution codes. Solutions are replaced on every save
(`replaceExerciseSolutions`) without bumping `gradingRevision`, so the digest
is what detects a new solution.

## Approach

A dedicated background job, following the existing sample-check and regrade
pattern.

Rejected:
- **Reuse staff practice**: pollutes the saving person's practice history and
  "last submit score", hits the 10-per-minute submission rate limit during an
  import, and stores a full case snapshot (up to 16 Mi characters) per run.
- **Check inside the save**: save would wait seconds to minutes and fail
  whenever the grader is busy or down.

## Data

One row per exercise holds its latest check, no history:

```prisma
model ExerciseSolutionCheck {
  materialId               String   @id @map("material_id") @db.Uuid
  checkId                  String   @map("check_id") @db.Uuid  // new per queued check
  gradingRevision          Int      @map("grading_revision")
  solutionsDigest          String   @map("solutions_digest")
  status                   SolutionCheckStatus
  engineVersion            String   @map("engine_version")    // Pyodide version when queued
  executionQueue           String?  @map("execution_queue")
  executionRuntimeSnapshot Json?    @map("execution_runtime_snapshot")
  result                   Json?    // per solution, per case; see below
  queuedAt                 DateTime @map("queued_at")
  startedAt                DateTime? @map("started_at")
  finishedAt               DateTime? @map("finished_at")
  exercise ProgrammingExercise @relation(fields: [materialId], references: [materialId], onDelete: Cascade)
  @@map("exercise_solution_checks")
}

enum SolutionCheckStatus { QUEUED RUNNING PASSED FAILED NO_SOLUTION NOT_CHECKABLE ERRORED }
```

Queuing a check **upserts** this row with a fresh `checkId`. A job carries the
`checkId` it was queued for; a job whose `checkId` is no longer the row's is
stale and exits without work. A burst of saves therefore runs only the last.

`result` (validated by a shared zod schema, never sent to students):

```ts
{ version: 1, failureReason: string | null,          // set when nothing could run
  solutions: [{ index, title, passed, stoppedBy,       // stoppedBy: why grading ended early
    cases: [{ position, isSample, outcome, runtimeMs, limitMs,
              error: { type, message, line } | null,   // message ≤ 200 chars
              cutSuspected: boolean }] }] }
```

There are no test inputs, expected outputs or program outputs in it.
`cutSuspected` is computed when the job runs, from the stored case lengths.
At most 10 solutions × 50 cases stay small.

## Running a check

New queue `cove-solution-checks` (work kind `check`) alongside `official`,
`practice`, `sample` and `regrade` (`judge.queue.ts`: queue,
`enqueueSolutionChecks`, `createSolutionCheckWorker`, diagnostics, telemetry
kind `check`):

- **Admission.** `NativeAdmission.select` with the new kind
  `"solution-check"` (`nativeAdmissionKindSchema`, kinds max 4 → 5), context
  `"preview"`. The descriptor is frozen on the row, as practice does. Add the
  kind to `NATIVE_ELIGIBILITY` in `deploy/compose.production.yml`. Without
  native, the Pyodide judge-worker runs it.
- **Workers.** `judge.main.ts` and `native-worker.ts` each register a worker
  through `capacity.runBackground` / the native background slot, the same
  priority as practice and regrade, so student submissions always go first.
- **Runner** (`solution-check.runner.ts`): claim `QUEUED → RUNNING` for the
  job's `checkId`. Load the exercise with cases and solutions, and settle as
  stale if `gradingRevision` or the digest moved. No solutions →
  `NO_SOLUTION`; quiz, no cases or `resolveGradingProfile(...).kind ===
  "unsupported"` → `NOT_CHECKABLE`. Otherwise build the snapshot with
  `gradingSnapshotFor` (exactly the grading a student gets: time scale, limits,
  comparator, total budget) and run each solution through
  `GradingService.execute` with a sink that writes nothing for any person.
  `PASSED` only if every solution passes every case. A wrong, crashing or too
  slow case (including the whole-job budget, `TOTAL_DEADLINE`) is `FAILED`; a
  grader that could not run the program is `ERRORED`. Every write is guarded by
  `checkId`.
- **Error text.** `GradeSink` gains an optional `observe(position, run)` hook
  that receives each executed case's stderr. Case rows are unchanged, so a
  submission still never stores stderr. `summarizePythonError` keeps the last
  exception line and the line number of the last `main.py` frame (both graders
  compile learner code as `main.py`).
- **Recovery.** `RuntimeRecovery` treats checks as it treats practice
  attempts: a `QUEUED` check older than 30 s whose job is missing is queued
  again, a failed job is retried, and a `RUNNING` check with no active job
  after 60 s is settled `ERRORED`.
- **Enqueue after commit.** The upsert is inside the write transaction. The
  job is added after commit. If adding fails, the save still succeeds and
  recovery queues the job later. An import adds its jobs in one `addBulk`.

## API and web

- `academyCourses.getSolutionCheck({ academyId, courseId, materialId })`
  (`exercises.manage`): one statement, returns the row (status, revision
  match, `result`), or null before a first check.
- `academyCourses.runSolutionCheck(...)` (`exercises.manage`): upserts and
  enqueues.
- `academyCourses.listSolutionChecks({ academyId, courseId })`
  (`exercises.manage`): one statement; status and failing case numbers of
  every checked problem in the course.
- **Editor page** server render starts `getSolutionCheck` in the same
  `Promise.all` as `getExercise` / `getExerciseSolution` and passes it down.
  While the status is `QUEUED` or `RUNNING`, the card refetches every 5 s,
  only while the tab is visible, and stops at a final state. That's faster
  than the 15 s default because a staff member is waiting on a check that
  usually finishes in 1–10 s, it's one indexed read, and it runs only while a
  check is pending.
- **Content list.** The course page reads `listSolutionChecks` in the same
  `Promise.all` as `getOutline`. It is kept apart from the outline because
  every builder mutation replaces the tree; a separate read keeps the icons
  through reorders and adds nothing to the outline's statements. The same
  5 s refresh runs only while some check in the course is pending.
- **i18n.** A new `solution-check` namespace (en + ko) in `contentNamespaces`
  for the card, hints and tooltips; adding them to `content.json` put the
  Korean file over the 15 KiB namespace budget. The import line is in
  `content-import.json`.

## Database statements

| Path | Before | After |
| --- | --- | --- |
| `getOutline` | N | N (unchanged) |
| Course page server render | outline | + 1 `listSolutionChecks`, in parallel |
| Editor page server render | unchanged chain | + 1 `getSolutionCheck`, in parallel |
| Exercise save | unchanged | + 2: one definitions read, one upsert (+ 1 academy read when native grading is enabled) |
| Import commit | unchanged | the same + 2 (+ 1) for every imported problem together |
| Runner | none | claim, one exercise load (4 statements), settle |

Measured in `solution-check.integration.spec.ts`: deciding and writing four
checks costs 2 statements beyond the transaction, an unchanged re-check 1,
and `get` / `list` 1 each beyond the permission read.

Each is measured in an integration spec with Prisma query events against a
disposable Docker PostgreSQL (`COVE_INTEGRATION_DATABASE_URL`), as
`navigation-performance.integration.spec.ts` does.

## Tests

- **Runner unit tests:** passed, failed with error line, time limit,
  `cutSuspected` at exactly 32,767 / 50,000, stale `checkId` exits, revision or
  digest moved, no solution, quiz, unsupported profile, grader failure →
  `ERRORED`, several solutions.
- **Service:** create queues a check; an update that changes cases, limits or
  solutions queues; a text-only update does not; import queues for created and
  updated exercises; `runSolutionCheck` permission.
- **Integration (Docker Postgres):** the statement counts above; a real
  grading run of a cut 탑-shaped fixture ends `FAILED` with `IndexError` and
  `cutSuspected`.
- **Native:** the admission schema accepts the kind. The native worker's
  consumer is covered by type checks only; its Linux-only application spec was
  not run locally.
- **Web:** the card's states and polling stop; the lecture-row icon; the import
  result line.

## Delivery

Implement and test on `feat/solution-check`. Then merge into
`feat/cove-studio-v2`, release, deploy (the migration adds one table and one
enum; the compose change adds the eligibility kind). After deploy, open 탑,
press **Run check again**, and confirm it reports cases 8 and 9 with the
spreadsheet hint.

## Out of scope

- A course-wide scan of existing problems (not chosen; "Run check again" covers
  single problems).
- Uploading test-case files, and refusing exactly-50,000-character cells at
  import (separate changes).
- Blocking publication on a failed check.
- Notifications when a check finishes.
