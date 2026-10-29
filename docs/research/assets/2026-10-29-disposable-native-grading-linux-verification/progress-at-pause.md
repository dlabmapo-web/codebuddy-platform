# SDD ledger — plan: docs/superpowers/plans/2026-10-29-disposable-native-grading-linux-ci-implementation.md

Spec: docs/superpowers/specs/2026-10-29-disposable-native-grading-linux-ci-design.md
User approved the written disposable Linux CI design on 2026-10-29.
Prior native product implementation is complete; this is a new test-environment extension.
Original IDE checkout remains untouched. Existing linked worktree verified by distinct git-dir/common-dir and no superproject. Already-installed frozen dependencies and green source-matched Linux CI 40835892964 provide baseline: 17 browser cases, 2 DB timing contracts; no native kernel acceptance.

## Preflight

| Tasks | Producer / consumer or internal agreement | Finding / ruling |
| --- | --- | --- |
| 1 | fixed guarded CLI, state/config paths, local refusal tests and real runtime setup | Scope agrees; no application/Turtle preflight can be invented on a kernel-only VM. |
| 2 | production protocol, actual cases, kernel observation and validation | Corrected plan typo PROGRAM_ERROR to existing RUNTIME_ERROR before dispatch. |
| 3 | workflow, bounded artifact collector, actual execution record | Scope agrees; success requires all positive checks, not capability-only green. |
| 1 + 2 | private state/public config; distinct coordinator account + exact worker cgroup | Privileged controller owns fault injection; worker sees broker only. |
| 1 + 3 | prepare/observe/cleanup consumed by run.sh | Build before grading; trap preserves primary and cleanup failure; no global cleanup. |
| 2 + 3 | kernel run produces allowlisted reports consumed by evidence collector | Missing, skipped, oversized or malformed positive evidence fails job. |

Ruling: Continue in the existing linked feature worktree — verified isolation already exists — no new folder or branch confusion.
Ruling: The installed skill helpers lack executable bits. Copy their byte-identical scripts into this plan workspace and mark only those copies executable — preserves global skill installation and helper behavior — copies are ignored scratch.
Ruling: Choose the recommended subagent-driven execution without another preference question — user explicitly requested implementation and approved the written design; developer says continue authorized work — preserves task/review gates.

## Tasks
Task 1: pending
Task 2: pending
Task 3: pending

Ruling: Make fixed paths explicit inside task interfaces, since the brief generator does not include the plan Files section — avoids missing standalone requirements — no behavioral scope change.
Ruling: Use read-only kernel interpreter-exec observation plus cgroup file-handle identity for the pre-init proof; after-READY polling is insufficient. Official Ubuntu bpftrace is an allowed test-only tool, bounded in system/headroom reserve; lack of tracing fails closed — extra disposable-VM dependency, no production/runtime bypass. Sources: https://bpftrace.org/docs/0.22 and https://kernel.googlesource.com/pub/scm/docs/man-pages/man-pages/+/refs/tags/man-pages-6.13/man/man7/bpf-helpers.7
Ruling: Use a private guest scratch marker to establish actual source release before faults; use actual kernel OOM/victim and stable process/cgroup identity, not a coordinator pending response, to prove overlap — avoids invalid positive fault evidence.
Ruling: Task3 implementer owns code/local checks; after its task source-review gate the controller performs the already-authorized feature push and actual Linux execution, then closes Task3 evidence before final whole-change review. Corrected contradictory earlier whole-review-before-push wording — avoids an impossible final-review/task-completion dependency — all privileged CI code is task-reviewed before execution.
Task 1: implementation committed 5d2c00d1e897728b9d803d6bfcc9bba6eef7096d; independent review in progress by /root/disposable_host_review.
Task 1: complete (38e05b54..eefbad9b; commits5d2c00d1 + eefbad9b, 19 contracts/compile/syntax/refusal verified by implementer report; independent spec/quality approved, M1 fixed and scoped re-review pass). No real Linux provisioning yet.
Task 2: implementing by /root/disposable_kernel_checks, BASE a41dc6ec76ccde1c63b5735e73ad70561ea0984f.
Ruling: Task2 covers learner, guest-parent and control-local OOM distinctly; only disposable control leaf may be tightened for fault injection, parent/family caps remain fixed. Host pressure drops privileges before allocation and closes trusted FDs; root authoritative kernel report is /var/lib/cove-grading-ci/kernel.json, not a worker-writable success claim.
Task2 interface update: worker phase files stay in worker-owned evidence directory; authoritative kernel.json remains root-owned in private-state parent, collected through privileged bounded collector. Public projection alone is insufficient host proof.
Ruling: Compatibility retains sampled semantic growth and its actual bounded guest ancestor; do not invent native-style leaf memory.max — production policy intentionally differs. Native pre-source leaf remains baseline+128MiB for the declared profile.
Ruling: Task2 may stage root-owned harness files beneath already-owned /opt/cove and record separate kernelFiles snapshots/kernelAttempt in private state; Task1 ownedFiles remains its strict production-rendered allowlist and no new cleanup root is added.
Task3 parser interface: no local PyYAML or direct root YAML dependency. Verified frozen web ESLint js-yaml4.3.0 is available via createRequire(packages/web/package.json) -> resolve(eslint) -> createRequire -> js-yaml, with JSON_SCHEMA preserving on as string and duplicate mappings rejected. Reuse that installed parser for structured workflow tests; no new dependency is needed.
Task 2: initial implementation04f8a70f; source review found I1 READY init/control-vs-scope path and I2 setsid descendant inherited output pipes. Fix round1/5 resumed /root/disposable_kernel_checks, preserve production cgroup/drain contracts and add focused regressions.
Ruling: Private bounded /dev/shm charged to learner/guest is permitted by approved private-tmpfs design; verify its actual isolation/size/charge instead of assuming it must be unwritable — avoids a false test defect without weakening production caps.
Task 2: fix round1/5 resolved I1/I2 in57323695; 46 Python contracts (27kernel+19provision), 41 runtime tests, syntax/compile/diff checks pass; scoped re-review by /root/disposable_kernel_rereview approved.
Task 2: complete (a41dc6ec..57323695; no production runtime changes; actual Linux remains pending Task3).
Ruling: New workflow uses cancel-in-progress:false so queued newer source does not erase a running first-failure record; fixed ephemeral VM still bounds lifetime.
Ruling: Exclude deploy/scripts/grading/ci from shared Docker context and extend the existing real synthetic BuildKit export test. Existing COPY . . otherwise takes new test-only controllers into production build inputs; a context exclusion preserves the established artifact boundary without changing runtime behavior. Task3 owns this small packaging boundary plus its test.
Task 3: CODE/local implementation by /root/disposable_ci_workflow, BASE40df68c2d9b335d17fa6594f33331c6a029140ea; controller still owns push/actual execution/evidence closure.
Ruling: Preserve bounded known-owned daemon/broker unit journal diagnostics on lifecycle failure before cleanup. These exact credential-free units do not log learner payloads; no worker/container/broad host logs. Generic CalledProcessError alone loses the cause once the disposable VM is destroyed; diagnostics remain separate from root-authoritative kernel proof and inside total artifact cap.
Task 3: initial code46647577; review I1 prerequisite failure artifact gap fixed in19ae8a29; scoped re-review /root/disposable_ci_rereview pending.
Parent verification: source46647577 ran60 CI contracts, actual BuildKit context test, runtime build/41 tests, syntax/compile/diff checks all exit0. After workflow-only fix19ae8a29 reran64 CI contracts (4.583s), shell syntax/diff clean. Verified no API/shared/runtime/guest/web source changes sinceef1541a2; context/runtime source unchanged by19ae8a29. Worktree clean, source19ae8a290158df943b1d6292c6d655595071dd92, remote ahead11.
Final whole-change review base for this new approved extension isef1541a2, the already-reviewed native-product implementation head. Original implementation review and17-case Linux browser CI are archived separately; do not redispatch its completed plan.
Task3 CODE source gate complete: initial review I1 fixed19ae8a29, scoped re-review approved, parent64 contracts/syntax pass. Task3 externally pending actual Linux.
Authorized push succeeded ef1541a2..19ae8a29. Initial disposable kernel run40848107655 at https://github.com/dlabmapo-web/codebuddy-platform/actions/runs/40848107655 ; parallel existing isolated run40848107576. Kernel checkout/setup/frozen install/prepare/64contracts/realBuildKitcanary green; wrapper in progress. No production connection.

## PAUSED at user request — 2026-10-29 Asia/Seoul
User: please do not forget what you did; we will continue later. Stop implementation/CI work after saving this checkpoint. No goal tool was created.
Initial kernel run40848107655 FAILED on source19ae8a290158df943b1d6292c6d655595071dd92 at prepare: Rootless prerequisites would alter rootful engine; refused. Rootful AMD64 native/compat/broker image builds succeeded; no grading daemon or kernel cases started. Artifact12886185688 downloaded; sanitized summary archived under docs/research/assets/2026-10-29-disposable-native-grading-linux-verification/run-40848107655-summary.json. Cleanup status0, owned namespaces/processes absent, unexpectedContainers=false.
Next action NOT IMPLEMENTED: inspect/pin official rootless extras to installed Docker package versions while preserving the protected rootful-engine no-change guard; retain bounded package-version/simulation diagnostics, add focused regressions, review, then a new source-revision CI run. Exact protected package/version that apt wanted to alter is not in current artifact; do not claim it is known. Never rerun unchanged failed samples to select passing evidence.
Task1/2 code+reviews complete; Task3 code+scoped review complete, actual execution/evidence closure and final whole-change review incomplete. Do NOT redispatch completed tasks. Keep this ignored workspace and durable archived reports.
Parallel ordinary isolated run40848107576 was still in progress at last read (local-browser in progress; capability success; paired acceptance skipped); source19ae8a29. Check once on resume. Prior baseline run40835892964 succeeded with17 browser+2DB timing cases. No production changes/native activation/SSH/server purchase/merge/tag.
