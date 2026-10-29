# Final whole-branch review — production native grading

Reviewed 2026-10-29 in `/Users/jurabeksamiev/Developer/codebuddy-platform-native-grading`, branch `feat/production-native-grading`.

- Base: `29fa6a0d`
- Reviewed HEAD: `d4cad35cc7d1c99c03655e5c1a10f886dfcfa6d0` (code through `6d12f9ce`; final plan tracking commit `d4cad35c`).
- Scope: the complete supplied 194-file / 1,110,935-byte diff, read in bounded sequential passes, including deployment, application persistence/recovery, runtime/guest/broker, web delivery, tests, and verification artifacts. Truncated output was recovered with bounded slices. This is the final integration review, not another review of only the last fixes.
- Authority: approved design, implementation plan, global constraints, full final-review brief, requesting-code-review reviewer instructions, and code-review skill.

## Merge readiness

**Not ready to merge: fix the three Important findings below, then perform the planned scoped re-review.** No Critical findings. No additional Minor findings.

The explicit Linux AMD64 rootless/systemd containment, resource/performance, scan, certification and pilot gates remain unrun. That is correctly disclosed and does not itself create an implementation finding. Native selection must remain disabled; local Pyodide/browser and deterministic-driver results do not establish production native acceptance or the five-second target.

## Strengths

- Runtime selection freezes a complete descriptor at admission, independently of role. Historical null/raw identities retain explicit unrecorded provenance and matching historical engine/version; v1–v4 and practice v1/v2 readers remain available. Accepted work does not silently switch engines.
- Durable dispatch, immutable execution leases, persisted source intent, private checkpoints, receipt acknowledgement, terminal retirement and epoch sealing form a coherent recovery protocol. Known or uncertain execution is not authorization to rerun source. Final grades, progress and first-solve points retain a fenced transaction.
- The execution package keeps application credentials, expected answers and scoring out of the broker/guest. The implementation has a pre-interpreter learner gate, separate control channel, charged-memory leaf enforcement, parent/control OOM distinctions, bounded captures/journal/connection accounting and removal confirmation before receipts.
- Retained release/repair code binds signed manifests, artifact/configuration/inventory identities, preserves historical capabilities and accepted metadata, fences ordinary deployment after handover, and orders old-service termination before replacement. The rebuilt broker artifact removes the specific unused escaping workspace link without weakening strict extraction.
- Practice SSE repeats current authorization and filters private fields; both streams reconcile retained queue failures against current durable state. The real first-XREAD and actual nested PostgreSQL COMMIT timing regressions address meaningful boundaries rather than merely matching implementation details.
- Verification is appropriately qualified: local real Python/browser checks, deterministic broker recovery, actual artifact imports/extraction and unrun kernel/production gates are distinguished. Delayed diagnostics preserve the original commit-acknowledgement timestamp, and the separate-filesystem fixture uses bounded private Redis diagnostics.

## Important findings

### I1 — Normal Submit turns reload into historical-source selection, hiding a newer draft

**Location:** `packages/web/src/app/(studio)/academy/[academySlug]/learn/exercises/[materialId]/_hooks/use-submission.ts:309–310`.

**Trigger:** Submit code A through the normal workspace; while that accepted attempt is pending (or after it completes), edit the buffer to B and let B autosave; then reload the normal URL. The new code has added `submission=<A's attempt>` to that URL.

**Evidence and impact:** The unchanged page reads this exact query as a historical selection (`page.tsx:31,55–61`), and `LearnService.getExerciseBootstrap` loads `findSelected` for it (`packages/api/src/learn/learn.service.ts:225–236`). `workspace.tsx:153–179` supplies the selected attempt's code as `historicalCode`. `use-draft-autosave.ts:99–109` gives historical source precedence over the server draft, and `:252–257` skips newer local-draft recovery entirely when it is present. Thus a reload displays A instead of the saved newer B and enters untouched historical-review mode. The durable B draft is initially still stored, but the next edit/Submit can promote the stale A buffer and replace it. This also affects a later reload after a verdict because the query remains. The existing pending-reload test proves result observation, not preservation of edits made after acceptance.

**Fix:** Give accepted-attempt observation a distinct URL/bootstrap meaning from explicit historical source review. Resume the authorized result stream without supplying the accepted source to draft hydration; retain ordinary local/server draft resolution. Preserve existing Answer-record historical links deliberately. Carry the observation distinction through reload and terminal state rather than inferring it solely from current status.

**Focused regression:** Through the real workspace, submit A, pause completion, edit/autosave B, reload the accepted URL, assert B stays in the editor and saved draft while the same attempt resumes with no new Submit. Deliver the terminal verdict and repeat reload; B must remain. Separately verify an explicit historical-review link still opens A without promoting it.

### I2 — The documented paired Linux acceptance workflow cannot switch its cached admission registry to candidate

**Location:** `packages/api/scripts/native-grading-e2e-server.mjs:376–379`.

**Trigger:** Run the documented baseline then candidate phases against the same prepared isolated API process, as `e2e/NATIVE-GRADING-ACCEPTANCE.md:44–51` and `.github/workflows/native-grading-verification.yml:71–79` prescribe. Baseline admits at least one executable attempt before candidate calls `/controls/phase`.

**Evidence and impact:** This endpoint only mutates `ConfigService` with `set('GRADING_NATIVE_ENABLED', true)`. `packages/api/src/judge/runtime-admission.ts:10–15,21–27` caches the registry promise by that same configuration object's identity. `runtime-registry.ts:67–79` captures `enabled` once in its immutable closure. After baseline constructs a disabled registry, candidate continues selecting compatibility for certified material. Candidate runtime-evidence validation consequently fails; the promised executable paired acceptance path cannot collect the required native cohorts. If first used in candidate mode, the same problem applies when switching back to baseline. This is a fixture/workflow defect, not a claim that ordinary production activation is broken: production recreates the API process and gets a fresh registry.

**Fix:** Make the isolated phase transition actually create a fresh future-admission registry/configuration generation, or explicitly restart only the isolated API process between phases under the existing single-bank authority and update the harness accordingly. Keep accepted descriptors and the manifest/readiness contract immutable; do not weaken candidate runtime validation or make historical accepted work reselect.

**Focused regression:** Exercise baseline admission, the actual phase-control transition, and candidate admission in the same fixture lifecycle using a certified manifest. Assert baseline Pyodide and candidate CPython descriptors, and assert the original baseline attempt remains bound to its accepted descriptor. Test the reverse transition if supported. This can be established locally with synthetic descriptors and fake readiness; no positive Linux containment claim is needed to test the cache boundary.

### I3 — Release inventory declares completeness while omitting durable private sample execution authority

**Location:** `packages/api/scripts/grading-inventory.mjs:35–52` (especially the DB-only recoverable count at `:38` and public-record-only scan at `:41–47`).

**Trigger:** A sample has private execution authority awaiting cleanup/retirement, but its public record is already terminal or has expired. For example, the worker dies after publishing the public result and before private retirement; later the public TTL expires, while `cove:grading:sample-lease:<id>` remains indexed in `cove:grading:sample-leases`. Completed/failed queue jobs need not contribute backlog.

**Evidence and impact:** `SampleExecution` explicitly retains that private authority beyond public TTL (`packages/api/src/judge/sample-execution.ts:8–12`), reads it for recovery (`:74–88`), and deletes it only after broker retirement (`:109–112`). Inventory counts recoverable PostgreSQL leases only, and its Redis scan neither matches the private index/key prefix nor counts terminal public samples. It can therefore emit `complete:true`, zero pending/recoverable/ephemeral/backlog counts, and omit the sample descriptor while private recovery remains necessary. `deploy/scripts/grading/retained.py:17–23` and `control.py:13–17` accept those zeros as a healthy drained transition, bypassing the distinction between drained replacement and explicitly authorized accepted-work repair. Existing preservation of all old capability descriptors reduces descriptor-loss risk, but does not make this signed inventory complete or its drain assertion true. The isolated phase endpoint already checks this private index separately, confirming that public sample status is not sufficient authority.

**Fix:** Include the bounded private sample index and every referenced private lease in the trusted inventory, validate each required record and runtime, include its descriptor in references, and count every unretired sample authority as recoverable (or a dedicated required count consumed by all drain/transition checks). Missing or malformed indexed authority must refuse a complete inventory, not be treated as zero. Keep raw lease tokens, IDs, source and output out of the emitted projection. Preserve the admission-fenced inventory procedure and signed projection consistency.

**Focused regression:** In the existing isolated Redis/DB inventory test, create private sample authority with (a) a terminal public record and (b) no public record after expiry, with no queue backlog or DB lease. Assert nonzero recovery count, retained descriptor and drain rejection in both cases; assert an indexed missing/malformed lease refuses completeness. Remove private authority only after simulated confirmed retirement and assert drain then succeeds.

## Named cross-contract checks and limitations

- **Historical loader/draft boundary:** Inspected the unchanged exercise page, `LearnService.getExerciseBootstrap`, workspace hook wiring, and the historical initialization/local hydration portions of `use-draft-autosave` specifically to resolve the accepted-ID URL risk. This established I1; these were not unrelated whole-file rereads.
- **Persistence privacy/grants:** Inspected the new migrations, repository migration/grant references, the existing `20261020013000_practice_server_only_access` migration, and public result schemas/projections. The practice table already has RLS and anon/authenticated revocation; new control tables explicitly revoke PUBLIC/anon/authenticated access. Public API result schemas do not export execution tokens/descriptors. I found no repository-defined table-wide authenticated SELECT grant on `submissions` proving the proposed inherited-grant leak. Actual externally managed Supabase grants were not inspected, and a plain PostgreSQL fixture without Supabase defaults cannot prove their absence. Therefore this report does **not** assert a confirmed leak. A grant-aware isolated migration regression remains appropriate validation before applying these columns to an environment with such grants; column-only revocation cannot override an existing table-wide SELECT privilege.
- **Sample recovery completion:** Consulted the unchanged sample runner ending path because new recovery supplies RUNNING/STOPPING records; its store finish contract deliberately resolves cancellation and avoids preserving a stopped sample result. The confirmed gap is the release inventory, not an alleged scoring mutation from samples.
- **Acceptance flag cache:** Traced the actual fixture phase endpoint through the new admission WeakMap and registry closure and compared the documented same-process workflow. The issue is independent of unrun Linux resource acceptance.
- **Retained release consumption:** Traced inventory counts/references through healthy drain and signed transition validation. I3 does not claim that existing complete-capability retention is absent or that broker cleanup was bypassed during normal execution.

## Evidence reviewed / tests performed

Read the approved design and plan, final tracked verification report and sanitized command/result assets, and the complete supplied branch diff including covering tests. Evidence includes the reported 17 broad real-Pyodide browser scenarios, four transport-overlap cases, actual production-standalone delivery, weighted partial persistence, 413 API / 85 shared / 41 runtime / 24 web checks, 26 real-DB and 11 Redis checks, 530 normal jobs across two epoch seals, the actual nested-PG COMMIT/delayed-diagnostic regression, builds/typechecks/import checks, extraction/tree binding and 22 build-context canaries. These remain reported evidence, with their documented scopes, not independent kernel certification.

No tests, services, daemons, network/production operations or broad suites were run during this review. Static control/data-flow evidence suffices for the three findings; focused regressions above are recommended for the single fix wave. No implementation, tracked files, index or HEAD were changed. Only this ignored report was written. HEAD and branch were rechecked before writing the report.
