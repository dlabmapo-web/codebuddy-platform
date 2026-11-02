# Native grading runtime

This package is a trusted Unix-socket client/service and a fresh-case NsJail
backend. It is an implementation candidate, not a containment or classroom
capacity certificate. The local Docker Desktop fixture fails readiness because
CPU/memory/PID controllers are not delegated. Do not enable admission until the
real Linux smoke, crash and compatibility gates pass on the intended nodes.

## Public integration contract

```ts
import { NativeExecutionClient } from '@cove/grading-runtime';

const engine = new NativeExecutionClient({
  socketPath: '/run/cove-native/executor.sock',
  descriptor: releaseManifest.descriptor,
  lane: 'official', // trusted worker configuration; background for practice/sample/regrade
  acquisitionTimeoutMs: 30_000,
});
await engine.health();
await engine.run({code, stdin, inputPromptPolicy: 'INCLUDE',
  timeLimitMs: 1000, memoryLimitMb: 512, outputLimitBytes: 16 * 1024, signal});
await engine.dispose();
```

`version` is `native-cpython-` plus the full SHA-256 of the schema-normalized
runtime descriptor. `descriptor` exposes the complete frozen identity. The client
structurally implements the existing API `ExecutionEngine`; native outcomes are
`PASSED`, `RUNTIME_ERROR`, `MEMORY_LIMIT`, `TIME_LIMIT`. PASSED means successful
execution, before comparison. Optional `timings` exposes host-monotonic `startupMs`, `executionMs`, `cleanupMs`,
and client `acquisitionMs` (busy retry time before the accepted attempt). These
contain no learner-provided values; acquisition/transport are separate from
`runtimeMs`. Infrastructure faults reject with
`NativeInfrastructureError`; they are never learner wrong-answer verdicts.

`NativeHealth` contains ready state, immutable descriptor, generation UUID and
active/draining/quarantined allocation counts. A boolean in learner stdout cannot
be a health response. A health result establishes neither eligibility nor an SLO.
API admission must independently validate the approved release manifest.

The shared package exports `nativeRuntimeDescriptorSchema`,
`nativeReleaseManifestSchema`, `nativeNodeResourcesSchema`, `NativeRuntimeDescriptor`,
`NativeReleaseManifest`, `nativeRuntimeIdentity`, and `sameNativeRuntime`.
The descriptor independently pins exact Python patch, architecture, rootfs tree,
package manifest, NsJail revision/binary, policy/bootstrap, and existing Pyodide
comparator package and semantic version. Every field participates in identity.
Eligibility is an explicit organization/academy/material/gradingRevision/context
(live or preview)/work-kind/limit list; an empty list admits no new work.
Historical snapshots retain their recorded identity even when new eligibility
is disabled. This package does not decide admission or change comparators.

## Service and resource ownership

`NativeExecutionService({socketPath, manifest, backend}).listen()` runs backend
readiness before binding. The socket parent must be owned by the service UID and
0700; the socket is 0600. Trusted worker and launcher therefore need the same
socket-access UID. Never expose or mount this directory into a learner jail.
Startup refuses an existing socket rather than deleting potentially live state.
`node dist/main.js /absolute/config.json` accepts a strict configuration containing
`socketPath`, `manifest`, `nsjailPath`, `rootfsPath`, `policyPath`, `cgroupRoot`, and
`workRoot`. No DB/Redis credentials are needed by this process.

Each connection carries one length-prefixed, schema-validated request and response
with a UUID and complete descriptor. Length is checked before buffer allocation
or JSON parsing. Aggregate pending frame reservations consume at most one quarter
of service overhead, leaving space for decoding. Connections, incomplete frames,
execution and response drain have finite bounds. UTF-8 output capture is bounded
in bytes. Current shared code/stdin/stdout protocol limits are preserved.

The resource bank admits no internal work queue. It reserves one CPU slot plus
full authored memory, configured per-case overhead and scratch. Active, draining
and quarantined cases all retain their reservation. Background use cannot consume
the official slot or memory reservation. The latter must fit every reserved
maximum-size official case. A healthy busy response can be retried by the client
within its acquisition budget; no ambiguous/disconnected execution is retried.
Acquisition never extends the learner's allowance. Disconnect/dispose cancels the
owned case; service-side tokens remain held until backend cleanup and response
handling finish. Cleanup uncertainty retains the allocation and removes readiness
for the entire generation. Configuration does not change within a generation.

The node parent cgroup must already have a finite matching memory limit, no swap,
and a matching CPU quota; all three controllers must be delegated. The launcher
must live in a direct service leaf of that parent. Other populated leaves or
stale case groups prevent readiness. The launcher checks baseline memory against
its reservation. The manifest leaves at least 20% and at least 1 GiB of host RAM
outside the node envelope. Worker/comparator pools in the service leaf consume
this same configured overhead. Task 3 owns parent provisioning, service/PID1
reaping and measured sizing; the launcher does not remount or grant itself controls.

## Jail lifecycle and threat boundary

Each case gets a unique child cgroup and fresh NsJail/CPython process. Only a
Python-only rootfs is bind-mounted, read-only/nosuid/nodev, plus a private bounded
nosuid/nodev/noexec tmpfs. There is no procfs, shell, host home, Docker socket,
expected output, comparator or credential mount. The guest has private
user/mount/PID/IPC/network/UTS/cgroup namespaces, UID/GID 65534, empty capabilities,
no-new-privileges and a default-deny architecture-specific Kafel policy. Fork,
clone, ptrace, sockets/connect, namespace and mount operations are denied.  Process/thread creation
is deliberately unsupported and additionally bounded by the kernel PID limit.

The immutable bootstrap reads source and stdin as JSON data. Before compiling or
running source, it writes exactly one readiness byte on FD3 and waits. The host
verifies child cgroup memory/swap/PID/CPU controls, UID/GID/capabilities,
no-new-privileges, an additional seccomp filter, namespace separation, read-only
root and bounded tmpfs through host `/proc`. Only then does it start a monotonic
wall budget, sample kernel CPU consumption and send GO. The bootstrap closes FD3
before learner compilation. It does not send trusted outcomes or timing. Source
cannot choose argv, executable, mounts, environment, cgroups, policy or socket.
Top-level await remains a SyntaxError, matching the current Pyodide script runner; prompt INCLUDE/IGNORE, Unicode,
`sys.stdin.buffer`, and SystemExit semantics are preserved for qualification.

Outcomes come from supervisor exit, the host deadline and retained hierarchical
cgroup OOM counters, never learner-authored control JSON. The lifecycle waits for
supervisor exit and pipe drain, kills the entire case cgroup, verifies populated=0,
removes descendants and private work files, then releases its reservation.
Unexpected supervisor termination is infrastructure failure. The independent
NsJail wall failsafe includes startup + requested budget + cleanup allowance; it
bounds orphan learners if the Node launcher is killed. It never replaces or
extends the precise post-GO timer. A crash leaves stale cgroup evidence and
subsequent readiness refuses it. Production service-cgroup/PID1 crash reaping must
also pass `test/linux-crash-smoke.mjs`; host SIGKILL failure is not certified here.

## Reproducible build and verification

The minimal build fixture pins:

- CPython `3.12.12-slim-bookworm`, OCI index
  `sha256:593bd06efe90efa80dc4eee3948be7c0fde4134606dd40d8dd8dbcade98e669c`.
- Node `22.22.0-bookworm-slim`, OCI index
  `sha256:dd9d21971ec4395903fa6143c2b9267d048ae01ca6d3ea96f16cb30df6187d94`.
- NsJail `d8415bc8eea43cdd413daba25af63127019a1189`, including its pinned Kafel submodule.
- Debian build inputs from snapshot `20260301T000000Z`; compilation uses `make -j2`.

`guest/Dockerfile` builds the binary, cross-compiles both policies with the exact
Kafel library, copies the interpreter/stdlib and their ELF dependencies into a
Python-only tree, and emits `/opt/cove/rootfs.digest` and a package manifest.
Third-party Python packages are empty for this candidate. The digest algorithm
includes canonical UTF-8 path order, types, modes, file bytes and symlink targets;
Node/Python parity is tested. Architecture-specific final digests are measured,
never invented or copied across architectures. Final node images/CI are Task 3.

```sh
pnpm --filter @cove/shared build
pnpm --filter @cove/grading-runtime build
pnpm --filter @cove/grading-runtime test
docker build -f packages/grading-runtime/guest/Dockerfile \
  -t cove-native-nsjail:task1 packages/grading-runtime/guest
pnpm --filter @cove/grading-runtime deploy --prod /tmp/cove-native-fixture
docker run --rm --network none --cpus 2 --memory 1g --pids-limit 128 \
  --read-only --cap-drop ALL --security-opt no-new-privileges \
  --tmpfs /tmp:rw,nosuid,nodev,noexec,size=64m \
  -v /tmp/cove-native-fixture:/fixture:ro cove-native-nsjail:task1 \
  node /fixture/test/local-linux-fixture.mjs
```

The ordinary-container fixture intentionally exits 78 for unsupported controls
and separately attempts the actual strict NsJail config; neither is a pass.
Its comparator identity is visibly synthetic and eligibility is empty. It never
mounts host cgroups or changes host protection. Contract tests use fake backends
for transport/ownership and bare Python only for fixed trusted bootstrap fixtures;
these tests do not establish containment.

On an isolated, delegated, production-equivalent Linux node, run
`pnpm --filter @cove/grading-runtime smoke /absolute/isolated-config.json` and
`node packages/grading-runtime/test/linux-crash-smoke.mjs /absolute/crash-config.json`.
Run the crash command itself in a direct service leaf of the configured parent
envelope: its child launcher inherits that placement, and its in-process restart
probe uses the same placement. Both count toward the service overhead reservation.
The crash gate waits at most 15 seconds for a marker written by its known learner
after GO, observed through the case PID's private `/tmp`, before killing the
launcher. It passes only after empty retained case evidence causes the expected
stale-case readiness refusal; allocation alone or an unrelated startup refusal
cannot pass. Its focused synthetic regression can be run with
`pnpm --filter @cove/grading-runtime exec tsx --test test/linux-crash-smoke.test.ts`;
that regression does not certify actual Linux containment.
The smoke covers success/nonzero/syntax/top-level await, prompt/Unicode, guest
filesystem/environment/network/Unix/control-FD access, PID/thread denial,
memory/CPU/wall/output limits, fresh scratch, cancellation and concurrent isolation.
Do not convert unsupported into skipped-success. No all-200-under-five-seconds
claim follows from this suite; that is a separate measured fleet gate.
