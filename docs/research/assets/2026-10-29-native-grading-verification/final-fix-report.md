# Final review fix wave

Base: d4cad35cc7d1c99c03655e5c1a10f886dfcfa6d0. Worktree: `/Users/jurabeksamiev/Developer/codebuddy-platform-native-grading`, branch `feat/production-native-grading`. No subagents. Scope: final I1/I2/I3 only; parent owns scoped rereview and final adjudication.

## Implemented

I1: normal acceptance writes `observeSubmission`, removes historical `submission`, and bootstrap accepts `observedSubmissionId` through the same owned `findSelected` user/academy/scope/sourceMaterialId predicate. Bootstrap returns only the result in `observedSubmission`, keeping `selectedSubmission` null. Workspace shows/resumes the authorized result while draft hydration receives no historical source. The distinction persists after terminal result. Explicit Answer-record Review links retain `submission` and historical source review without promotion. Existing scope/action/event-source cleanup guards remain.

I2: admission cache entries now include an immutable captured enabled/path configuration generation. A changed generation creates a new future-admission registry promise without changing registries/descriptors already held or persisted accepted rows. Production normally recreates API on activation; the confirmed defect was the same-process isolated paired fixture. Its actual endpoint delegates to `transitionFixturePhase`, retaining Linux/environment and idle authority gates and the real manifest/readiness/admission path. Local contract passes synthetic certified descriptors and readiness; no kernel/native execution proof is inferred.

I3: trusted inventory atomically reads at most512 indexed private sample authorities, caps record size at16KiB, validates exact SavedSampleLease/ExecutionLeaseIdentity fields, source-release/reservation relationship, indexed attempt identity and full shared runtime descriptor. Each indexed unretired record increments existing `recoverable`, automatically consumed by both existing drain/transition checks, and contributes its descriptor to references. Missing/malformed/oversized/over-bound authority exits1 with only generic refusal and no complete JSON. No new packaged helper dependency. Admission fence and signed projection fields remain unchanged.

## Reproduction and covering verification

- Real browser RED: `/tmp/native-final-i1-red.log`, `test-results/native-1793254858-5591-e84368a7`. A accepted and B autosaved; literal pending reload returned A instead of B.1failed; screenshot/trace/error context retained. The run also retained the existing Next dev stream-close diagnostic outside the test.
- Backend prior-source reproduction: `/tmp/native-final-i2-i3-red.log`. The two product files were read from HEAD for the run and restored in a Python finally block;2expected failures showed candidate still Pyodide and recoverable0 rather than1. Tests existed before implementation; initial backend execution overlapped edits and passed, so the later explicit baseline run supplies the honest regression reproduction (no claim of prior-to-edit backend RED timing).
- Initial fixed browser1/1,25.3s (`/tmp/native-final-i1-green.log`), verified B pending+terminal and actual Answer-record Review sourceA. Strengthened final browser1/1,36.6s (`/tmp/native-final-i1-local-green.log`), additionally blocked ordinary autosave/beacon, wrote owned local-onlyC, proved IndexedDBC/serverB and reloadC after terminal with one accepted attempt/one Submit request. Same case overlap, not two distinct tests.
- API74 in5files (`/tmp/native-final-api-units.log`), shared learn30 (`/tmp/native-final-shared.log`), web65 in5files (`/tmp/native-final-web-units.log`). Commands are retained in tracked final evidence. Expected negative SubmissionService log remains; no global suppression.
- Strengthened backend3selected/25filtered +Redis11 (`/tmp/native-final-backend-confirmed.log`): actual phase helper baselinePyodide→candidateCPython→baselinePyodide and frozen original rows; real CLI publicterminal+actualTTLexpiry/private source-released authority/no queues/no DBlease;7missing/malformed/oversize cases,513index bound; both actual Python drain consumers reject, actual deterministic broker receipt/ack/removal/retirement allows recoverable0 with source executed exactlyonce. Existing all-four-queue/fence CLI regression passed. These are deterministic-driver contracts, not native containment.
- Self-review caught order dependence in the new idle fixture tests. They now run before stateful cases and delete only their own accepted row IDs/outbox cascade in finally. Named existing dispatcher case included in final covering run to prove the new fixtures leave no earlier outbox. Final result recorded below.
- Shared/API/worker/web/E2E types and owned four-file web ESLint passed serially; `/tmp/native-final-{shared,api,worker,web,e2e}-typecheck.log`, `/tmp/native-final-web-lint.log`. Node syntax/whitespace passed.

## Final verification/artifacts/self-review

Final reordered run `/tmp/native-final-backend-order.log`:4selected/24filtered +Redis11 passed. It includes the named existing outbox case after new fixtures and the real all-four-queue/fence inventory case. All private sample assertions pass with actual source release, receipt acknowledgement, cancel/removal/retirement and exactly one execution under the deterministic driver. No other broad suite rerun.

Self-review followed shared hook/bootstrap consumers and caught embedded QuizWorkspace also needs the result-only initialResult handoff. Added exactly one fallback expression, preserving historicalCode selected-only and existing quiz scoring/execution. Owned quiz ESLint +web types passed. Web rebuilt serially after all three images/smokes/tree: current production webpack/TS/42pages GREEN, ID `h-n6ie7Su4_Sr2jd0r4Y_`. Initial build ID5TTPKNR0Q-2e35R-Lr1YV is superseded only for web; excluded web/fixture edits do not affect packaged API/worker/broker bytes.

ONE requested current-production standalone A/B/C/history case first failed only the local-only fixture final serverB assertion: serverB existed before reload, editorC survived, but server alsoC afterward. Retained trace/screenshot/run `test-results/native-1793256170-29248-c213cbff`. The test's page-level save/beacon interception did not maintain intended transport failure through document teardown; no more-specific browser root cause or product loss claimed. Corrected only fixture fault transport to context routes +explicit navigator.sendBeacon(false) in current/future documents; actual hook sync fallback is aborted by context route. Same assertions/source/profile remain. Final E2E types passed. One covering production rerun GREEN1/1,16.218s case/24.425s harness, `test-results/native-1793256341-31168-d9dd4919`. Current standalone has no destination-stream digest; pg/no-manifest worker diagnostics remain. No product/image rebuild for fixture-only correction.

Final local ARM64 immutable config IDs:

- API sha256:838300296d99826755cb56467051ff4f434fccd4815a60be871e3ec6435dff7e.
- Worker sha256:1fadc9c3884909b2616f601cfd9d88a3ff9586c747951fa5dc112bf2eeae5bd7.
- Broker sha256:ebd305076c56abdc2ae24583e0f972402093496704bc1217f9b213b711595b53.

All built serially with pinned verified local Unix Docker endpoint and passed audit +readonly/networknone768MiB/.75CPU/64PID actual imports/filesystem/Prisma/fixture exclusion. API smoke executes packaged inventory imports/schema then explicit-env refusal, not merely --check. New phase helper absent. Actual stopped-carrier broker strict tree1/1 GREEN, dfb9c6e6e90b23653560ddc5ae5d17f661cdf94d93a292cbe768327337d4ba08; changed host tree rejected and broker not started. Shared bootstrap schema changed packaged bytes, so broker rebuilt once; unchanged guest inputs not rebuilt. No source-label/registry digest/AMD64 acceptance claim.

Both app image logs retain optional msgpackr-extract prebuild-loader ERR_INVALID_ARG_TYPE followed by successful node-gyp local rebuild. Audits allowlist API six known dev bins, worker prisma, broker none; no global stderr suppression or dependency/policy patch.

The extracted fixture phase helper is included in API-side root-owned script hash verification and harness-hashes.json generation; docs explicitly require it in the trusted fixture tmpfs. Node syntax passed, positive Linux still unexecuted. No production files whitelist expansion or fixture payload addition.

Raw logs retained outside scratch: `test-results/native-final-fix-20261029-f3b00486`. Tracked final-fix-{commands,focused-green,regressions-red,production-fixture-failure,artifacts}.txt, sanitized final-fix-verification-summary.json with hashes and two synthetic screenshots supplement the updated tracked verification. All21 ledger rulings preserved verbatim.

Self-review: checked existing findSelected actor/user/academy/class scope/sourceMaterialId boundary; both hook consumers; explicit history source/no promotion; pending and terminal draft recovery; stale action/scope cleanup; captured cache generations; exact private SampleExecution fields/identity/bounds/generic failure/retirement; both existing drain consumers and signed projection; fixture ownership/order cleanup and exclusion; actual artifact imports/tree; all unrun acceptance gates. No open implementation correctness concern from self-review. Parent owns ONE scoped rereview and residual adjudication. Commit/final clean status recorded after creation below.

## Limits

No production/live account/default dotenv/SSH/pause/system-account/daemon-config/native activation/deployment/publication/push/PR/tag/dispatch occurred. Original checkout is separate and untouched. Only unique owned loopback fixture/process/container cleanup. No general E2E/dev Supabase seed. No kernel/rootless/resource/readonly/provenance fence weakened. Existing1s timeout/weighted/Linux simple policies and the four2s transport fixtures remain unchanged. Linux AMD64 rootless positive containment/resources/performance/cohorts/scans/certification/pilot remain unrun; production native remains disabled. No five-second target or percentile is claimed. All21 existing Rulings remain verbatim in tracked verification; parent may append final rulings.


## Commit and final status

Commit `496b4fff862d79b2396d8d8b0e5c82cccd29385c` — `fix(grading): preserve drafts and complete recovery inventory`. Tracked/index status clean after commit; no amend/reset/push. All fixture/listener/carrier census checks empty. First precommit cached whitespace check caught trailing spaces in extracted text logs; stripped only trailing whitespace in sanitized tracked extracts (raw logs retained), rechecked GREEN, then committed. No source/test rerun needed for that formatting-only correction.

Files changed:

- `deploy/scripts/grading/artifact-smoke.mjs`
- `docs/research/2026-10-29-production-native-grading-verification.md`
- `docs/research/assets/2026-10-29-native-grading-verification/final-fix-artifacts.txt`
- `docs/research/assets/2026-10-29-native-grading-verification/final-fix-commands.txt`
- `docs/research/assets/2026-10-29-native-grading-verification/final-fix-draft-reload-red.png`
- `docs/research/assets/2026-10-29-native-grading-verification/final-fix-focused-green.txt`
- `docs/research/assets/2026-10-29-native-grading-verification/final-fix-production-fixture-failure.txt`
- `docs/research/assets/2026-10-29-native-grading-verification/final-fix-production-fixture-red.png`
- `docs/research/assets/2026-10-29-native-grading-verification/final-fix-regressions-red.txt`
- `docs/research/assets/2026-10-29-native-grading-verification/final-fix-verification-summary.json`
- `e2e/NATIVE-GRADING-ACCEPTANCE.md`
- `e2e/native-grading-acceptance.mjs`
- `e2e/specs/native-grading.spec.ts`
- `packages/api/scripts/grading-inventory.mjs`
- `packages/api/scripts/native-grading-e2e-phase.mjs`
- `packages/api/scripts/native-grading-e2e-seed.mjs`
- `packages/api/scripts/native-grading-e2e-server.mjs`
- `packages/api/src/judge/native-grading.integration.spec.ts`
- `packages/api/src/judge/runtime-admission.ts`
- `packages/api/src/learn/learn.service.spec.ts`
- `packages/api/src/learn/learn.service.ts`
- `packages/shared/src/content/learn.ts`
- `packages/web/src/app/(studio)/academy/[academySlug]/learn/exercises/[materialId]/_components/quiz-workspace.tsx`
- `packages/web/src/app/(studio)/academy/[academySlug]/learn/exercises/[materialId]/_components/workspace.tsx`
- `packages/web/src/app/(studio)/academy/[academySlug]/learn/exercises/[materialId]/_hooks/use-submission.ts`
- `packages/web/src/app/(studio)/academy/[academySlug]/learn/exercises/[materialId]/page.tsx`
- `packages/web/src/components/workspace/submission-action.spec.tsx`
