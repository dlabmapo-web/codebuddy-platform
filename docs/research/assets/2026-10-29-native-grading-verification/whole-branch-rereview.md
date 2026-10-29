# Final scoped rereview — I1 / I2 / I3

Reviewed 2026-10-29 in `/Users/jurabeksamiev/Developer/codebuddy-platform-native-grading`, branch `feat/production-native-grading`.

- Base: `d4cad35cc7d1c99c03655e5c1a10f886dfcfa6d0`.
- Reviewed HEAD: `496b4fff862d79b2396d8d8b0e5c82cccd29385c`.
- Scope: the one consolidated final fix wave, original findings I1/I2/I3, and regressions introduced by those fixes. Read the complete supplied 1,831-line / 108,938-byte diff once in sequential bounded passes and the full `final-fix-report.md`, including final source/artifact impacts and retained failed runs. This is not a second whole-branch audit.

## Verdict

**Approved for merge as the disabled implementation. I1, I2 and I3 are resolved. No remaining Critical, Important or Minor findings in this scoped rereview.**

Combined with the preceding whole-branch review, no confirmed merge-blocking finding remains. This approval does not authorize deployment or native activation. Linux AMD64 rootless/systemd positive containment, resource/performance cohorts, release scans, certification and pilot gates remain unrun; native production selection remains disabled. Neither the local results nor this review establishes a five-second claim.

## Per-finding assessment

### I1 — Resolved: accepted observation no longer supplies historical code to draft hydration

The normal acceptance path now deletes the historical `submission` query and writes `observeSubmission` (`packages/web/src/app/(studio)/academy/[academySlug]/learn/exercises/[materialId]/_hooks/use-submission.ts:305–315`). The page passes its validated UUID through the new optional shared input and preserves it through class selection.

`packages/api/src/learn/learn.service.ts:223–239` routes explicit review and observation through the same existing `findSelected` lookup. The existing implementation at `packages/api/src/learn/submission.service.ts:283–309` retains actor/user/academy/scope authorization and the `sourceMaterialId` predicate. The result uses the existing student-safe projection. The bootstrap now keeps observation result-only and explicit review source-bearing (`learn.service.ts:261–264`); when both inputs exist, explicit historical review takes precedence. Staff-practice does not receive either student result.

The Python workspace supplies observation only to `initialResult` while `historicalCode` remains selected-only (`workspace.tsx:153–182`), and clears the observed bootstrap value when navigating to another material. The quiz hook consumer receives the same result-only fallback (`_components/quiz-workspace.tsx:51–58`) while its draft source remains explicit review only. The quiz consumer is keyed by material. Existing action/scope invalidation and pending observation remain intact.

Covering evidence is appropriate to the original failure: retained real-browser RED shows autosaved B reloading A. The passing real A/B/C/history case tests the actual generated URL, B during pending and terminal reloads, newer IndexedDB-only C with the server still B, exactly one Submit/attempt, and the actual Answer-record historical link showing A without promoting it. The current production standalone case also passes 1/1. The initial production fixture failure is honestly retained: C survived in the editor, but the attempted local-only transport fault failed to keep C off the server. The final context-level save abortion plus `sendBeacon(false)` preserves that intended fault across teardown without relaxing assertions or modifying the product policy.

No residual draft-loss or authorization regression identified in this fix.

### I2 — Resolved: phase changes create a fresh future-admission configuration generation

`packages/api/src/judge/runtime-admission.ts:10–15,21–37` now captures path/enabled synchronously, keys the cached promise by that generation, and loads from the captured generation rather than reading mutable configuration after an await. Changing the flag or manifest path replaces only the future-admission cache entry. The registry obtained by an earlier caller and descriptors already persisted on accepted work remain unchanged. Registry selection, full manifest validation, readiness and resource funding still run normally.

The actual fixture endpoint delegates to the extracted `native-grading-e2e-phase.mjs` helper, whose `:4–16` preserve explicit permission, allowed phase values, all four queue backlogs, pending attempts, DB leases and private sample-authority idle checks before changing the flag. The endpoint still derives permission from the isolated acceptance environment plus Linux x64; the local test's synthetic `allowed:true` is explicitly contract evidence, not production authority.

The real owned PostgreSQL/Redis regression invokes this same helper, admits baseline Pyodide → candidate CPython → baseline Pyodide through actual admission/readiness, rereads original accepted rows to verify frozen descriptors, and rejects transition with pending work. Retained prior-source RED reproduces the original stale Pyodide selection. The helper is included in the Linux driver's actual root-owned fixture hash checks and harness hash output, documented as required instrumentation, and excluded by production artifact smoke checks.

No residual phase-cache defect or accepted-work reselection introduced. Ordinary production activation still normally recreates the API; this fix closes the documented same-process isolated workflow without claiming that Linux acceptance ran.

### I3 — Resolved: private sample authorities are included in complete inventory and drain decisions

`packages/api/scripts/grading-inventory.mjs:12–18` validates the existing exact private saved-lease shape and complete runtime descriptor. Its Lua read at `:63–74` atomically snapshots the bounded private index and indexed records, limits membership to 512 and each record to 16 KiB, and refuses missing/oversized authority. This avoids treating a concurrent confirmed retirement between index and row reads as a corrupt missing record. Subsequent validation checks indexed identity and source-release/reservation consistency (`:75–79`).

Each indexed authority contributes its runtime reference and increments the existing `recoverable` field (`:83`). Therefore both existing healthy-drain consumers and the signed inventory projection continue to consume the complete count without a schema downgrade or extra ignored field. Terminal public status and public TTL expiry no longer suppress private recovery obligations. Failures retain generic stderr and no complete stdout (`:84–85`), without IDs/tokens/source/output escaping in diagnostic messages. Adding Zod uses an existing application dependency; the packaged API import smoke executes the actual inventory imports/schema before checking explicit-environment refusal.

The real CLI regression holds an actual source-released deterministic-broker sample authority with no DB lease or queue backlog, checks both a terminal public record and actual public TTL expiry, asserts recoverable=1 and descriptor retention, and independently tests rejection by both Python drain consumers. Seven missing/malformed/oversized cases and a 513-member index refuse completeness. Actual receipt acknowledgement, cancellation/removal and retirement then delete private authority and permit recoverable=0/drain, with one source execution. The test order/owned-row cleanup regression also covers the existing outbox case, and the original all-four-queue/fence inventory case passes.

No residual private-authority omission or new signed-projection/privacy breakage identified. This is application/broker state-machine evidence, not native kernel cleanup proof.

## Evidence and new-breakage checks

Reviewed the updated tracked verification and every new sanitized final-fix command/result/summary artifact in the diff. Focused reported checks are 74 API tests, 65 web tests, 30 shared tests, four selected DB/Redis integration cases, 11 sample-store Redis cases, the development and current production standalone A/B/C/history case, Shared/API/worker/web/E2E types, owned web lint, syntax checks and the current 42-page production Next build. Counts overlap prior coverage; no aggregate or additional passing-suite rerun is claimed.

Checked the changed artifact smoke and acceptance instrumentation bindings. Final local ARM64 API `sha256:838300296d99826755cb56467051ff4f434fccd4815a60be871e3ec6435dff7e`, worker `sha256:1fadc9c3884909b2616f601cfd9d88a3ff9586c747951fa5dc112bf2eeae5bd7`, and broker `sha256:ebd305076c56abdc2ae24583e0f972402093496704bc1217f9b213b711595b53` supersede prior packaged artifacts. Their recorded bounded readonly/network-none imports and exclusions pass. Strict actual stopped-carrier broker tree evidence is `dfb9c6e6e90b23653560ddc5ae5d17f661cdf94d93a292cbe768327337d4ba08`, including rejection of changed host bytes. Guest sources are unchanged. Source binding is accurately described as precommit worktree hashes rather than a fabricated image revision label.

Independently performed read-only SHA-256 comparisons against the tracked summary: **24/24 referenced source/build files match**, including the current standalone server artifact. Rechecked HEAD and tracked/index status: expected HEAD and clean status. The updated verification inserts the fix record before the existing rulings; the 21 rulings are preserved.

The only additional unchanged-code reads were narrow checks of the reused authorized `findSelected`/student-safe projection, RPC forwarding and the Python/quiz bootstrap consumer seams. No broad audit was reopened. The prior grant uncertainty remains unchanged: this scoped fix does not add grants, and no unsupported live-Supabase privilege claim is made. Other pre-existing behavior and Linux release acceptance are outside this rereview.

## Review execution limits

No tests, services, daemons, network writes, production actions, git/index/HEAD mutations or subagents were used. The regression/build outcomes above are reviewed retained evidence, not freshly rerun results. Only this ignored `final-rereview.md` was written. The original user checkout was not touched.
