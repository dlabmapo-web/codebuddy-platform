# Task 2 implementation report

Status: implemented and locally verified; actual disposable Linux execution is still pending the later authorized CI run. No native/kernel success is claimed by the local contracts.

Base: `a41dc6ec76ccde1c63b5735e73ad70561ea0984f`.
Commit: `04f8a70f` — `test(grading): verify real rootless guests and recovery`.
Worktree: `/Users/jurabeksamiev/Developer/codebuddy-platform-native-grading`.
Scoped files: `packages/grading-runtime/test/linux-kernel-smoke.mjs`, `deploy/scripts/grading/ci/kernel.py`, `exec_observer.py`, `test_kernel.py`.
No production runtime, Task1, workflow, package/dependency or neighboring source files changed.

## TDD and local verification

1. Added an importable docstring-only `kernel.py` and seven rejection tests. The first run was RED with twelve missing-implementation `AttributeError` subcase errors; import itself succeeded. Tests demanded required cases, actual limits, pre-init identity, PID/census stability, OOM evidence and receipt/source identity.
2. Implemented the validators and harness; those seven tests became GREEN.
3. Added transport, source-boundary, bounded-reader, authority/stage, native attach-notification, official apt candidate and observer parser tests. The Node transport tests invoke the actual exported coordinator helpers and prove BUSY retries stop at pending, subsequent calls are receipt-only, UNCERTAIN is returned without retry, and transport loss does not resubmit source. These local scripted replies are transport contracts, not a positive native driver or native acceptance result.
4. Added complete-result fixtures plus six mutation subcases requiring allocation/event/source/lease/observation binding. All six were RED (`ValueError not raised`) before strengthening the final validator, then GREEN.
5. Python AST parses every generated native source without executing it locally; this verifies generated quoting, including actual tab escapes in `/proc/status` checks. No guest fixture is executed on this Mac.

Final checks:

- `python3 -m unittest discover -s deploy/scripts/grading/ci -p 'test_*.py' -v`: 43 tests pass (24 Task2 + 19 Task1).
- Focused Task2 suite after final candidate parsing refinement: 24 pass.
- `node --check packages/grading-runtime/test/linux-kernel-smoke.mjs`: pass.
- `python3 -m py_compile deploy/scripts/grading/ci/kernel.py deploy/scripts/grading/ci/exec_observer.py`: pass.
- `pnpm --filter @cove/grading-runtime test`: build and 41 tests pass; no skipped tests.
- `git diff --check` and scoped staged diff check: pass.
- `python3 deploy/scripts/grading/ci/kernel.py run` on this Mac: expected exit1, `Disposable kernel checks failed: ValueError: Disposable Ubuntu AMD64 GitHub host required`, before mutation. This is refusal evidence only.

## CLI and authority boundaries

`python3 deploy/scripts/grading/ci/kernel.py run` is the root-only entrypoint and retains Task1's exact ephemeral-host guard. It consumes the fixed private state/public config paths. It installs only a candidate pinned to official Ubuntu bpftrace apt repositories, after an apt simulation that refuses daemon/runtime package changes and removals. It never changes userns/AppArmor/seccomp restrictions.

The root controller stages five root-owned files beneath the already-owned `/opt/cove` root: kernel/provision/observer harness copies, the coordinator, and a host canary. Per the parent ruling, separate `kernelFiles` snapshots and `kernelAttempt:true` are recorded in private state; Task1's strict `ownedFiles`/`ownedPaths` allowlists remain unchanged. A failed run cannot be reselected by invoking run again against the same prepared state. The copied code identities are verified before controller execution.

The fixed `cove-grading-ci-kernel.service` lives in `system.slice` with 512MiB memory, 0.5CPU, 128PIDs, zero swap and a 1800-second runtime bound. Effective limits and actual memory-current/peak, PID, local memory-event and CPU counters are recorded. Preflight requires that reserve plus another 256MiB of system headroom, separately from the unchanged 2048MiB/2.25CPU combined grading envelope. The observer and host subprocesses inherit this reserve. Fixed fault pressure is explicitly moved only into the exact observed disposable guest parent/control target and remains bounded by its unchanged parent/family ceilings.

Every coordinator phase uses the existing fixed worker service and worker slice, the distinct worker UID/GID, control-only supplementary group, and exact 768MiB/.75CPU/256PID/zero-swap limits. The host verifies actual UID/group/cgroup state. Coordinator startup verifies private state and grading-home reads are denied. It receives only the public config and uses production `BrokerClient`; it receives no daemon path, grading home authority, private state, fault executable or administrator socket.

The coordinator CLI is exactly `--phase NAME --config PATH --result PATH`, with phase enum `functional`, `isolation`, `limits`, `cancellation`, `recovery`, fixed public config, and fixed phase result path. Host handshake messages are bounded, no-follow reads with expected worker ownership. A closed case order, strict stage transitions, UUID identities, independent fixed-source hash calculation and production journal allocation binding precede any fault. Messages cannot select commands, units, paths, arbitrary PIDs or altered limits.

## Kernel and case evidence

There are 24 required cases: eight functional cases on each engine, then eight native cases (isolation, memory, pids, cancel, retained, active-restart, parent-oom, control-oom). Every case has a fresh case/lease identity; the root controller binds it to a unique fresh production journal allocation and the exact pre-observed container/PID/cgroup identity. Both complete engine descriptors are checked against the public manifest.

Functional cases use the exact requested Unicode INCLUDE/IGNORE outputs, 8388608-character consumed and unconsumed stdin, expected ValueError/RUNTIME_ERROR, one-second wall timeout, exact8388608-byte NUL stdout and one-byte-over output/truncation. Raw stdout/stderr are compared inside the worker and immediately projected to lengths and SHA256; no multi-MiB captures enter artifacts. Once a run is pending, only receipts are polled. No runtime is skipped and no failed source sample is replayed. First failure stops further phases.

Pre-init proof uses `sys_enter_execve` for the actual mapped-UID `gated-launcher`, followed by successful `sched_process_exec`, retaining only PID, UID, fixed interpreter filename and kernel cgroup ID. `name_to_handle_at` supplies the real cgroup kernfs file-handle identity (eight-byte FILEID_KERNFS), compared with the trace and `/proc` identity of the learner. Both GATE and EXEC events must match, and the final validator requires them for every source allocation. A later READY snapshot alone is not accepted.

Observer readiness is **not** a bpftrace BEGIN event: official documentation says BEGIN runs before other probes attach. The observer waits for bpftrace's native post-attach `sd_notify READY=1` on a root-private Unix datagram socket, authenticated by SCM_CREDENTIALS to its real root PID, before restarting the owned broker. Missing notify/tracing capability, diagnostics, overflow, missing/failed exec events and observer exit fail closed. The trace queue/event count is capped at512 and output at256KiB; only watched OOM victims are retained. No argv or environment is captured.

Native isolation checks actual nonroot UID, dropped caps, no-new-privileges, seccomp, distinct PID/network/user/mount/cgroup namespaces, readonly root/cgroup mount options, no host/control/app paths or bind mounts, no trusted FD3..127, unavailable network, and fresh private scratch. The `/tmp`16MiB and bounded `/dev/shm` mounts are checked as private restricted tmpfs; one MiB written in each must produce at least two MiB of actual learner `memory.stat shmem` growth. A private bounded charged shm is not falsely treated as an isolation defect.

Compatibility retains its production sampled-growth policy and `memory.max=max` learner leaf under the verified448MiB hard guest ancestor. Native requires its actual baseline+128MiB semantic leaf ceiling under256MiB guest hard ceiling, zero swap and guest pids32. No production policy is changed to force a test pass.

A private `/tmp/cove-ci-marker` with a fresh token, actual namespace PID and bounded child census proves source release before native memory/PID/cancel/restart/OOM observation. The host opens it through the exact owned init root and no-follow fixed components, then binds the namespace PID and observed descendants to the actual learner. Fork attempts are capped at40, require EAGAIN and a real parent `pids.events max` increase; setsid descendants are observed and subsequent removal requires no surviving namespace/process/cgroup/container.

Learner OOM is required to produce both local limit `oom` and victim-leaf `oom_kill` deltas, an actual kernel victim event, a pre-held pidfd/stable startTime, exact cgroup IDs, and observations while the cgroup still exists. Parent/control/family local oom counters must remain unchanged for student MEMORY_LIMIT.

Parent and control OOM are distinct fixed faults. Parent pressure is placed in a new `ci-pressure` leaf under only the observed guest parent. Control pressure tightens only that disposable control leaf to64MiB; parent/family limits never increase. Before allocation, pressure drops all groups, UID/GID to65534, verifies zero effective capabilities and no-new-privileges, closes trusted FDs, and executes only a fixed bounded allocation loop. The host verifies its PID/incarnation/cgroup and holds a pidfd. Parent-local `oom_kill` may correctly remain zero when the victim is in its pressure descendant, so the validator uses limit-local `oom` plus **victim-leaf** `oom_kill`. The trace must name the pressure victim. Fault receipts must remain UNCERTAIN/INFRASTRUCTURE, the journal must remain non-scoring, and exact removal is required. Broader family OOM is rejected rather than relabelled student memory failure. The broker is restarted only after the uncertain receipt and cleanup are verified; its daemon attestation is never rewritten.

Cancellation first proves actual running descendants, requires premature release to return BUSY, then requires cancel/release cleanup removed, an UNCERTAIN receipt and host-confirmed absence. Retained recovery compares the original full durable receipt hash in the actual production journal, exact source hash/context/reservation and full client receipt across restart; no run call is made after restart and the fresh guest census cannot change while recovering it. Active restart uses fixed SIGKILL of the broker unit's main process after the marker and RUNNING journal state, then restarts the unit and requires startup reconciliation of the exact original guest with a non-scoring unknown receipt and no replay.

## Output contract for Task3

Authoritative root-owned report: `/var/lib/cove-grading-ci/kernel.json`, mode0600, maximum2MiB. It is created on controller completion/failure and, when state exists, on setup/interruption failure. Collect this root-owned path through the privileged collector; a worker-writable copy cannot establish host proof.

Top-level success report fields:

- `version:1`, `success`, `cases` (24 bounded coordinator summaries), `productionEquivalent:false`, `nativeAcceptanceExecuted:false` (the broader production acceptance remains unexecuted).
- `before`, `after`: actual Task1 observation projections.
- `systemReserve`, `systemReserveBefore`, `systemReserveAfter`: configured/effective bounded system reserve and actual numeric counters.
- `hostProof.preInitEngines`, `workerPhases`, `allocations`, `cases`: actual root observations. Every allocation binds engine/name/caseId/sourceHash/context/reservationId/containerId/learner/exec. Native case records contain exact guest paths and numeric identities/counters, private-marker observation, removal proof, scratch/PID evidence, distinct OOM evidence, or retained before/after receipt identities.
- `kernelEvents`: bounded GATE/EXEC/watched-victim identity events, with no argv/environment/source.
- Failure reports use `success:false`, bounded `failure:{category,type,message?}`, completed earlier phase cases and available partial host proof. Cleanup secondary failures do not replace the primary phase failure.

Worker results: `/var/lib/cove-grading-ci/evidence/{functional,isolation,limits,cancellation,recovery}.json`, each read limit256KiB. Each includes version, phase, success, cases and optional bounded coordinator failure classification. Captures have `{bytes,sha256}` only. Case context/source/receipt hashes are synthetic CI identities, never application data. Root report repeats these summaries after validating their allocation bindings.

`evidence/*.request.json` and `*.reply.json` are internal phase handshakes; exclude them from uploaded evidence. `evidence/kernel.json` is only a convenience projection and is redundant/untrusted relative to the root-owned authoritative copy. No raw broker journal, observer stderr, raw stdout/stderr, daemon secrets or environment is written to evidence.

## Self-review corrections and concerns

Corrections made before commit: avoided adding files to Task1 strict allowlists; preserved compatibility's actual memory policy; fixed parent-versus-victim OOM counter semantics; authenticated native observer attach readiness; bound every short-lived case through the production journal; required source/fault stage identity; released unknown reservations after cleanup; used abrupt active restart rather than a graceful-stop-only test; caught seccomp-denied socket creation as expected network denial; verified actual readonly mount flags rather than relying on unprivileged write failure; measured tmpfs charging without inventing a shm prohibition; protected OOM identity with pidfds; preserved primary failures through worker/observer shutdown; and pinned official apt candidate selection.

No actual Ubuntu provisioning, observer attachment, guest execution, OOM, cancellation, broker crash/recovery or production access was performed here. Unsupported official Ubuntu bpftrace notify/probe support, missing cgroup handles, or inability to sample required local OOM counters before removal will fail the later real run rather than skip proof. The short-lived OOM sampling is deliberately strict: delayed/missing observations are not positive evidence. Actual Linux execution must establish all of these capabilities and may reveal genuine production defects; none were speculatively patched on this Mac. Family-local OOM injection is not added: learner, guest-parent and control-local faults are covered distinctly, and unexpected family OOM fails.

No push, publication, provisioning, agents/reviewers, production limit weakening, fake positive driver or startup bypass was used.

## Review follow-up: I1 and I2

Both Important findings in `task-2-review.md` are fixed in the harness/fixture only.

I1: `live_guest` now treats the actual READY init cgroup as `scope/control`, requires that exact leaf name, derives its parent scope, and retains the immutable `docker-<container-id>.scope` and execution-family ancestry checks. It verifies the actual init PID in control's `cgroup.procs` and the interpreter's actual `/proc` cgroup mapping in the sibling learner leaf. It does not accept the old pre-preparation init-in-scope layout.

The new integrated local fixture exercises `live_guest` against a temporary production-shaped READY cgroup tree, mocked `/proc` identity/mount/namespace reads, and trace events. It checks the returned scope/control/learner paths and interpreter identity. Six refusal subcases cover wrong init leaf, unprepared scope, wrong container ID, outside-family scope, missing init membership and moved interpreter membership. These are local API/layout contracts, not native proof.

I2: Every fixed native detached child now closes inherited stdout/stderr FDs1/2 immediately after `setsid()` and before its 30-second sleep. The parent retains its own output descriptors. Descendants still live for the PID/namespace census and broker cleanup checks, while they no longer prevent the supervisor from confirming output EOF after the parent exits. No production supervisor drain timeout or cleanup policy changed.

The pipe regression extracts the actual child branch from the generated PID fixture via Python AST and runs only that trusted branch with **exactly one** local child. It shortens the sleep to five seconds to bound the local contract, waits at most two seconds for parent-output EOF, and checks the detached child still exists when EOF arrives. A finally block kills only the exact test-owned child and reaps/closes the parent process/pipe resources. It does not run the full guest fixture, fork-until-limit loop, provisioning, cgroups or native containment test on this Mac.

TDD RED: before either fix, the focused27-test suite reported two errors and one failed subcase: the valid READY layout raised `Guest escaped exact family`; the unprepared-scope negative case incorrectly passed; and the single detached-child pipe test raised `subprocess.TimeoutExpired` after two seconds. This directly reproduced both integration defects.

TDD GREEN: after the scoped fixes, all27 Task2 tests pass, including the real single-child pipe-drain contract and all six layout refusals.

Validation after both fixes:

- `python3 -m unittest discover -s deploy/scripts/grading/ci -p 'test_*.py' -q`: **46 tests pass** (27 Task2 +19 Task1).
- `pnpm --filter @cove/grading-runtime test`: build and **41 tests pass**, zero skips.
- Node syntax check, Python compilation and `git diff --check`: pass.

Self-review: the scope is still derived from the observed init process and validated against exact owned container/family identity; no looser name-based lookup or arbitrary cleanup target was introduced. Only descendant-local pipe handles are closed, preserving the parent's output and long-lived cleanup subjects. Production runtime files, limits, drain/cleanup behavior, workflow and Task1 files remain unchanged. No subagents, push, provisioning or production access occurred. Actual Linux containment/OOM/recovery evidence remains pending.

Review-fix commit: `57323695` — `test(grading): align kernel checks with ready guest lifecycle`.
