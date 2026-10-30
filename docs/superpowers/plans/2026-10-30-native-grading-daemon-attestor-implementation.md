# Native grading live daemon attestor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair actual hardened-broker daemon identity verification using authenticated live native attestation, then execute the required disposable Linux checks without changing production.

**Architecture:** A statically linked nonroot initial-userns attestor reads only the configured daemon's kernel identity. An immutable credential client authenticates it against administrator-owned proof and returns fresh identity to the existing hardened broker. The root controller installs/attests exact owned services and immutable artifacts; the feature workflow retains every actual result.

**Tech Stack:** Linux AMD64, C11, static GCC14.3/bookworm toolchain, reviewed Mbed TLS SHA256, bounded jsmn JSON parsing, Python3 administrative tooling, TypeScript/Node22, systemd255/cgroupv2, rootless Docker.

**Spec:** `docs/superpowers/specs/2026-10-30-native-grading-daemon-attestor-design.md`

## Global Constraints

- Existing linked worktree `/Users/jurabeksamiev/Developer/codebuddy-platform-native-grading`, branch `feat/production-native-grading`. Original checkout stays on `feat/public-turtle-browser-pilot`. Base is `cf94a265`; completed earlier plans are not redispatched.
- User approved this written design on2026-10-30. Source/independent reviews/disposable standard Ubuntu24.04 AMD64 branch CI are authorized. No production SSH, deployment, native activation, merge, tag, publication, server purchase or paid runner.
- Keep the current broker's `PrivateTmp`, `ProtectSystem=strict`, writable-path allowlist, and `NoNewPrivileges`. Keep the daemon and all guest policies unchanged.
- The helper remains under the existing `cove-grading.slice`, within the same1280MiB/1.5CPU/256PID/zero-swap ceiling and256MiB control reserve. Trusted worker remains768MiB/.75CPU/256PID; no larger grading allocation.
- Helper: existing grading UID/primary control GID, zero host effective/permitted/ambient capabilities, initial host userns, NNP, dumpable0, post-ready seccomp syscall allowlist. No mount-namespace directive that implicitly creates another userns. No app/rootful Docker groups or credentials.
- One fixed read-only daemon attestation operation, four pending clients maximum, one request/connection,8192-byte maximum frame, one-second per-request monotonic deadline. No client-supplied paths/PIDs/code/commands/env/image IDs and no Docker API operations, cgroup mutation, forks/threads or subprocesses in helper.
- Live kernel SO_PEERCRED, executable path/dev/inode/SHA256, config argument, UID, PID/starttime, cgroup ancestry and socket incarnation before/after while connected; no argv discovery, cached success, stale-sidecar fallback or caller-provided success claim.
- Root-installed config/proof beneath `/etc/cove-grading/attestor/`, no symlink/hardlink/writable-parent substitution. Client must account for root UID being unmapped inside broker userns; host administrator/helper establish host-root ownership. Client never treats account-owned proof as authoritative.
- Root-controlled launch causality and exact loaded unit/no unexpected overrides. Mandatory NNP/seccomp/dumpability before helper listens; prevent exec, fork/clone/vfork/clone3, namespace changes, ptrace/process-memory changes, executable mappings, dumpability reversal, FD export/sendmsg/SCM_RIGHTS after readiness. Close unneeded inherited FDs. Static ELF has no PT_INTERP or DT_NEEDED; no ambient loader/config behavior.
- Restarted helper cannot refresh its own proof. Broker freezes proof generation and daemon identity. Exact drain/stop order: admissions/guests, broker, helper, daemon. Changed/unavailable identities or ambiguous cleanup fail closed and keep funding quarantined.
- Existing learner/public wire/descriptor identities and flags remain unchanged. Host-tool/broker artifact/config identities change and require rebuilt release evidence. No hosted smoke establishes production equivalence or latency acceptance.
- Local Docker is Desktop ARM64. Linux/AMD64 native-tool fixture tests in a build/test container are contract evidence, not rootless guest acceptance. Actual containment comes only from the disposable real production broker path.

## Interface and file map

Task1 owns native protocol/config/proof schemas, small shared C modules, binaries and pinned artifact build. Task2 consumes that documented contract and owns root bootstrap/unit/lifecycle and Node transport. Task3 consumes both and owns disposable provisioning/observation/cleanup/evidence and actual run closure. Each code task gets spec and quality review before its dependent task.

Native executables are `/opt/cove/grading/current/host/bin/attestor` and `.../attestor-client`. Config is `/etc/cove-grading/attestor/config.json`; proof is `/etc/cove-grading/attestor/proof.json`; private socket is `/run/user/<UID>/cove-grading/attestor.sock`; unit is `cove-grading-attestor.service`.

The native contract documented in Task1's `host/PROTOCOL.md` is authoritative for its producer/consumers. Config v1 contains exactly version, uid, gid, daemonSocket, daemonExecutable, daemonExecutableSha256, daemonConfig, cgroupParent, attestorSocket, attestorExecutable, attestorExecutableSha256, clientExecutable, clientExecutableSha256, attestorUnitSha256 and artifactTreeIdentity. All values are scalar integers or bounded nonescaping strings; paths absolute/canonical and inside the fixed owned profile; hashes lowercase64hex. Reject duplicate/unknown keys, overflow, nonfinite/invalid JSON and excess depth/size.

Wire request:8-byte magic `COVEAT01`,32-byte random nonce, network-order uint32 operation1 and uint32 reserved0 (48bytes). Response:8-byte magic `COVEAR01`, echoed nonce32, uint32 status, uint32 payload length, then bounded JSON payload (total frame<=8192). Requests cannot select any target. Fixed error statuses contain no raw paths/argv/env/error text. Successful payload: version1, instance64hex, configSha25664hex, bootId UUID and daemon identity with existing `DaemonIdentity` fields. Every exchange validates complete framing/deadline/challenge and no trailing requests.

`attestor` accepts no arguments. `attestor-client` accepts no arguments for normal operation; root-only `--bootstrap` permits inspection before proof publication and performs actual helper kernel checks across the live connection. Both read only the fixed root config. Normal stdout is one bounded object `{version:1,proofSha256:<64hex>,daemon:<DaemonIdentity>}`; normal failure is nonzero with fixed classification, never raw exception/subprocess data. Root-only bootstrap additionally returns the helper kernel/process/socket/config/instance metadata needed to produce proof. Exact bootstrap/proof keys must be defined in `PROTOCOL.md`, consumed unchanged by Task2, and include all spec bindings: boot, helper PID/UID/GID/starttime/namespace/cgroup/executable dev+ino+hash/socket dev+ino+mode/instance, NNP/seccomp/dumpability, configuration/client/unit/artifact identities. No self-issued proof. Root proof has version1 and cannot be replaced under a live broker generation.

### Binding implementation clarifications

The existing daemonConfig is an account-owned configured argument; root ownership applies to new attestor config/proof/tools, not a daemon policy change. Existing retained releases use a root-controlled current symlink: administrator bootstrap resolves that logical installation entrypoint once, validates its root ownership and canonical retained release, and pins canonical executable paths/dev/inode/hashes. Native verification walks canonical paths without symlinks; client self-executable identity must match root config even when invoked through fixed current. Changed pointer/config/proof requires fenced restart. Modern procstatus has no Dumpable field: fixed evidencekind `native-prctl-and-proc-owner` combines mandatory PR_SET/GET_DUMPABLE0-before-filter/listen in the root-bound native executable with independent proc-owner/status/NNP/seccomp observations. Proc owner alone cannot distinguish0vs2, and namespace overflow UID alone cannot establish actual host-root file ownership; root administrator/initialns helper establish that ownership, native broker client authenticates immutable root paths and configuration against that helper.

### Task 1: Native immutable attestor, credential client and artifact

**Files:** Create `packages/grading-runtime/host/{PROTOCOL.md,common.h,config.c,identity.c,protocol.c,policy.c,attestor.c,attestor-client.c,Makefile,Dockerfile.test,test_native.py,fixtures.c,third-party.json}` and the minimal reviewed vendor sources/licenses under `host/vendor/`; modify `packages/grading-runtime/Dockerfile.broker` and `packages/grading-runtime/package.json`. Split native modules by the named single responsibilities rather than one giant file.

**Interfaces:** Produces the fixed protocol/config/proof contract above and documented `PROTOCOL.md`, `host/bin/attestor`, `host/bin/attestor-client`, `host/bin/manifest.json` with binary/vendor/toolchain hashes and static-ELF evidence. Task2 imports no undocumented native structure. The root bootstrap client validates live helper executable directly; the ordinary broker client authenticates the same process without accessing protected helper exe.

- [ ] **Step 1: Write executable failing native contracts and define exact bounded schemas.** Tests use actual Unix sockets and fixed synthetic daemon executable, not Docker learner guests. A representative rejection assertion is:

```python
value = run_client_against_forged_same_uid_listener()
assert value.returncode != 0
assert b'success' not in value.stdout
```

Add concrete cases for good live identity, duplicate/unknown/malformed/oversized config/proof, writable or linked proof/parent, correct-UID forged listener/wrong PID/starttime/socket/instance/nonce, stale proof/helper restart, daemon PID/exe/config/socket changes and incomplete observations. Store RED command/output before implementation. Pure parser fixtures and real socket/process fixtures remain separate evidence.

- [ ] **Step 2: Pin reviewed SHA256/parser and build toolchain.** Use upstream Mbed TLS3.6.7 commit `068ff080b369adfac81509f9b57b2afabaf82dc5`, minimum SHA256/platform-util source/header closure, Apache-2.0 license, and jsmn v1.1.0 commit `fdcef3ebf886fa210d14956d3c068a653e76a24e`. Vendor exact upstream bytes plus license and per-file hashes in third-party.json; any build config is a separately named local file. Do not implement new crypto. Avoid AF_ALG: current official kernel docs mark it deprecated/insecure. Pin compiler stage `gcc:14.3.0-bookworm@sha256:5e927c284bf55a7dc796262e311a0703344f62f41f5621eb56843111b1d37e15`; no floating compiler/apt install. Static link with warnings-as-errors, stack protection, no executable stack. For example:

```make
CFLAGS = -std=c11 -O2 -Wall -Wextra -Werror -fstack-protector-strong -D_FORTIFY_SOURCE=3
LDFLAGS = -static-pie -Wl,-z,relro,-z,now,-z,noexecstack
```

Record actual gcc/binutils versions and assert ELF architecture, no interpreter and no needed dynamic libraries. Include known SHA256 empty/abc/multiblock vectors and streaming comparison to Python hashlib. Build only needed hashing sources, not TLS/network functionality.

- [ ] **Step 3: Implement bounded helpers and one-operation server/client.** Use dirfd walks/O_NOFOLLOW, O_NONBLOCK where needed, single regular files/nlink1 and immutable ownership/modes. Hash daemon through its actual proc executable fd, compare it to reviewed canonical executable/inode/hash, verify config token without emitting argv, parse stat from the final `)` and cgroup exact ancestry with before/after snapshots. Pin live endpoint with SO_PEERCRED, pidfd and held socket. Read initial userns/credentials from kernel; helper dumpable0 can make `/proc/<helper>` root-owned, so authenticate UID from kernel peer/status rather than assuming proc-directory owner equals UID. Helper installs NNP/dumpability/seccomp before readiness and exposes no arbitrary action. A representative policy test must exercise an initially allowed syscall and verify the installed filter rejects it:

```python
assert unfiltered_exec_fixture().returncode == 0
assert filtered_exec_fixture().reported_errno == errno.EPERM
assert filtered_fd_export_fixture().reported_errno == errno.EPERM
```

Cover exec/fork/clone/namespace/process-memory/mmap-exec/dumpability/FD-export restrictions using a separate compiled fixture sharing the production filter, never a runtime test mode in the server. Audit and bound poll/IO/open loops with a single monotonic deadline; no request can stall serial service indefinitely. Static program ignores environment/loader configuration and uses no NSS/subprocesses. Root bootstrap validates fixed native code while connected; normal client rejects all changed proof/peer/incarnation values and outputs only the contract.

- [ ] **Step 4: Package and verify the actual static artifact.** Pinned compiler stage builds native tools, copies only bin/manifest/licenses into pnpm deployed broker artifact, and leaves native fixture/build/vendor source out of the runtime tree. Add host/bin to package files, preserve strict self-workspace-symlink removal and extraction. Run:

```sh
docker build --platform linux/amd64 -f packages/grading-runtime/host/Dockerfile.test -t cove-attestor-contract:local .
docker run --rm --cgroupns=host cove-attestor-contract:local
```

The fixture container uses no app mounts, credentials, rootful socket, privileged mode or learner code. Its root setup only creates isolated fake-daemon/config/proof fixtures then runs nonroot host tools. It does not certify native containment. Verify malformed frames and deadline failures are bounded and native build output has no warnings. Build the broker artifact/extract its bin/manifest and check root-owned immutable tools and strict tree identity. Commit scoped deliverable and full RED/GREEN/self-review report; do not push.

### Task 2: Root bootstrap, exact helper lifecycle and hardened broker transport

**Files:** Create `deploy/scripts/grading/attestor.py`, `deploy/scripts/grading/tests/test_attestor.py`, `packages/grading-runtime/src/attestor.ts`, `packages/grading-runtime/test/attestor.test.mjs`; modify `install.py`, `broker-env.py`, `host.py`, `release.py`, relevant retained/recovery config validators, `packages/grading-runtime/src/{daemon-identity.ts,rootless-driver.ts,main.ts}` and exact affected tests. No generic helper API.

**Interfaces:** Consumes Task1 PROTOCOL.md config/proof/bootstrap/client JSON and immutable bin manifest. Produces root-only Python `install_config(config)`, `bootstrap(config, expected_unit_identity) -> proof`, `verify_attestor(config, proof) -> observation`, `remove_owned_attestor(record)` operations with fixed schema paths, explicit evidence and install-only behavior. TS `readLiveDaemonIdentity(): Promise<{proofSha256:string,daemon:DaemonIdentity}>` invokes only the fixed immutable client path with no target arguments. Driver stores/freeze-compares proofSha256 and full daemon identity before every existing continuity-sensitive operation. There is no direct-proc or stale-sidecar fallback.

- [ ] **Step 1: Add failing ownership/lifecycle/transport contracts.** Root config/proof must reject symlink/hardlink/writable-parent/schema/generation substitutions. A representative generation fence test is:

```js
assert.rejects(() => verifyLiveIdentity(frozen, {...fresh, proofSha256: 'f'.repeat(64)}));
assert.rejects(() => verifyLiveIdentity(frozen, {...fresh, daemon: {...fresh.daemon, startTime:'999'}}));
```

Use actual native socket/client tests from Task1 for peer authenticity; TS tests check framing/typed closed output, deadlines and frozen comparisons without pretending JSON mocks prove kernel credentials. Preserve test evidence for existing source/daemon continuity and quarantine paths.

- [ ] **Step 2: Implement root config and causally bound bootstrap.** Use root-only guarded fixed CLI, canonical root-owned immutable parent/config/proof and no implicit service start. Validate unit fragment and complete drop-in inventory, exact service MainPID, static native tool/tree hashes, live namespace equals host, UID/GID/caps/NNP/seccomp/dumpability, actual kernel exe and private socket while connected, then recheck before publishing proof atomically. Proof cannot authorize an arbitrary preexisting listener. Root-owned namespace-aware proof reading follows Task1 contract; normal user cannot self-refresh. Every accepted proof binds boot/config/unit/client/artifact and helper instance/PID/starttime/socket. Account for helper inside unchanged control reserve, not another execution budget.

- [ ] **Step 3: Render exact service relationships and integrate transport.** Add fixed helper user unit requiring/bound to daemon, no mount-userns options, NNP and common slice; ordinary installer writes configuration only. Broker requires/starts after helper but keeps every existing sandbox directive. Administrator starts daemon then helper, publishes proof, then broker. Implement typed bounded fixed-client subprocess in attestor.ts with no raw child stderr/argv/env logging, validated complete JSON and nonzero/timeouts -> infrastructure failure. Replace production direct daemon exe accesses with live authenticated client and freeze/compare all previous identity fields plus proof generation. Preserve existing Docker ID/data-root/image/label and effective cgroup checks. Eliminate obsolete test-only fallback routes from production entrypoints.

- [ ] **Step 4: Audit remaining cross-process operations and lifecycle gates.** Inspect every `/proc` use in cgroup/rootless-driver/daemon identity. Protected guest children/status/namespace observations are not automatically delegated to the identity-only helper. Report any newly load-bearing namespace problem with concrete source/kernel evidence; keep one-operation helper and preserve existing learner init/READY/cleanup security. Root lifecycle tooling handles broker restart with same helper; helper/daemon restart invalidates proof and requires explicit administrator refresh/fenced restart. Rollback retains matching native tools/config/proof schema and never disables proof checks. Extend host/release observations to bind actual helper identity and family resources while keeping install/deploy disabled. Run:

```sh
python3 -m unittest discover -s deploy/scripts/grading/tests -p 'test_*.py' -v
pnpm --filter @cove/grading-runtime test
pnpm --filter @cove/grading-runtime typecheck
```

Separate Docker-requiring tests when appropriate; no broad suite repetition after green without changes. Commit complete scoped code and RED/GREEN/self-review report; do not push.

### Task 3: Disposable real integration, actual evidence and whole-change closure

**Files:** Modify existing `deploy/scripts/grading/ci/{provision.py,kernel.py,broker-preflight.mjs,evidence.py,test_provision.py,test_kernel.py,run.sh}`, `.github/workflows/native-grading-kernel.yml` only if required for host-tool contracts, and create `docs/research/2026-10-30-native-grading-attestor-verification.md` with bounded assets. Preserve all earlier summaries and failure source revisions.

**Interfaces:** Consumes production host tools/bootstrap/renderer/live driver. Produces actual root-owned helper/proof/cgroup/resource observations and complete actual kernel cases or explicit failure/unexecuted outcomes, exact cleanup, source-bound artifact and final independent review. Controller owns push/remote execution after task source review; implementer never pushes.

- [ ] **Step 1: Add focused CI contracts and integrate the production setup.** Exact new root config/proof paths and helper unit become registered owned resources, with identity snapshots and known lifecycle order. No broad deletion or helper-supplied cleanup target. Install config from actual extracted native manifest, start exact helper, run real bootstrap, freeze proof, then start ordinary hardened broker. Add helper actual identity/caps/namespace/seccomp/static hash/endpoint/proof generation and memory/PID/CPU observations, bounded closed evidence projection, and failure-stage diagnostics. Ensure native-tool source/test controllers do not enter unintended runtime COPY/package contexts; run real BuildKit context check. Preserve one-day20MiB artifact cap, primary failure and cleanup statuses, branch-only45-minute no-production-secret workflow and no rerun of unchanged failed samples.

- [ ] **Step 2: Verify local contracts and obtain task source review.** Run exact affected host/native/runtime/CI checks, syntax/compile/whitespace and actual static artifact. If code changes fix a known failure, tests must cover it. Record evidence independently from real kernel acceptance. Commit scope with report and obtain independent spec/quality gate before controller push.

- [ ] **Step 3: Controller pushes reviewed new source and inspects actual Linux run.** Push only existing feature branch, observe kernel and ordinary workflow through completion, download sanitized summary, retain source/artifact ID/hash/run URL. Verify actual hardened broker and initial-userns helper, zero host caps, NNP/seccomp/dumpability, unchanged family/worker/control budgets, immutable hash/proof and exact cleanup. Execute all24 required fresh source/guest cases on supported environment. Unsupported kernel capability or newly found defect remains explicit failure; preserve it before scoped fix/review/new source. No unchanged sample rerun, unprivileged isolation weakening, unbounded timeouts or production fallback.

- [ ] **Step 4: Final whole-change review and checkpoint.** Review this repair fromcf94a265 through final code, resolve scope findings, archive exact evidence and update plan/ledger/resume checkpoint. Keep feature worktree and ignored plan workspace until required work finishes; retain durable reports in docs. A24-case hosted pass still leaves full native app E2E, paired100-sample cohorts, mixed load, host equivalence and release/activation proofs as separate gates; prepare the next concrete isolated acceptance step when kernel proof passes. Never claim deployment readiness while those gates remain open.

## Plan self-review

All approved sections map to native tools/authentication and static artifact (Task1), root proof/lifecycle/driver/host observations (Task2), actual integration/isolation/resource/kernel/evidence and whole review (Task3). Producer schemas are explicitly owned/documented byTask1 and consumed byTask2; Task3 cannot invent a CI substitute. Parent preserves proof-generation fencing, no helper API growth and all existing broker hardening. New production runtime code is authorized by the design; actual production effects remain excluded.
