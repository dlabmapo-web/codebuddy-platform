# Student Problem-Solving at Academy Scale

**Date:** 2026-07-31

**Branch:** `feat/cove-studio-v2`

**Status:** Proposed — traffic model revised 2026-07-31, see §2.0

**Supersedes for this subsystem:** the v1 grading flow in `main`
(`src/lib/judge/*`, `src/app/api/judge/callback/*`)

**Built as:** `docs/superpowers/specs/2026-07-31-student-learning-experience-design.md`

## 1. Purpose

Migrate the v1 student problems list and problem-solving page into v2 with an
architecture that holds as the platform grows, and decide exactly where Redis
and BullMQ belong.

This document holds the *reasoning* and the growth thresholds. The
implementation spec above holds what actually gets built.

This document covers three hot paths — reading a problem, saving work in
progress, and grading a submission — plus the delivery of results. Live teacher
monitoring and AI feedback are named only where they constrain a decision here;
each needs its own design.

## 2. Traffic model

### 2.0 Revision — actual target is 10,000 users

This document was first written against an assumed 100,000 registered students.
The real target is **10,000 total users**, teachers and students combined. The
architecture below was re-derived; §2.2 records which conclusions changed and at
what growth threshold each one comes back.

The *ratios* between the three paths hold at both scales and are what the
architecture responds to. Only the absolute numbers — and therefore which
optimizations are worth their complexity — differ.

### 2.1 Current target

| Quantity | At 10,000 users | At 100,000 (future) |
|---|---|---|
| Registered users | 10,000 | 100,000 |
| Peak concurrent | 1,000–1,500 | 5,000–15,000 |
| Statement/outline reads | 300–1,000 rps | 3,000–10,000 rps |
| Draft sync events (5s debounce) | 300–500 /s | 1,000–3,000 /s |
| Submissions | ~7 /s | 30–60 /s |
| Test-case executions | ~50–100 /s | 300–900 /s |
| Worker threads needed | ~5 (one small box) | 15–45 |
| Sample runs ("Run") | 20–60 /s | 100–300 /s — **browser-side, costs the server nothing** |

### 2.2 What the correction changed

| Recommendation | At 10,000 | Revisit when |
|---|---|---|
| BullMQ grading queue | **Keep** — justified by isolation, retry, and backpressure, not throughput | Never removed |
| Separate judge-worker process | **Keep** — untrusted code must not run in a request handler | Never removed |
| SSE result delivery | **Keep** — replaces polling at any scale | Never removed |
| Local-first drafts (IndexedDB) | **Keep** — free, and better UX | Never removed |
| Redis draft write-behind buffer (§4) | **Drop** — a debounced upsert handles 500 writes/s | Draft syncs exceed ~2,000/s |
| Publish-time materialization (§3.2) | **Drop** — plain caching by immutable version id suffices | Statement reads exceed ~3,000 rps, or cache miss rate is material |
| Two Redis instances (§8.1) | **Drop to one** — no cache in Redis means nothing to split | The moment anything cacheable lands in Redis |
| Submissions partitioned by month (§7) | **Defer** — ~1M rows/year, not 100M | Approaching ~10M rows |

The dropped items are not wrong; they are premature. Each is a local change when
its threshold arrives, which is the point of recording the thresholds.

Sections 3 through 12 below are written against the 100,000 case and remain the
reference for growth. Read them as *why*, and read the implementation spec for
*what*.

Three conclusions:

1. **Reads dominate by two orders of magnitude.** The statement read path must
   never touch a join. This is the highest-leverage optimization and it is not
   the judge.
2. **Draft writes are the sneaky killer.** v1 PATCHes the server on a 1s
   debounce. At 5,000 concurrent students that is ~5,000 writes/s of a large
   text column into Postgres — enough to saturate the database on its own,
   before a single submission is graded.
3. **Grading is the only genuinely CPU-bound path**, and it is the smallest of
   the three by request count. It is where BullMQ belongs; the other two need
   Redis but not a queue.

### 2.1 Keep run and submit separate

v1 already gets this right and it must survive the migration. "Run" and "Run
sample" execute in the browser's Pyodide worker. Only "Submit" reaches the
server. This is the difference between provisioning for ~600 executions/s and
provisioning for ~5,000. Never move sample execution server-side for
convenience.

The corollary is a correctness requirement covered in §5.4: the browser and the
server must run the *same* Python, or students will see "Run passes, Submit
fails" and lose trust in the grader.

## 3. Read path: publish-time materialization

### 3.1 The property to exploit

`CourseVersion` with status `PUBLISHED` is immutable by design — this is already
enforced in `course.service.ts` (`COURSE_VERSION_IMMUTABLE`). Editing a
published version creates a *new* version with a new id.

That single property means the student read path has **no cache invalidation
problem at all**. A cache keyed by `versionId` can never go stale, because
changing the content changes the key. Most caching designs spend their
complexity budget on invalidation; here it is free, and the architecture should
collect that dividend aggressively.

### 3.2 Materialize on publish, not on read

v1 rebuilt every problem page from a live 4-level join
(`subjects → stages → chapters → problems`) on every request. v2 should do that
work once, at publish time.

```text
publishVersion()
  ├─ validate (already implemented)
  ├─ freeze the version
  └─ fan out, in the publish transaction or a follow-up job:
       ├─ student outline payload   → one JSON per courseVersionId
       ├─ student exercise payload  → one JSON per materialId  (NO hidden cases)
       └─ grading payload           → one JSON per materialId  (hidden cases, server-only)
```

Three payload kinds, written to `published_payloads` in Postgres (the durable
record) and pushed into Redis (the read cache):

| Payload | Key | Contains | Reachable by |
|---|---|---|---|
| Outline | `outline:v{versionId}` | Published modules → lectures → exercises, titles, difficulty, positions | Student, teacher |
| Exercise | `ex:{materialId}` | Statement, formats, constraints, starter code, **sample cases only**, hints, limits | Student, teacher |
| Grading | `grade:{materialId}` | All test cases including hidden, limits | **Judge worker only** |

The grading payload lives on a key namespace the API layer never reads. The
student payload has no field that can carry a hidden expected output. Combined
with §7.1's contract-level separation, leaking hidden test data requires a
deliberate change in three places rather than one forgotten `select`.

### 3.3 Serving it

```text
Browser ──▶ Next.js RSC ──▶ Nest API ──▶ Redis ──▶ Postgres
            (cache: force-cache,  (L2 cache,     (cold miss only)
             keyed by versionId)   immutable)
```

- The exercise endpoint returns `Cache-Control: public, max-age=31536000, immutable`
  and a strong `ETag`. The URL contains the `versionId`, so this is safe.
  A student reopening a problem gets a browser cache hit — zero requests.
- Next.js RSC caches the render keyed by `versionId`. Same reasoning.
- Redis is the shared L2 so a cold Next.js instance does not fall through to
  Postgres.
- Postgres is touched only on a genuine cold miss, or if Redis is flushed.

Expected steady-state: **most statement reads never leave the browser**, and
almost none reach Postgres. This turns the largest traffic class into
essentially free static asset delivery.

### 3.4 One call, not four

v1's `loadProblemTransitionSnapshot` issues four requests to open a problem
(detail, submission count, session create, deferred learning context). v2 should
expose one procedure:

```ts
learn.getExerciseWorkspace({ academyId, materialId })
  -> { exercise, breadcrumb, neighbors: { previous, next }, draft, progress }
```

`exercise`, `breadcrumb`, and `neighbors` all come from the immutable cached
payloads. Only `draft` and `progress` are per-student and dynamic — and both are
cheap Redis reads (§4, §6). Prefetch the neighbours' payloads on idle so
previous/next is instantaneous.

## 4. Write path: local-first drafts with a write-behind buffer

### 4.1 Why v1's approach does not scale

v1 debounces 1s and PATCHes `collaboration_sessions.final_code`, plus a 10s
safety interval, plus a `keepalive` write on unmount. Each write is a large text
UPDATE. At peak that is thousands of row updates per second on a table that is
also read by the drafts list — heavy WAL, heavy autovacuum, high lock churn, and
none of it is data the student would notice losing for 30 seconds.

### 4.2 Three tiers

```text
Keystroke ──▶ IndexedDB          (instant, offline-safe, source of truth while typing)
   5s idle / blur / navigate / visibilitychange
          ──▶ Redis  draft:{userId}:{materialId}   (O(1) write, added to a dirty set)
   every 30–60s, or on session end
          ──▶ Postgres  exercise_drafts            (batched upsert by a BullMQ repeatable job)
```

- **IndexedDB** makes typing free and survives a browser crash or lost network.
  This is strictly better than v1 for the student, not just cheaper for us.
- **Redis** absorbs the sync traffic. A hash write plus a sorted-set add is
  trivial at 3,000/s.
- **BullMQ repeatable job** drains the dirty set into Postgres in batches. 3,000
  Redis writes/s becomes roughly 50–100 batched upserts/s against Postgres.

Use `sendBeacon` (not `fetch(..., {keepalive:true})` alone) on `visibilitychange`
so a closing tab still flushes.

### 4.3 The durability tradeoff, stated plainly

A Redis failure between flushes loses at most ~60 seconds of draft code for
students who were typing at that moment — and those students still hold it in
IndexedDB, which restores on next load. Run Redis with `appendfsync everysec`.

This is an acceptable trade for a draft. It would **not** be acceptable for a
submission, which is why submissions are written to Postgres synchronously
before the job is enqueued (§5.2).

## 5. Compute path: the judge

### 5.1 One job per submission, not one per test case

This is the most important structural change from v1.

v1 fans out N Judge0 submissions with N callback tokens, then reassembles
partial results — which is the entire reason `finalize.ts`,
`reconciliationPolicy.ts`, and the callback-token binding machinery exist. It is
a lot of code and several race conditions in service of parallelism that is not
needed: the test cases of one submission are small and sequential-friendly.

v2: **one BullMQ job = one submission = one worker = one transactional write.**

```text
POST submit
  ├─ Redis token bucket rate limit            (atomic, no DB write)
  ├─ INSERT submission (status QUEUED)        (Postgres, durable)
  └─ queue.add('grade', { submissionId }, { jobId: submissionId })

judge-worker
  ├─ claim: UPDATE ... SET status=RUNNING WHERE status=QUEUED
  ├─ load grading payload from Redis          (hidden cases, no Postgres)
  ├─ execute cases in order, early-exit on first failure
  ├─ ONE transaction: submission + cases + student_exercise_progress
  └─ PUBLISH submission:{id}                  (result push, §6)
```

Benefits over v1: no partial state to reconcile, no per-case callback endpoint,
no token binding, no orphaned cases. Retries are safe because the whole job is
idempotent.

**Early exit** matters at this scale. Most failing submissions fail on case 1.
Stopping there removes an estimated 50–70% of total executions. Make it a
per-exercise flag so an exercise that wants partial scoring can opt out.

### 5.2 Idempotency and safety

- `jobId: submissionId` — BullMQ deduplicates enqueues.
- Partial unique index on `(user_id, material_id) WHERE status IN ('QUEUED','RUNNING')`
  — one in-flight submission per student per problem. v1 learned this the hard
  way (`SUBMISSION_ALREADY_JUDGING`); make it a database constraint, not a
  read-then-write check.
- The result write is guarded `WHERE status = 'RUNNING'`, so a duplicate
  delivery cannot double-apply.
- The submission row is written to Postgres **before** enqueueing. If Redis dies,
  a sweeper job re-enqueues anything left `QUEUED` past a threshold.
- Rate limiting moves from v1's `consume_submission_rate_limit` Postgres RPC to
  a Redis Lua token bucket. A rate limiter that writes to the database defeats
  its own purpose.
- The server owns elapsed time (`attemptStartedAt` on the server). v1 accepts a
  client-reported `elapsed_sec`.

### 5.3 Execution engine

Put this behind an interface from day one:

```ts
interface ExecutionEngine {
  run(input: { code: string; stdin: string; timeLimitMs: number; memoryLimitMb: number })
    : Promise<{ stdout: string; stderr: string; outcome: CaseOutcome; runtimeMs: number }>;
}
```

Two viable implementations:

| | **Pyodide in the worker (recommended to start)** | **Container sandbox (nsjail / gVisor / Firecracker)** |
|---|---|---|
| Isolation | WebAssembly — no syscalls, no filesystem, memory-capped | OS-level, battle-tested |
| Cost per run | ~50–150ms warm, no process spawn | 200–500ms including spawn, or a warm pool to manage |
| Density | Many instances per Node process | One container per run |
| Languages | Python only | Anything |
| Matches the browser | **Yes — identical runtime** | No |
| Ops burden | Low | High |

Recommendation: **start with Pyodide in the worker.** For an intro-Python
academy it is a real security boundary, it is dramatically cheaper, and — the
decisive argument — it is the *same runtime the student just ran in their
browser*, which eliminates the "Run passed but Submit failed" class of bug that
v1 has structurally (browser Pyodide vs. Judge0 CPython).

Switch to a container engine when they add a second language or when profiling
shows Pyodide's slower execution is the bottleneck. The interface makes that a
contained change.

Implementation notes for the Pyodide engine:
- One warm Pyodide instance per worker thread; reset globals between runs rather
  than reloading the runtime.
- Enforce the time limit with Pyodide's interrupt buffer, not a promise race —
  a busy loop will not yield to the event loop.
- Cap stdout size; a `while True: print(x)` must not fill memory.

### 5.4 Pin the runtime version

The browser and the worker must load the same pinned Pyodide version, from the
same self-hosted assets (`packages/web/public/pyodide/`, already in place).
Record the version on the submission row so a future runtime upgrade is
auditable and old results remain explainable.

### 5.5 Capacity

At ~100ms per warm case, one worker thread does ~10 cases/s. Peak of 300–900
cases/s, halved by early exit, needs roughly **15–45 worker threads** — two to
six 8-core machines at peak, and near zero off-hours. Autoscale on queue depth,
not CPU, so scale-up leads demand instead of trailing it.

## 6. Result delivery: stop polling

v1 polls up to 400 times at 1.5s intervals per submission. At 30 submissions/s
that is tens of thousands of status queries per minute, most returning
"still judging", and the student still waits up to 1.5s after the result exists.

v2:

```text
worker ──PUBLISH submission:{id}──▶ Redis pub/sub ──▶ API SSE subscriber ──▶ browser EventSource
```

- **SSE, not WebSocket.** One-directional, survives proxies, has automatic
  reconnect built into `EventSource`, and is far cheaper per connection.
- The connection is opened on submit and closed on result — not held for the
  whole session. Concurrent SSE connections therefore track *submissions in
  flight* (tens to low hundreds), not concurrent students.
- Keep exactly one fallback: if no event arrives within ~15s, poll once. This
  covers a dropped connection without reintroducing a polling architecture.
- Progress events (`case 3/10 passed`) are nearly free once the channel exists,
  and are a genuine UX improvement over v1's opaque spinner.

If holding SSE connections on the API instances proves awkward under
autoscaling, Supabase Realtime is already in the stack and is a reasonable
alternative — but SSE is simpler and avoids exposing another channel that must
be authorized.

## 7. Data model additions

New models (sketch — full schema belongs in the implementation spec):

```
Submission               id, userId, materialId, courseVersionId, code, status,
                         score, passedCount, totalCount, runtimeMs, engineVersion,
                         startedAt, queuedAt, gradedAt
SubmissionCase           submissionId, position, outcome, runtimeMs, memoryKb
                         (never stores hidden input/expected output)
ExerciseDraft            userId, materialId, code, updatedAt        @@unique([userId, materialId])
StudentExerciseProgress  userId, materialId, bestStatus, attemptCount, firstPassedAt, lastAttemptAt
PublishedPayload         key, kind, versionId, payload(jsonb), createdAt
```

Scale notes:

- 100k students × ~200 exercises × ~5 attempts ≈ **100M submission rows** over
  the platform's life. Partition `submissions` by month from the start —
  retrofitting partitioning onto a live 100M-row table is a bad week.
- `code` is the fat column. Keep it in a separate `submission_code` table (or
  object storage) so history queries, progress rollups, and the teacher
  dashboard never drag it through memory.
- `StudentExerciseProgress` is maintained in the same transaction as the
  submission result. **Never aggregate progress on read** — v1's teacher
  progress endpoint scans all submissions and aggregates in JavaScript per
  request, which is already slow and would be unusable at this scale.
- Class- and course-level rollups belong in summary tables refreshed by a BullMQ
  repeatable job every 1–5 minutes.

### 7.1 Contract-level test-case safety

Define a separate `learn.*` contract namespace whose output schemas have no
field capable of carrying a hidden expected output. The authoring contract
(`academyCourses.getExercise`) returns hidden cases and must stay reachable only
by `curriculum.manage` holders. Structural impossibility beats a remembered
filter.

## 8. What Redis is actually for

Answering the original question directly — Redis earns its place six times, and
BullMQ twice:

| Use | Structure | Why not Postgres |
|---|---|---|
| Grading queue | BullMQ (streams) | Job distribution, retry, backoff, priority |
| Draft flush, progress rollups, queue sweeper | BullMQ repeatable | Scheduled batch work |
| Draft write-behind buffer | Hash + dirty sorted set | Absorbs 1,000s of writes/s |
| Published payload cache | String, immutable keys | Removes a 4-level join from the hottest path |
| Grading payloads | String, server-only namespace | Worker never queries Postgres per run |
| Submit rate limiting | Lua token bucket | A rate limiter must not write to the DB |
| Result fan-out | Pub/sub | Replaces 400-iteration polling |

### 8.1 Use two Redis instances

**Queue and cache must not share a Redis instance**, or must at minimum use
separate instances rather than separate databases on one server. A cache wants
`maxmemory-policy allkeys-lru`; under memory pressure that policy will silently
evict BullMQ's job data and lose submissions. This is a genuinely common
production failure and it is cheap to avoid:

- `redis-queue` — `maxmemory-policy noeviction`, AOF on, treated as durable.
- `redis-cache` — `allkeys-lru`, treated as disposable, cold-start safe.

## 9. Deployment shape

```text
packages/web           Next.js          N replicas, stateless
packages/api           NestJS + SSE     N replicas, stateless
packages/judge-worker  BullMQ consumer  M replicas, CPU-bound, autoscale on queue depth   ← new
redis-queue            managed          noeviction, AOF
redis-cache            managed          allkeys-lru
Postgres (Supabase)    + PgBouncer      transaction pooling
```

- The judge worker is a **separate deployable**, not a thread inside the API. A
  runaway student program must not be able to degrade request serving, and the
  two scale on completely different signals.
- Prisma against PgBouncer needs `?pgbouncer=true` on `DATABASE_URL`, with
  `DIRECT_URL` for migrations. Both variables already exist in `env.schema.ts`.
- New environment: `REDIS_QUEUE_URL`, `REDIS_CACHE_URL`, `JUDGE_CONCURRENCY`,
  `PYODIDE_VERSION`. Add them to `apiEnvironmentSchema` with the same validation
  discipline as the existing entries.

## 10. Delivery phases

Do not build all of this before any of it ships. Each phase is independently
useful and independently verifiable.

| Phase | Scope | Needs Redis? | Needs BullMQ? |
|---|---|---|---|
| **P1** Read path | `learn.*` contracts, publish-time materialization, outline + workspace pages, RSC/HTTP caching | Optional (cache) | No |
| **P2** Local-first drafts | IndexedDB, sync endpoint, write-behind buffer | Yes | Yes (flush job) |
| **P3** Grading | Submission models, queue, judge-worker, execution engine, SSE delivery | Yes | Yes |
| **P4** Progress & analytics | Progress rows, rollup jobs, teacher dashboard | Yes | Yes (rollups) |

P1 is worth shipping on its own: with materialized payloads and browser caching
it is already faster than v1, and it proves the student-facing contracts before
any queue exists. **P1 does not require Redis** — it can ship with Next.js RSC
caching alone and gain the L2 later.

The slice previously agreed (read path + browser-local run, academy-wide course
scoping) is exactly P1 plus the browser runner, and remains the right first
build.

## 11. Explicit non-goals for this design

- Class/section enrollment scoping — still unmodelled; P1 ships academy-wide.
- Live teacher monitoring, presence, and cursor sync — needs its own design; the
  presence-in-Redis pattern is noted only so P4's rollups do not conflict with it.
- AI feedback generation — a queue consumer alongside the judge, later.
- Multi-language support — deferred, but the `ExecutionEngine` interface exists
  so it does not require rearchitecting.

## 12. Decisions

| Decision | Choice | Reason |
|---|---|---|
| Statement read path | Materialize at publish, cache immutably by `versionId` | Immutable versions make invalidation a non-problem |
| Workspace load | One procedure, not four requests | v1 needs four round trips to open a problem |
| Sample execution | Stays in the browser | 10× difference in server capacity required |
| Draft persistence | IndexedDB → Redis → batched Postgres | 5,000 writes/s is not a database workload |
| Grading unit | One job per submission | Removes v1's per-case reconciliation entirely |
| Failing cases | Early exit by default | Removes an estimated 50–70% of executions |
| Execution engine | Pyodide in-worker, behind an interface | Same runtime as the browser; cheap; swappable |
| Result delivery | Redis pub/sub → SSE | Replaces a 400-iteration polling loop |
| Progress | Written transactionally, rolled up by job | v1 aggregates on read and is already slow |
| Redis topology | Two instances, queue vs cache | LRU eviction on a shared instance loses jobs |
| Judge deployment | Separate process | Student code must not degrade request serving |

## 13. Open questions

1. Peak concurrency is an assumption. Instrument v1 now — concurrent sessions
   and submissions/minute during evening classes — so P3 capacity planning uses
   real numbers.
2. Submission retention: how long is full code kept? This decides whether
   partitioning plus object storage is enough or whether an archival tier is
   needed.
3. Does any exercise genuinely need partial scoring, or is pass/fail sufficient?
   This decides whether early exit is the default or the only mode.
4. Managed Redis provider and region, given Supabase's region — cross-region
   latency to Redis would undo much of §3.
