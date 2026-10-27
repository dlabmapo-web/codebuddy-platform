# Grading runtime latency after bounded replenishment

Date: 2026-10-27 (Asia/Seoul)
Status: proposed follow-up; no runtime migration or host purchase approved.

## Context

The [performance design](../superpowers/specs/2026-10-27-platform-runtime-performance-design.md)
requires fresh, single-use interpreters, sequential cases, unchanged grading
budgets and atomic verdict/progress/points commits. It explicitly calls for this
decision note if safe tuning does not establish the latency targets.

Local Linux ARM64 containers reproduce long waits beyond the initial three
ready interpreters. Instrumentation attributes most observed wall time to
acquiring freshly prepared runners. Execution, pipe drain and confirmed cleanup
are small in the trivial fixture. Serializing replacement initialization reduces
contention in the exploratory comparison, but does not establish the ten-case
end-to-end p95 target of five seconds. See the
[verification report](../research/2026-10-27-runtime-performance-local-verification.md)
for sample counts, image identities, failures and measurement boundaries.

Docker Desktop is not the deployed Linux VPS. Small sandbox-only samples cannot
identify a production CPU quota, certify classroom throughput or justify a VPS
upgrade. The earlier production idle-host observation also cannot rule out
container throttling, execution isolation budgets or future load.

## Current implementation boundary

Keep Pyodide 0.27.5, current runtime identity, single-use interpreters, two worker
slots plus one spare, and the existing production CPU/memory ceilings. Retain
bounded serial replenishment, cleanup barriers and diagnostics for review. Keep
the readiness admission guard opt-in. Do not deploy this as an accepted latency
release until the applicable gates pass.

Do not reuse a student's interpreter, raise student deadlines, accept output
before exit/drain, or add hidden spares to make the benchmark pass. Do not infer
an optimal quota from the noisy 1.5/2.0/2.5-CPU development smokes.

## Evidence required for the next decision

1. Repeat the paired benchmark on production-equivalent Linux/architecture with
   pinned images, the unchanged 1,280 MiB sandbox ceiling and a transferred test
   execution budget. Record throttling, acquisition, preparation and event-loop
   time. Compare the design's quota/concurrency variants only within that budget.
2. Run at least 100 real fixture submissions in each one/five/ten-case cohort,
   separately covering first-solve points and repeat solves. Measure acceptance
   through committed result and visible feedback. Run the paired two-submission
   and mixed-background/read/drawing experiment; preserve every failure.
3. If a quota change meets all gates and fits the combined resource policy,
   approve that specific configuration separately. If it does not, compare a
   dedicated execution host against a separately designed runtime change.
4. Any native CPython, snapshot, or other runtime proposal must specify package,
   prompt, memory, deadline and comparator compatibility; tenant isolation;
   historical runtime identity; replay; rollout and rollback. It cannot silently
   inherit the current runtime's identity or regrade historical work.

## Consequences

Feedback and observability improvements are reviewable independently. Faster
ten-case grading, warm Turtle, usable-page SLOs and classroom capacity remain
open release work. This explicitly records the limit of the implementation;
it does not authorize a runtime replacement or infrastructure purchase.
