# Faster execution and grading on the existing VPS

Date: 2026-10-27 (Asia/Seoul)
Status: implementation authorized by the user on 2026-10-27. Performance targets
below remain release gates, not achieved results. Production rollout requires
the stated evidence; this document makes no classroom-capacity claim.

Implementation and open gates are tracked in the
[local verification report](../../research/2026-10-27-runtime-performance-local-verification.md)
and [runtime/host decision note](../../adr/2026-10-27-grading-runtime-latency.md).
The complete initiative is not yet accepted for production.

The subsequent [production page-navigation investigation](../../research/2026-10-27-production-page-navigation-performance.md)
records authenticated course/class delays and read/payload costs. Native grading
testing was stopped by the user; production grading remained active.

## 1. Decision and intended outcome

Improve perceived and actual execution speed on the current Contabo VPS 6 before
buying more compute. Prioritize predictable, correct Python grading, then result
feedback and Turtle startup. Measure complete user actions and their component
stages so that slow execution, queuing, animation and page loading can be
distinguished.

The server had substantial spare CPU and RAM during the October 27 investigation.
Individual containers can still be throttled, and creating an execution
environment still takes time. “The host has spare capacity” is supported;
“infrastructure cannot be involved” is not. Changes to container resource limits
are deployment changes and require a measured resource budget.

This is one staged performance initiative with independently releasable work:

1. Establish reliable execution diagnostics and a reproducible Linux baseline.
2. Resolve grading delays and unexpected timeouts without changing grading rules.
3. Shorten result-display delays using bounded, lightweight status requests.
4. Improve Turtle startup, reusing the existing standby implementation only if
   its original resource and performance gates pass.
5. Measure editor/navigation performance and publish a separate capacity result.

Keep the current Python runtimes, grading profiles, lesson data, student/staff
ownership, classroom attribution, points, PIN admission, and execution isolation.
No runtime replacement, automatic historical regrade, global animation change,
database migration to another provider, or increase in public Turtle execution
capacity is included.

## 2. Evidence, provenance and uncertainty

The baseline below comes from the October 27 investigation in the requesting
session: ordinary HTTPS requests, a browser square run, read-only SSH/Docker and
Prometheus inspection, aggregate SQL, and a small synthetic sandbox diagnostic.
The diagnostic executed no coursework submission and changed no grade or server
configuration. These observations are not a controlled acceptance benchmark.

The live response identified release `v2.0.42`, source
`2d6ace8b4d828287fe0de8db4eb95df2e2663ec2`. Source review for this specification
used local commit `b2e7f82a`; it includes subsequent video work. Implementation
must record its own exact commit, built image digests and effective deployment
configuration rather than assume the local checkout equals production.

### 2.1 Host, network and service observations

| Observation | Measured value | Interpretation and limit |
| --- | --- | --- |
| Host | Six vCPU, approximately 12 GB RAM; Japan | Current deployment, not a promise about provider performance under other loads. |
| CPU | 8.29% over 15 minutes; maximum sampled five-minute average about 15.02% over 24 hours | No sustained host CPU saturation in those samples; short spikes remain possible. |
| Available host RAM | Minimum 8.46 GiB over 24 hours | No observed host memory pressure; spare memory is not a worst-case allocation budget. |
| CPU steal | Zero in inspected averages | No observed hypervisor CPU steal; not proof of future dedicated CPU service. |
| I/O wait | Approximately 0.22% over 15 minutes | No observed sustained disk bottleneck. |
| `/turtle` HTML | Three compressed downloads: 0.325–0.451 s | Excludes editor startup, hydration, execution and first drawing. |
| API readiness HTTP request | Three requests: 0.187–0.291 s | Does not exercise grading throughput. |
| Database | Eight `SELECT 1` requests: 33–65 ms; new connection about 185 ms | Network/query floor to the Seoul Supabase pooler, not timing of application queries or connection-pool waits. |
| Public Turtle broker | One active slot, warm standby disabled, 0.5 CPU/256 MiB | Verified effective settings; do not confuse standby count with execution capacity. |
| Course Turtle broker | One configured execution slot, 0.5 CPU | Public and course brokers are separate pools. |
| Judge worker / sandbox | Two worker slots; sandbox two slots plus one spare, 1.5 CPU/1,280 MiB | Runner execution and replenishment share the sandbox CPU ceiling. |
| Sandbox memory events | No OOM or OOM kill in inspected cgroup counters | Memory exhaustion was not observed in this diagnostic. |

The API's environment reported `JUDGE_CONCURRENCY=1`, while the worker and sandbox
reported two. Current source consumes this setting for scheduling in the judge
process, not the request-serving API. Record the effective consumer and remove
configuration ambiguity; this difference alone is not a proven bottleneck.

Direct cgroup inspection showed throttling in the judge sandbox, judge worker
and public broker. Sandbox CPU pressure rose during the synthetic diagnostic.
An attempted Prometheus query by container name returned no matching series;
that empty result was not evidence of zero throttling. Fix metric discovery and
verify it against actual cgroup counters.

### 2.2 Turtle and grading observations

Five recent broker launch events ranged from 1,633 to 3,742 ms, all cold. Launch
ends when the Python process is spawned; it is not click-to-first-drawing time.
The square completed visually in the live browser. Its custom helper explicitly
uses `speed(1)` and screen delay 25 ms: slow animation after startup is expected
teaching behavior, distinct from startup overhead.

Read-only grading aggregates since **2026-10-24 18:00 KST**:

| Authored test count | Submission count | Median `graded_at - created_at` |
| --- | --- | --- |
| 1 | 6 | 838 ms |
| 5 | 3 | 11,614 ms |
| 8 | 4 | 20,345 ms |
| 9 | 3 | 20,036 ms |
| 10 | 2 | 27,789 ms |

The query selected automatically graded Python submissions with a completed
grading timestamp and no maintenance regrade ID. The interval includes queueing
and work through assignment of that timestamp. `gradedAt` is assigned inside the
final transaction before its writes/points work have all committed, so this is
not a committed-result latency measurement. The cohorts contain different
programs/outcomes and are small. They do not isolate interpreter startup or
prove that every authored case executed.
The broader seven-day sample contained 603 submissions, with a 951 ms median and
38,730 ms p95. Do not compare mixed production cohorts as an A/B improvement.

A repeated `print(1)` diagnostic, with a one-second case limit, returned:

- First request: 171 ms wall time, passed.
- Second: 1,155 ms wall time, time limit, despite receiving expected output.
- Third: 1,200 ms wall time, time limit.
- Fourth: exceeded the diagnostic client's 12-second wait. That client timeout
  was shorter than the engine's case limit plus 45-second transport allowance;
  it does not establish a permanently stuck request.

This is a high-priority reproducibility/correctness signal, not proof that all
historical time-limit grades were wrong. Receiving output alone never proves
that a program terminated. The sandbox and judge subsequently remained healthy
and returned to idle resource usage, but the current judge health route returns
only `{"status":"ok"}` and does not establish execution responsiveness.

### 2.3 Existing work that must be preserved

The [October 23 Turtle design](2026-10-23-turtle-startup-performance-design.md)
already has a single-use standby implementation, telemetry, resource preflight,
and rollback procedure. Its [verification report](../../research/2026-10-23-turtle-startup-local-verification.md)
explicitly states that full performance gates did not pass: the original 100-run
cold p95 was 3.714 s, versus 4.220 s for a contended standby-enabled cohort. A
later 20-run warm smoke p95 of 1.745 s did not replace the acceptance experiment.

Viewer preloading and skipping empty asset installation already exist in current
source. Do not implement them again or describe them as a new improvement.
Warm production enablement remains gated by
[the existing operations procedure](../../operations/turtle-startup-performance.md).

## 3. Approaches considered

| Approach | Benefit | Cost / decision |
| --- | --- | --- |
| Instrument and tune existing execution paths | Targets observed delays; preserves current compatibility and can be delivered incrementally | Recommended. Root-cause work must precede promises about exact speed. |
| Upgrade the VPS or add a dedicated execution host immediately | May increase aggregate throughput or provide stronger CPU isolation | Would retain cold startup, polling delays and existing quotas. Reconsider only after measured capacity/resource gates fail. |
| Replace Pyodide/Tk with a different grading or browser runtime | Potentially changes startup economics substantially | Requires a separate compatibility/security design, runtime identity and historical playback policy. Outside this specification. |

The selected design keeps cases sequential within each submission and keeps each
student interpreter single-use. Increasing parallel cases or resetting a used
interpreter is not an accepted shortcut.

## 4. Measurement contract and acceptance targets

Use monotonic clocks for durations within each process. A server-generated trace
ID correlates stages; never subtract unsynchronized browser/server clocks. Record
queue time separately, and retain complete click/acceptance-to-result latency.
Separate cold cache, cached assets, cold execution, ready standby and queueing.

Reference environment: pinned production images and actual Linux cgroup limits;
Chromium and WebKit on a recorded desktop/device profile; network RTT at most
80 ms and at least 20 Mbps download. A Docker Desktop result is development
evidence, not the Linux release result.

| Metric | Release target |
| --- | --- |
| Run/Submit pending feedback | Visible within 100 ms, without duplicate execution/submission. |
| Simple one-case automatic grading | Accepted submission to committed terminal result: p50 ≤0.75 s, p95 ≤1.5 s, unqueued. |
| Simple five-case automatic grading | Same boundary: p50 ≤2 s, p95 ≤3 s, unqueued. |
| Simple ten-case automatic grading | Same boundary: p50 ≤3 s, p95 ≤5 s, unqueued; p95 also at least 50% below paired baseline. |
| Result display after commit | Polling client with a visible tab: p95 ≤1.5 s. Report separately from grading service time. |
| Public Turtle ready-standby drawing | Preserve original gates: p50 ≤1 s, p95 ≤1.5 s, and at least 40% better p95 than paired cold baseline. |
| Public Turtle cold drawing | Preserve original p95 ≤4 s. Repeated runs include previous-run teardown. |
| Editor usable | Code visible and editable: cold-asset p95 ≤3 s, cached-asset p95 ≤1.5 s. This is not HTML response time. |
| Authenticated lesson navigation | Navigation to usable lesson shell: p95 ≤1.5 s for fixed small fixtures; report PDF/media completion separately. |
| Resource / correctness | No OOM, leaked execution, isolation failure, double award, unexpected trivial-case timeout or new grading discrepancy. Reference read/API and active-drawing p95 regression ≤10% under identical mixed load. |

“Simple” grading fixtures use deterministic `print(1)`, stdin echo including
Unicode, or short arithmetic, with fixed inputs/outputs, one-second per-case
limits, existing comparators and a total execution budget of case count times
one second in the enhanced profile. Freeze the same fixture policies for the
baseline and candidate. These
targets do not apply to programs deliberately using their full execution limit,
large output, pathological regexes, human review, or external model evaluation.
Benchmark first-solve/points and repeat-solve paths separately; both must pass.
The unqueued grading targets use one submission in flight and no background
execution. The two-submission/mixed-load experiment additionally requires no
unexpected trivial-case timeout and no completion-throughput regression over
10% against its paired baseline; publish its latency separately.

Use at least 100 submissions per one/five/ten-case cohort for final grading
acceptance, after instrumented smaller reproductions. Use the original minimum
100 runs per Turtle mode. Retain failures and publish failure rates; successful
latency percentiles cannot hide excluded errors. Record sample count, p50, p95,
maximum, runtime digest, resource settings and queue state. A missed gate leaves
that workstream incomplete; do not silently relax limits or targets.

## 5. Execution diagnostics and readiness

### 5.1 Measure the entire grading path

Keep `runtimeMs` and historical grading records under their existing semantics.
Add infrastructure timings through telemetry, not by overwriting student runtime
or deriving queue duration from the existing `started_at` field.

| Component | Required stage observations |
| --- | --- |
| Submission admission / BullMQ | Accepted-to-job-claim queue duration, durable enqueue/retry outcomes, official/background queue depth and oldest age. |
| Grading service | Claim/load, each engine request, comparator wait/execute, progress reporting, final transaction and completed service duration. |
| Sandbox pool | Acquire wait, idle/executing/warming/draining counts, oldest waiter age, spawn-to-READY, refill failures/retries and last execution-completion timestamp. Canary outcomes are recorded separately by the fixture harness. |
| Runner lifecycle | Job delivery, process exit, pipes close, drain fallback, forced termination and identity sweep/release. Trace trusted preparation/flush in a fixture without trusting student-written control messages. |
| Resource monitoring | CPU quota and throttled-period deltas, pressure, memory/current/peak/limit/OOM, task count, event-loop delay, process restarts. |

Distinguish `exit` from `close`: Node closes child stdio after process exit. Do
not replace pipe-drain correctness with an early successful verdict. Investigate
the existing two-second drain fallback, post-READY host lockdown, output flush,
replacement initialization, synchronous `/proc` work and event-loop delay as
separate possible contributors. None is declared the root cause in advance.

Use bounded labels: fixed stage, official/practice/sample/regrade class, fixed
outcome, and case-count buckets (1, 2–5, 6–10, 11–50). Trace IDs belong only in
restricted logs. Never include source, stdin, expected/actual output, student or
academy identifiers, PINs, tokens, cookies, database URLs or raw child stderr in
performance logs, metrics or browser timing artifacts.

### 5.2 Export without breaking isolation

The sandbox remains network-disabled. Extend the existing private health reply
with an optional, versioned, bounded diagnostics object containing aggregate
counts, histogram buckets and health timestamps. No source, PIDs or owner IDs
are returned. This is an additive diagnostics extension to protocol v3; validate
its shape and bounds. An old peer may omit it. Execution requests, verdicts and
runtime identity retain their existing protocol and validation.

The judge polls that private socket every five seconds, permits one poll in
flight, and exposes cached aggregate metrics. Missing/stale diagnostics are
explicitly unavailable, never zero-valued health. Do not sum a cumulative
snapshot again on every scrape. Snapshot resets are identified per process
generation and handled as counter resets.

Keep `/health` as cheap liveness. Add `/ready` for scheduling readiness and a
separate metrics-only authenticated `/metrics` on the private judge listener.
Connect the judge to the existing monitoring network for Prometheus access;
publish no host port and add no Caddy route. Use an independent metrics secret,
stored through existing private-file practices; the token grants no execution
or grading access. Do not attach Prometheus to the application backend network
or give monitoring a Docker socket.

Readiness requires a live Redis worker connection, compatible isolated sandbox,
diagnostics no older than 15 seconds, and no pool starvation. Starvation means
an acquire waiting longer than five seconds, with zero executing and zero ready
runners, and either no warming runner or warming past the existing 30-second
startup bound. Explicit exhaustion of replacement retries is also degraded.
One failed spawn that is recovering within its bounded retry policy does not
alone make the pool unready. A fully busy pool, including programs legitimately
using their execution allowance, is healthy; five seconds without a completion
is not by itself a fault. Readiness itself does not execute student code. Report
pool capacity separately from readiness.

A degraded pool pauses new claims from all queues sharing it; it does not reject
already accepted submissions or mark their code wrong. Existing deadlines and
cleanup own in-flight work. Resume after three healthy five-second samples.
Liveness stays independent to avoid restarting a busy interpreter pool merely
because it is full. An absent diagnostics capability during a mixed-version
rollout is reported but does not activate this new admission behavior until
both peers support it and the readiness guard is explicitly enabled.

## 6. Grading improvements: reproduce, attribute, then change

First reproduce the diagnostic in an isolated Linux fixture using the complete
sandbox protocol, a one-second case limit and its existing transport allowance.
Exercise at least ten sequential cases so the initial three prepared runners
cannot conceal replenishment stalls. Correlate each delay with the stages above.
Never continue an unbounded diagnostic on the production student pool.

Make only changes supported by a paired stage-level result. The initial resource
experiment sequence is:

| Variant | Sandbox CPUs | Official concurrency / spare | Purpose |
| --- | --- | --- | --- |
| A | 1.5 | 2 / 1 | Reproduce effective deployment. |
| B | 2.0 | 2 / 1 | Isolate CPU-quota effects. |
| C | 2.5 | 2 / 1 | Try only if B misses targets and mixed-load headroom permits. |
| D | Winning tested quota | 1 / 1 | Diagnose active work versus replenishment contention; not automatically the production choice. |

Stop broadening experiments once a candidate meets all gates. Maintain the
1,280 MiB sandbox ceiling initially; additional spare processes are a separate
budgeted experiment, not a default response to latency. Change the worker's
0.75 CPU limit only if its own stage timings and quota deltas identify it as a
bottleneck. Do not lift unrelated service limits.

The selected configuration must pass both unqueued latency and two-submission
throughput/mixed-background tests. A lower concurrency that improves one request
but increases classroom backlog is not a complete improvement. Record worker,
sandbox, comparator and background concurrency together in one non-secret
effective configuration summary. Preserve the reserved official-submission
capacity and queue fairness; do not increase official concurrency to hide slow
cases.

If lifecycle work is the measured cause, optimize that component behind its
existing execution interface. Requirements remain:

- A used interpreter and its mutable globals/files are never reused after a
  student's case. An OS uid can return to the bounded identity pool only after
  the prior runner and descendants are gone and mandatory cleanup is confirmed.
- Executing, idle, warming, draining and failed allocations count against the
  physical process bound until cleanup is confirmed; retries cannot overshoot.
- Replacement work is bounded and cannot starve execution. Any refill scheduler
  change must retain progress with one or two slots and avoid deadlock when no
  runner is ready. Do not create a larger eager warming burst by default.
- Isolation, baseline memory measurement, descendant cleanup, output draining,
  hidden-case privacy and host-controlled exit interpretation remain enforced.
- Preserve case/total/comparator deadlines, scoring snapshots, runtime identity,
  input prompt behavior and stop/continuation policy. Do not raise student time
  limits, accept partial output as success, or change clocks to make tests pass.
- Detectable infrastructure failure follows the existing aborted/errored path
  and cannot award points or become a wrong answer. A genuine nonterminating
  program still receives its existing resource-limit outcome. Any change to
  verdict semantics needs a separately versioned grading design.
- Submission result, case rows, progress and points remain atomic. Optimize the
  final transaction only if measured; do not publish success before commit or
  defer required point writes outside it.

If the current engine still cannot meet the targets after measured tuning and
lifecycle fixes, produce a separate runtime/host ADR. Do not silently introduce
native CPython, WebAssembly snapshots, used-interpreter reuse or more execution
hosts in this workstream. Existing historical submissions are not regraded.

## 7. Faster feedback with bounded reads

Standard coding/PDF-code workspaces already have an authorized, small
`learn.getLatestSubmission` result polled every second. Retain and measure that
path. PDF + code grading uses the programming-exercise path; it must not be
conflated with manual assessment or human review.

`ManualWorkspace` currently polls the entire workspace every three seconds when
the latest submission is pending, including `AWAITING_REVIEW`. Extract a narrow
`manual.latestSubmission` read using the existing `LatestSubmission` public DTO
and ownership/class/role logic. The programming endpoint currently rejects
manual material types; do not bypass that type/access boundary for reuse.

The manual status read returns only the current actor's latest result summary.
Inspection mode cannot gain private staff attempts; staff practice remains owned
by its author; student access is scoped to enrollment, class, academy and visible
material. Preserve preview and material-revision behavior. Teacher roster review
remains a separately authorized read, not an arbitrary `userId` on the own-status
endpoint.

Poll automatic pending work every one second while visible, with one request in
flight and a 120-second fast-poll window. Perform an immediate check after an
accepted submission. Stop on terminal status, loss of authorization, navigation,
or loss of ownership context. On transient failures back off to 2/4/8 seconds,
then retain manual Refresh and retry on focus; never retry a denied read in a
tight loop. Hidden tabs pause and refetch immediately when visible again.

Human `AWAITING_REVIEW` is not automatic execution: use a 15-second visible-tab
status refresh, plus focus/manual refresh. Reaching 120 seconds must retain the
real pending state and offer Refresh; it never means the attempt failed or may
be automatically resubmitted. Avoid additional background polling.

On a terminal transition, update the summary and invalidate relevant result,
history/progress queries once. Fetch the full workspace only for data that
actually changed. Status reads cannot replace unsaved editor/answer drafts,
change selected history, or remount the drawing viewer. Keep the existing
generation/identity guards so late responses from a previous class/material or
attempt cannot replace the active result. Review roster polling stays at three
seconds until measured; do not accelerate full roster reads.

Measure API/query/payload costs under the same concurrent client count. A
one-second narrow status request must not perform the old full-workspace query
or make database/read p95 regress by over 10%. Real-time push is deferred; it is
not required for this bounded feedback improvement.

## 8. Turtle startup and drawing behavior

Reuse the broker-owned standby pool and original security/resource invariants.
The existing one-active/four-queued public pilot remains the capacity contract.
The course pool remains cold unless a separate course-specific warm design is
approved; never turn on public standbys in the course broker by sharing flags.

Instrument browser click-to-response, viewer bundle readiness, RFB connection and
first expected drawing pixels. Keep prior drawing visible while preparing the
replacement. Test immediate reruns, teardown and refill as well as the first
run. A successful POST or RFB connection does not satisfy the drawing target.

The shared viewer currently exports a PNG data URL every 500 ms to retain a
frame. Profile its main-thread/encoding cost on Chromium and WebKit before
changing it. Optimize only if it materially affects responsiveness; any change
must preserve drawings on completion, timeout, disconnect and panel expansion,
without reconnecting the socket or changing ownership. Do not call a new PNG
export an incoming-frame signal.

For startup benchmarks only, use a fixed colored line and `speed(0)`. Production
helpers keep `speed(1)` and delay 25 ms, as approved in earlier teaching designs.
Students can request faster animation through existing Python commands; this
initiative adds no default animation or helper-version change.

Warm enablement requires the existing combined host budget, actual rootless
cgroup enforcement, current runtime-bound envelope, independent slice metrics,
and original 100-run performance/recovery gates. The existing 3 GiB headroom
requirement remains. The earlier reported 8.97 GiB of main-service ceilings,
plus trial slice, course guests and deployment overlap, is a warning that the
strict budget may not fit on this host. Re-render the actually enabled profiles;
idle RAM alone cannot justify enabling it. Do not double-count the trial slice
or omit dynamically created course guests when calculating allocations.

If the envelope or performance gate fails, retain cold mode and publish the
reason. Do not reduce unrelated memory ceilings or waive headroom to force a
pass. Cold-path fixes may ship independently. A budget failure can justify a
later dedicated execution host even while current average RAM remains low.

## 9. Page and editor loading

Capture production-build browser waterfalls and CPU traces for `/turtle`, one
standard/PDF-code lesson, and one course Turtle lesson. Include fresh assets,
cached assets, direct links and in-app navigation. Use fixture content rather
than production student bodies in shared artifacts.

Monaco is already dynamically imported and versioned local assets are configured;
noVNC already has a cached/preloaded loader. Verify the actual versioned paths,
worker loads, compression, cache headers and cross-origin isolation. An obsolete
unversioned `/monaco/vs/loader.js` returning 404 is not a current-editor failure.

If targets already pass, make no route-loading change. If a trace fails a target,
fix the identified waterfall, duplicate fetch or main-thread work with the
existing component boundaries. Immutable caching applies only to genuinely
versioned assets; never cache authenticated HTML, status, capabilities or private
lesson content globally. Keep same-origin worker/display behavior and access
checks. Do not preload every lesson's editor/media at login.

Follow the installed Next.js guides under
`packages/web/node_modules/next/dist/docs/` for implementation. The lazy-loading
and self-hosting guides were read for this design; APIs must be rechecked
against the installed version when implementing.

## 10. Capacity and combined resource policy

Keep service-speed acceptance separate from classroom throughput. An unqueued
one-second run does not imply that 20 students can run simultaneously. The
public Turtle pilot can start only one execution; completed drawings may retain
that slot until stopped, rerun or expired. Show existing queued/busy states
honestly and preserve cancellation/admission limits.

After latency gates pass, run an isolated capacity experiment at 1, 2, 5, 10 and
20 authenticated simulated clients, stopping when a stage fails. Twenty is a
planning probe, not an approved product capacity. Measure lesson/status reads,
then bursts of official submissions, then a mixed workload with existing
background activity and the permitted public/course Turtle load.

For each step publish queue wait/age, completion throughput, per-run service
latency, rejected admissions, errors, read/API p95, pool census and host/container
pressure. Retain bounded queues. Never submit fake attempts through real student
accounts or grant a load tool access to hidden production cases. The existing
`deploy/load/k6.js` public-page/readiness test does not cover grading or drawing
and is not classroom-capacity evidence.

Before a resource increase, render effective enabled Compose profiles privately,
include course guest ceilings, rootless parent slice and deployment overlap, and
account for OS/monitoring headroom. Keep limits finite. CPU ceilings may be
oversubscribed, so approve changes based on measured mixed-load behavior rather
than a misleading sum of CPU limits. Do not change parent quotas accidentally.

If queue wait exceeds five seconds p95 at a tested submission burst while all
service targets pass, report that client count as beyond the desired interactive
capacity. Recommend a separate capacity decision. Consider an execution host or
larger plan only when measured demand, isolation budget or sustained pressure
requires it; do not call an idle-server snapshot a scaling guarantee.

## 11. Verification and release sequence

| Stage | Deliverable and exit condition |
| --- | --- |
| A — diagnostics | Safe stage timings, discovered cgroup metrics, readiness states and sanitized evidence. Demonstrate the repeated-case failure or explicitly record non-reproduction; no unbounded load on student pools. |
| B — grading | Attribute the dominant delay, implement the smallest justified change and pass one/five/ten-case, correctness and mixed-load gates. Record chosen quotas/concurrency and reproducible commands. |
| C — feedback | Narrow authorized manual status read, one-second automatic polling, human-review cadence and draft/identity safeguards. Pass result-display and read-cost gates. |
| D — Turtle | Complete paired Linux/rootless drawing benchmarks and full resource/recovery gates. Enable warm mode only on success; otherwise ship eligible cold fixes and record that standby remains blocked. |
| E — loading/capacity | Browser waterfall evidence and any justified loading fix, plus tested capacity envelope. Missing classroom headroom becomes an explicit follow-up decision. |

Stages B and C can release independently of warm enablement. Do not label the
entire initiative complete while a mandatory grading/correctness gate fails.
Warm mode may remain explicitly unavailable without blocking independently
verified grading/feedback improvements.

Required targeted regression coverage during implementation:

- Full interpreter turnover beyond capacity plus spare; two official jobs with
  practice/sample/regrade work; starvation, refill failure and recovery.
- Correct and incorrect output, genuine infinite loop, stdin EOF/prompts/Unicode,
  output/memory limits, exit-code behavior, hidden-case filtering, late/duplicate
  replies, process descendants and cleanup barriers.
- Verdict/progress/points transaction rollback and idempotent retry; staff
  attempts remain private and never mutate student grades or rewards.
- Narrow status endpoint access across academy/class/role/preview contexts;
  stale responses, slow/offline requests, retry backoff, visibility changes,
  unchanged drafts, human review and the end of fast polling.
- Existing Chromium/WebKit Turtle functionality: real colored pixels, input,
  retained frames, reruns, timeout, disconnect, expansion and runtime pins.
- Existing standby reconciliation, late Docker create/removal, rootless limits,
  metrics freshness and aggregate memory preflight.

A production-equivalent fixture uses the same images and Linux limits in a
maintenance window or separate approved test host. If it shares this VPS, drain
and transfer the relevant execution budget rather than start an unbudgeted
duplicate pool. Use a separate test database/Redis namespace and fixture users;
live service monitoring may be read-only. Stop on any isolation error, OOM,
unexpected canary timeout, available memory below 3 GiB, or reference API p95
regression over 10% in two consecutive one-minute windows. Keep short diagnostic
runs separate from the full acceptance run; do not discard failures from either.

Production rollout is a later action. First deploy telemetry in compatibility
mode with no scheduling change, then verified lifecycle fixes, then the selected
resource configuration, feedback changes and independently gated Turtle changes.
For a one-worker deployment, draining all grading queues and upgrading the
coupled worker/sandbox is the canary boundary; do not add a second production
consumer/pool outside the budget. Activate readiness admission only after the
upgraded peers and fixture checks pass. Retain pinned prior images/configuration.

Observe at least 30 minutes and 20 fixture/approved canary completions before
broad use; keep a 24-hour follow-up for natural traffic. Low traffic cannot count
as acceptance samples, and canary results are not historical regrades. Revert
on correctness/isolation failure, unexpected trivial-case timeout, unbounded
allocation, or the resource/API regression conditions above. A rollback drains
work and restores only the affected image/configuration; it never rewrites
grades, rotates PINs, removes unrelated containers or changes course runtime pins.
Turtle rollback follows the existing cleanup and cold-mode procedure.

## 12. Reviewable implementation surfaces

| Area | Existing files to extend or inspect |
| --- | --- |
| Runner/pool | `packages/api/src/judge/pyodide-engine.ts`, `pyodide-runner.ts`, `process-memory.ts`, `sandbox-server.ts`, `sandbox-protocol.ts`, `sandbox-engine.ts` |
| Judge orchestration | `packages/api/src/judge/judge.main.ts`, `judge.queue.ts`, `execution-capacity.ts`, `case-evaluator.ts`, `grading.service.ts`, existing practice/sample/regrade runners |
| Result updates | `packages/shared/src/content/latest-submission.ts`, relevant API contracts, `packages/api/src/manual/manual.service.ts` and controller, `packages/api/src/learn/learn.service.ts`, `packages/web/src/lib/manual-api.ts`, `components/manual/manual-workspace.tsx`, `components/workspace/use-latest-submission.ts` |
| Turtle/browser | `packages/gui-runtime/src/server.mjs`, `sandbox.mjs`, `standby-pool.mjs`, `telemetry.mjs`, `scripts/benchmark-startup.mjs`; `packages/web/src/components/manual/gui-viewer.tsx`, `novnc-loader.ts`, `components/turtle-trial/turtle-trial.tsx` |
| Deployment/operations | `deploy/compose.production.yml`, existing Turtle overlays, `deploy/scripts/turtle-resource-envelope.py`, `deploy/monitoring/`, `deploy/load/`, dated verification report under `docs/research/` |

Extract focused helpers only where needed for lifecycle telemetry, status reads
or benchmark fixtures. Avoid unrelated restructuring of authoring, video,
curriculum, notifications or the points system. No application database schema
change is required by this design.

## 13. Technical references

- [Docker resource constraints](https://docs.docker.com/engine/containers/resource_constraints/):
  CPU quotas cap a container independently of host idle CPU. This supports the
  quota experiment, not a claim that quotas explain every measured delay.
- [Node child process events](https://nodejs.org/api/child_process.html#event-close):
  process exit and closed stdio are separate lifecycle boundaries. Preserve
  output-drain correctness when reducing execution overhead.
- [Pinned Pyodide 0.27.5 JavaScript API](https://pyodide.org/en/0.27.5/usage/api/js-api.html):
  interpreter initialization is distinct from execution. Do not assume newer
  snapshot/caching APIs exist in the deployed runtime.
- [Existing Turtle operations](../../operations/turtle-startup-performance.md)
  and [production deployment procedure](../../operations/production-deployment.md):
  the independent warm enablement gates and normal release/rollback workflow.
  The local October 24 deployment record corroborates the live cold-mode
  snapshot, but is not required to use this committed specification.

The implementation handoff must contain sanitized baseline/candidate artifacts,
root-cause attribution, passed and failed gates, exact effective resource
settings, tested concurrency and rollback references. It must state whether
warm mode is actually enabled. A faster health endpoint or a successful small
smoke run alone is not evidence that grading or first drawing became faster.


## Navigation implementation addendum (2026-10-27)

The user approved implementation after the production page-navigation audit.
This work follows the existing design and the audit's recommendations. Prefer
scoped SQL summaries and a separate outline DTO over more hardware or a shared
permission cache: summaries reduce database round trips without stale access,
whereas quota changes alone retain oversized reads. Full client-only loading
would move the wait without removing the underlying database work.

- Course lists fetch course/provenance metadata and one academy-scoped aggregate
  for displayed IDs. Counts preserve empty modules/lectures, all material kinds,
  and module/lecture/material visibility independently of the course flag.
- Class lists use the same batched counts for assigned courses instead of nested
  availability graphs. Keep class status, roster counts, teacher roles and
  academy authorization unchanged; detail reads retain their existing contract.
- Add an authenticated curriculum-review `getOutline` endpoint. Its distinct
  schema contains only builder metadata and exercise badges, never exercise
  descriptions, starter code, test cases or hints. The complete tree and
  authoring endpoint remain available for editing. Builder consumers migrate
  together; an outline must never masquerade as a complete exercise draft.
- Builder queries use an outline-specific cache key under the existing course
  invalidation prefix and a short freshness window to avoid the immediate
  duplicate read. Mutations continue to revalidate authorization on the server.
- Administrator tables load independently of supplementary counts, which use
  the existing client query/error state. Retain the existing loading boundaries.
- Do not weaken authorization, cache permissions between requests, change
  production quotas, deploy, or resume the stopped grading benchmark.

Validate with real PostgreSQL equivalence tests against the old tree summaries,
empty/hidden/mixed-type and cross-academy fixtures, outline privacy/permission
and editor regression tests, API/web/shared type checks, and a production web
build. Local query/payload measurements are not a production latency claim.
The <=1.5-second navigation target still requires a controlled deployed test.

The account read also moves to one fresh, explicitly projected SQL snapshot
instead of loading the full Prisma graph. Keep the same response serializer,
status denial, missing-account bootstrap, DLAB filtering and avatar signing.
Never include credentials or contact/student profile data in that projection.
Server-rendered RPC uses an optional runtime-only `INTERNAL_API_RPC_URL`;
Compose supplies `http://api:4000/api/rpc` on the existing private network.
Browser requests retain the public origin. Authorization headers and role-view
behavior remain unchanged. Deploy the additive API endpoint before the web.
