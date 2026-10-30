# Whole disposable-CI extension review — 2026-10-30

Reviewed implementation range `ef1541a2..6e1cea33a8f494051f1830a5f1de9edfd652c1c2`, the approved disposable Linux design/plan, current uncommitted verification report and plan updates, all six archived failed-run summaries and run-index, scoped review history, and latest-source ordinary-run metadata. Applied the code-review skill. Original native-product implementation was not redispatched. No implementation was edited, no suite was blindly repeated, and no provisioning, push or remote run was performed by this review.

## Summary and verdict

**Approve the CI extension source and truthful failed-evidence disposition; do not approve positive kernel acceptance, completion of the native verification goal, or production eligibility.** No new blocking security/correctness defect in the CI extension was identified by whole-change inspection. The real production unit/driver integration failure below is still an acceptance blocker. All required kernel cases remain unexecuted. An approved production repair design and subsequent implementation/review/new-source Linux evidence are necessary to progress past it.

The distinction matters: the extension now exposes a concrete inherited product integration failure and refuses preparation; that is useful test behavior, not a passing runtime verification. Existing production runtime/installer/daemon-attestation source remains identical toef1541a2. The proposed attestor design is advisory, explicitly unapproved and unimplemented; this review does not authorize or fully review that future architecture.

## Blocking integration finding

| ID | Severity / category | Location | Finding and required disposition |
| --- | --- | --- | --- |
| I1 | High — positive acceptance blocker, inherited product integration | `packages/grading-runtime/src/daemon-identity.ts:19`; current renderer `deploy/scripts/grading/install.py:63`; surfaced at `deploy/scripts/grading/ci/provision.py:227` | Under the actual current broker policy, production driver verification cannot stat the attested daemon's executable. Latest run41013987308 source6e1cea33 retains driver-verify/EACCES/stat/daemon-proc-executable. The actual broker, daemon and host namespace comparisons are all false. Preparation therefore stops before any required guest case. Retain the failure and require a separately approved production identity/service repair; do not skip the kernel identity check, relax the broker sandbox in CI, substitute a fake driver, label the sample unsupported-but-passing, or claim native readiness. |

This is the confirmed verification failure; namespace observations plus systemd source are consistent with the suspected mechanism, but the current report correctly describes the prelaunch host/daemon sampling and absence of a complete causal counterfactual. The product repair lies beyond the disposable extension's requirement to use existing rendered units. No additional CI-only fix is claimed to close I1.

## Whole-change source assessment

### Workflow, authorization and artifact boundary

The workflow is restricted to the feature-branch push, standard Ubuntu24.04 AMD64, read-only repository permission and45-minute budget. It has no production environment/secrets, pull-request execution, image publication, deployment, merge/tag or paid-host escalation. Native workflow concurrency preserves the running first-failure record. Actions/tool/dependency preparation remains explicit; an unsupported capability is not converted to a green native check.

Shared `.dockerignore` excludes all CI controllers, while the actual synthetic BuildKit COPY test checks representative and nested future CI canaries and preserves a safe package fixture. The new preflight sits under that excluded directory as well. Production application/runtime/guest source is unchanged; the only production-build-facing change is excluding test controllers from inputs.

### Privileged preparation and exact cleanup

Every privileged lifecycle operation checks the exact disposable-host/platform/root guard before mutation. Fixed private state binds new accounts, non-overlapping subordinate IDs, owned paths, image IDs, unit/config identities and endpoint incarnation. Existing principals/configuration are refused. Official selected rootless extras match installed CE; all installed protected engine packages are explicitly version-pinned, simulated removals/protected installs are refused, and post-install package/executable/daemon identity checks remain. The actual resumed runs prove selection/install and later rootless daemon/image setup advanced safely.

The administrator uses only owned stopped rootful image carriers, verifies them before copy/removal, and never executes learner source through the rootful daemon. Extracted broker trees and complete runtime descriptors are verified and staged immutable. The distinct coordinator receives the broker socket, not daemon/group/home/admin access. The manager environment correction checks an actual user service and manager-created runtime directory rather than assuming client environment or transient `%t` semantics.

Cleanup validates principals, files, daemon/container ownership and exact service identity before stopping/removing only registered resources. It checks original process incarnations and owned namespaces/cgroups absent and does not use global prune or unrelated-host cleanup. Primary and cleanup failures stay separate. All six actual preparation failures have successful cleanup receipts; kernel-stage cleanup remains unexecuted, so those receipts are not proof of post-guest destruction.

### Kernel/controller/coordinator interfaces

The24-case set covers both engines' functional boundaries plus native isolation, charged scratch, memory/PID, cancellation, retained/active restart and distinct parent/control OOM. Actual production broker/client APIs are used. BUSY retries are limited to pre-release run refusal; released work polls receipts. Fresh source/case/lease and journal/allocation bindings reject reuse, replay and source drift. Expected outputs remain with the coordinator.

The root controller alone observes/faults exact owned guests. It validates READY control/learner placement, actual interpreter UID/namespace/mount/cgroup state and GATE/EXEC evidence bound to the kernel cgroup handle. Tracing is bounded and must authenticate attached readiness. OOM proof requires local counters, an actual watched victim and pidfd/incarnation binding before removal; parent/control events cannot become a student memory grade. Fault pressure has a fixed target/action, drops privilege/NNP and trusted FDs before allocation. Confirmed removal checks census, cgroup and surviving namespace/process identity.

These paths are source-reviewed and contract-tested, but none executed on Linux because I1 stopped setup. The review makes no assertion that latent Linux-only issues cannot remain. The success validator requires all24 unique cases and corresponding root host proof rather than allowing skipped or partial execution.

### Evidence handling and diagnostic scope

Only the fixed root-owned kernel report can supply authoritative host proof. Collector reads reject symlinks/path escapes, wrong file type/owner/mode/link count, duplicate JSON keys, nonfinite/oversized data and malformed capture projections. It allowlists identity/counter/status fields and output lengths/hashes, excludes source/raw output/private state/environment and distinguishes optional worker diagnostics. Overall success requires the validated authoritative report, no collection failures and all lifecycle statuses successful (`evidence.py:200`).

Unit journal excerpts are limited to the two exact owned services, bounded by entry/message/byte/deadline limits and redacted; broad host, worker and container logs are excluded. Package diagnostics retain bounded versions/transaction identities only. Broker diagnostics invoke actual read-only production verification under current renderer-derived service policy, preserve the original failure, and expose only closed stage/errno/syscall/path-role/invariant identifiers plus three namespace booleans. They never create a guest or stand in for startup/kernel acceptance.

The wrapper preserves first primary failure and secondary cleanup/collection statuses. The stdlib-only workflow fallback covers missing wrapper summaries after prerequisite failures, preserves valid wrapper bytes/inode, marks missing/unexecuted evidence honestly, and authorizes upload only for a safe bounded summary path. One-day retention makes the tracked sanitized snapshots important; archived failures are retained across new reviewed source revisions. The earlier incorrect transient probe and superseded review are also retained with their actual failure and correction.

## Evidence verification and documentation

Independently recomputed every archived summary SHA256 and checked exact source, success:false, prepare-stage failure and cleanup status against run-index:

| Run | Source | Archive disposition |
| --- | --- | --- |
|40848107655|19ae8a29|hash/source/failure/cleanup match|
|41011046173|5177da10|hash/source/failure/cleanup match|
|41011581831|3d9ee69e|hash/source/failure/cleanup match|
|41012042378|29f0bfe5|hash/source/failure/cleanup match|
|41013115176|8e87354c|hash/source/failure/cleanup match|
|41013987308|6e1cea33|hash/source/failure/cleanup match|

All six contain no authoritative kernel report and explicitly fail collection for missing required reports. Each cleanup record proves cleaned:true, owned processes/namespaces absent and unexpectedContainers:false. Latest preflight retains the exact original error and three false comparisons. No positive case count or containment result was inferred from successful image builds or local contracts.

Current report and plan correctly preserve the0/24 gate as unmet, document the production repair boundary, and keep ordinary/browser results separate. Latest-source ordinary-run41013987237 metadata reports completed/success,17 browser cases and2 database timing contracts, with paired acceptance skipped and both broader acceptance flags false. This metadata was controller-verified, not independently re-fetched by this review. The controller corrected historical subsection wording to distinguish what was unknown/in progress at each earlier run from the current diagnosis. No outstanding documentation issue blocks failed-evidence closure.

Verification used the already source-matched87-contract result independently obtained during the latest scoped review (4.575seconds), parent87 result (4.837seconds), and supplied41 runtime/real BuildKit results. Whole-review additions independently verified the archived hashes/semantic dispositions, parsed all CI Python sources, checked shell/coordinator syntax, confirmed the application/runtime/installer diff is empty, and ran whitespace checks. Known passing suites were not repeated without a new concern. No Next.js source/API changed.

## Remaining goal status

Task1/2 implementation and scoped reviews stay complete; they are not positive Linux acceptance. Task3 source review/push/actual-run inspection and failed-evidence collection have been performed. Evidence archival/final review can close with an explicit failed disposition, while **the goal of passing all24 actual kernel cases remains incomplete and blocked by I1**. Complete application/native E2E, paired100-sample cohorts, mixed-load p95, host equivalence, release proof and native activation remain unverified. No merge, deployment or native activation is approved.
