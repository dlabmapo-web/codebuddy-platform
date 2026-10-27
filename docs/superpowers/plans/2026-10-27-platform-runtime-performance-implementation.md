# Runtime performance implementation

Date: 2026-10-27 (Asia/Seoul)
Source: [approved design](../specs/2026-10-27-platform-runtime-performance-design.md).
User authorized implementation in the requesting session. Production deployment
and warm enablement retain their independent acceptance gates.

## Sequence

1. Build an isolated baseline judge image and reproduce repeated short cases
   through the Linux sandbox, beyond the initial ready pool. Preserve evidence.
2. Add bounded lifecycle/stage telemetry, versioned private diagnostics, cgroup
   observations and real scheduling readiness; keep admission guards opt-in.
3. Fix any attributed lifecycle defect; compare baseline/candidate at the same
   limits. Add focused lifecycle, isolation, timeout and readiness regressions.
4. Add an authorized narrow manual latest-result endpoint and bounded visible-tab
   polling; retain draft ownership and terminal invalidation behavior.
5. Wire private monitoring and resource experiment configuration without changing
   production defaults. Add fixture benchmark and load evidence/reporting tools.
6. Run the relevant checks and local browser/runtime verification. Preserve Turtle
   cold mode unless every existing warm gate passes. Record failed/unavailable
   Linux rootless/production/capacity gates explicitly in the verification report.
7. Review the complete diff for correctness, security, performance and deployment
   compatibility. Deliver implementation, reproducible commands and limitations.

## Validation

Run focused API/shared/web tests as components change, followed by affected
typechecks/lint and deployment configuration checks. Real runner checks execute
in an isolated network-disabled container without database/Redis credentials.
They create no production submissions. Performance samples retain failures,
resource limits, commit/image identity and separate queue/service/browser stages.

## Implementation record

Diagnostics, bounded replenishment/cleanup, narrow feedback reads, monitoring and
local fixture tools are implemented and locally checked. The
[verification report](../../research/2026-10-27-runtime-performance-local-verification.md)
records the paired results and exact boundaries. Production-equivalent latency,
browser loading, rootless Turtle and classroom capacity gates remain open; the
[runtime decision note](../../adr/2026-10-27-grading-runtime-latency.md) records the
remaining grading latency work. No deployment or warm enablement occurred.

The user subsequently stopped native grading testing and requested page-speed
inspection. The [production navigation report](../../research/2026-10-27-production-page-navigation-performance.md)
records live browser timings and an enforced read-only database diagnostic.
Production grading stayed active; the earlier maintenance approval is superseded.


## Approved navigation follow-up

1. Add scoped, batched course counts; switch course and class list reads.
2. Add a separate outline contract/read and migrate builder initial/refetch data.
3. Remove duplicate initial builder reads and optional admin summary blocking.
4. Verify SQL equivalence, tenant/permission isolation, editing and invalidation;
   typecheck/build and record reproducible local measurements.
5. Leave production untouched; retain deployed acceptance as a release gate.


Navigation follow-up implemented and locally verified. See
[verification and rollout order](../../research/2026-10-27-navigation-performance-local-verification.md).
Production navigation acceptance and deployment remain outstanding; the stopped
native grading comparison is not part of this implementation.

## Shared reads after the broader role audit

Following the expanded request and existing design's measurement-first loading
work, the shared permission snapshot, attention window query and narrow
sample-status projection are implemented. The
[verification report](../../research/2026-10-27-platform-wide-performance-verification.md)
records 531 passing regression tests, 23 separate PostgreSQL checks, API
typecheck/build and read-only production baseline/candidate comparisons.
These changes have not been deployed. Native grading latency and Turtle warm
enablement remain separate, unmet gates; the production benchmark stays stopped.

## Public Turtle Run-to-drawing follow-up

Within approved spec section 8, replace repeated readiness-probe process launches
with one bounded in-container watcher. Keep isolation, fresh guests, capacity,
animation, quota and cleanup behavior. Run watcher unit tests and runtime
regressions, then paired local real-Docker preparation measurements. Record
measured gain and remaining end-to-end gates separately; do not enable warm
mode or deploy through this local refinement.

Follow-up completed locally: one persistent display watcher, four watcher unit
checks, 42 passing runtime unit/policy checks, real Docker integration and Chrome
initial/rerun drawing smoke. Final 100-pair component p50: 428 → 273 ms; p95:
498 → 335 ms. Earlier conflicting samples retained. Full browser/VPS acceptance
and warm enablement remain open; see
[verification](../../research/2026-10-27-turtle-cold-start-verification.md).
