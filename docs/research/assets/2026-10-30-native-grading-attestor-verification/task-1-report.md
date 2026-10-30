# Task 1 native attestor/client report

Status: DONE_WITH_CONCERNS for source fix round3 — forged response EOF now preserves the peer until the client finishes, and isolated valid/invalid/valid controls share one peer/socket/root-forged test proof. The real Unix fixture lifecycle contracts pass locally; the actual native-client controls require source re-review and a new controller-owned AMD64 run. Actual run41038461369 passed policy enforcement but failed all13 live fixture setups; those failures are retained. This is not Task1 closure, guest acceptance, production equivalence, deployment or activation. Earlier handoffs below are historical; the final section records the latest source and artifact identities.

Commit: `8b8a078ad3b2a6ebd87c455a848730dbbff58d62` (`feat(grading): add static daemon attestor and credential client`).
Base supplied: `1fe3972027e0296e738b50aaba7e303ead40f69f`. No push performed. The parent's two modified design/research files were left unstaged and uncommitted.

## Scope and implementation

Added separate C11 modules for strict immutable configuration/proof handling, bounded protocol/IO, kernel process/executable/socket identity, the production seccomp allowlist, helper and client. Both native programs ignore command/environment configuration and close inherited descriptors. The helper has one fixed read-only operation; only the separate fixture executable exposes test operations. Helper startup requires the configured initial namespace, dedicated real/effective UID/GID, safe groups, zero effective/permitted/ambient capabilities, NNP, dumpable0 and seccomp before listening. There is no production test mode, Docker operation, subprocess, fork or thread.

The ordinary client authenticates the root proof, its own canonical native executable, live kernel peer PID/UID/GID, pidfd, public helper start time/cgroup, socket incarnation, nonce, helper instance and root-config bytes, and checks config/proof/process/socket again. It does not read protected helper exe/ns links. Root bootstrap additionally verifies the actual helper executable, initial namespace and kernel restrictions across the connection, and emits proof metadata without writing proof. Root publication, causal launch, loaded-unit checks and lifecycle belong Task 2.

`host/PROTOCOL.md` is the producer/consumer authority: exact bounded config, wire, proof/bootstrap, normal output, fixed errors, ownership semantics, startup, filter and lifecycle requirements. Request is 48 bytes and must be half-closed with `SHUT_WR`; response is at most 8192 bytes with nonce echo. One monotonic 1000ms deadline spans all operations; regular-file/hash loops check that deadline at each bounded read boundary. Listener backlog3 gives four pending Unix clients on Linux, one accepted client at a time. The daemon identity shape remains unchanged. Daemon PID/socket replacement is returned as fresh identity for the broker's mandatory frozen comparison; it is not automatically adopted by the broker.

Broker build adds the pinned native stage, deploys only `host/bin` tools/manifest/licenses, and retains the strict unused self-workspace symlink removal. Parent-approved early `native_contracts` workflow step precedes the existing wrapper and is included in prerequisite/failure-summary stages; it uses an isolated, network-disabled, 256MiB/1CPU/64PID fixture container with `SYS_PTRACE` only for the root observer. It runs no learner code and has no app mounts, credentials, Docker socket or privileged mode.

## Controller decisions incorporated

1. Existing daemonConfig is an account-owned argument target; its ownership policy is unchanged. Strict root ownership applies attestor config/proof/native executables and their safe parents.
2. The existing root-controlled `current` symlink is an installation entrypoint. Root resolves it once and places canonical retained executable paths in config/proof. Native verification never follows that pointer. Pointer/config/proof changes require fencing.
3. Modern proc status has no Dumpable field. Proof uses `dumpable:0` and fixed `dumpabilityEvidence:"native-prctl-and-proc-owner"`: mandatory native SET/GET_DUMPABLE0, immutable executable binding, root-owned proc directory and actual NNP/seccomp observations. Proc ownership alone does not establish 0 versus2.
4. Approved config17-key refinement: add exactly `hostUserNamespaceDevice` and `hostUserNamespaceInode`. A zero-capability nonroot helper cannot assume it can inspect root PID1 namespace links, so it compares its own kernel namespace against the root-provided tuple. Root bootstrap independently checks both PID1 and helper. Ordinary client never dereferences PID1. Proof/bootstrap remain31 keys.
5. Root ownership inside the broker is namespace-aware. Overflow UID is only a representation; it is not proof of host-root ownership. The root-anchored immutable path, trusted broker mount namespace and authenticated helper's initial-userns root-config hash are all required.
6. Desktop ARM64 cannot supply actual AMD64 filter/process evidence. The parent authorized the early real-AMD64 workflow prerequisite and its affected collector/parser contracts. The parent owns review and branch CI execution; no source bypass or unsupported-platform skip was introduced.

## RED evidence

Exact command:

```sh
python3 packages/grading-runtime/host/test_native.py
```

Before implementation: `Ran 3 tests ... FAILED (errors=15)` because `host/bin/fixtures` was absent. Assertions already covered SHA256 known/streaming vectors, strict malformed JSON, an initially allowed exec and production-filter denial cases. Full output: `task-1-red.log`.

Exact workflow RED command, after tests expected the new prerequisite but before workflow update:

```sh
python3 -m unittest discover -s deploy/scripts/grading/ci -p test_kernel.py -k PrerequisiteEvidenceContracts -q
```

`Ran 4 tests ... FAILED (failures=17)`; expected native_contracts stage was absent. Full output: `task-1-workflow-red.log`.

## GREEN evidence and exact commands

Pinned compiler build:

```sh
docker build --platform linux/amd64 -f packages/grading-runtime/host/Dockerfile.test -t cove-attestor-contract:local .
```

Exit0. All native C compiled with `-std=c11 -O2 -fPIE -Wall -Wextra -Werror -fstack-protector-strong -D_FORTIFY_SOURCE=3`, static PIE, RELRO/NOW/noexecstack; no compiler warnings. Static-ELF/provenance assertions passed. Output: `task-1-build.log`.

Narrow local pure/format/build contracts:

```sh
docker run --rm --platform linux/amd64 --network=none --cgroupns=host cove-attestor-contract:local python3 -m unittest -v test_native.NativeContracts.test_sha256_known_and_streaming_vectors test_native.NativeContracts.test_strict_json_grammar test_native.NativeContracts.test_config_parser_exact_schema_and_bounds test_native.NativeContracts.test_proof_parser_exact_schema_and_bounds test_native.NativeContracts.test_static_artifact_manifest
```

`Ran 5 tests ... OK`. Includes empty/abc/multiblock and 2,097,408-byte streaming SHA256 comparison to Python hashlib; exact config/proof key schemas; every missing field; duplicate/unknown/malformed/overflow/path/hash/unsafe-flag rejections; actual built binary hashes/ELF properties. Output: `task-1-native-pure-green.log`. These are not live authentication or filter success claims.

```sh
python3 -m unittest discover -s deploy/scripts/grading/ci -p test_kernel.py -k PrerequisiteEvidenceContracts -q
python3 -m unittest discover -s deploy/scripts/grading/ci -p 'test_*.py' -q
python3 -m unittest discover -s deploy/scripts/grading/tests -p test_build_context.py -v
pnpm --filter @cove/grading-runtime test
```

Focused fallback4/4, full CI contracts87/87, real BuildKit synthetic-secret context1/1, runtime41/41. Logs respectively `task-1-workflow-green.log`, `task-1-ci-contracts.log`, `task-1-context.log`, `task-1-runtime-tests.log`.

Artifact build/extraction:

```sh
docker build --platform linux/amd64 -f packages/grading-runtime/Dockerfile.broker -t cove-attestor-broker:local .
python3 .superpowers/sdd/2026-10-30-native-grading-daemon-attestor-implementation/task-1-verify-artifact.py
```

Both exit0. Exact extraction/inspection script is retained at the command path. It creates a stopped container, reads `/opt/grading-runtime` archive, verifies UID/GID0, immutable mode0555 for both executables and no host-bin symlink/hardlink, checks SHA256, confirms host contains only bin and bin contains only tools/manifest/licenses, verifies self-workspace link removal, calculates existing strict tree identity and removes the temporary container. Python data-filter extraction adds owner-write to local copies; original archive modes are independently verified, never misrepresented as local root ownership. Generated native binaries/manifest/licenses are also available at ignored `packages/grading-runtime/host/bin`.

Strict artifactTreeIdentity: `62345699434cf3bc09a5fc17bbf72ea60ad4ba90a38f71e0447647898637ecc1`.

* attestor SHA256 `a256ab2a8776d91fa3d697e38cdfa62cf2b18f28f088520ba232e6874820886e`, 1,210,224 bytes.
* client SHA256 `ed199aa1c92804f8743d9062f6020742db7032e978723471b8355a1b5394dbff`, 1,210,240 bytes.
* Both: ELF64 AMD64 static PIE, no PT_INTERP, no DT_NEEDED, GNU_STACK RW, RELRO, BIND_NOW.

Outputs: `task-1-broker-build.log`, `task-1-artifact.log`. Docker's static-platform lint advisory is recorded; it is not a C compiler warning. No other runtime/source/vendor/fixture files occur under artifact host/.

## Required native run remains RED locally

Exact full command (also the authorized workflow command):

```sh
docker run --rm --network=none --cgroupns=host --cap-add=SYS_PTRACE --memory=256m --cpus=1 --pids-limit=64 cove-attestor-contract:local
```

`Ran 19 tests ... FAILED (failures=28)`. Thirteen real-socket/process setups fail closed with `ATTESTOR_STARTUP`; fifteen filter subcases fail filter installation with errno22. Five pure contracts pass. Output: `task-1-native-full-local.log`. No cases are skipped to make this green.

Independent environment controls (no production changes):

```sh
docker run --rm --platform linux/amd64 --network=none --cgroupns=host cove-attestor-contract:local /fixture/host/bin/fixtures policy-environment
docker run --rm --platform linux/amd64 --network=none cove-attestor-contract:local python3 -c 'import ctypes; c=ctypes.CDLL(None,use_errno=True); r=c.syscall(436,ctypes.c_uint(3),ctypes.c_uint(0xffffffff),ctypes.c_uint(0)); print("close_range="+str(r)+" errno="+str(ctypes.get_errno()))'
```

First result: `nnp=0 errno=0 dump=0 errno=0 observedDump=0 observedNnp=1 minimalSeccomp=-1 errno=22`. The filter control is an independent single `SECCOMP_RET_ALLOW` instruction, proving the local problem is not the production allowlist's policy choices. Second result: `close_range=-1 errno=38`. Desktop AMD64 emulation lacks close_range and rejects seccomp. Logs: `task-1-seccomp-environment.log`, `task-1-close-range-environment.log`.

The full real-kernel suite contains good live bootstrap/identity, wrong-root-proof bindings, forged same-UID listener, wrong PID/starttime/socket/instance/nonce, malformed/oversized/trailing/deadline frames, stale helper restart, config/proof links/modes/parents/schema, native executable substitution, daemon executable/config/PID changes and unavailable observations. Real AMD64 must execute these before Task1 closure/Task2 dependency approval. No local result certifies guest containment.

## Dependency and runtime provenance

* Compiler image exactly `gcc:14.3.0-bookworm@sha256:5e927c284bf55a7dc796262e311a0703344f62f41f5621eb56843111b1d37e15`; no apt install or floating compiler.
* Mbed TLS3.6.7 commit `068ff080b369adfac81509f9b57b2afabaf82dc5`, exact upstream SHA256/platform_util source/header dependency closure and Apache-2.0 notices. No TLS/network functionality, custom cryptography or AF_ALG. Local `mbedtls_config.h` is separately named.
* jsmn1.1.0 commit `fdcef3ebf886fa210d14956d3c068a653e76a24e`, exact upstream header and MIT license. Application grammar/schema gate rejects jsmn's intentionally permissive JSON cases; no vendor edits.
* GCC14.3.0 runtime notices at release commit `c9cd41fba9ebd288c4f101e4b99da934bcb96a11` include COPYING.RUNTIME and COPYING3.
* Actual `gcc (GCC) 14.3.0`; `GNU ld (GNU Binutils for Debian) 2.40`; Debian binutils2.40-2, libc6/libc6-dev2.36-9+deb12u10.
* `third-party.json` records per-file hashes and upstream commit/license. The build verifies exact vendor inventory and bytes. Manifest records gcc/cc1/as/ld hashes, libc.a/libgcc.a/libgcc_eh.a and CRT hashes, exact package versions, own source/Makefile/build script/PROTOCOL hashes and license hashes.
* Runtime notices retain glibc copyright + full LGPL2.1 and GCC runtime exception. STATIC-LINKING.txt points to complete application source/relink recipe and matching Debian glibc source. Distribution/license/release review remains a later gate; no legal conclusion or publication is asserted.

## Self-review and limitations

Reviewed module boundaries, strict scalar/nested JSON parsing, maximum token/file/frame/path/depth bounds, integer-safe encoding, no escape interpolation, safe fd-relative parent walks, exact root-owner/proc-peer distinctions, final proc-stat parenthesis parsing, current daemon UIDs plus kernel peer credentials, before/after executable and socket metadata, pidfd liveness, proof/config generation rechecks, mandatory restriction-before-listen ordering, syscall argument filters and default denial, lack of production test hooks, immutable runtime-only packaging and cleanup of local stopped containers.

`git diff --cached --check -- . ':!packages/grading-runtime/host/vendor'` passed before commit. Full whitespace check reports upstream blank EOF lines in exact GCC runtime notice and jsmn LICENSE; those bytes were intentionally not edited. All generated artifacts/reports are ignored; only scoped source/workflow files were committed. No learner/public interfaces, current daemon policy, broker mount sandbox, funding/resource limits or production paths were changed by this task.

Outstanding: independent source/security review; actual Ubuntu AMD64 native tool contracts; later Task2 root lifecycle/transport integration; Task3 actual hardened broker/guest observations; full release/host-equivalence and broader acceptance. The strict one-second production deadline has not been measured against real dockerd or the control reserve; actual Linux must validate it without silently extending it. Existing historical zero-of24 learner execution remains unrepaired evidence until that real run occurs.

## Changed files

```text
.github/workflows/native-grading-kernel.yml
deploy/scripts/grading/ci/test_kernel.py
packages/grading-runtime/Dockerfile.broker
packages/grading-runtime/host/.gitignore
packages/grading-runtime/host/Dockerfile.test
packages/grading-runtime/host/Makefile
packages/grading-runtime/host/PROTOCOL.md
packages/grading-runtime/host/attestor-client.c
packages/grading-runtime/host/attestor.c
packages/grading-runtime/host/build_manifest.py
packages/grading-runtime/host/common.h
packages/grading-runtime/host/config.c
packages/grading-runtime/host/fixtures.c
packages/grading-runtime/host/identity.c
packages/grading-runtime/host/mbedtls_config.h
packages/grading-runtime/host/policy.c
packages/grading-runtime/host/protocol.c
packages/grading-runtime/host/test_native.py
packages/grading-runtime/host/third-party.json
packages/grading-runtime/host/vendor/gcc-notices/COPYING.RUNTIME
packages/grading-runtime/host/vendor/gcc-notices/COPYING3
packages/grading-runtime/host/vendor/jsmn/LICENSE
packages/grading-runtime/host/vendor/jsmn/jsmn.h
packages/grading-runtime/host/vendor/mbedtls/LICENSE
packages/grading-runtime/host/vendor/mbedtls/include/mbedtls/build_info.h
packages/grading-runtime/host/vendor/mbedtls/include/mbedtls/check_config.h
packages/grading-runtime/host/vendor/mbedtls/include/mbedtls/config_adjust_legacy_crypto.h
packages/grading-runtime/host/vendor/mbedtls/include/mbedtls/config_adjust_ssl.h
packages/grading-runtime/host/vendor/mbedtls/include/mbedtls/config_adjust_x509.h
packages/grading-runtime/host/vendor/mbedtls/include/mbedtls/error.h
packages/grading-runtime/host/vendor/mbedtls/include/mbedtls/platform.h
packages/grading-runtime/host/vendor/mbedtls/include/mbedtls/platform_util.h
packages/grading-runtime/host/vendor/mbedtls/include/mbedtls/private_access.h
packages/grading-runtime/host/vendor/mbedtls/include/mbedtls/sha256.h
packages/grading-runtime/host/vendor/mbedtls/include/mbedtls/threading.h
packages/grading-runtime/host/vendor/mbedtls/library/alignment.h
packages/grading-runtime/host/vendor/mbedtls/library/common.h
packages/grading-runtime/host/vendor/mbedtls/library/platform_util.c
packages/grading-runtime/host/vendor/mbedtls/library/sha256.c
packages/grading-runtime/package.json
```


## Review fix round 1 — generated native artifact exclusion

Commit: `134c54b3bfa854068ae1842b9b58b3fb0692800b` (`fix(grading): exclude generated native tools from packaging inputs`). This commit changes only `.dockerignore`, `packages/grading-runtime/package.json`, and `deploy/scripts/grading/tests/test_build_context.py`. Native C, protocol, policy, vendor bytes, compiler inputs, runtime behavior and self-workspace-link removal are unchanged. The parent's modified research/plan files remain unstaged.

The independent Important finding was correct: Docker COPY overlays do not remove destination-only local outputs, and the package-wide host/bin entry allowed fixtures and other generated files into a package. The shared Docker context now excludes the entire generated `packages/grading-runtime/host/bin` tree. Both compiler-stage and Node-stage source COPY therefore cannot import local tools or extra files; the Node artifact receives its native bin directory solely from the pinned compiler stage. Legitimate native C/Makefile/vendor source inputs remain available.

The package `files` list now names the two executable files, manifest and each of the seven intended notices individually. It no longer admits the whole bin or licenses directory. The package probe checks the exact resulting native inventory against the built manifest's license names.

### Reproduced RED

After adding the real BuildKit canary regression, before adding the ignore rule:

```sh
python3 -m unittest discover -s deploy/scripts/grading/tests -p test_build_context.py -v
```

`Ran 2 tests ... FAILED (failures=1)` at `packages/grading-runtime/host/bin/fixtures`: the generated fixture entered the COPY layer. The pre-existing secret-canary test passed. Log: `task-1-packaging-context-red.log`.

Before narrowing package files:

```sh
python3 .superpowers/sdd/2026-10-30-native-grading-daemon-attestor-implementation/task-1-pack-probe.py
```

Exit1, `Generated native canaries leaked into package`. The actual `pnpm pack --pack-destination <temporary-directory>` tarball included all three synthetic files: `host/bin/fixtures`, `host/bin/cove-packaging-canary`, and `host/bin/licenses/cove-license-canary`. Log: `task-1-packaging-pack-red.log`. The exact reversible probe script is retained at the command path; it refuses to overwrite existing outputs and removes only its canaries in finally.

### GREEN and current artifact

After the fixes, the same context-test command passes `Ran 2 tests ... OK`. The new real BuildKit test verifies generated fixture, arbitrary bin canary and arbitrary license canary exclusion while retaining synthetic inputs at attestor.c, Makefile and vendor/mbedtls/library/sha256.c. The full shared COPY context is used, so the regression covers both compiler and Node source imports. Log: `task-1-packaging-context-green.log`.

The same pack-probe command exits0, reports `"canariesPresent": []`, and contains exactly two tools, one manifest and seven expected notices. Log: `task-1-packaging-pack-green.log`.

Actual production artifact probe:

```sh
python3 .superpowers/sdd/2026-10-30-native-grading-daemon-attestor-implementation/task-1-packaging-artifact-probe.py
```

The retained script creates all three local canaries with bytes `SYNTHETIC_GENERATED_NATIVE_CANARY\n`, verifies their presence before and after this exact production build, and then invokes the retained extraction verifier:

```sh
docker build --platform linux/amd64 -f packages/grading-runtime/Dockerfile.broker -t cove-attestor-broker:local .
python3 .superpowers/sdd/2026-10-30-native-grading-daemon-attestor-implementation/task-1-verify-artifact.py
```

Both commands exit0. The actual extracted broker has only expected native runtime entries, all original archive ownership/mode/link/hash checks pass, and a complete artifact scan finds neither canary basenames nor marker bytes. Marker SHA256 was `3537b08a0c03878515f9b429d5f711ce4e49005f730e54411025f1748af7df6a`. All canaries and stopped inspection containers were removed. Logs: `task-1-packaging-broker-build.log`, `task-1-packaging-artifact-green.log`.

Current strict artifactTreeIdentity: `8cadb5fec7e50efecfc6661e4602eb2ca5f127d1898ae5373b53b6b5c73520b5`.

The earlier artifactTreeIdentity in the original report is retained as historical evidence. Both native binaries are unchanged: attestor `a256ab2a8776d91fa3d697e38cdfa62cf2b18f28f088520ba232e6874820886e`; client `ed199aa1c92804f8743d9062f6020742db7032e978723471b8355a1b5394dbff`. Compiler/runtime/vendor/static-ELF provenance is unchanged. Generated host/bin contains the current artifact and no fixture/canary.

`git diff --cached --check` passed. No unchanged native C, full CI or runtime suites were rerun in this packaging-only round. Source re-review and the real AMD64 native-contract result remain controller-owned gates; the historical local seccomp/close_range failures and broader acceptance limitations are unchanged. No push, production operation, subagent, learner execution or paid resource was used.


## Fix round2 — actual AMD64 bootstrap rejects the created socket mode

Commit: `9475775d3116bd1fea05db812145a6e280333864` (`fix(grading): create attestor socket with exact private mode`). Parent-owned source epoch `3ea3e796c3a6035d33450e1e150bfff4f215b2eb`, including read-only Yama/prelaunch-causality clarifications, is retained unchanged. This round changes only host/PROTOCOL.md, attestor.c, common.h, fixtures.c, protocol.c and test_native.py. No policy.c, verifier predicate, schema, workflow capability, daemon policy or host setting is changed.

### Actual failure retained

Controller run41038461369, source3ea3e796c3a6035d33450e1e150bfff4f215b2eb, produced a successful pinned native/static build, five passing pure contracts and a passing actual `test_seccomp_real_denials`. All13 live test methods failed during setUp at the root bootstrap call with `ATTESTOR_CLIENT_PEER`; their later positive/adversarial assertions were not executed. Total: `Ran 19 tests in 0.620s; FAILED (failures=13)`. The kernel wrapper was skipped, so learner kernel execution remains0/24. The original step log is retained unmodified at `test-results/native-attestor-run41038461369/native-contracts.log`, SHA256 `8993cc5a0bbd9ebcdbd9ada625588e4fc4f2e768e76e00867d3414b0329cb867`. No unchanged CI rerun was requested or performed by this agent.

### Concrete cause and authority-preserving repair

Source diagnosis found that the producer used `umask(0077)` before Unix `bind()`. Linux starts the socket inode permission bits at0777, so that mask produces0700 (decimal448). `bootstrap_snapshot` correctly requires exact0600 (decimal384), as does the proof schema. The created listener therefore violates a fixed bootstrap guard even though it successfully listens. The retained error classification is consistent with this definite mismatch; it does not prove that every earlier/later bootstrap guard is otherwise satisfied.

Before editing, an isolated Linux socket control using the exact old mask/bind sequence reported `bound_socket_mode=0o700`:

```sh
docker run --rm --platform linux/amd64 --network=none cove-attestor-contract:local python3 -c 'import os,socket,stat,tempfile; d=tempfile.TemporaryDirectory(); p=d.name+"/socket"; os.umask(0o077); s=socket.socket(socket.AF_UNIX); s.bind(p); print("bound_socket_mode="+oct(stat.S_IMODE(os.lstat(p).st_mode)))'
```

The production startup bind moved intact to small shared `bind_attestor_socket(const Config *)` in protocol.c so a compiled fixture can exercise the same routine before seccomp readiness. The sole permission correction is mask0177, which atomically creates0600 without chmod or a new allowed syscall. The function still binds only the fixed root-configured target in production, keeps nonblocking/CLOEXEC, does not listen, refuses an existing entry, and closes its newly allocated FD on bind failure. Attestor main still mandates policy installation before listening. No arguments, environment settings, caller-selected operations or runtime diagnostic mode were added to the helper/client.

The verifier/proof still reject0700. The test fixture's forged listeners also now create0600; their test harness asserts actual mode and exact expected PEER/PROTOCOL/CHANGED failures, preventing incidental permission failure from pretending to test nonce/framing/instance branches. Each actual helper fixture additionally asserts its observed socket mode is0600 before root bootstrap. PROTOCOL now states the correct0177 creation mask; the wire/proof contract does not change.

### Meaningful RED and GREEN

Before changing the shared routine's old0077 mask, build and run:

```sh
docker build --platform linux/amd64 -f packages/grading-runtime/host/Dockerfile.test -t cove-attestor-contract:local .
docker run --rm --platform linux/amd64 --network=none cove-attestor-contract:local python3 -m unittest -v test_native.NativeContracts.test_attestor_bind_exact_private_mode_and_no_adoption
```

RED: `AssertionError: b'448 1 1\n' != b'384 1 1\n'`; `Ran 1 test ... FAILED (failures=1)`. This is real socket metadata from the compiled shared production bind, not a copied parser/constant assertion. Logs: `task-1-round2-red-build.log`, `task-1-round2-bind-red.log`.

After the producer correction:

```sh
docker build --platform linux/amd64 -f packages/grading-runtime/host/Dockerfile.test -t cove-attestor-contract:local .
docker run --rm --platform linux/amd64 --network=none --cgroupns=host cove-attestor-contract:local python3 -m unittest -v test_native.NativeContracts.test_attestor_bind_exact_private_mode_and_no_adoption test_native.NativeContracts.test_sha256_known_and_streaming_vectors test_native.NativeContracts.test_strict_json_grammar test_native.NativeContracts.test_config_parser_exact_schema_and_bounds test_native.NativeContracts.test_proof_parser_exact_schema_and_bounds test_native.NativeContracts.test_static_artifact_manifest
```

Build exit0 without C compiler warnings; GREEN `Ran 6 tests in 0.916s; OK`. The new test verifies exact0600, nonblocking/CLOEXEC, and refusal to adopt/remove an existing path (content and inode preserved). The proof parser regression explicitly rejects decimal448. Existing pure/hash/schema/static checks validate the rebuilt binaries. Logs: `task-1-round2-build.log`, `task-1-round2-native-green.log`.

Changed Python test syntax also passed:

```sh
python3 -m py_compile packages/grading-runtime/host/test_native.py
```

Actual broker artifact rebuilt and extracted:

```sh
docker build --platform linux/amd64 -f packages/grading-runtime/Dockerfile.broker -t cove-attestor-broker:local .
python3 .superpowers/sdd/2026-10-30-native-grading-daemon-attestor-implementation/task-1-verify-artifact.py
```

Both exit0, with exact runtime inventory, root archive ownership, mode0555/nlink1, hashes/static-ELF, and self-workspace-link checks intact. Logs: `task-1-round2-broker-build.log`, `task-1-round2-artifact.log`.

Current artifactTreeIdentity: `fb5e4a385a598408585f8a9cab9c94740511123fe62ddf47232e69624548ddb2`.

* attestor SHA256 `290c8b8b070fb0fe681de9cefdea5b40b2178bb34d62c8f37fa6c459f66b4d62`, size1,210,264.
* attestor-client SHA256 `863c2b7c3eee267e8667ca089d62be45e6172347797323a000961799b9e5c442`, size1,210,392.

Both are rebuilt because the shared native module changed. Toolchain/vendor/static runtime provenance remains pinned; updated manifest source hashes and binary hashes are retained. The local ignored host/bin now contains this artifact.

### Self-review and remaining gate

Verified unchanged strict0600 checks, no new runtime operation or permissive fallback, unchanged seccomp allowlist, unchanged bind-before-policy-before-listen order, no stale socket adoption/unlink, bounded fixture-only observation, and meaningful exact error-class assertions. `git diff --check` passed. Parent docs/rulings were not reverted. No broad capability/privileged/container change, sysctl write, production action, SSH, push or subagent was used.

The independent shared-bind fixture is a pre-readiness socket contract, not a successful full helper/bootstrap emulation. Desktop still cannot install the filter/close_range, so the unchanged unsupported local full-suite path was not rerun or marked green. The changed live fixture assertions must execute on the next reviewed actual AMD64 source. The retained policy pass belongs to the prior source; it is not relabelled as a current-source full native pass. Further live failures, real daemon latency/control-reserve acceptance and all later hardened-broker/learner gates remain possible and unresolved until their actual results exist.

## Fix round3 — forged response EOF must not invalidate peer liveness

Commit: `0257fc29ef2effe5fafdba2e53a23728b862dfe9` (`test(grading): hold forged peers through identity checks`). The only source file changed is `packages/grading-runtime/host/test_native.py`. Production C, the correct instance comparison, protocol/schema, seccomp, bootstrap/proof predicates, packaging, capabilities and host policy are unchanged. Parent documentation/assets remain unstaged and uncommitted by this agent.

### Review finding and correction

The round2 wrong-instance fixture closed its accepted stream and then exited. The ordinary native client requires response EOF, but also rechecks process/cgroup/pidfd liveness afterward. Both an instance mismatch and an exited peer produce `ATTESTOR_CLIENT_CHANGED`. The old negative could therefore pass even if the correct production instance comparison regressed. Exact error classification alone did not isolate this branch.

The forged fixture now closes each accepted stream first and signals that EOF has been delivered, then waits on a parent release event while preserving the listener and PID. The parent releases it only after the native client has returned and the expected assertions finish. Each accept/read has a 3-second timeout, each release wait has a 10-second bound, and context cleanup uses bounded 2-second join followed by kill/join if needed. The parent asserts the peer is still alive before release. No production process gains a new operation or test switch.

The wrong-instance case uses three exchanges on one forged process/socket: valid, instance-only mutation, valid. One explicit root-forged fixture proof is written before these exchanges; its bytes stay identical. Both valid controls require native-client exit0, empty stderr and the exact normal JSON response including the proof SHA256 and daemon identity. Only the response instance changes for the negative, which must return exactly `ATTESTOR_CLIENT_CHANGED`. Because the same peer remains alive and all other response/proof data remain fixed, a removed instance check would make the negative succeed and fail the test.

Inspected and updated all related forged response cases. Timeout, oversized, malformed JSON, wrong nonce and trailing data each get a successful valid-response control using the same forged peer/proof before their negative exchange. They require `ATTESTOR_CLIENT_PROTOCOL`. The different peer against the original proof requires `ATTESTOR_CLIENT_PEER`. A separate root-bootstrap case rejects the forged listener while its PID remains alive, preserves the original proof bytes and requires `ATTESTOR_CLIENT_PEER`. This explicitly distinguishes the root-authorized fixture proof used to isolate ordinary client protocol verification from a proof genuinely obtained by production root bootstrap; the fake is not claimed to satisfy bootstrap invariants.

### Meaningful RED and GREEN

Added the real Unix/process lifecycle regression against the old exiting server first:

```sh
docker build --platform linux/amd64 -f packages/grading-runtime/host/Dockerfile.test -t cove-attestor-contract:local .
docker run --rm --platform linux/amd64 --network=none --memory=256m --cpus=1 --pids-limit=64 cove-attestor-contract:local python3 -m unittest -v test_native.ForgedListenerContracts
```

RED exit1: `Ran 1 test in 2.166s; FAILED (failures=8)`. All eight subcases failed the explicit assertion `Response EOF must not terminate its peer`: valid, wrong-peer, timeout, oversized, malformed, nonce, trailing and instance. This observes actual EOF, SO_PEERCRED, process lifetime and the kernel start time, not a duplicate of the native instance predicate. Logs: `task-1-round3-red-build.log`, `task-1-round3-lifecycle-red.log`.

After changing the fixture lifecycle, rebuilt and reran the same commands above. Build exit0; GREEN exit0:

```text
test_every_response_closes_stream_but_holds_peer_until_release ... ok
test_multiple_exchanges_preserve_one_peer_and_socket ... ok
test_parent_abort_has_bounded_owned_process_cleanup ... ok
Ran 3 tests in 4.590s
OK
```

These three methods cover all eight response modes, exact wire bytes/EOF and kernel peer credentials, three exchanges preserving PID/start time/socket inode, and cleanup when the parent aborts before any accept. The fixture uses the same server/barrier implementation as the actual native-client tests. Logs: `task-1-round3-build.log`, `task-1-round3-lifecycle-green.log`.

Additional affected checks:

```sh
python3 -m py_compile packages/grading-runtime/host/test_native.py
git diff --check
```

Both passed. No unchanged native C, broker packaging, full runtime or workflow suites were rerun. The Docker fixture image rebuild verified unchanged static runtime binary hashes:

* attestor `290c8b8b070fb0fe681de9cefdea5b40b2178bb34d62c8f37fa6c459f66b4d62`, size1,210,264.
* attestor-client `863c2b7c3eee267e8667ca089d62be45e6172347797323a000961799b9e5c442`, size1,210,392.

Both remain static PIE x86_64 ELF64, no interpreter/NEEDED libraries, non-executable stack, RELRO and BIND_NOW. The runtime artifact was not changed/repackaged this round; the previously extracted artifactTreeIdentity remains `fb5e4a385a598408585f8a9cab9c94740511123fe62ddf47232e69624548ddb2`. Compiler/libc/GCC-runtime/vendor provenance and notices remain as recorded above.

### Self-review and remaining actual Linux gate

Reviewed every forged response path for EOF-before-release, live peer assertion, bounded wait/cleanup and correct expected failure class. The positive/negative/positive native control shares one immutable test proof and changes only the response instance. Cleanup covers parent assertion failure as well as successful consumption; no test-mode production bypass, policy change, broad capability, privileged container, push, SSH, subagent or production action was introduced.

Local lifecycle GREEN does not establish that the ordinary native-client positive controls pass. Desktop emulation still cannot support the mandatory native close_range/seccomp path, and the unchanged unsupported full suite was not rerun or relabelled green. Source re-review and execution of all new native-client controls on actual AMD64 remain controller-owned gates. Run41038461369 stays failed with all13 live setups failed and their assertions unexecuted; its passing policy result and retained log are unchanged. Further native bootstrap/client failures remain possible until the new actual result exists; Task1 and the downstream learner acceptance remain open.
