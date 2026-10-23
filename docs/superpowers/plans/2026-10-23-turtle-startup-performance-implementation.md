# Public Turtle startup implementation

Approved scope: implement the 2026-10-23 startup performance spec and run real
local tests. Deployment is deferred by the user's latest instruction.

1. Capture the current real browser/container startup baseline.
2. Extract a bounded Docker sandbox driver and privacy-safe stage telemetry.
3. Add a single-use standby pool, cancellation, teardown barriers and prompt FIFO dispatch.
4. Preload the viewer after admission; retain existing student behavior and API ownership.
5. Add opt-in production configuration, combined resource preflight, slice migration,
   private metrics, host cgroup collector, monitoring and rollback documentation.
6. Exercise pool/scheduler failure paths with deterministic unit tests.
7. Run real local runtime, PIN/BFF/browser, performance and isolation tests; run
   affected type/lint/deployment checks and record evidence and limitations.
8. Leave production unchanged and warm enablement gated on Linux/rootless and
   combined-host resource verification.

The brainstorming design/review steps are complete. Its referenced writing-plans
skill is not installed in the available skill directories; this explicit plan
records the implementation sequence without adding an unavailable dependency.

Implementation and local verification are complete. See
[verification](../../research/2026-10-23-turtle-startup-local-verification.md)
for real test results and the latency distributions. The performance release
gates are not passed; production warm mode remains disabled. No deployment was
performed. Linux/rootless acceptance and combined host sizing remain required
for the later production enablement decision.
