# Task 2 review

Reviewed commit `04f8a70fd51d742ce1107cd56722f44881cd61f4` against base `a41dc6ec76ccde1c63b5735e73ad70561ea0984f`, the Task 2 brief, implementation report, and supplied diff. Production APIs were inspected only to resolve concrete cgroup and descendant-lifecycle integration risks. No implementation files were changed, suites rerun, or Linux execution attempted.

## Spec Compliance: Request changes

The implementation substantially covers the requested surface: production BrokerClient, all 24 cases, fixed unprivileged phases, source/allocation identities, pre-interpreter trace events, bounded output summaries, actual OOM counters, cancellation, and receipt/restart recovery. However, the deterministic integration failures below prevent the intended native checks from completing. Task 2 is not ready to accept as complete.

Actual Ubuntu provisioning, observer attachment, kernel execution, OOM, cancellation, and recovery remain **unverified**, as the implementation report explicitly states. Local contract tests and Mac refusal are not positive native proof. Pending Linux verification alone is not treated as a code finding.

## Task quality: Request changes

The authority model and refusal contracts are thoughtfully scoped, but the local tests do not cover two important interactions with the existing runtime. Fix the harness integration and add focused regression coverage; retain the production resource and failure policies.

## Findings

### Critical

None identified.

### Important

1. **Warm guest inspection always treats the control leaf as the guest parent.** `deploy/scripts/grading/ci/kernel.py:145` obtains `parent` directly from `host.group(container_init_pid)`, then line 147 requires its basename to equal `docker-<container-id>.scope`. Production `prepareLeaf` explicitly moves that init process to `<scope>/control` before READY (`packages/grading-runtime/src/cgroup.ts:108–118`). `host.group` returns that actual leaf without normalization (`deploy/scripts/grading/host.py:18–22`). Therefore `Controller.warm_proof()` fails with `Guest escaped exact family` immediately after the broker restart, before any phase executes. Derive and validate the exact parent from the observed control leaf, preserving the container-ID/family checks and verifying init membership in control. The existing removal path demonstrates the required distinction (`packages/grading-runtime/src/rootless-driver.ts:549–560`). Add a focused contract for a READY guest whose init is in control and interpreter is in learner.

2. **The PID fixture expects PASSED while its detached descendants prevent successful output drainage.** `packages/grading-runtime/test/linux-kernel-smoke.mjs:88–91` forks children that call `setsid()` and sleep for 30 seconds while retaining inherited stdout/stderr. The `pids` case at line 27 lets the interpreter print and exit after three seconds and expects a PASSED receipt. The production supervisor only kills the interpreter process group after interpreter exit, so these separate-session descendants remain; their pipe descriptors keep output streams open. After two seconds, the supervisor deliberately raises `output drain unconfirmed` (`packages/grading-runtime/guest/supervisor.py:118–124`), producing an infrastructure/uncertain path rather than the required receipt. Make the fixture's long-lived descendants close their inherited output descriptors, or otherwise arrange confirmed drainage while preserving actual live descendants for broker-removal proof. Do not weaken the production fail-closed drain policy. Add a focused regression for this fixture/supervisor interaction.

### Minor

None raised.

## Strengths and scope checks

- Worker coordination uses a closed phase/case/stage sequence, source hashes, fresh identities, and production journal allocation/PID/cgroup binding before fixed host faults. The worker receives no daemon/admin endpoint or private state.
- The observer requires authenticated native attach readiness and both gate and successful exec events, with kernel cgroup-handle identity. Missing or ambiguous evidence fails; no fake positive native driver is used.
- Parent and control OOM faults are distinct. The code checks local limit events and victim-leaf kill events, holds pidfds, and rejects scoring receipts from these faults.
- Compatibility retains its sampled-growth leaf policy under its hard guest ancestor. Native memory and worker/family limits are not weakened. Bounded, private, charged `/dev/shm` is allowed and checked; it is not a finding.
- Separate `kernelFiles` snapshots stay beneath already-owned `/opt/cove`; Task 1 allowlists are unchanged. Host pressure targets are derived from observed owned guests and execute a fixed allocation loop after dropping privilege.
- BUSY retries stop once pending is returned, subsequent polling uses receipt only, captures are projected to lengths/hashes, and failed cases are not rerun. Worker/observer shutdown paths generally preserve the primary failure.
- The report records passing local checks and clearly separates those checks from the still-pending Linux run. Those checks were reviewed as reported evidence and were not regenerated.
