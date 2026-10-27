# Local native-grading feasibility prototype

Date: 2026-10-27.
Status: approved by the user on 2026-10-27 for local-only implementation.
No new runtime is selected for production or authorized to regrade historical
submissions. Production configuration remains unchanged.

## Problem and scope

The deployed platform still waits for fresh Pyodide interpreters. Increasing
logical worker count does not remove that cost. The running setting is two
slots on a 1.5-CPU sandbox, despite a development default of four. The broader
[investigation](../../research/2026-10-27-platform-wide-performance-verification.md)
implements measurable shared-read improvements independently.

The next bounded project is a **local-only feasibility experiment** comparing
the existing Pyodide sandbox with fresh native CPython guests. It must answer
whether startup can meet the latency target at the same overall grading budget,
before proposing an application/runtime migration. It does not change the API,
student browser runtime, production worker count, student deadlines, grade
weights, points, queue policy or deployment configuration.

Page reads, grading execution and Turtle are separate implementation cycles.
This proposal covers grading only. It does not claim to solve every page load
or public Turtle startup.

## Alternatives and recommendation

| Approach | Benefit | Limit |
| --- | --- | --- |
| Local native CPython feasibility prototype — recommended | Tests an alternative to repeatedly initializing WASM; can be rejected before touching live grades | Compatibility and isolation require explicit proof; not a production-ready engine |
| Keep Pyodide and compare worker/CPU settings | Smaller implementation scope; may improve throughput or refill | Four workers still share the budget; earlier small CPU tests did not establish the target |
| Add a larger/dedicated execution host now | More independent resources | Does not prove which startup cost or query delay improves; no purchase is part of this proposal |

The prototype is preferable to silently switching engines or increasing
production resource ceilings. A failing prototype is useful evidence and must
not be hidden by relaxing limits.

## Experiment architecture

Use an isolated local Linux Docker fixture, without production database, Redis,
accounts or authentication credentials. The trusted test harness owns only its
uniquely labeled fixture containers and exposes no public listener.

Each case executes inside a fresh, network-disabled, read-only CPython guest
with a non-root learner UID, dropped capabilities, no-new-privileges, a reviewed
seccomp profile, bounded tmpfs, PID/CPU/memory limits and bounded output. It
receives only synthetic source/stdin and a case manifest through a bounded pipe.
The guest contains runtime files only, without application configuration,
credentials, host mounts or a Docker socket. The controller's Docker access
never enters a guest.

An unused guest may be prepared ahead of time. A guest that has executed code
is destroyed, including all descendants, and never reused. Keep a bounded
two-active/one-unused-spare pool initially; allocations under creation, active,
idle, failed, uncertain and draining states all count. An uncertain creation or
unconfirmed cleanup quarantines its slot. Cancellation cannot release a slot
before confirmed process/container cleanup.

Pin the CPython image by digest and record the actual interpreter version and
platform. Derive the baseline Python version from the existing runtime rather
than guessing it from a Pyodide release number. Use a distinct experimental
runtime identity. Historical `pyodide-*` records and snapshots are untouched.

## Budgets and correctness

Keep the current overall grading resource envelope as the baseline: sandbox
1,280 MiB / 1.5 CPUs and trusted worker/comparator 768 MiB / 0.75 CPUs. Count all
native guests, unused spares, controller and comparators in the candidate
budget. Do not run baseline and candidate simultaneously outside that budget.
Use 256 MiB synthetic case limits initially, with explicit accounting for
interpreter/container overhead. Reject a configuration that cannot enforce the
original limit without exceeding its aggregate envelope; do not quietly lower
the student's allowance to make a benchmark fit.

Preserve case sequencing, stdin, Unicode, newline/input-prompt semantics,
stdout/stderr separation, output truncation, exit/error classification and the
existing case/total/comparator deadlines. Startup and cleanup remain measured
infrastructure time, not a student's CPU time or a silently extended allowance.
Keep the existing comparator for grading-equivalence fixtures; report its
resource cost and timing separately.

Probe filesystem/environment/credential access, network and Unix-socket access,
child processes, thread/PID exhaustion, descendant cleanup, output floods,
memory exhaustion and cancellation during create/start/execute/drain. A guest
must not affect another guest or the controller. Failure to prove containment
blocks further work regardless of latency.

## Measurement and exit criteria

1. Build both fixtures from immutable inputs. Record image IDs, actual Python/
   Node versions, architecture, CPU/memory/PID settings and source revision.
2. Run correctness/isolation probes before timing cohorts. Retain every failure.
3. Alternate baseline/candidate cohorts for one-, five- and ten-case trivial
   stdout and Unicode/input programs, then two simultaneous submissions. Compare
   execution-only first, then the existing isolated queue/committed-grade fixture.
4. Record admission/queue, preparation/acquisition, execution, comparison,
   cleanup and commit separately; report totals, p50/p95, sample counts, errors,
   memory peaks/OOM and CPU throttling. Small smokes are diagnostic only; use
   the original design's 100-submission cohorts for latency acceptance.
5. A four-worker experiment is optional only after a written aggregate budget
   fits. It must compare throughput and single-submission latency, include
   background work and preserve official-submission reservation. It is not the
   default and does not authorize production concurrency four.
6. If correctness, isolation or budgets fail, stop and retain Pyodide. If native
   execution is promising, write a separate production design covering protocol
   versioning, runtime/package compatibility, historical identity, roll-out,
   observability, replay and rollback. Prototype results do not select a new
   default or establish VPS performance from Docker Desktop timings.

No production pause or native VPS test is authorized by approving this local
prototype. Production-equivalent experiments still require an isolated host or
an explicitly approved transferred execution budget/maintenance window.

## Turtle boundary

Public Turtle is a CPython/Tk remote desktop already; changing the grading
interpreter does not speed it up. Its cold broker start takes 1.6–2.0 seconds
before browser connection. Existing standby is implemented but disabled.

The current lower-bound warm plan needs at least 16,832 MiB including required
headroom, before dynamic course guests/deployment overlap, on an 11,960 MiB
host. Preserve the existing resource gate. A separate execution-host or revised
resource allocation proposal must specify the full combined budget and original
rootless recovery/100-run drawing gates; no service is stopped, allowance
reduced, warm standby enabled, or host purchased by this proposal.
