# Public Turtle browser runtime implementation

Date: 2026-10-28 (Asia/Seoul). User authorized implementation of the
[design](../specs/2026-10-28-public-turtle-browser-runtime-design.md).
Production remains unchanged. Work is on `feat/public-turtle-browser-runtime`.
The writing-plans skill is not installed in the available skill directories;
this plan follows the repository's existing staged implementation format.

## Ordered work and gates

1. **Local feasibility (initial gates passed; broader checks continuing).** Pin Brython; implement a worker-compatible
   Turtle model, bounded drawing protocol/Canvas renderer, fresh prepared workers
   and a separate-origin fixture with real CSPs. Prove the shipped helpers,
   reliable non-cooperative Stop, isolation and actual first drawing. Record
   measured engine/asset/preparation costs. Do not advance if a design gate fails.
2. **Runtime integration (implemented behind disabled flags).** Add shared discriminated browser
   contracts, API/Redis admission and leases without broker dependencies, a
   focused execution adapter and unchanged-layout public UI integration.
   Keep native project exports, explicit full-Python fallback and default-off flags.
3. **Operational integration (implemented and locally verified).** Add immutable static-origin
   packaging, effective frame/worker policy validation, optional production
   routing/flags and version-aware rollback drain. No live DNS/config changes.
4. **Verification (local software checks complete; acceptance open).** Meaningful protocol/model/renderer/lifecycle tests,
   real Redis quota/recovery tests, actual local browser checks, regressions,
   typechecks/builds and code review. Record untested devices/staging cohorts
   separately; local success does not certify production performance.

## Completion reporting

Update this file as gates are evaluated. Preserve failed samples and controls.
Distinguish implemented code, verified behavior, open release gates and actual
production enablement. Do not silently change engines or execute student code on
the main page thread to pass a timing gate. No deployment or release is included.

## Stage A findings so far

- Brython 3.15.0 pinned from npm, BSD license copied from its exact upstream tag.
  Initial runtime bundle is about 1.41 MB gzip, including the full stdlib.
- Separate-origin local browser fixture at localhost:3128 / 127.0.0.1:4128,
  bound to loopback only, with actual frame/worker CSP and parent COEP.
  This is explicitly a harness, not a product layout change.
- Real drawing, race helpers and expected queries, unsupported input and
  non-cooperative infinite-loop Stop verified in Chrome. Measured local Stop
  acknowledgement: 11.155 ms, excluding CUA tool overhead.
- Storage/shared-channel capabilities removed before the interpreter loads;
  XHR and parent access probes denied. A real nested-worker execution probe
  is rejected by worker CSP (constructor return alone is not proof of execution).
- First 100-run local dispatch-to-stroke cohort: median 30.055 ms, p95 64.210 ms,
  max 76.700 ms. Excludes API admission and physical classroom hardware. The
  cohort retained preparation timings, but not all individual stroke timings;
  repeat with raw samples for the final report. This is not production acceptance.
- Nine CPython model tests plus protocol tests pass. Existing real CPython/Tk
  public-helper suite passes using local image `46b3a49c43b3…`.
- Early preparation was ~6 s with eager traceback initialization; removing that
  dependency reduced preparation to roughly 0.2–1.5 s. Preserve this diagnostic.
  A compile-to-code-object then exec path failed starred imports in the engine;
  direct Python source execution fixes the actual public helper/race programs.
  No engine or main-thread-execution fallback was introduced.

## Final implementation handoff

- Added the browser package, isolated worker/renderer and static-origin artifact,
  shared profile contracts, atomic admission/leases, public execution adapter,
  existing-layout integration, local exports and explicit full Python.
- Added default-off flags, pilot/retained-version configuration, version-aware
  rollback revocation/drain and CI/operations tests. Disabled browser grants retain
  their preference so refresh cannot silently upload source through native Run.
- Final runtime artifact: `brython-3.15.0-2ab1760c5c7107d57457`.
- Web 1,430 tests, shared 928, targeted API 39, translations 140, runtime 10
  Node tests (11 Python model methods), builds/typechecks/lint and deployment
  checks passed. Detailed commands, scopes and assets are recorded in the report.
- Performance is **not accepted**: full-path diagnostic samples included
  188/213/1,588 ms; late preparation exceeded its gate and timed out twice.
  The final component-only 100-run p95 was 200 ms, excluding admission.
  OS CPU/memory contention was observed; failures were retained, not discarded.
- Stage C/D remain open: actual classroom devices, Safari, controlled cold load,
  twenty visitors, exact Tk cadence and previous-image rollback rehearsal.
  Do not enable production from local component timings.
- No production deployment, DNS changes, broker/worker pause, new VPS allocation,
  commit or push was performed by this implementation turn.

See [verification](../../research/2026-10-28-public-turtle-browser-runtime-verification.md)
and [operations](../../operations/2026-10-28-public-turtle-browser-runtime.md).
