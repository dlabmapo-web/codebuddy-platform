# Native grading for a 200-student classroom burst

Date: 2026-11-01 (Asia/Seoul).
Status: proposed design for user review; implementation, hardware purchases,
production load tests and deployment are not authorized by this document.

## 1. User requirement and decision

The user requested inspection of the existing VPS, cleanup of cancelled grading
experiment artifacts, and a concrete grading-speed specification. During that
work they selected **200 students submitting at the same time, everyone seeing
results within five seconds**, for short programs with ten cases.

Use native CPython grading with fresh per-case execution isolation and a
prewarmed, horizontally scalable executor fleet. Retain the existing application,
Redis/BullMQ concepts, comparator semantics and atomic grading transaction.
Keep the current six-vCPU VPS as the initial control-plane candidate. Do not
promise that one such VPS can satisfy the 200-student requirement.

The earlier experiment is cancelled. Its Docker artifacts have been removed;
this design does not resume its maintenance window or deploy its images. Its
source, tests and research are references for compatibility and failure probes.

## 2. Evidence and alternatives

The [VPS inspection and cleanup record](../../operations/2026-11-01-grading-vps-inspection-and-cleanup.md)
records current deployment identity, resource ceilings, historical host metrics,
and completed cleanup. It supersedes earlier SSH-access uncertainty.

Live browser diagnostics in the requesting session measured:

| Workload | Cove Submit to visible result | Elice comparison |
| --- | --- | --- |
| One case, five timed probes | 2.19–2.77 seconds | Not measured for the same fixture |
| Two-case weather exercise | 3.31–4.45 seconds | Approximately 3.2–3.9 seconds |
| Four-case menu, partial / correct | 6.95 / 8.11 seconds | 3.48 / 3.22 seconds, identical submitted programs and matching scores |
| Ten cases, `print(0)`, repeated | 33.17 / 30.47 seconds | Not measured on the same ten-case exercise |

The ten-case individual runtimes summed to approximately 1.28 / 1.13 seconds.
Visible progress continued throughout the wait. Browser measurements include
automation overhead, have small sample sizes and are not production percentiles.
The runtime total shown in the result header is not the sum of all case times.

Current source runs cases sequentially, destroys every used interpreter, and
serializes Pyodide replenishment. Effective production settings are two slots
and one spare. This explains the observed increasing wait as cases consume the
ready pool; the exact production stage split remains to be measured.

The [local native prototype](../../research/2026-10-27-native-grading-prototype-verification.md)
measured ten-case engine medians of 2.626 seconds native versus 12.397 seconds
Pyodide. Its slowest simultaneous native total was about 5.9 seconds, excluding
application admission and committed grading. It did not establish classroom
capacity or production compatibility.

| Approach | Benefit | Decision |
| --- | --- | --- |
| Native execution plus prewarmed fleet | Removes repeated WASM initialization and adds measurable parallel capacity | Recommended for the selected requirement |
| Native execution only on the existing VPS | Smaller first deployment; likely improves individual jobs | Useful baseline, insufficient evidence for 200 results in five seconds |
| More Pyodide slots, CPU or spares | Smaller configuration change | Retains expensive refill and bounded host capacity; does not establish this requirement |

## 3. Exact latency and workload contract

The five-second target is an **all-results release gate**, not p95. For each
submission, measure from the student's Submit action to its committed terminal
grade displayed in the visible browser. Also report acceptance-to-commit,
queue wait, execution, comparison, commit, and commit-to-display separately.
Preserve every error, rejected admission, timeout and result over five seconds.

The initial classroom qualification uses 200 distinct authorized students, each
submitting once within a one-second arrival window, with:

- Ten sequential STDIO cases per submission; unchanged scoring/comparators.
- Deterministic short Python programs, including correct, wrong-output,
  Unicode/input/prompt, runtime-error, and representative curriculum solutions.
- Up to 512 MiB authored learner memory, source up to 10,000 characters,
  aggregate case stdin up to 64 KiB and output up to 16 KiB per case.
- No package installation, GUI, external I/O, intentional sleeps or deliberate
  resource exhaustion in latency fixtures. Their separate correctness tests
  retain existing author-defined limits.
- A recorded classroom network profile: RTT at most 80 ms to the application,
  at least 20 Mbps per client, and independent load generators that are not the
  throughput bottleneck. Report slower-client results separately.

These are benchmark boundaries, not new product limits or permission to reject
existing exercises. Larger inputs, heavier computation and memory limits up to
the current 4,096 MiB protocol ceiling require corresponding capacity classes
and separate SLOs. A program legitimately consuming its full long execution
allowance cannot be guaranteed a five-second total result. Product communication
must state this boundary before making a universal grading-speed claim.

All 200 qualifying results must meet five seconds during normal operation.
Also publish p50/p95/p99/max; passing percentiles cannot excuse a missed result.
A provisional critical-path budget is 0.75 seconds for admission, 3.5 seconds
for queue/execution/comparison, and 0.75 seconds for commit and display. Measure
the actual path rather than adding overlapping asynchronous stage totals.

## 4. Architecture and interfaces

### 4.1 Admission, immutable runtime and queues

The API authorizes the student/class/material, freezes the grading inputs and
runtime identity, persists the submission and dispatches its ID to a compatible
queue. Keep the existing unique in-flight guard and per-user rate limits; 200
students are not one account making 200 attempts.

Introduce a native runtime contract distinct from `pyodide-*`, recording engine,
exact Python version, architecture, immutable runtime image/rootfs digest,
sandbox-policy version and comparator identity. Extend snapshot validation and
runtime mismatch checks explicitly. Release manifests pin all runtime inputs;
native work must never be labeled as historical Pyodide work.

Route new native submissions through a versioned native queue family, including
official, staff-practice, sample and regrade variants. Existing Pyodide queues
and workers continue handling their own snapshots. Dispatch, recovery sweepers,
monitoring and result-event subscriptions must use recorded runtime identity.
An old worker cannot claim native work during a rolling release.

### 4.2 Trusted worker on each execution node

Run existing grading orchestration on execution nodes. Workers consume the
appropriate BullMQ queue and talk to their local sandbox launcher over a private
Unix socket. This preserves local execution boundaries and avoids a new public
student-code execution API. Trusted workers alone receive narrowly scoped
database/Redis access over authenticated encrypted connectivity.

Each node has a fixed reviewed official-job capacity, bounded comparator pool
and reserved official capacity over background work. Fleet capacity is the sum
of healthy ready nodes' bounds. Queue configuration must not introduce a hidden
global concurrency cap. Background reservations apply on every node and are
verified under mixed fleet load; separate queues alone do not reserve CPU.

### 4.3 Fresh native case execution

Implement the `ExecutionEngine` behavior using a long-lived trusted launcher and
a fresh native CPython process in a fresh per-case Linux jail. Pin NsJail and its
policy/rootfs. Docker may package node services, but Docker create/start/remove
is not performed per case on the intended high-throughput path. The cancelled
per-container prototype supplies reference probes, not an accepted security
boundary for this new launcher.

Every jail gets private PID/mount/IPC/network isolation, non-root execution,
read-only runtime files, private bounded scratch storage, an explicit minimal
environment, dropped learner capabilities, no-new-privileges, syscall filtering,
and CPU/memory/PID/output/wall limits. No database credentials, Redis credentials,
Docker socket, expected outputs, comparator code or trusted result channel enter
the learner jail. Required kernel capabilities and cgroup delegation are checked
at startup; an unavailable protection prevents readiness. Do not disable host
security controls automatically to make the launcher start.

Pin a Python 3.12 build for initial compatibility evaluation. The exact patch
and package set come from the immutable candidate manifest and pass the semantic
matrix before eligibility is enabled. Matching a Python version string does
not establish equivalence with Pyodide's Emscripten ABI or memory semantics.

Use separate bounded stdout/stderr pipes and a trusted control channel. Wait for
process exit, pipe drain and confirmed cleanup of all descendants before
releasing capacity. A cleanup uncertainty quarantines the allocation and removes
the node from admission. Never reuse an interpreter or writable case state.
Prewarm immutable filesystem pages, launcher services and comparator pools;
no used learner state becomes standby.

Keep cases sequential within a submission for this release. Parallelizing cases
would change cumulative deadlines, cancellation and continuation behavior and is
not included as a shortcut to the target.

### 4.4 Scoring, persistence and feedback

Reuse current comparator semantics, weighted grading and the atomic
grade/cases/progress/points transaction. Comparison runs outside learner jails.
Do not replace Python regex behavior with JavaScript regex for speed.

Bound worker database pools fleet-wide: API pools + all worker pools + operational
reserve must fit the configured database connection budget. Measure connection
waiting and transaction round trips at 200-client admission/completion. If these
dominate, consolidate queries without weakening authorization, snapshot
consistency, first-solve awards or retry idempotency.

Retain authorized SSE result delivery. Support the native queue family and
terminal results committed before stream connection. Measure commit-to-display
instead of assuming the existing 15-second quiet-stream recovery explains all
latency. Add bounded reconnect recovery if required by dropped-stream tests;
never turn stream failure into a duplicate submission.

## 5. Capacity calculation and host placement

Two hundred ten-case submissions require 2,000 case executions and 200 grade
commits. Five seconds implies at least 40 completed submissions/second and 400
cases/second averaged over the whole window, with less execution time available
after admission and feedback. Native execution alone does not establish those
rates. Instantaneous cold autoscaling cannot satisfy a five-second burst;
required execution capacity must already be ready before class starts.

Size nodes using measured service demand under concurrency. If `D` is total
executor CPU-seconds per qualifying submission and `W` is the available execution
window, `200 * D / W` is a necessary effective-CPU lower bound. It excludes
additional control-plane/comparator demand and does not guarantee tail latency.
For illustration only, `D = 0.2` and `W = 3.5` require at least 11.43 effective
executor CPUs before overhead. This is arithmetic, not a measured demand or a
hardware recommendation. Use full burst replay, not the formula, for acceptance.

Keep the current VPS's live resource ceilings unchanged during this design work.
Its existing configured memory maxima nearly consume physical RAM if reached
together. Place additional execution capacity on separately budgeted nodes;
do not infer a safe new allowance from idle RSS. The VPS itself must still pass
200-client admission, result streaming and database/Redis throughput tests before
it is accepted as the production control plane.

For each execution node enforce a parent resource envelope that counts launcher,
workers, comparators, active/unused/warming/draining/quarantined jails, scratch
storage and daemon overhead. Reserve at least 20% of physical RAM, and no less
than 1 GiB, for OS and operational headroom outside that envelope. Account for
full allowed memory plus runtime overhead per allocation, not observed trivial
program RSS. The scheduler checks tokens for both CPU and memory before claiming
work; high-memory jobs cannot silently consume the standard classroom reserve.

The capacity deliverable is a measured tuple of node hardware, node count,
official/background slots, comparator pools, memory classes, DB connection
budget, exact images, ready state and burst timings. Hardware purchase and
provider choice are a later owner decision based on that result, not part of
approving this specification.

## 6. Failure and compatibility requirements

Cover correct/wrong output, all comparators, prompts, Unicode and truncation,
`sys.exit(0/None/nonzero)`, syntax errors/top-level await, stderr, empty stdin,
memory/CPU/wall limits, large input, output floods and allowed packages.
Maintain existing distinction between student failure and grader failure.
Do not charge startup time as student CPU time or extend student allowances to
hide infrastructure delays.

Kill/reap descendants on cancellation and deadline; retain slots until confirmed
cleanup. Prove isolation against filesystem/environment disclosure, network and
Unix socket access, sibling signal/ptrace access, PID/thread exhaustion, forged
control output, leftover scratch files and launcher crashes. A new process jail
needs its own threat review; passing the earlier Docker prototype's probes does
not certify it.

Exercise worker/node loss, Redis interruption, duplicate queue delivery,
database rollback and SSE reconnect. A terminal grade and its rewards commit
once. Recovery cannot manufacture a wrong-answer verdict for infrastructure
failure. If qualified capacity is unavailable, preserve accepted work, expose
queue state and record the SLO violation rather than silently claiming success.

## 7. Implementation boundaries and release gates

Implement as a sequence with a complete deliverable at each gate:

1. **Native launcher and runtime contract:** deterministic compatibility and
   adversarial isolation suite on production-equivalent Linux; pinned build
   manifest; bounded resource accounting; no production learner traffic.
2. **Full grading integration:** real authenticated admission, immutable native
   snapshot, native queues, worker engine, comparison, committed grade/progress/
   points and visible feedback. Test first/repeat solves and restart recovery.
3. **Measured node capacity:** 100 submissions in each one/five/ten-case cohort;
   one and two jobs in flight; then bounded 5/10/20/50/100/200-client bursts.
   Stop growth on correctness, containment or resource failure. Record failures.
4. **Fleet acceptance:** at least five separate 200-client qualifying bursts,
   after complete replenishment, all results within five seconds in every burst.
   Include background grading and the recorded representative platform read/
   drawing load; reference read/drawing p95 regression must remain at most 10%.
   Also test deploy/cold readiness, higher-memory classes and node failure, with
   their separately reported availability/latency outcomes.
5. **Controlled rollout:** enable eligible new work for a test academy, then
   staged expansion. Stop on any grading discrepancy, OOM, leaked execution,
   duplicate reward or isolation failure. Publish the measured supported class
   size before claiming capacity.

Load generators, fixture accounts, PostgreSQL/Redis and execution nodes must
have an approved isolated test budget. No 200-client production experiment is
authorized here. Testing on the current live host needs a separate maintenance
window and restored resource budget; the cancelled window cannot be reused.

Keep metrics for all existing stages plus admission, launcher readiness, process
start, cleanup, database pool wait, commit and display. Use monotonic durations
within processes and a server trace ID for correlation; do not subtract
unsynchronized client/server timestamps. Avoid source/output/identity metric
labels. Verify client and generator CPU/network saturation before accepting a
fleet result.

## 8. Rollback and explicit exclusions

Disable native admission for new work to roll back, then drain or recover
already accepted native snapshots with the matching native runtime. Existing
Pyodide workloads keep their original queues/runtime. Do not execute a native
snapshot under Pyodide after a switch or regrade historical work automatically.
Retain accepted native image digests until all relevant queued work and the
documented replay retention window have expired.

No Turtle/browser runtime change, curriculum edit, blanket Docker prune, VPS
purchase, production quota change, DB-provider migration, used-interpreter
reset, case parallelism or historical grade rewrite is included. The cleanup
already completed removes cancelled artifacts only and is not evidence of a
runtime speed improvement.

## 9. References

- [Fresh-runner implementation](../../../packages/api/src/judge/pyodide-engine.ts)
- [Current grading transaction](../../../packages/api/src/judge/grading.service.ts)
- [Runtime snapshot validation](../../../packages/api/src/judge/grading-profile.ts)
- [Execution telemetry](../../../packages/api/src/judge/execution-telemetry.ts)
- [Sandbox protocol and supported limits](../../../packages/api/src/judge/sandbox-protocol.ts)
- [NsJail primary documentation](https://github.com/google/nsjail): namespaces,
  cgroups, resource limits and syscall filtering; not a security certification of
  this proposed deployment.
- [Docker resource constraints](https://docs.docker.com/engine/containers/resource_constraints/):
  configured resource limits and host memory accounting.
