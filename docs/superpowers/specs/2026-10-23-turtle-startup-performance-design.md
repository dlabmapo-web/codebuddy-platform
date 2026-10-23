# Faster public Turtle startup on the existing VPS

Date: 2026-10-23 (Asia/Seoul)
Status: approved by the user on 2026-10-23 for implementation and real local tests.
Deployment is deferred. Production warm enablement remains subject to the gates below.

## 1. Outcome and scope

Reduce the time between clicking **Run** at `/turtle` and seeing the program's
first drawing. The user reports approximately 2–3 seconds today and selected
**faster startup on the existing VPS first**, with classroom capacity handled
separately.

Retain CPython/Tk, the beginner `custom` module (`TForward`, `TLeft`, race
helpers), the current editor/layout, Korean/English support, academy PIN access,
and isolated guest execution. Keep one active guest execution and a queue of at
most four. A prepared environment is infrastructure capacity, not another
student execution slot. This release does not promise 20 simultaneous students.

The recommended change is one clean, unassigned standby container, created
before Run and destroyed after its first use. Measure the existing path before
enabling it. Viewer preloading and removing the empty-asset setup operation are
smaller improvements that can ship independently.

This extends the [public Turtle design](2026-10-22-public-turtle-trial-design.md)
and [rootless pilot design](2026-10-22-turtle-rootless-pilot-design.md). It
supersedes their allocation rule only to allow broker-owned empty standbys;
page visits and PIN entry still never allocate an environment to a visitor.
The existing pilot remains the deployed behavior until a separate release.

## 2. Evidence and diagnosis

Source reviewed at commit `74fee409`:

| Source | Current behavior and consequence |
| --- | --- |
| `packages/web/src/components/turtle-trial/turtle-trial.tsx` | Run awaits deletion of an existing active drawing, then posts a new run. The viewer mounts after the response. A retained drawing can remain visible during startup. |
| `packages/api/src/turtle-trial/trial.service.ts` | Redis reserves the request and its budget, the private broker starts the run, then the API binds ownership and rechecks admission. Retry reconciliation uses owner/request key. |
| `packages/gui-runtime/src/server.mjs` | Each launch runs a fresh container, probes VNC with repeated Docker execs, inspects isolation, runs asset setup even for an empty list, and starts Python in another exec. RUNNING currently means the program process was spawned, not that a drawing frame arrived. |
| `packages/gui-runtime/docker/boot.sh` | Starts Xvfb and x11vnc per container. There is no fixed 2–3 second sleep. |
| `packages/web/src/components/manual/novnc-loader.ts` | Caches the viewer script promise, but first loads it when the viewer requests it. |
| `packages/web/src/components/manual/gui-viewer.tsx` | Establishes WebSocket/RFB after mounting. The connect event is not proof that student drawing pixels arrived. |
| `deploy/compose.turtle-trial-rootless.yml` | One active execution; private broker limited to 256 MiB and 0.5 CPU. |
| `deploy/scripts/setup-turtle-rootless.sh` | The rootless daemon and student scopes share a 1 GiB memory maximum, 1.5 CPU quota, no swap, and 256 tasks. Each student container has a separate 512 MiB/one CPU/64 PID limit. |

A read-only production snapshot on 2026-10-23 showed approximately 9 GB available
memory and load averages below one. That does not measure per-run throttling or
rule out transient contention. Fresh container/display startup is a plausible
major contributor, not a measured breakdown yet. Queuing is a separate delay;
the one-second status poll is not an obligatory delay for an unqueued launch,
because the initial POST already waits for launch.

## 3. Approaches considered

| Approach | Benefit | Trade-off and decision |
| --- | --- | --- |
| Measure and streamline the current cold path | Small change; no additional resident sandbox. | Still starts Docker/Xvfb for every Run. Ship as the baseline stage. |
| Keep one clean standby with a strict container budget | Removes container/display preparation from a warm Run while retaining fresh Python and files. | Requires lifecycle coordination and a verified host budget. Recommended after baseline measurements. |
| Replace the runtime with a browser interpreter or add execution hosts | Could change latency or capacity substantially. | Separate compatibility/capacity project. Outside this release. |

Do not reset and reuse an environment after arbitrary student Python has run.
Clearing turtle graphics does not remove files, child processes, Python state,
or other changes made by that program.

## 4. Measurements and release targets

These are acceptance targets, not claims of achieved production speed.

Record monotonic durations within each process. Do not subtract browser and
server wall clocks. Keep queue wait separate from service startup, and report
warm, cold, initial-run, and repeat-run samples separately.

| Measurement | Definition / target |
| --- | --- |
| Click feedback | Run shows its pending state within 100 ms on the reference browser, with no second submission. |
| Warm first drawing | Click to the first expected drawing pixels: p50 ≤1.0 s and p95 ≤1.5 s, with no queue and network RTT ≤80 ms. Repeat runs include retiring the previous drawing. |
| Relative improvement | Warm p95 first drawing is at least 40% lower than the measured baseline under the same workload. Both absolute and relative gates must pass. |
| Cold first drawing | p95 ≤4 s under the same conditions, reported separately. Missing standbys must not silently lose runs. |
| Startup bound | Container preparation and claim-to-Python launch each have an overall 15-second deadline, separate from the student's execution allowance. |
| Refill | Under healthy baseline load, a replacement standby is ready within 5 s at p95. A second click before refill is permitted to use the cold path. |
| Resource regression | No host/slice OOM, no container-count overshoot, and no more than 10% regression in active drawing completion or reference application p95 response time compared with the same-load baseline. |

Benchmark at least 100 unqueued runs per mode in a production-equivalent Linux
fixture before enabling standbys: the same immutable images, resource limits
and network conditions. This does not require purchasing another server: the
existing VPS can host an isolated fixture during a reserved maintenance window,
with the public guest pool drained and its allocation budget transferred to
the fixture. Never run duplicate execution pools outside the combined budget.
Keep course services untouched and abort on host pressure. Include first-run
cold viewer cache, cached viewer runs,
repeated runs after refill, and immediate reruns before refill completes. Bypass
neither PIN admission nor normal request limits; use several disposable grants
and pace requests to their existing budgets.

Use a deterministic small drawing with a known initial colored segment and
`speed(0)` for startup measurements. Observe expected canvas pixels in the
browser test; an empty framebuffer, RFB connection, or RUNNING status is not
the first drawing. Keep slower teaching animation and randomized race examples
in functional tests rather than mixing their execution time into startup SLOs.
Store raw timings, sample counts, p50/p95, failures, warm-hit rate and resource
snapshots in a dated verification artifact. Report failures as failures, not
discarded latency samples.

## 5. Instrument first, then streamline

Instrument the existing cold path before changing allocation. Add bounded
stage timers for prior-run cleanup, API authorization/reservation, queue wait,
Docker creation, display readiness, sandbox inspection, asset installation,
Python spawn, and total launch. Record browser click-to-response,
viewer-script load, and RFB connection separately in the benchmark. A Python
spawn measurement is explicitly not Python/Tk readiness.

Use server-generated opaque trace IDs for cross-service correlation. Logs may
contain trace/session IDs, stage, duration, warm/cold mode, runtime image ID and
fixed failure categories. Never log source, stdin, PINs, cookies, capabilities,
secrets, request bodies or raw Docker stderr. Do not make session, owner,
request-key or academy IDs metric labels.

For the fixed trial profile, skip `/opt/assets.py` when `assets.length === 0`.
Retain manifest path validation and the existing read-only, root-owned empty
assets mount. Course runs with assets retain the existing installation path.

After successful guest bootstrap/admission, preload the existing noVNC bundle
using its cached loader. This only loads JavaScript: it creates no socket,
session or container. Loader failure must leave the editor usable and permit
a later retry through the existing loader. No authentication flow, helper
semantics, turtle speed, pen width or interpreter behavior changes.

## 6. Standby architecture and boundaries

Keep the broker as the sole owner of allocation. Extract focused runtime
modules instead of adding another collection of flags to the HTTP handlers:

| Component | Responsibility and contract |
| --- | --- |
| Sandbox driver | Creates, probes, inspects, launches Python in, and removes containers. Receives an explicit Docker connection and immutable profile; does not authorize visitors or schedule requests. |
| Standby pool | Owns unused containers and their state; offers `claim(profile)`, `reconcile()` and `close()`. Returns one exclusive handle or a bounded cold-preparation outcome. Never stores student source or capabilities. |
| Session scheduler | Owns FIFO admission, one active execution, teardown barriers and idempotent request/session lookup. Uses pool handles without exposing them to HTTP clients. |
| Telemetry | Fixed-category durations, counters and gauges, with no source or credentials. |

These names describe contracts; implementation may use functions or objects
consistent with the existing runtime. No external queue service or database
migration is required. The course broker uses the existing cold path and must
not activate the trial standby feature.

### 6.1 Pool identity and preparation

Standbys match the exact immutable runtime image ID, 1024×640 display, 512 MiB
memory, one CPU, 64 PID profile and sandbox security configuration. In this
release only the current default trial runtime is eligible; a retained image
must use its own validated cold launch rather than claim a mismatched standby.

Preparation starts only trusted image entrypoint programs (Xvfb/x11vnc), waits
for the display, and verifies isolation. It does not execute student code,
write `/work` source, create grant/session capabilities, or cache a Python
interpreter shared with later runs. Python/Tk initialization remains on the
claim path in this version; measure its remaining contribution before proposing
an interpreter preload protocol.

Assign labels for the trial pool, broker generation, profile version and standby
role. Use immutable Docker IDs for subsequent operations. Before assignment,
reinspect that ID, verify it is still running, and verify image, non-root user,
network isolation, filesystem, mounts, seccomp and resource limits using the
same policy as a fresh launch. Readiness alone is not isolation verification.

### 6.2 State and ownership

Container lifecycle:

`CREATING → VERIFYING → READY → CLAIMED → DRAINING → REMOVED`

Creation/verification failure, idle expiry, failed claim, image change or
cancellation retires the container through DRAINING; no transition returns
CLAIMED or DRAINING to READY. READY has never executed student source. Assign
fresh session ID and display token only through normal authorized Run handling.

Reserve capacity synchronously before the first asynchronous Docker operation.
Move READY to CLAIMED atomically before writing files or spawning Python. A
request key can map to only one session, and one container can map to only one
claim. Duplicate requests and ambiguous HTTP failures return/reconcile the
existing session through the established API/Redis mechanism.

Public states remain QUEUED, STARTING, RUNNING, WAITING_INPUT, DISPLAYING and
the existing terminal states. Pool states are broker-internal. Idle standbys
have no owner, source, public URL or viewer token and are never discoverable
through public session endpoints.

### 6.3 Global budget and scheduling

One broker may have at most **two allocated container slots in total**: one
student run and one standby, including containers being created or removed.
An uncertain Docker create/removal outcome retains its slot until reconciled;
a timed-out CLI operation is not proof the daemon did no work. Do not refill
or fall back by creating an extra container when the budget is uncertain.

There is one refill worker and at most one unclaimed standby. On Run, after the
previous active container is confirmed removed, claim READY immediately. If a
matching preparation is already in flight, await that preparation within its
remaining deadline instead of creating a duplicate. Otherwise use the same
validated fresh creation path, within the two-container budget. Prioritize an
admitted run over idle rotation or speculative refill.

After a claim, refill asynchronously while the run executes, subject to that
budget. With an active container draining and an unused standby present, wait
for removal before assigning the next active execution; do not admit two
student programs to hide cleanup latency. The container slot remains occupied
until removal is confirmed even if the public session is already terminal.

Dispatch queued work promptly on confirmed resource release, rather than
waiting for the one-second maintenance tick. Keep the tick as a recovery
sweep, and retain the 60-second queue expiry, bounded FIFO queue, one active
run per grant and existing request limits. A displayed drawing still occupies
its execution slot under today's rules; do not evict it for another visitor.

Expire unused READY containers after ten minutes and replace them serially.
Never pull images on the Run path. Deployments must pre-pull approved images
into the independent rootless daemon.

### 6.4 Cancellation, deadlines and accounting

For a cold launch, preparation has a 15-second overall deadline; claiming and
launching Python then has its own 15-second deadline. A warm claim uses only
the latter. Individual Docker calls
must honor the remaining budget and cancellation; the existing blanket
30-second per-command timeout must not multiply into minutes. A late async
completion must check its generation/cancelled state before assigning source,
publishing readiness or launching Python. Unknown Docker outcomes are
quarantined and reconciled, not returned to the free-slot count.

Stop, Clear, Exit, PIN revocation, grant expiry and session expiry retire the
claimed container and descendants, including during preparation. Recheck the
existing authorization expiry immediately before Python launch. Preserve the
API's grant recheck and cleanup after binding; do not bypass Redis admission
because a container is ready.

For the public trial, set `startedAt` and start the 120-second execution
deadline immediately before spawning the student's Python process. Track
`preparationStartedAt` separately for diagnostics. Queue/standby time never
consumes the execution allowance, and a failure before Python spawn settles
at zero executed seconds through the existing idempotent settlement rules.
After spawn, retain conservative accounting when execution outcome is unknown.
No run may survive grant expiry, even if it has execution time remaining.

## 7. Resource and isolation requirements

Do not put the extra standby under the current 1 GiB slice without a capacity
decision. Proposed warm-mode slice: MemoryHigh 1536 MiB, MemoryMax 2 GiB,
MemorySwapMax 0, CPUQuota 150%, TasksMax 256. This covers two 512 MiB container
ceilings plus daemon/tmpfs/management headroom; it is a ceiling, not measured
usage or a guaranteed capacity reservation. Keep each container's existing
limits and keep the broker at 256 MiB/0.5 CPU unless measurements justify a
separately reviewed change.

Before enabling warm mode, inventory the actual enabled main-stack services,
the separate broker, rootless slice, active course execution budgets and
deployment overlap. Extend deployment validation to include them rather than
validating only the main Compose file. Preserve at least 3 GiB host headroom
using a conservative allocation model, avoid double-counting guests already
inside a slice, and do not treat a single free-memory snapshot as proof of fit.
If the budget does not fit, ship the measured cold-path improvements with
standbys off. Do not silently reduce other services' limits or increase the
host allocation to force this feature through. Moving guest execution to a
dedicated host is a separate capacity decision.

Warm mode startup verifies the configured budget and the actual slice's memory,
swap, CPU and task limits before creating two slots. Operators supply the
verified slice information through the deployment check; the broker additionally
verifies its daemon and container controllers. A missing or mismatched check
blocks warm enablement. Update the setup script with an explicit, backed-up
migration for the existing slice; its current refusal to overwrite differing
configuration must not be disabled indiscriminately.

Keep independent rootless Docker, its private socket, systemd/cgroup v2 checks,
network=none, no-new-privileges, all capabilities dropped, seccomp, read-only
root, bounded tmpfs, no host binds in guest containers, and non-root Python.
No student container receives broker secrets or Docker access. All accounting
includes CREATING and DRAINING containers. No fallback to course Docker or
rootful guest execution is allowed. Verify actual kernel limits, not just
successful CLI arguments.

Docker's [rootless resource-limit documentation](https://docs.docker.com/engine/security/rootless/tips/)
requires cgroup v2/systemd for these controls. Its
[resource-constraint documentation](https://docs.docker.com/engine/containers/resource_constraints/)
explains that container limits require explicit configuration. These support
the verification requirements, not the proposed speed targets or host sizing.

## 8. Failure handling and operations

`GUI_WARM_STANDBY` is a proposed broker configuration accepting only `0` or `1`,
default `0`. Reject `1` outside the trial-only profile or when the verified
two-slot resource envelope is unavailable. Keep `GUI_SESSION_CAPACITY=1`.
The flag is deployment-time configuration; changing it drains the public broker
and restarts only that broker. Course runtime configuration stays unchanged.

Private health keeps its existing ready/pool/capacity contract and adds standby
ready/building/draining counts, allocated slots, warm enabled/degraded state,
and fixed failure reason categories. No READY standby by itself is not an
admission outage: if the verified cold path is usable, ready remains true.
Daemon/controller/image integrity failures fail admission closed.

For ordinary preparation failures, delete and confirm retirement, then retry
with 1/2/4/8/16/30-second backoff and bounded jitter. Three failures in 60 seconds
open a 60-second warm-preparation circuit breaker. Healthy cold execution may
continue within the resource budget; controller/isolation failures or uncertain
resource ownership instead block new launches until reconciliation. Never mark
a failed or partially used environment READY.

On broker startup, retain the existing dedicated-daemon, cross-pool guard.
Remove stale trial containers from earlier generations before refilling. If
course-labeled containers are found, fail startup without deleting them.
On daemon restart, preserve the existing socket-rebinding broker restart hook;
reconcile old standbys and sessions before readiness. On shutdown, disable
refill first, cancel/await builders, stop sessions and remove standbys. No
late completion may recreate a container after shutdown cleanup.

Expose fixed-label counters/gauges and stage-duration histograms at a private
broker `/metrics` route using a separate metrics-only bearer credential. It
must authorize only this route, never execution control. Configure Prometheus
with a protected credential file and private control-network access; publish
no broker port and keep Caddy's display gateway restricted to WebSocket session
paths. Do not expose metrics through `/turtle/api`. Validate the additional
Prometheus network membership and the metrics/control credential separation.

Collect slice usage/limits, `memory.events` and `cpu.stat` on the host rather
than assuming rootful cAdvisor sees the independent rootless daemon. Install
a narrowly scoped user-systemd collector alongside the rootless service. Every
20 seconds it reads only the known Turtle cgroup and atomically publishes
non-secret Prometheus textfiles, including collection time. Mount only that
metrics directory read-only into node-exporter and enable its textfile collector;
do not mount the user home or a Docker socket there. Missing/stale samples over
60 seconds are unhealthy for warm enablement. The resource preflight still reads
the actual kernel configuration before rollout; a cached sample alone is not
permission to enlarge the pool.

Add dashboard panels for warm hits/misses, stage p50/p95, failed launches,
queue depth/wait, allocated containers and slice pressure. Alert on metrics
unavailability after five minutes, uncertain cleanup or allocation-budget
violations immediately, three preparation failures in one minute, and any
increase in slice OOM events. Warm-miss/startup warnings require at least 20
unqueued samples in a 15-minute window: warn when hit rate is below 80% or
warm broker launch p95 exceeds one second for ten minutes. Browser first-drawing
latency remains a synthetic benchmark, not a claim inferred from broker timing.

## 9. Student experience and compatibility

Keep immediate localized pending feedback, code editing and downloads. Preload
the viewer without reconnecting or showing a PIN gate on language changes.
Clearly distinguish Preparing from Waiting for a drawing space. The current
toolbar already has a pending message; refine it only if testing identifies a
gap, rather than introducing another panel.

Stop/Clear/starter-switch behavior, per-starter drafts, retained frames, stdin,
race coordinates, custom imports, bold strokes, turtle size, explicit speed
settings and standard turtle compatibility must remain unchanged. A new run
clears prior output and displays only the new run. A failed start retains the
student's code and offers the existing retry path.

## 10. Verification requirements

| Level | Required evidence |
| --- | --- |
| Pool/scheduler unit tests | Concurrent claims, duplicate request keys, one refill worker, two-slot bound, removal barrier, FIFO release, expiry, image mismatch, stale generation, cancellation at every async boundary, and no used-container return to READY. |
| Driver fault tests | Docker create/probe/inspect/spawn/remove failures and timeouts; late completion; unknown outcome quarantine; circuit recovery; isolation failure refusing admission. |
| API/Redis integration | Ownership, rate limits, PIN rotation/revocation, grant expiry, original-request recovery after transport timeout, one settlement, zero charge before spawn, bounded queue and one active run per grant. |
| Real rootless runtime | Warm/cold drawings, helpers, race, stdin, output limit, 120-second timeout, fork/memory pressure, actual cgroup ceilings, blocked network, read-only root and descendant cleanup. A subsequent run sees no prior files or processes. |
| Browser | Chromium/WebKit, EN/KO, first/repeat/immediate runs, slow/offline viewer script, retained drawing replacement, starter switch, Clear/Stop, language switch without PIN flash, recovery after refresh, mobile layout, and expected-pixel first-drawing measurement. |
| Recovery | Kill warm container; broker crash during creation/claim/removal; rootless daemon restart/socket replacement; pending request retry; wrong image/security profile; shutdown with refill in flight; full queue. Confirm no orphan or cross-pool removal. |
| Resource/load | Same-load cold/warm comparison, one active + one warming, worst-case guest memory and PID use, rapid reruns, queue expiry, refill CPU contention, and existing course/web/API activity. Include idle standby cost and slice memory.events/cpu.stat. |
| Deployment | Compose and systemd budget checks, secret-free examples, no public REST/metrics/VNC, separate metrics credential, pre-pulled digest, feature off/on rollback, and unchanged course broker. |

Use meaningful lifecycle and isolation tests rather than timing assertions in
unit tests. Run benchmarks in the dedicated fixture environment described in
section 4; never restart a daemon serving live users, rotate a real academy PIN,
stop a visitor's run or flood the one-slot production pool to collect samples.
A public smoke check uses an operator-controlled disposable academy/grant
during an agreed idle window.

## 11. Delivery and rollback

1. **Baseline:** add stage telemetry and a repeatable benchmark; record the
   current distribution and resource inventory. Keep standbys disabled.
2. **Small improvements:** ship empty-asset skipping and viewer preloading;
   repeat the same benchmark and retain the results even if warm mode is blocked.
3. **Standby implementation:** add the bounded pool, shared sandbox verification,
   scheduler teardown barriers, lifecycle tests and disabled-by-default config.
   Add private metrics and deployment resource validation.
4. **Enablement gate:** pass the combined host-budget check, real rootless
   security/recovery checks, performance targets and regression limits. If any
   gate fails, leave warm mode off and document the measured bottleneck.
5. **Production rollout:** use immutable approved images and the existing
   protected release process. Drain public execution before broker/slice changes;
   do not restart course services. Verify cold fallback with warm mode off,
   then enable one standby and observe through at least one normal teaching
   session. Do not announce measured speed before results exist.

Rollback to cold mode by disabling admission to new public runs, waiting for
active runs to finish (at most the established run lifetime), setting standby
to `0`, and restarting only the private trial broker. Verify no standbys remain
and cold execution works, then reopen admission. Keep the larger slice ceiling
until all extra containers are confirmed removed; restoring the original limit
afterward is optional and must be validated. For integrity/resource emergencies,
close public admission and stop only the trial pool rather than weakening
isolation. Preserve PIN pepper, academy codes, grants and student drafts.

## 12. Completion and review

The change is complete only with benchmark artifacts demonstrating the stated
targets, passing lifecycle/isolation/recovery checks, a combined host resource
budget, working monitoring/rollback, and a verification record separating
local/staging results from production observations. If only instrumentation or
cold-path improvements are delivered, report that limited outcome explicitly.

Review decisions: confirm the proposed two-slot/2 GiB envelope fits the actual
host budget before implementation enablement, and accept the warm/cold targets
as release gates. This spec does not authorize bypassing the existing GitHub
production approval process or changing classroom concurrency.
