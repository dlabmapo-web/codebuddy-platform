# Disposable native-grading Linux CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute initial real rootless Linux native-runtime checks on a disposable standard GitHub VM without changing production.

**Architecture:** A guarded administrator harness prepares the existing dedicated
grading units and immutable local artifacts. A distinct bounded unprivileged
coordinator uses only the production broker socket. Host-only observation and
fault injection remain in the administrator harness; a push workflow uploads
bounded evidence and tears down exact owned resources.

**Tech Stack:** Ubuntu 24.04 AMD64, systemd cgroup v2, official rootless Docker,
Node 22, Python 3, existing CPython/Pyodide guest and broker images, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-29-disposable-native-grading-linux-ci-design.md`

## Global Constraints

- Work only in the existing linked worktree on `feat/production-native-grading`; original IDE checkout is untouched.
- Fresh standard `ubuntu-24.04` VM, a maximum 45-minute job budget, no production secrets, no deployment environment and read-only repository permissions. The workflow is not triggered by untrusted pull-request input.
- No production SSH, paid VPS purchase, publication, merge, tag, activation, signed acceptance, global prune, rootful guest execution fallback, disabled AppArmor/seccomp or privileged Docker-in-Docker.
- Execution-family ceiling: 1280 MiB, 1.5 CPU, zero swap, 256 PIDs including daemon, helpers, broker and guests; control reserve 256 MiB; two reservations, at most one background, no extra spare. Guest PID cap 32.
- Coordinator: separate worker-equivalent cgroup capped at 768 MiB, 0.75 CPU and 256 PIDs; combined grading remains 2048 MiB / 2.25 CPUs.
- Actual production broker/client, manifest, attestation, resource bank and guest implementations; no positive fake driver, synthetic native acceptance, startup bypass or weakened limit.
- Unsupported capability, absent evidence, wrong output, uncertain cleanup or budget exhaustion fails. Preserve first failure; retries may wait for readiness, never re-execute a released source to select a successful result.
- Uploaded evidence at most 20 MiB, one-day retention, no credentials/raw environment/journal payloads/keys. Record hardware mismatch and no production five-second proof.
- Build before learner tests; observe other host/system headroom separately. The coordinator has broker access only, no Docker group/socket, grading home or privileged test-fault authority.

## Files and interfaces

- `deploy/scripts/grading/ci/provision.py`: guarded ephemeral-host lifecycle and privileged fixed operations; imports existing install/artifact/daemon-attestation code rather than copying it.
- `deploy/scripts/grading/ci/bundle.mjs`: validate actual built AMD64 image projections and emit complete manifest, funded mixed warm profiles and public non-secret test configuration.
- `deploy/scripts/grading/ci/test_provision.py`: meaningful ownership, platform, budget, artifact and failure/cleanup tests with no host mutation locally.
- `packages/grading-runtime/test/linux-kernel-smoke.mjs`: actual unprivileged production-client assertions with bounded machine-readable results; import production modules, never fixture/FakeDriver.
- `deploy/scripts/grading/ci/kernel.py`: privileged host observation/fixed fault orchestration, coordinator invocation and cleanup verification.
- `deploy/scripts/grading/ci/exec_observer.py`: bounded read-only kernel exec/OOM observation and cgroup file-handle identity matching.
- `deploy/scripts/grading/ci/test_kernel.py`: evidence/census/cgroup/fault-result rejection contracts runnable locally.
- `deploy/scripts/grading/ci/run.sh`: dependency/build/provision/test/cleanup orchestration with error preservation.
- `deploy/scripts/grading/ci/evidence.py`: allowlisted, no-symlink, bounded sanitized evidence collection with non-success on missing/overflow.
- `.github/workflows/native-grading-kernel.yml`: feature-branch-only disposable job.
- `docs/research/2026-10-29-disposable-native-grading-linux-verification.md`: actual run/outcome record, including failures and unexecuted remaining gates.

The private administrator state is `/var/lib/cove-grading-ci/state.json`, root
owned/mode0600, version1. It binds owned users, paths, service names, image config
IDs, daemon identity and a random run UUID. Public test configuration is
`/opt/cove/grading/ci/config.json`, root-owned read-only, containing only version1,
the manifest, broker socket, worker generation and coordinator evidence directory.
No caller-supplied command strings or arbitrary cleanup targets are accepted.

### Task 1: Prepare a guarded real rootless runtime environment

**Files:** Create `deploy/scripts/grading/ci/provision.py`, `bundle.mjs`, `test_provision.py`.

**Interfaces:** Consumes the existing installer, daemon SO_PEERCRED attestation,
strict artifact tree calculator and locally built `cove-grading-{native,compatibility,broker}:ci`.
Produces CLI `sudo ... python3 provision.py prepare REPO`,
`python3 provision.py observe`, `python3 provision.py cleanup`, private state and
public config at `/opt/cove/grading/ci/config.json` and private administrator state
at `/var/lib/cove-grading-ci/state.json`. These commands are ephemeral-CI-only.

- [x] **Step 1: Add and run failing local refusal/validation tests.**

```python
def test_non_ci_host_refused():
    with self.assertRaises(ValueError):
        ci.require_ephemeral_host({'GITHUB_ACTIONS': 'false'}, 'Linux', 'x86_64', 0)
def test_wrong_architecture_refused():
    with self.assertRaises(ValueError):
        ci.require_ephemeral_host(ci_environment(), 'Linux', 'aarch64', 0)
```

Run `python3 -m unittest discover -s deploy/scripts/grading/ci -p 'test_provision.py' -v`.
Require a real missing implementation failure first, not a swallowed import error.
Also cover root requirement, existing different account/config refusal, safe
non-overlapping 65536-entry subordinate IDs, exact owned cleanup and immutable
image/manifest identity rejection. Pure fixtures are contracts, not native proof.

- [x] **Step 2: Implement fixed host provisioning and bundle generation.**

Use an explicit environment guard before the first mutation:

```python
def require_ephemeral_host(env, system, architecture, euid):
    if not (env.get('GITHUB_ACTIONS') == 'true' and
            env.get('RUNNER_ENVIRONMENT') == 'github-hosted' and
            env.get('GRADING_DISPOSABLE_CI') == '1' and
            system == 'Linux' and architecture == 'x86_64' and euid == 0):
        raise ValueError('Disposable Ubuntu AMD64 GitHub host required')
```

Verify Ubuntu24.04/systemd/v2 and fresh absent owned paths/accounts; install only
official uidmap, user-session, slirp4netns and Docker rootless prerequisites with
the official rootlesskit AppArmor profile. Never disable the Ubuntu userns
restriction or AppArmor. Allocate checked non-overlapping subuid/subgid ranges.
Create grading account/control primary group and a separate unprivileged test
worker; neither joins rootful Docker. Enable grading linger and user-manager
cpu/memory/pids delegation, verifying actual controllers. Install root-owned Node22
under owned `/opt/cove` and the existing installer/scripts. Render existing units
unchanged and start the dedicated daemon with its real attestation config.
Extract broker from an exact owned stopped carrier and verify strict tree identity.
Import only the two registered guest images into the dedicated daemon. Generate
descriptors from actual image config IDs, AMD64 architecture and pinned labels/
package identities, validated with production manifest schemas. Fund one warm
guest per engine with declared128MiB and total targetReady2. Write exact private
broker env, start existing broker and wait boundedly for actual ready health.
Create an independent worker-equivalent slice with exact limits. Do not run full
production `collect_host` against absent app/Turtle services or invent that proof.

- [x] **Step 3: Implement observation and idempotent exact-owned cleanup.**

Observe actual daemon attestation, image IDs/tree/package identities, relevant
service PIDs, private socket modes, effective execution/coordinator limits and
external/system headroom. Persist only bounded non-secret projections. Stop only
fixed owned broker/daemon/test units and exact owned guests/carriers; verify
termination, namespace/descendant absence and no unexpected containers. Keep the
first failure if cleanup also fails. Existing/unowned/changing resources refuse
cleanup rather than broadening scope. Leave unrelated rootful services intact.

- [x] **Step 4: Run local checks, self-review and commit.**

```sh
python3 -m unittest discover -s deploy/scripts/grading/ci -p 'test_provision.py' -v
python3 -m py_compile deploy/scripts/grading/ci/provision.py
node --check deploy/scripts/grading/ci/bundle.mjs
git diff --check
```

Commit only this task's files with `test(grading): prepare disposable rootless Linux host`.
No actual local Mac provisioning or push is part of this task.

### Task 2: Execute real native kernel and recovery checks

**Files:** Create `packages/grading-runtime/test/linux-kernel-smoke.mjs`,
`deploy/scripts/grading/ci/kernel.py`, `exec_observer.py`, `test_kernel.py`; narrowly fix actual production
runtime defects revealed by genuine kernel evidence without weakening contracts.

**Interfaces:** Consumes Task1 fixed private/public config, production BrokerClient
and exact owned user units. Produces `python3 kernel.py run` which launches each
coordinator phase as the distinct worker under its exact cgroup budget, runs fixed
administrator fault steps, and writes bounded per-case reports to owned evidence.
The private state is `/var/lib/cove-grading-ci/state.json`; public config is
`/opt/cove/grading/ci/config.json`. Task1 report binds the concrete observed user,
slice and service names. Unprivileged CLI uses `--phase NAME --config PATH --result PATH`; phase names form
a closed enum for functional, isolation, limits, cancellation and recovery.

- [x] **Step 1: Add failing evidence/cgroup/fault rejection contracts.**

```python
def test_missing_required_native_case_fails():
    with self.assertRaises(ValueError):
        kernel.validate_results({'version': 1, 'cases': []})
def test_rootful_or_unbounded_parent_fails():
    with self.assertRaises(ValueError):
        kernel.validate_observation({'rootless': False})
```

Add assertions for wrong effective worker/family limits, absent learner pre-init
proof, PID/census changes, absent actual OOM counters and recovered receipt/source
identity mismatch. Execute `python3 -m unittest discover -s deploy/scripts/grading/ci -p 'test_kernel.py' -v`.

- [x] **Step 2: Implement bounded real broker/client cases.**

Use production health/descriptor/reserve/run/receipt/ack/release protocol. BUSY
may be retried only before release; once a run is pending, poll only its receipt.
New cases use fresh case IDs and guests. Record first failure and stop; never
silently skip a runtime or repeat failed samples. Enforce both engine descriptors.
Store stdout/stderr lengths and hashes; do not accumulate multi-MiB raw output in
artifacts. Required cases include:

| Case | Source/action | Required observation |
| --- | --- | --- |
| Unicode and stdin | `print(input('prompt:'))`, `한😀\n` | Exact text for INCLUDE and IGNORE policy on both engines |
| Consumed/unconsumed maximum stdin | `sys.stdin.read()` / `print('done')` with8388608 chars | Exact length/output, bounded completion |
| Program error | `raise ValueError('ci-check')` | RUNTIME_ERROR and bounded expected error |
| One-second timeout | `while True: pass`,1000ms | TIME_LIMIT on both engines |
| Output boundary | NUL-filled exact8388608 bytes, then over-limit output | Correct bytes/truncation, bounded protocol |
| Native isolation | inspect UID, PID namespaces, mounts, network, FDs, readonly root/cgroup and private scratch | Nonroot, no host/control/app canaries or trusted FDs, network unavailable, allowed scratch only |
| Native memory | allocate beyond128MiB semantic growth | Actual learner cgroup OOM and MEMORY_LIMIT with removed descendants |
| Native PID/descendants | bounded fork attempt while inside guest | Effective pids32 enforced; no escaped survivors after stop/removal |
| Cancel running case | actual running long-lived descendant workload then cancel | Confirmed removal, no successful receipt/capacity release before cleanup |
| Retained receipt recovery | actual completed unacked case, broker restart, same original case/lease | Same durable receipt and no source execution again |
| Restart with active guest | actual source released then broker restart | Exact owned guest reconciled; unknown receipt remains non-scoring, no replay |
| Parent/control OOM | fixed privileged pressure in execution family while active case | Actual parent/control OOM evidence; never student MEMORY_LIMIT from parent/unknown evidence |

Host orchestration must verify actual learner-before-interpreter cgroup assignment
using the existing READY gate and actual process/cgroup state, rather than trusting
an unverified JSON success field. A host-only exec trace starts before an owned
broker restart and records the gated launcher at interpreter exec, including
actual PID, UID, executable and kernel cgroup ID. Match that ID to the actual
learner cgroup using the kernel file-handle API; an after-READY snapshot alone
cannot establish pre-init assignment. The official Ubuntu bpftrace package may
supply this read-only test observer; unsupported tracing fails instead of
skipping proof. Bound the observer in the separately measured system/headroom
reserve, retain only required identity events and never argv/environment.
Use a guest-private scratch marker to prove actual source release before active
cancellation/restart/OOM faults; the administrator reads it through the exact
owned guest root. Native learner OOM and parent OOM events must be observed before
the corresponding cgroup disappears, with actual victim/leaf identity binding. Read kernel/controller evidence around failures,
classify infrastructure separately, and preserve ambiguous cleanup as failure.
The coordinator never receives daemon/home/admin authority. The host controller
performs only fixed observed faults against the private state's exact owned units.

- [x] **Step 3: Test result validation and bounded coordinator/source identity.**

```sh
python3 -m unittest discover -s deploy/scripts/grading/ci -p 'test_*.py' -v
node --check packages/grading-runtime/test/linux-kernel-smoke.mjs
pnpm --filter @cove/grading-runtime test
git diff --check
```

Refusal on this Mac is expected and is not positive evidence. Commit scoped files
with `test(grading): verify real rootless guests and recovery`.

### Task 3: Wire disposable CI, run it and preserve truthful evidence

**Files:** Create `deploy/scripts/grading/ci/run.sh`, `evidence.py`,
`.github/workflows/native-grading-kernel.yml`, evidence collector tests in
`deploy/scripts/grading/ci/test_kernel.py`, and
`docs/research/2026-10-29-disposable-native-grading-linux-verification.md`; modify
`.dockerignore` and `deploy/scripts/grading/tests/test_build_context.py` to keep
CI-only host controllers outside every production COPY context.

**Interfaces:** Consumes Task1 provision/observe/cleanup and Task2 kernel run.
Produces a feature-branch push workflow and at most20MiB sanitized summary artifact. Collect the root-owned authoritative report
`/var/lib/cove-grading-ci/kernel.json` through privileged guarded collection; a
worker-writable report alone is insufficient host proof. Pass setup-node's actual
absolute executable as `GRADING_CI_NODE_SOURCE` through narrowly scoped sudo
environment, not the entire caller PATH/environment.

- [ ] **Step 1: Add failing bounded collector/workflow contracts.**

Test missing evidence, symlink/path escape, forbidden files, size overflow and
preservation of the original test failure alongside cleanup failures. Extend the
existing real BuildKit synthetic-canary test with files under
`deploy/scripts/grading/ci/`; require they are absent from the exported COPY
context while the safe package fixture remains. Add that path to `.dockerignore`.
Test actual
workflow branch/runner/timeout/permissions, no production environment/secrets/
untrusted PR trigger, and one-day retention using the frozen web ESLint js-yaml
parser via Node createRequire, JSON_SCHEMA and duplicate-key rejection; no new
YAML dependency or hand-written parser is needed.

- [ ] **Step 2: Implement the run and evidence entrypoints.**

Build dependencies/images before grading starts; use `bash deploy/scripts/build-grading-images.sh ci linux/amd64`.
Then guard/provision, observe, run actual kernel cases, observe and exact cleanup
under an EXIT trap. Preserve nonzero primary and cleanup statuses. Collect only
allowlisted bounded JSON/status/journal excerpts, architecture/kernel/Node/Docker,
immutable IDs and checks. Source expected values stay outside broker/guest.
Every success summary asserts required case execution counts and actual kernel
evidence. Upload relevant first-failure diagnostics even on failure, never raw
environment, journal payloads, app credentials or keys.

```yaml
on:
  push:
    branches: [feat/production-native-grading]
permissions:
  contents: read
jobs:
  kernel:
    runs-on: ubuntu-24.04
    timeout-minutes: 45
```

Use workflow concurrency with `cancel-in-progress: false` to preserve a running
first-failure record when a newer source revision is queued.
Use normal checkout/pnpm/Node22 actions, frozen dependencies, explicit
`GRADING_DISPOSABLE_CI=1`, no deployment credentials, and always-run bounded
upload with `retention-days: 1`. Unsupported native capability fails this job;
do not use continue-on-error to label native checks passing.

- [ ] **Step 3: Review, push the authorized feature branch and inspect actual run.**

Run local contract checks and the appropriate runtime tests; perform the task
source review before the controller pushes only `feat/production-native-grading`.
The code implementer does not push. The controller owns actual Linux execution
and evidence closure; this task remains pending until those finish. The final
whole-change review follows actual execution and any scoped fixes. Observe the
new workflow through completion. Download actual evidence. If it exposes a
defect, preserve that run's failure, fix within the approved contracts, review
and run a new source revision; never repeatedly rerun unchanged samples to select
passing evidence. An actual runner limitation must remain an explicit failed or
unexecuted native result. No paid runner escalation or production changes.

- [ ] **Step 4: Record actual outcomes and finish.**

Record run URLs, exact commits, actual required case results, effective limits,
daemon/guest/tree/package identity, cleanup and failure dispositions. Keep the
17-case prior Pyodide browser CI and this native kernel result distinct. State
that complete app/native E2E, paired100-sample cohorts, mixed-load p95, production
host equivalence and all release/activation gates are still unverified unless
separately executed. Commit evidence/plan completion; no merge or deployment.

## Plan self-review

All approved first-stage requirements map to Tasks1–3. Task1 owns rootless
provisioning, identity, artifact loading and exact cleanup; Task2 owns actual
kernel/correctness/fault/recovery; Task3 owns the branch-scoped job, evidence
limits and actual run. Shared interfaces are fixed paths/CLI and schema-validated
descriptors, not caller-supplied success booleans. No requirement authorizes
production effects or substitutes a hosted smoke for full performance acceptance.
