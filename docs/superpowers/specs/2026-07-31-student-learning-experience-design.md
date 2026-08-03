# Student Learning Experience Design

**Date:** 2026-07-31

**Revised:** 2026-07-31 — target scale corrected from 100,000 to 10,000 total
users (§17). Reconciled with the built implementation after Phases 0, A, and B
landed; §14 records status, deviations, and outstanding gaps per phase.

**Status:** Phases 0, A, B, C complete and verified (200 unit tests, 13 E2E).
Phase D — hardening and production observability — remains.

**Branch:** `feat/cove-studio-v2`

**Companion:** `docs/design/2026-07-31-student-problem-solving-scale-design.md`
holds the reasoning and the growth thresholds. This spec is what gets built.

**Migrates from:** v1 `main` — `src/app/(student)/problems/*`,
`src/app/(fullscreen)/problems/[problemId]/*`, `src/lib/judge/*`

## 1. Purpose

Give a Student a place to find published problems, solve them, and get a trusted
verdict — built on the v2 content model, inside the v2 studio shell.

The platform is sized for **10,000 total users** (teachers and students),
roughly 1,000–1,500 concurrent at peak class hours. That number shapes every
decision here; §17 records what was removed when it was corrected downward.

### 1.1 In scope

- Student course catalog and course outline.
- Fullscreen problem workspace: statement, Monaco, terminal, sample runner.
- Browser Python execution via the existing Pyodide worker.
- Local-first drafts.
- **Server-side grading** on BullMQ with live per-case progress over SSE.
- Per-exercise progress.

Grading is included rather than deferred. Read path plus local run is not a
usable product for a student — there is no way to complete anything. The three
build phases are sequenced so grading is reachable, not so it is optional.

### 1.2 Out of scope

| Deferred | Reason |
|---|---|
| Classes, sections, enrollment | Unmodelled; §3 scopes by membership instead |
| Live teacher monitoring, collaboration | Its own design |
| AI hints and AI feedback | Its own design — but see §8.7, the job plumbing is shared |
| Excel curriculum import | Content spec Phase B — also a §8.7 consumer |
| Course/class analytics rollups | Needs enrollment first |
| Languages other than Python | `ExecutionEngine` interface keeps the door open |

## 2. Non-destructive rule

The v1 student pages and API handlers keep working and keep their routes. No v1
route, handler, or table is modified or removed here. Removal is a separate
change once v2 passes acceptance.

The v1 copy inside `packages/web` predates `main` — it lacks the judge,
curriculum-navigator, and problem-navigation work. **Read v1 behaviour from
`main`, not from `packages/web`.**

## 3. Scoping without enrollment

There is no `Class` or `Enrollment` model yet. Until there is:

> A user sees the published content of every course in an academy where they
> hold an **ACTIVE membership**, regardless of role.

This uses `curriculum.read`, which every role holds, so Team Leads and Managers
can walk the student experience of their own curriculum. When enrollment lands
it narrows the same query in one service method — no contract changes.

## 4. Navigation and shell

The student area **reuses the studio shell verbatim**: same sidebar, academy
switcher, header, collapse behaviour, language switcher, sign-out. A student's
Cove looks like a Manager's Cove with different sidebar groups.

### 4.1 Routes

```text
/studio/academies/[academyId]/learn/courses                   Catalog     StudioShell
/studio/academies/[academyId]/learn/courses/[courseId]        Outline     StudioShell
/studio/academies/[academyId]/learn/exercises/[materialId]    Workspace   fullscreen
```

`(v2-studio)` has no `layout.tsx` — pages opt into `StudioShell` themselves. The
workspace simply does not render it and is fullscreen with no extra machinery.

### 4.2 Sidebar group

Add one group to `studioNavGroups()` in `_components/studio-sidebar.tsx`:

```ts
if (canLearn) {
  groups.push({
    id: 'learning',
    labelKey: 'group.learning',
    items: [
      { href: `${base}/learn/courses`, labelKey: 'link.my_courses', icon: GraduationCap },
    ],
  });
}
```

Add to `lib/academy-access-state.ts`, beside the existing helpers:

```ts
export function canLearn(role: AcademyRole | null | undefined): boolean {
  return role ? roleHasPermission(role, 'curriculum.read') : false;
}
```

Every role holds `curriculum.read`, so the group always renders. A STUDENT holds
neither `academy.members.manage` nor `curriculum.review`, so the existing gates
already hide People and Content — a Student sees **Overview + Learning** with no
role special-casing anywhere. Ordered after Overview, before Content.

### 4.3 Landing

`authDestination()` sends a STUDENT to `/studio/academies/{id}/learn/courses`;
other roles keep the overview. `/studio/academies/[academyId]/page.tsx` redirects
a STUDENT to the same place so a bookmark does not strand them.

## 5. Data model

### 5.1 New Prisma models

```prisma
enum SubmissionStatus {
  QUEUED
  RUNNING
  PASSED
  FAILED
  ERRORED        // judge fault — never counted against the student
  CANCELLED
}

enum CaseOutcome {
  PASSED
  WRONG_OUTPUT
  RUNTIME_ERROR
  TIME_LIMIT
  MEMORY_LIMIT
  SKIPPED        // after early exit
}

enum ExerciseProgressStatus {
  NOT_STARTED
  IN_PROGRESS
  SOLVED
}

model ExerciseDraft {
  id         String   @id @default(uuid()) @db.Uuid
  userId     String   @map("user_id") @db.Uuid
  materialId String   @map("material_id") @db.Uuid
  code       String
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt  DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  material Material @relation(fields: [materialId], references: [id], onDelete: Cascade)

  @@unique([userId, materialId])
  @@index([userId, updatedAt(sort: Desc)])
  @@map("exercise_drafts")
}

model Submission {
  id              String           @id @default(uuid()) @db.Uuid
  userId          String           @map("user_id") @db.Uuid
  materialId      String           @map("material_id") @db.Uuid
  courseVersionId String           @map("course_version_id") @db.Uuid
  code            String
  status          SubmissionStatus @default(QUEUED)
  passedCount     Int              @default(0) @map("passed_count")
  totalCount      Int              @map("total_count")
  runtimeMs       Int?             @map("runtime_ms")
  engineVersion   String           @map("engine_version")
  failureReason   String?          @map("failure_reason")
  startedAt       DateTime?        @map("started_at") @db.Timestamptz(6)
  gradedAt        DateTime?        @map("graded_at") @db.Timestamptz(6)
  createdAt       DateTime         @default(now()) @map("created_at") @db.Timestamptz(6)

  user     User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  material Material         @relation(fields: [materialId], references: [id], onDelete: Restrict)
  cases    SubmissionCase[]

  @@index([userId, materialId, createdAt(sort: Desc)])
  @@index([status, createdAt])
  @@map("submissions")
}

model SubmissionCase {
  id           String      @id @default(uuid()) @db.Uuid
  submissionId String      @map("submission_id") @db.Uuid
  position     Int
  isSample     Boolean     @map("is_sample")
  outcome      CaseOutcome
  runtimeMs    Int?        @map("runtime_ms")
  /// Only ever populated for SAMPLE cases. Hidden cases record an outcome and
  /// nothing else — see §7.3.
  actualOutput String?     @map("actual_output")

  submission Submission @relation(fields: [submissionId], references: [id], onDelete: Cascade)

  @@unique([submissionId, position])
  @@map("submission_cases")
}

model StudentExerciseProgress {
  id            String                 @id @default(uuid()) @db.Uuid
  userId        String                 @map("user_id") @db.Uuid
  materialId    String                 @map("material_id") @db.Uuid
  status        ExerciseProgressStatus @default(NOT_STARTED)
  attemptCount  Int                    @default(0) @map("attempt_count")
  bestPassed    Int                    @default(0) @map("best_passed")
  firstSolvedAt DateTime?              @map("first_solved_at") @db.Timestamptz(6)
  lastAttemptAt DateTime?              @map("last_attempt_at") @db.Timestamptz(6)

  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  material Material @relation(fields: [materialId], references: [id], onDelete: Cascade)

  @@unique([userId, materialId])
  @@index([userId, status])
  @@map("student_exercise_progress")
}
```

Add inverse relations to `User` and `Material`.

### 5.2 One in-flight submission per problem

```sql
CREATE UNIQUE INDEX submissions_one_active_per_user_material
  ON submissions (user_id, material_id)
  WHERE status IN ('QUEUED', 'RUNNING');
```

A database constraint, not a read-then-write check. v1 learned this as
`SUBMISSION_ALREADY_JUDGING` after the fact.

### 5.3 Progress is written, never aggregated on read

`StudentExerciseProgress` is updated in the same transaction as the submission
result. v1's teacher progress endpoint scans all submissions and aggregates in
JavaScript per request; it is already slow and must not be reproduced.

### 5.4 Migrations

Two migrations: `..._student_drafts` (Phase B) and `..._student_grading`
(Phase C). Both are additive and safe to apply to a database serving the studio.

## 6. Reads: normalized, cached by version id

A `PUBLISHED` `CourseVersion` is immutable — enforced by
`COURSE_VERSION_IMMUTABLE`. Editing produces a new version with a new id, so
anything keyed by `versionId` **cannot go stale**.

The read path therefore queries the normalized tables directly and caches the
result keyed by version id, using Next.js RSC caching and HTTP cache headers. No
materialized payload table.

> **Removed in revision.** The first draft specified publish-time materialization
> into a `PublishedPayload` table. At 10,000 users the read volume does not
> justify a second source of truth, a backfill command, and the drift risk it
> carries. The immutability that made materialization safe makes plain caching
> equally safe. The scale design records the threshold at which to revisit.

Visibility filtering — `isPublished` on `CourseModule`, `Lecture`, `Material` —
is applied in one place: a shared `publishedVersionInclude` Prisma fragment used
by every `learn.*` read. It is never re-derived per call site.

## 7. Contracts

New `learn` namespace: `packages/shared/src/api/orpc/learn.contract.ts`, schemas
in `packages/shared/src/content/learn.ts`.

```ts
learn.listCourses         ({ academyId })                       -> { courses: LearnCourseSummary[] }
learn.getCourseOutline    ({ academyId, courseId })             -> LearnCourseOutline
learn.getExerciseWorkspace({ academyId, materialId })           -> LearnExerciseWorkspace
learn.listDrafts          ({ academyId })                       -> { drafts: LearnDraftSummary[] }
learn.saveDraft           ({ academyId, materialId, code })     -> { updatedAt }
learn.discardDraft        ({ academyId, materialId })           -> { discarded: boolean }
learn.submit              ({ academyId, materialId, code })     -> { submissionId, totalCount }
learn.getSubmission       ({ academyId, submissionId })         -> LearnSubmissionResult
learn.listSubmissions     ({ academyId, materialId })           -> { submissions: LearnSubmissionSummary[] }
```

Result delivery is SSE and sits outside oRPC — see §8.5.

Key shapes:

```ts
LearnExerciseWorkspace = {
  breadcrumb: { course, module, lecture },
  exercise: {
    materialId, courseVersionId, title, difficulty, language,
    description, inputFormat, outputFormat, constraints,
    starterCode, timeLimitMs, memoryLimitMb,
    sampleTestCases: [{ position, input, expectedOutput }],
    hints: [{ position, content }],
    hiddenTestCaseCount: number,          // a count, never the cases
  },
  neighbors: { previous: LearnExerciseRef | null, next: LearnExerciseRef | null },
  draft: { code, updatedAt } | null,
  progress: { status, attemptCount, bestPassed },
}

LearnSubmissionResult = {
  submissionId, status, passedCount, totalCount, runtimeMs, gradedAt,
  cases: [{ position, isSample, outcome, runtimeMs,
            input?, expectedOutput?, actualOutput? }],   // sample cases only
}
```

### 7.1 One call to open a problem

`getExerciseWorkspace` returns statement, breadcrumb, neighbours, draft, and
progress in one response. v1 needs four requests.

### 7.2 New error codes

| Code | Meaning |
|---|---|
| `COURSE_NOT_PUBLISHED` | The course has no published version |
| `EXERCISE_NOT_AVAILABLE` | Material unpublished, or not in a published version |
| `DRAFT_TOO_LARGE` | Draft code exceeds the cap |
| `SUBMISSION_IN_FLIGHT` | One already queued or running for this problem |
| `SUBMISSION_RATE_LIMITED` | Too many submissions in the window |
| `SUBMISSION_NOT_FOUND` | Unknown, or belongs to another user |

### 7.3 Hidden test cases never leave the server

Three independent barriers:

1. **Read path** — `learn.*` output schemas have no field capable of carrying a
   hidden case's `input` or `expectedOutput`. Only `hiddenTestCaseCount`.
2. **Result path** — `SubmissionCase.actualOutput` is populated only when
   `isSample` is true. A failing hidden case reports an outcome and a position,
   never a diff. Otherwise a student can reconstruct hidden expectations by
   submitting probes.
3. **Worker path** — hidden cases are loaded by the judge worker directly from
   Postgres and never enter an API response object.

§12.3 tests this invariant directly. It outranks every other test here.

## 8. Grading

Built on the BullMQ patterns already running in `docquery`, ported to NestJS
idioms.

### 8.1 One job per submission

```text
learn.submit
  ├─ Redis token-bucket rate limit
  ├─ INSERT submission (QUEUED)                 durable before enqueue
  └─ queue.add('grade', { submissionId }, { jobId: submissionId })

judge worker
  ├─ claim: UPDATE ... SET status=RUNNING WHERE status=QUEUED
  ├─ load exercise + all test cases from Postgres
  ├─ execute in order, early exit on first failure
  ├─ job.updateProgress({ position, of, outcome })      → live per-case progress
  ├─ ONE transaction: submission + cases + progress
  └─ job completes                                       → QueueEvents → SSE
```

v1 fans out N Judge0 submissions with N callback tokens and reassembles partial
results — the reason `finalize.ts`, `reconciliationPolicy.ts`, and the token
binding exist. One job per submission deletes all of it.

**Early exit** stops at the first failed case. Most failing submissions fail on
case 1. Remaining cases are recorded `SKIPPED`. A per-exercise flag can opt out
if partial scoring is ever wanted.

### 8.2 Idempotency

- `jobId: submissionId` — BullMQ deduplicates enqueues.
- The claim is a conditional UPDATE; a duplicate delivery finds nothing to claim.
- The result write is guarded `WHERE status = 'RUNNING'`.
- `UnrecoverableError` for malformed input, so it does not retry — same as
  `appcallWorker`.
- A sweeper repeatable job re-enqueues submissions left `QUEUED` past a
  threshold, and marks `RUNNING` rows stale past a longer one as `ERRORED`.
- `ERRORED` never increments `attemptCount`. A judge fault is not a student's
  wrong answer — v1 gets this right and it must survive.

### 8.3 Execution engine

```ts
interface ExecutionEngine {
  readonly version: string;
  run(input: { code: string; stdin: string; timeLimitMs: number; memoryLimitMb: number })
    : Promise<{ stdout: string; stderr: string; outcome: CaseOutcome; runtimeMs: number }>;
}
```

Initial implementation: **Pyodide inside the judge worker.**

- WebAssembly is a real boundary — no syscalls, no filesystem, memory-capped.
- It is the *same runtime the student just ran in their browser*, which removes
  the "Run passed, Submit failed" class of bug that v1 has structurally (browser
  Pyodide vs. Judge0 CPython).
- No process spawn per run.

Requirements:

- One Pyodide instance per Node `worker_thread`; reset globals between runs
  rather than reloading.
- Enforce the time limit with Pyodide's **interrupt buffer**, not a promise race
  — a busy loop never yields to the event loop.
- Cap stdout bytes; `while True: print(x)` must not exhaust memory.
- Pin the Pyodide version, share it with the browser (§9), and record it on the
  submission as `engineVersion`.

Swap to a container engine (nsjail/Firecracker) when a second language arrives.
The interface makes that contained.

### 8.4 NestJS equivalents of the docquery patterns

Confirmed against the working implementation in `packages/next/src` of the
`docquery` repository — `QueueStore`, `appcallWorker`, `createEventStream`, and
`app/api/job/[queue]/[jobId]/route.ts`. The architecture is proven in a sibling
project; only the framework idioms differ.

| docquery | Cove |
|---|---|
| `QueueStore.getInstance()` singleton | `@nestjs/bullmq` — `BullModule.registerQueue()`, `@InjectQueue()` |
| Worker in the Next.js instrumentation hook | **Separate `packages/judge-worker` process** — see §8.6 |
| `createEventStream()` returning `ReadableStream` | `@Sse()` returning an `Observable` — Nest handles SSE framing |
| `/api/job/[queue]/[jobId]/route.ts` | Nest controller `GET /api/jobs/:queue/:jobId/stream` |
| `filterFn: data.ownerId === session.id` | Ownership check via `AcademyAccessService` |
| `job.updateProgress({ content })` | `job.updateProgress({ position, of, outcome })` |
| `UnrecoverableError` | Same |
| 15s keep-alive comment, `X-Accel-Buffering: no` | Same — both required |

`rxjs` is already a dependency of `packages/api`, so `@Sse()` needs no new
package.

### 8.5 Result delivery

```text
worker → job progress/completion → QueueEvents → Nest @Sse() → EventSource
```

- SSE, not WebSocket: one-directional, proxy-friendly, automatic reconnect.
- The connection opens on submit and closes on result. Concurrent connections
  track *submissions in flight* (tens), not concurrent students.
- Events: `progress` (per case), `result`, `error`.
- **The stream endpoint is a plain Nest controller, not an oRPC procedure.** SSE
  does not fit the oRPC contract model. Enqueue, fetch, and list stay in oRPC.
- Exactly one fallback: if no event arrives within 15s, call
  `learn.getSubmission` once. This covers a dropped connection without
  reintroducing v1's 400-iteration polling loop.

### 8.6 The worker is a separate process

`packages/judge-worker` is its own deployable from day one. docquery runs its
workers inside the Next.js process, which is fine for I/O-bound calls to Dify
and n8n; it is wrong here, because a runaway student program would pin an API
thread and degrade request serving.

Concurrency tracks core count, not the high per-worker concurrency docquery uses
for I/O-bound jobs.

### 8.7 Shared job plumbing

The queue module, the generic `/api/jobs/:queue/:jobId/stream` controller, and
the ownership filter live in a shared Nest module rather than inside the grading
feature — because there is a **known** second consumer, AI feedback, whose v1
implementation (`/api/ai-feedbacks`, `/api/hints`) is the same shape as
docquery's `appcallWorker`: call a provider, stream partial output, persist,
optionally chain. Excel curriculum import is a third.

Build it concretely for grading. Generalize when AI feedback lands, not before.

### 8.8 Redis

**One instance**, `maxmemory-policy noeviction`, AOF `everysec`. It holds BullMQ
jobs and the submit rate-limit bucket, nothing else.

> **Removed in revision.** The first draft specified two Redis instances and a
> draft write-behind buffer. The two-instance split exists to stop an LRU cache
> from evicting queue data; with no cache in Redis, there is nothing to split.
> §9 explains why the draft buffer went away.

**Provisioned** as `cove-redis` in `docker-compose.dev.yml`, on port **6380**.

Deliberately not the Redis already running on 6379: that one belongs to a
neighbouring project's production compose stack. Sharing it would mean a shared
keyspace, a shared memory budget, and a shared restart — a `docker compose down`
in the other project would drop Cove's queued submissions. It also sets no
`maxmemory` and no policy, so its correct `noeviction` behaviour is Redis's
default rather than a decision.

Environment additions to `apiEnvironmentSchema`:

```
REDIS_URL                 redis://:PASSWORD@127.0.0.1:6380   (rediss:// in production)
JUDGE_CONCURRENCY         default 4 — CPU-bound, so track core count
PYODIDE_VERSION           pinned, shared with the web package
SUBMISSION_RATE_LIMIT     default 10 per minute
DRAFT_MAX_BYTES           default 262144
```

Production Redis must sit in **`ap-northeast-2`**, matching the Supabase
project. Cross-region latency on every enqueue and every result push would undo
most of what §6 buys.

### 8.9 Degradation

| Failure | Behaviour |
|---|---|
| Redis unreachable | `learn.submit` returns `SUBMISSION_RATE_LIMITED`-style retry guidance; reads, drafts, and local run keep working |
| Worker down | Submissions queue and drain on recovery; UI shows queued state |
| SSE dropped | The single 15s fallback fetch |
| Poison job | `UnrecoverableError` → no retry, submission marked `ERRORED`, alert |
| Worker OOM/crash mid-job | Sweeper marks it `ERRORED`; `attemptCount` untouched |

Reading and solving never break because grading is unavailable.

## 9. Drafts

### 9.1 Two tiers

```text
keystroke ──▶ IndexedDB                      instant, offline-safe, authoritative while typing
   5s idle │ blur │ route change │ visibilitychange (sendBeacon)
          ──▶ learn.saveDraft → Postgres     debounced upsert
```

v1 PATCHes on a 1s debounce plus a 10s safety interval. This removes the network
from the typing path entirely and cuts server writes by roughly an order of
magnitude.

> **Removed in revision.** The first draft routed drafts through a Redis
> write-behind buffer with a BullMQ flush job. That is justified at thousands of
> writes per second; at ~300–500/s a debounced upsert is an ordinary Postgres
> workload. The buffer, the dirty set, and the flush job are gone. IndexedDB
> stays — it costs nothing and is better UX.

### 9.2 Restore order

1. IndexedDB entry, if newer than the server's `updatedAt`
2. `draft.code` from `getExerciseWorkspace`
3. `exercise.starterCode`

A newer local entry means the last sync did not complete: the student's machine
wins and a sync is scheduled immediately.

### 9.3 On a passing submission

The draft is kept, not cleared. v1 nulls `final_code` on pass, which loses the
student's working solution. Keeping it also makes the catalog's continue-solving
list honest.

## 10. Browser execution

### 10.1 Reuse what exists

`packages/web` already carries the working stack: `lib/pyodide/interactiveRunner.ts`
(worker + `SharedArrayBuffer` for interactive `input()`), `lib/pyodide/loader.ts`
(main-thread fallback without cross-origin isolation), `public/pyodide-worker.js`,
and the COOP/COEP headers in `next.config.ts` and `public/_headers`.

Port from `main`, which has it and `packages/web` does not:
`lib/pyodide/sampleRun.ts` — input queue builder and whitespace-tolerant output
comparison — with its spec.

The runner's user-facing strings are Korean literals. New UI does not add to
them: the workspace maps runner events to translated copy and treats the
runner's own text as diagnostic detail.

### 10.2 Loading strategy

Pyodide is 13 MB: a 10.1 MB wasm, a 2.4 MB stdlib zip, a 1.3 MB asm.js. v1
begins loading on the **first Run click** — the worst possible moment.

| Change | Effect |
|---|---|
| `Cache-Control: immutable, max-age=31536000` on `/pyodide/*` and `/pyodide-worker.js` | Currently unset — `public/_headers` declares only COOP/COEP/CORP. First load pays once instead of every session |
| Confirm Brotli for `.wasm` at the CDN | ~10 MB → ~3 MB |
| Spawn the worker on workspace mount | Loads while the student reads the problem |
| `<link rel="prefetch">` from the outline | Warm before the workspace opens |
| Never block the editor on it | Monaco interactive first; Run shows a loading state |

### 10.3 Run stays local, Submit goes to the server

Run and Run-sample execute in the browser and are never sent to the server.
Sample verdicts are computed client-side against `sampleTestCases[].expectedOutput`,
which is public data, and are **never trusted for grading** — the server
re-runs every case including the samples.

## 11. UI

Existing design system throughout: tokens from `app/globals.css`, primitives
from `components/studio/`, `lucide-react` icons. No new colour values, no inline
hex. v1's student pages are built almost entirely from inline hex and hardcoded
Korean; none of that carries over.

New i18n namespace `learn`, loaded per-route with `PageTranslationsProvider`
rather than added to `layoutNamespaces`, so it does not ride in every studio
page's payload. `nav.group.learning` and `nav.link.my_courses` go in `nav`.

> Note: this makes `learn` the first user of `PageTranslationsProvider`, whose
> own comment says *"Nothing needs this yet."* Budget a little time to shake it
> out. Falling back to `layoutNamespaces` is acceptable if `learn` stays under
> the 15 KB per-namespace budget.

### 11.1 Catalog — `learn/courses`

Inside `StudioShell`.

- **Continue solving** — shown only when drafts exist. A `brand-soft` panel
  above the list, each row linking to its workspace with a discard action.
  Mirrors v1's `이어서 풀기` drawer, which is a good idea worth keeping.
- **Course cards** — responsive grid, `rounded-card border border-border bg-white`:
  title, description, `modules · lectures · problems`, solved/total progress bar,
  `ChevronRight`.
- **Empty state** when the academy has no published course.

> **Deliberate divergence:** Manager and Team Lead pages use `DataTable` because
> they manage many rows with filters and bulk actions. A student has one to five
> courses; a three-row table reads as broken. Cards use the same tokens, borders,
> and radii so the page still reads as one system. Every other surface follows
> the studio patterns exactly.

### 11.2 Outline — `learn/courses/[courseId]`

Inside `StudioShell`. Reuses the curriculum builder's visual language
(`module-card.tsx`, `lecture-row.tsx`) so a Team Lead sees draft and student
views rendered the same way.

- Modules as collapsible sections, first expanded.
- Lectures nested, each listing its exercises.
- Exercise row: position badge (monospace), title, difficulty pill using the
  studio's `EASY/MEDIUM/HARD` styles, status chip
  (`NOT_STARTED` / `IN_PROGRESS` / `SOLVED`).
- Client-side title filter over the loaded outline — no request needed.
- Deep link `?lecture={id}` expands and scrolls.

### 11.3 Workspace — `learn/exercises/[materialId]`

Fullscreen, no `StudioShell`.

```text
┌──────────────────────────────────────────────────────────────┐
│ ← Course · Module · Lecture   [Prev][Next]  difficulty  ⏱    │
├───────────────────────────┬──────────────────────────────────┤
│ Statement                 │ Monaco (python, paircode-dark)   │
│  description (iframe)     │                                  │
│  input / output format    │                                  │
│  constraints              ├──────────────────────────────────┤
│  sample cases             │ Terminal   [Run][Sample ▾][Submit]│
│  hints (progressive)      │  stdout / stderr / stdin prompt  │
└───────────────────────────┴──────────────────────────────────┘
```

- Authored HTML renders through `RichTextFrame`, the sandboxed iframe already
  used by the exercise preview. Student-facing HTML is injected no other way.
- Sample cases use the `ValueBlock` treatment from `preview-modal.tsx`.
- Hints reveal one at a time.
- Draft indicator: `Saved` / `Saving…` / `Saved locally`.
- **Submit result panel** driven by SSE: a per-case checklist filling in live
  (`✓ 1  ✓ 2  ✗ 3  · · ·`), then a summary. Sample failures show expected vs.
  actual; hidden failures show position and outcome only (§7.3).
- `hiddenTestCaseCount` is shown so the student knows samples are not the whole
  test.
- Previous/Next swap the Monaco **model**, not the component, and do not change
  route — `history.pushState` only. Neighbour payloads prefetched on idle.
- Mobile: statement and editor become tabs below `md`.

### 11.4 Component layout

```text
learn/
├── courses/
│   ├── page.tsx
│   ├── _components/{course-catalog,course-card,continue-panel}.tsx
│   └── _hooks/use-course-catalog.ts
├── courses/[courseId]/
│   ├── page.tsx
│   ├── _components/{course-outline,module-section,exercise-row}.tsx
│   └── _hooks/use-course-outline.ts
└── exercises/[materialId]/
    ├── page.tsx
    ├── _components/{workspace,workspace-header,problem-statement,
    │                code-editor,terminal-panel,run-controls}.tsx     built
    │               +{submit-panel,exercise-timer}.tsx                Phase C
    ├── _hooks/{use-python-runner,use-draft-autosave,use-split-pane}.ts   built
    │          +{use-submission}.ts                                   Phase C
    └── _lib/{sample-run,draft-store}.ts + specs                      built
              +{submission-progress}.ts + spec                        Phase C
```

Naming settled during Phase B: `run-controls` rather than `sample-runner`, since
it owns Run, Run-sample, and Stop together. Hints render inside
`problem-statement` rather than a `hint-list`, and terminal-line formatting sits
in `use-python-runner` rather than a `terminal-lines` module — neither had
enough logic to earn a file. Exercise navigation lives in `workspace` because it
is coupled to the draft flush and runner teardown that must precede it.

No file over ~250 lines. Pure logic — output comparison, input queueing,
neighbour resolution, restore-order selection — lives in `_lib` with a spec
beside it. v1's equivalent is a single 1,902-line component.

**`workspace.tsx` is currently 310 lines**, over the ceiling since the in-place
swap landed. Phase C must not add the submit panel on top of it: extract
`use-exercise-navigation` (swap, prefetch, popstate) first, which returns it to
budget and gives `use-submission` a clean place to sit beside.

## 12. Testing

### 12.1 Shared

Schema acceptance and rejection. Restore-order selection. Sample output
comparison including trailing-whitespace and trailing-newline tolerance.
Neighbour resolution across module and lecture boundaries.

### 12.2 API

Academy isolation. Inactive and suspended membership rejection. Unpublished
module/lecture/material exclusion. Draft ownership and size cap. One-in-flight
constraint. Rate limiting. `ERRORED` does not increment `attemptCount`. Progress
transitions. Submission ownership on fetch and stream.

### 12.3 The invariant test

> No `learn.*` response, and no SSE event, for any input, contains the `input` or
> `expectedOutput` of a test case whose `visibility` is `HIDDEN`.

Seed an exercise whose hidden cases carry a unique sentinel string, exercise
every `learn.*` procedure and the stream, and assert the sentinel appears in no
serialised output. This test outranks every other test in this spec.

### 12.4 Worker

Early exit records `SKIPPED`. Timeout produces `TIME_LIMIT`, not a hang —
including for a busy loop with no I/O. Stdout cap. Globals do not leak between
runs in the same Pyodide instance. Duplicate job delivery does not double-write.
Crash mid-job leaves a sweepable row.

### 12.5 Web

Catalog loading, empty, error states. Outline expand and filter. Draft restore
precedence. Autosave debounce and flush on navigation. Runner states including
the non-cross-origin-isolated fallback. Submit progress rendering. SSE drop →
fallback fetch.

### 12.6 Performance

Query-count assertion on `getExerciseWorkspace`: at most three Postgres queries.
This catches an N+1 introduced by a future `include`.

| Interaction | p75 | p95 |
|---|---|---|
| Outline loads | 300ms | 800ms |
| Workspace interactive | 500ms | 1.2s |
| Editor ready to type | 800ms | 1.5s |
| Pyodide ready, warm cache | 300ms | 800ms |
| Sample run completes | 200ms | 600ms |
| Submit → first case event | 500ms | 1.5s |
| Submit → final verdict | 2s | 5s |
| Draft never blocks typing | 0ms | 16ms |

## 13. Observability

- An OpenTelemetry span per `learn.*` procedure and per grading job.
- Counters: submissions by status, queue depth, job duration, early-exit rate,
  SSE fallback rate, draft sync rate.
- Client metrics: time-to-editor-interactive, time-to-Pyodide-ready.
- Alerts on **queue depth, `ERRORED` rate, and p99 job duration** — not CPU.

Without the client metrics there is no way to know whether §10.2 worked.

## 14. Implementation phases

### Phase 0 — Foundations — **done** (`a3db970`, `10d5ac5`)

GitHub Actions on every PR: typecheck, lint, test, Prisma drift check, build.
Immutable cache headers on `/pyodide/*` and the worker.

**Deviation:** lint is scoped to v2 code. All 27 pre-existing errors sat in
vendored Pyodide output and in the frozen v1 surface, where the migration rule
means they can never be acted on. Both ignore blocks are deleted with v1.

**Not done:** OpenTelemetry and Sentry. §13's observability is still absent, and
none of §12.6's budgets are enforced. Carried into Phase D.

### Phase A — Read path — **done** (`9fe9576`, `1bbb21c`, `771d7ff`, `db89194`)

**Deviation:** `learn` sits in `layoutNamespaces` rather than behind
`PageTranslationsProvider`. English totals 25 KB of the 50 KB budget, and the
page provider still has no users — being its first would mean debugging it for
no gain. Revisit if the namespace grows.

### Phase B — Workspace and local execution — **done** (`2ff4de5`, `db55cdd`)

Two defects were found and fixed after the fact, both worth recording because
they are the kind that survive review:

- Previous/Next used `router.push`, which re-renders the server page and
  remounts the workspace — tearing down the Pyodide worker and reloading the
  runtime on every click. Measured at ~1,000ms against ~60ms for the in-place
  swap §11.3 always specified. Now guarded by a 300ms E2E budget.
- The terminal divider never resized anything: its container ref was never
  attached, so every pointer move returned early. Now guarded by an E2E drag.

**Outstanding from Phase B**, tracked rather than silently dropped:

| Gap | Spec reference |
|---|---|
| Query-count assertion on `getExerciseWorkspace` | §12.6 |
| "Typing issues no network request" test | §15.10 |
| `workspace.tsx` is 310 lines against the ~250 ceiling | §11.4 |
| Header timer | §11.3 — moved to Phase C, since §5.2 of the scale design puts elapsed time on the server |

### Phase C — Grading — **done**

Submission, case, and progress models. Redis and `@nestjs/bullmq`.
`packages/judge-worker` with the Pyodide `ExecutionEngine`. `learn.submit`, the
SSE controller, the sweeper. Submit panel with live per-case progress.

Phase C completes the product loop. A student can find a problem, solve it, and
be told whether they are right.

**Verified:** Redis token-bucket limiting, durable BullMQ enqueue, a separately
deployable `packages/judge-worker`, worker-thread Pyodide runtimes with shared
interrupt buffers, early exit, output caps, duplicate-delivery protection,
queued/running recovery, ownership-gated SSE, the hidden-case sentinel
invariant, the one-shot SSE fallback, and the live submit panel. The full
grading journey passes against Postgres, Redis, Pyodide, and Chromium.

### Phase D — Hardening

Volume seed (10k users, realistic content). k6 load tests for catalog, outline,
workspace open, draft sync, and submit. Playwright journey. Query-count and
bundle budgets wired into CI.

## 15. Acceptance criteria

1. V1 student routes and APIs continue to work unchanged.
2. A Student signing in lands on their catalog and sees only Overview and
   Learning in the sidebar, with no role special-casing in the sidebar code.
3. Shell, sidebar, academy switcher, and header are the same components Manager
   and Team Lead use.
4. Unpublished modules, lectures, and materials are absent from every student
   response.
5. A course with no published version does not appear in the catalog.
6. The §12.3 invariant test passes for both responses and SSE events.
7. A student in Academy A cannot read Academy B content or submissions.
8. Opening a problem issues one API call and at most three Postgres queries.
9. Typing issues no network request.
10. Closing the tab mid-edit and reopening restores the code.
11. A second submit while one is in flight is rejected by the database
    constraint, not only by application code.
12. A submission whose worker crashes is swept to `ERRORED` and does not count
    as an attempt.
13. An infinite loop in student code yields `TIME_LIMIT` within the configured
    limit and does not degrade the API.
14. A failing hidden case reveals position and outcome only — never a diff.
15. Result appears without polling; the fallback fetch fires at most once.
16. Sample runs execute entirely in the browser.
17. Previous/Next does not remount the editor or change route.
18. No user-visible string is hardcoded.
19. All budgets in §12.6 are met on a mid-tier laptop over throttled 4G.

## 16. Open questions

1. `authDestination` keys off active membership only. If a user holds STUDENT in
   one academy and TEACHER in another, which lands first? Proposal: most
   recently active, falling back to the first.
2. Draft retention — indefinite, or expired after N months of inactivity?
3. Submission retention — how long is full `code` kept? Decides whether a
   separate `submission_code` table is needed before launch or later.
4. Managed Redis provider and region relative to Supabase.
5. Should a Team Lead previewing the student view get a "you are previewing"
   affordance, or is the shared route enough?

## 17. Revision log

**2026-07-31 — scale corrected to 10,000 total users.**

| Change | Reason |
|---|---|
| Removed `PublishedPayload` and publish-time materialization | Read volume does not justify a second source of truth, a backfill command, and drift risk. Immutable version ids make plain caching equally safe |
| Removed the Redis draft write-behind buffer and flush job | ~300–500 writes/s is an ordinary Postgres workload; the buffer is justified at thousands/s |
| Two Redis instances → one | The split existed to keep an LRU cache from evicting queue data; with no cache in Redis there is nothing to split |
| Grading moved from "separate spec, later" into Phase C | Read path plus local run is not a usable student product. Removing materialization made Phase A small enough for grading to be reachable |
| Added §8.4 NestJS mappings for the `docquery` BullMQ patterns | The queue-plus-progress-plus-SSE architecture is already proven in a sibling project; porting a known pattern is lower risk than deriving one |

**What survives the correction:** BullMQ for grading — justified at any scale by
isolation, retry, and backpressure rather than throughput, since untrusted Python
must not execute in an API request handler. Also SSE delivery, the separate
worker process, local-first drafts, and the §7.3 test-case barriers.
