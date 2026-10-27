# Runtime performance implementation and local verification

Date: 2026-10-27 (Asia/Seoul)
Status: implementation available for review; production acceptance incomplete.

## Outcome and scope

Implemented the independently reviewable diagnostics, lifecycle and feedback
changes in the [approved design](../superpowers/specs/2026-10-27-platform-runtime-performance-design.md).
The full performance initiative is **not complete**: no end-to-end production
latency SLO, Turtle warm gate, usable-page SLO or classroom capacity is certified
by this report. Nothing was deployed and no historical submission was regraded.

The main measured development bottleneck is waiting for fresh Pyodide runners
after the initial ready pool is consumed. Serial replenishment reduces competing
initializers while preserving fresh interpreters, finite allocations, exit and
pipe-drain correctness, identity cleanup and existing grading deadlines. This
is not evidence that every production timeout has that cause.

Manual result feedback now uses a small authorized status read instead of
reloading the whole workspace every three seconds. Automatic pending results
poll every second while visible; human review polls every 15 seconds. Error
backoff, authorization stops, focus/manual recovery and the existing 120-second
fast-poll bound apply. No draft or drawing state is replaced by a status read.

## Source and environment

- Base revision: `9ed4d49c177ad4e100aaf7b7be6deeb29f8cee0b`; implementation was
  uncommitted during measurement. This differs from the earlier deployed source.
- [Source manifest](assets/2026-10-27-runtime-performance/source-manifest.json)
  records SHA-256 values for changed implementation/deployment inputs. Reports
  distinguish harness HEAD from image identity and explicitly mark dirty source.
- Baseline image: `sha256:1cb1e5d071c1e8417dd24c5b1f52f049f9747e39ada46b28996fcc749d07803d`,
  built before implementation from the base revision. Its original build has no
  source-revision label; provenance is the session's build order and immutable ID.
- Final candidate: `sha256:a7ae976edc63632e48fab8877c2d311db4c59c4b372bce0043526d7929d699aa`.
  Its revision label explicitly says base plus uncommitted performance changes;
  it must not be mistaken for a clean commit build.
- Local Docker Desktop Linux ARM64, Node 22.23.4, Pyodide 0.27.5. Docker reports
  eight virtual CPUs and 4,109,737,984 bytes of VM memory. Other development
  containers remained present; this is not a dedicated/reference host.
- Sandbox: network none, actual isolation checks, read-only root, runner UID
  switching, 1.5 CPU, 1,280 MiB memory/no extra swap, 128 tasks, concurrency two
  plus one spare. No application/database/Redis credentials reach the fixture.
- Workload alternates `print(1)` and Unicode stdin echo. One-second case budgets,
  fresh interpreters and the existing protocol/transport allowance are retained.
  No source, stdin, output, cookies or credentials are retained in JSON artifacts.

## Exploratory attribution

The initial pre-change ten-case smoke took 17,354.95 ms. The first three cases
were fast, followed by multi-second waits in replacement waves. An instrumented
serial-refill smoke at the same quota took 11,352.36 ms: summed acquire time was
about 10,825 ms, versus 497 ms execution, 1 ms drain and 3 ms cleanup. This
supports targeting preparation contention; it does not support shortening drain
grace or accepting a program merely because it printed the expected output.

The original live diagnostic's unexpected trivial-case timeouts were not
reproduced in these development smokes. That is a recorded non-reproduction,
not proof they cannot recur in production.

Initial quota smokes at 2.0 CPU and 2.5 CPU took 9,652.73 ms and 16,927.78 ms
respectively. Each had only one submission-equivalent sample; host contention
was uncontrolled. These are retained, including the worse 2.5-CPU result, and
do **not** select a winning production quota. Production remains 1.5 CPU for
the sandbox and 0.75 CPU for the worker.

Original sanitized artifacts: [baseline](assets/2026-10-27-runtime-performance/cove-judge-baseline.json),
[serial refill](assets/2026-10-27-runtime-performance/cove-judge-serialized-refill.json),
[2.0 CPU](assets/2026-10-27-runtime-performance/cove-judge-2cpu.json),
[2.5 CPU](assets/2026-10-27-runtime-performance/cove-judge-25cpu.json).
The earlier harness did not yet record dirty-tree/parallel/image-label fields;
its `commit` identifies the harness checkout, not a clean instrumented image.

## Final paired sandbox smokes

The final cohort alternates baseline/candidate ordering across three pairs on
the same development host, with no builds or tests run concurrently. Each pair
starts independent isolated containers with identical limits and a fresh ready
pool. Separate two-in-flight smokes exercise turnover under concurrency. These
small samples remain diagnostic evidence, never 100-sample p95 acceptance.

| Pair | Baseline, ten cases | Candidate, ten cases | Failed runs, baseline / candidate |
| --- | --- | --- | --- |
| 1 | [17.876 s](assets/2026-10-27-runtime-performance/paired-1-baseline.json) | [10.250 s](assets/2026-10-27-runtime-performance/paired-1-candidate.json) | 0 / 0 |
| 2 | [18.417 s](assets/2026-10-27-runtime-performance/paired-2-baseline.json) | [9.753 s](assets/2026-10-27-runtime-performance/paired-2-candidate.json) | 0 / 0 |
| 3 | [18.090 s](assets/2026-10-27-runtime-performance/paired-3-baseline.json) | [10.146 s](assets/2026-10-27-runtime-performance/paired-3-candidate.json) | 0 / 0 |

The three-sample median is 18.090 s versus 10.146 s
(43.9% lower). This is a descriptive median of three smokes, not an
accepted p95 improvement.

The two simultaneous ten-case runs completed in 34.234 s
for the [baseline batch](assets/2026-10-27-runtime-performance/parallel-2-baseline.json)
and 22.949 s for the
[candidate batch](assets/2026-10-27-runtime-performance/parallel-2-candidate.json).
Each batch had two successful runs. This single batch checks concurrent turnover,
not the mixed-background throughput or classroom gate.

Additional warmed-pool candidate smokes: [one case](assets/2026-10-27-runtime-performance/candidate-1-case-smoke.json)
57.27 ms; [five cases](assets/2026-10-27-runtime-performance/candidate-5-case-smoke.json)
2674.29 ms, one run each. Across the final cohort: 12 submission-equivalent
runs, 106 cases, zero incorrect/timeout/transport outcomes, and zero recorded OOM
events. Candidate diagnostics show no preparation failures, drain fallback or
forced termination. Preparation timers include initial parallel warmup and
overlap other stages; their sums must not be added to execution wall time.

All timings in this section exclude submission admission, Redis queueing,
comparators, database transactions, points and browser feedback. They cannot
establish acceptance-to-committed-result latency or result-display p95. The
[runtime/host decision note](../adr/2026-10-27-grading-runtime-latency.md) records
the unresolved latency gate without introducing a new runtime or host.

## Correctness and build verification

| Check | Result and boundary |
| --- | --- |
| Isolated backend script | 20 files, 328 tests passed; 11 opt-in tests skipped. Own disposable local PostgreSQL, real migrations; no cloud Auth. |
| Real weighted grading integration | All 8 tests passed against the disposable PostgreSQL; verifies weighted outcomes/transactions, including existing points behavior. |
| Final sandbox/lifecycle/readiness checks | 38 tests passed after cancellation/trace work; final readiness-only rerun passed all 7 after correcting initial healthy-start guard behavior. Counts overlap the broader suite. |
| Web regression suite | 4 files, 14 tests passed: polling policy/races, result summary, practice recovery and retained GUI frames. Includes hidden/focus and late prior-context/new-attempt responses. |
| Loopback read harness | Both tests passed: remote/mutating request rejection and sanitized separate-actor reads. This is harness verification, not a classroom load result. |
| Type checking | API, judge-worker and web passed. Shared code compiled in backend/container builds. |
| Production builds | Next web production build passed; final judge-worker Docker build passed. |
| Web lint | No errors; two pre-existing effect-dependency warnings in ManualWorkspace (`session`, `save`) remain. |
| Deployment validation | Passed: Compose/profile isolation, unchanged quotas, resource ceiling, Caddy, base/optional Prometheus scrape configuration and all 19 alert rules, Alertmanager, dashboards. |
| Script/diff checks | Node syntax checks for both benchmark scripts and `git diff --check` passed. |

The existing weighted integration fixture still supplied the retired
`solutionCode` field. Updated its three authoring calls to the current
`solutions` array contract before rerunning; the initial stale-fixture failure
was not an execution regression. Tests also exposed a comparator shutdown race
after timed acquisition; dispatch now rechecks disposal/death before using the
acquired worker. Optional metrics validation caught a nested read-only mount
conflict; its credential now mounts separately under `/run/secrets`.

The database fixture's Supabase schema/roles are local doubles. They do not
verify Supabase provider-side authentication. Redis-dependent background sample
integrations remain opt-in; no production queues were used as test fixtures.

## Review and release status

Self-review covered authorization, private result projection, late-response
guards, grading/points semantics, process allocation and cancellation, bounded
diagnostics, secret separation, Compose isolation and compatibility defaults.
Readiness now pauses only after degradation and resumes after three healthy
samples; a healthy initial boot incurs no recovery pause. Disconnected queued
requests cannot consume later interpreters, and active cancelled requests await
confirmed cleanup instead of becoming a student timeout/verdict.

| Workstream | Current status |
| --- | --- |
| Diagnostics | Implemented and locally tested. Optional private metrics/trace logs; guard defaults off. Production scrape discovery and rollout observation remain pending. |
| Grading | Safe replenishment change and regression coverage implemented. Full one/five/ten-case committed-result SLO and paired mixed-load gates remain unaccepted. |
| Feedback | Narrow endpoint/polling implemented and tested. Production-equivalent payload/query p95 and commit-to-display browser measurements remain pending. |
| Turtle | Existing standby retained, default cold unchanged. Browser harness supports Chromium/WebKit and sanitized shell/editor/resource timings. No new live browser/rootless acceptance run performed. Original 100-run/resource/recovery gates remain unmet. |
| Loading/capacity | Loopback read tool and browser timing collection implemented. Authenticated navigation/CPU traces, actual client-load steps and classroom envelope remain unmeasured. No speculative route/cache/PNG change. |

The existing main-service ceiling validation is 8.97 GiB against a 9.00 GiB
budget. That check alone omits the complete trial/course-guest/deploy-overlap
envelope and cannot approve warm Turtle on this host. Existing drawing speed,
single public active slot and runtime pins are unchanged.

Use the [operations guide](../operations/runtime-performance.md) to reproduce
the checks and prepare the gated production-equivalent experiment. Deployment,
warm enablement, CPU increases and a VPS upgrade require their own evidence;
this implementation makes no claim that the current VPS supports 20 students.
