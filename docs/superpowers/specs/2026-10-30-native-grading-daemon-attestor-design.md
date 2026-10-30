# Native grading live identity attestor design — 2026-10-30

Status: approved by the user on2026-10-30: “okay i will approve and do what is
needed”. Approval authorizes the scoped source implementation, reviews and
disposable Linux CI evidence below. Production SSH, deployment, resource
handover and native activation remain excluded. The historical observed
namespace evidence is retained.

## Decision and alternatives

Approve a small statically linked native identity attestor and credential client,
with the protocol, bootstrap and kernel restrictions below. Keep the existing
broker filesystem sandbox and every learner containment/resource contract.
Implementation remains in the isolated feature worktree and disposable Linux CI;
production deployment and native activation remain separate release gates.

| Approach | Benefit | Cost and decision |
| --- | --- | --- |
| Native read-only attestor plus credential client | Retains current broker sandbox and shared family; gives fresh kernel identity from the required namespace | Recommended; adds a small audited IPC/service boundary and immutable host tools |
| System-manager non-root broker and common-family migration | Allows direct host-namespace kernel inspection with filesystem hardening | Broader cgroup, lifecycle, unit and proof migration; not selected |
| Preserve current inactive feature and failure record | No additional implementation | Leaves0/24 kernel cases and production eligibility unresolved |

The approved scope covers source changes, reviews, new source-revision
disposable runs and evidence for this repair. It includes no production SSH,
resource handover, deployment, activation, merge, tag or purchase.

## Evidence and boundary

The actual source-`8e87354c` Linux run failed in the production driver's read-only
verification with `EACCES`, syscall `stat`, role `daemon-proc-executable`. No guest
case ran; exact cleanup succeeded. Root host attestation had succeeded against
that same daemon. The source-`6e1cea33` diagnostic run `41013987308` retained the
same exact failure and reported all three namespace comparisons false:
`brokerMatchesHost`, `brokerMatchesDaemon`, and `daemonMatchesHost`. Thus the
actual sandboxed broker and daemon each occupied a different user namespace from
the host and from each other. No guest case ran; exact cleanup succeeded. The
systemd source explains the expected sibling relationship; this diagnostic did
not independently traverse namespace parent handles.

Systemd 255's `exec_context_need_unprivileged_private_users()` independently ORs
`PrivateTmp`, `ProtectSystem`, and nonempty `ReadWritePaths`; its user-unit launch
path creates a user namespace before applying mount isolation. Setting
`PrivateUsers=no` does not override these conditions. A broker in a sibling user
namespace lacks the initial-namespace account's implicit capability in the
rootless daemon's namespace. `/proc/PID/exe` dereferencing uses a ptrace access
check, explaining the observed failure without relaxing that check.

The original specification requires the rootless daemon's dedicated systemd user
service, real kernel identity/isolation checks, and the frozen resource envelope.
It does not specifically prescribe the broker mount-hardening directives. The
approved disposable extension nevertheless requires the existing rendered units
unchanged, so this production repair requires a new written design decision.

## Recommended arrangement

Keep the current broker's `PrivateTmp`, `ProtectSystem=strict`, writable-path
allowlist, and `NoNewPrivileges`. Keep the daemon and all guest policies unchanged.
Add one dedicated, unprivileged, initial-user-namespace **read-only identity
attestor**. Its sole operation examines the fixed configured daemon endpoint and
returns fresh kernel executable/PID/socket identity. It cannot launch a process,
run Docker commands, modify cgroups, or accept paths, PIDs, source, environment
assignments, commands, or image identifiers from a client.

The helper remains under the existing `cove-grading.slice`, within the same
1280 MiB / 1.5 CPU / 256 PID / zero-swap ceiling and 256 MiB control reserve. It
runs as the existing dedicated grading account, with zero effective, permitted
and ambient capabilities in the host user namespace, `NoNewPrivileges=yes`, and
no membership in rootful Docker or application groups. Its fixed user unit `cove-grading-attestor.service` must omit
the mount/namespace directives that implicitly create a new user namespace.
Its private endpoint is `/run/user/<UID>/cove-grading/attestor.sock`, with the
exact concrete path bound into administrator-owned configuration and proof.
Document this deliberate helper-only policy; never describe it as having the
broker's mount sandbox. Root must verify its actual user namespace equals the
host's, its cgroup membership, credentials, and resource controls.

Prefer a small immutable **native attestor executable and native credential
client** for the first implementation. Root can bind the running helper's actual
kernel executable directly to the release hash, avoiding the problem of proving
which script a general-purpose interpreter loaded. Use an existing reviewed
SHA-256 implementation, not new cryptography. Build the host tools in a pinned
Linux AMD64 stage, retain their immutable hashes in the broker artifact/release,
and verify the actual runtime dependency arrangement. The artifacts must be statically linked, with no PT_INTERP or dynamic dependency
entries, and ignore loader/environment controls. Pinned build dependencies,
source provenance, licensing and release hashes are required review inputs.

The attestor can reuse the existing Python implementation as a behavioral
reference and differential-test oracle, not as an executable subprocess. Its
request parser should accept one fixed operation plus a bounded fresh challenge,
not a general JSON command object. The native client performs `SO_PEERCRED` and
returns a bounded typed reply to Node. Do not rely on undocumented Node socket
internals, infer a peer from socket owner/mode alone, or recursively inspect the
helper's inaccessible `/proc/PID/exe` from the broker.

## Authentication without recursive executable inspection

An administrator-only bootstrap writes a versioned proof under a root-owned,
non-writable directory, `/etc/cove-grading/attestor/proof.json`.
Root owns every directory component, config, executable and proof; reject
symlinks, extra hard links, group/other writes, wrong owners and oversized files.
The account must not be able to replace the proof through a writable parent.

The proof binds:

- Boot identity; exact helper PID, UID/GID and kernel start time; actual host user
  namespace; expected unit/cgroup; effective NNP and seccomp state.
- Kernel helper executable device/inode/content hash and reviewed release
  identity, not only its argv or a unit's reported command line.
- Exact listening socket path/device/inode/owner/mode and a fresh 256-bit helper
  instance identifier generated internally from kernel randomness.
- Fixed root-owned configuration identity, reviewed daemon executable hash and
  config/socket/cgroup targets, protocol version and immutable client identity.

Root verifies these across a live connection to the actual helper, checks
`SO_PEERCRED` against the exact live unit PID, and rechecks start time, executable,
socket identity and cgroup afterward. It publishes proof only after the helper
has installed its mandatory restrictions. Root bootstrap must control launch
causality and check the loaded unit/overrides; it must not turn discovery of an
arbitrary account-owned listener into authorization.

Launch causality also protects the interval before native startup sets dumpable0:
normal exec resets dumpability to1 ([Linux execve](https://man7.org/linux/man-pages/man2/execve.2.html)).
Before a genuinely fresh trusted launch, root must require host Yama
`ptrace_scope` in1..3 and keep that precondition through readiness; missing or0
fails closed, with no sysctl mutation ([kernel Yama](https://docs.kernel.org/admin-guide/LSM/Yama.html)).
The helper stays in the initial user namespace, and its launch chain must have
no attacker-controlled ancestor/ptracer exception or host CAP_SYS_PTRACE holder.
An existing user manager requires a prior root-controlled trusted launch record;
current MainPID/PPid/executable/TracerPid checks alone do not establish its history.
Otherwise bootstrap must refuse adoption and require a fresh fenced trusted
manager/launch. Root observes TracerPid0 before publication as corroboration,
not as proof that no earlier attach-and-detach occurred.

For every broker check, the pinned native client opens the root proof safely,
connects only to its fixed attestor socket, obtains kernel `SO_PEERCRED`, and
matches PID/UID/GID to that proof. It reads the helper's public start-time field
before and after the exchange, holds a pidfd during the exchange, and checks the
socket incarnation. The nonce and helper instance must match. A changed proof,
reused PID, replaced socket, malformed/oversized reply, timeout or failed
credential check fails closed. Initial integration must verify start-time access
inside the actual broker sandbox; it cannot be assumed from an arbitrary host
client, although the actual daemon preflight already passed its start-time read.

`SO_PEERCRED` is necessary but insufficient by itself: Unix listening FDs can be
passed to another process while retaining creator credentials, and `exec` retains
PID and start time. Therefore, before readiness, the helper must:

- Set `PR_SET_DUMPABLE=0` to reject same-account tracing/memory/FD manipulation.
  Root corroborates this using ownership of the fixed regular
  `/proc/<helperPID>/status` file opened without following a symlink. Linux
  exempts0555 process directories from dumpability-based ownership, so their
  owner is not this evidence ([kernel task_dump_owner](https://github.com/torvalds/linux/blob/v6.8/fs/proc/base.c#L1814)).
  Status-file ownership alone cannot distinguish dumpable0 from2; mandatory
  native SET/GET_DUMPABLE0 and the causally bound immutable executable remain
  necessary, with post-ready prctl forbidden.
- Install a reviewed seccomp allowlist that permits its fixed read-only file and
  Unix-socket workload but forbids `execve/execveat`, fork/clone/vfork/clone3,
  namespace changes, ptrace/process-memory writes, executable mappings, and
  `sendmsg`/SCM_RIGHTS FD export. Set NNP before installing it; prevent later
  dumpability reversal. No subprocesses or new threads are part of steady state.
- Close inherited descriptors except the exact required listener and startup
  channel; reject ambient environment and loader controls. Keep configuration
  immutable after startup.

These measures preserve the identity of the executable behind the authenticated
listener. They do not make a compromised helper trustworthy; the fixed request
format and implementation review remain part of the trust boundary. Root remains
trusted, as in existing host provisioning. A separate same-UID process can cause
denial of service by killing the helper, but must not impersonate a replacement.

## What the helper actually proves

Each request makes a fresh connection to the configured daemon Unix socket and
obtains daemon PID/UID from kernel `SO_PEERCRED`. It performs the same essential
checks as `daemon_identity.py`: dedicated non-root UID; actual executable path,
device/inode and SHA-256; immutable expected config argument; unified cgroup
inside the fixed execution family; PID start time; socket owner/device/inode;
and matching before/after process and socket snapshots while the connection is
held. No PID is selected from an argv scan or supplied by the broker.

The response contains the current kernel identity, echoed challenge, helper
instance and configuration identity. Raw cmdline, environment and exception text
never leave the helper. A bounded serial listener (at most four pending clients,
one request/connection, 8 KiB maximum frame, one-second per-request deadline)
returns fixed infrastructure error codes. Performance and deadline choices must
be validated rather than silently extended after a failure.

The production driver still obtains Docker ID/data-root, rootless/systemd-v2
capability, image/config/label identities and effective cgroup limits itself.
It compares live daemon identity to its frozen startup identity at every existing
continuity checkpoint. Replacing direct protected `/proc/exe` access with the
authenticated live attestation is the repair; accepting a stale sidecar, skipping
identity checks, or trusting a caller's success boolean is not.

Audit the other cross-process checks (`/proc/guest/task/.../children`, namespace
PID/status, cgroup membership and removal). The known executable failure is not
proof that all later guest observations work in the broker namespace. Any other
protected operation needs a separate narrow design, not a growing generic helper
API.

## Lifecycle and compatibility

Provision root-owned immutable helper/client/config first. Start the dedicated
daemon and helper in the common execution family. The helper user unit is bound
to the daemon's lifecycle; root bootstrap attests the exact running instance and
publishes proof. Only then start the ordinary hardened broker. Default native
selection remains disabled and installation alone starts no services.

Broker restarts can use the same live helper/proof. A helper restart must not
refresh its own proof: the old PID/start time/socket/instance fails authentication
until an explicit administrator refresh attests the new instance. Daemon restart
also invalidates the relevant frozen identity and requires the existing broker
restart/reconciliation and administrator proof workflow. No auto-adoption of a
changed daemon is introduced.

Drain/stop order is broker admissions and owned guests, broker, helper, then the
dedicated daemon; preserve uncertain cleanup and resource ownership. Stop/remove
only exact registered units, sockets, proof and files. Rollback restores a matching
broker/helper/client/proof schema set; it cannot silently disable attestation.
Never change a proof generation under a running broker without a defined fenced
handover. Preserve the existing rule that install/setup does not activate native
grading or transfer production capacity.

No learner descriptor, image, scoring rule, grading lease or public wire schema
needs to change merely for this host control repair. The broker artifact and host
configuration identities do change, so rebuild and revalidate the release,
rollback retention, host/acceptance proof and helper/client provenance. Existing
acceptance evidence cannot be relabelled as evidence for the new arrangement.

## Concrete implementation surface for a future approved plan

Implementation files to cover in the separate plan (not created by this proposal):

- `packages/grading-runtime/host/attestor.c`, `attestor-client.c`, a bounded shared
  protocol definition and reviewed syscall policy; pinned build/artifact tests.
- `packages/grading-runtime/Dockerfile.broker` and package artifact `files` list:
  package immutable AMD64 host tools in the broker artifact; retain strict tree
  extraction and record all tool hashes.
- `src/daemon-identity.ts` and `src/rootless-driver.ts`: typed authenticated live
  attestation transport, frozen identity comparison and no bypass/fallback.
  `src/main.ts` only for the required fixed proof/client configuration wiring.
- `deploy/scripts/grading/install.py`, `broker-env.py`, `host.py`, `release.py` and
  explicit administrator bootstrap/refresh tooling: exact helper unit, immutable
  config/proof validation, lifecycle and control-reserve observation. Keep ordinary
  setup install-only. Keep the current broker hardening and guest units/settings.
- Focused host/runtime tests plus disposable `ci/provision.py`, preflight and
  evidence interfaces updated only after the production implementation is
  reviewed. No CI-only substitute for the production attestor/driver.

## Required validation and exit gates

Reject forged listeners with correct UID/mode but wrong PID/start time/socket or
instance; helper exec attempts; FD transfer; forks/clones; dumpability reversal;
proof/config/executable substitution; hard links/symlinks/writable parents; helper
restart without root refresh; daemon exec/config/PID/socket changes; incomplete
before/after observations; slow/oversized/malformed requests and replies. Test
kernel peer credentials and immutable proof loading with real Unix sockets, not
only JSON fixtures. Compare native attestation semantics against existing Python
fixtures without treating fixtures as containment proof.

On actual Ubuntu 24.04 AMD64, verify broker mount hardening remains effective,
broker and helper namespace relationships, initial-userns non-root helper with
zero host capabilities, mandatory seccomp/NNP/dumpability, exact common-family
limits, helper RSS/PID/CPU and churn inside the existing control reserve. Then
execute all 24 kernel cases once on each new reviewed source revision, retaining
every failed outcome and exact cleanup. Complete broader application/native E2E,
paired cohorts, mixed load and host-equivalence/release gates separately.

A Python helper was considered as a smaller source change because it could reuse
`daemon_identity.py`. However, hashing its interpreter and script file does not
prove that a running interpreter loaded that script; argv is forgeable. It needs
an explicitly controlled root-authenticated startup chain and immutable loaded
code assumptions, plus the same exec/fork/FD/dumpability restrictions and a pinned
credential client. This design selects native tools rather than that interpreter-based alternative.
The existing Python implementation remains a differential-test oracle; it is not
the runtime helper or credential client.

A system-manager-launched non-root broker could retain mount protections while
staying in the initial user namespace, but putting it and the user-manager daemon
under the same enforced family requires a broader cgroup/unit/proof migration.
It is a valid separate architecture option, not a small CI fix. Explicit
`PrivateUsers=no` while leaving the current namespace-triggering directives is
not a solution on systemd 255; removing those directives would remove hardening.

## Primary sources

- Systemd 255 `exec-invoke.c`, particularly lines 3472–3508 and 4200–4214:
  <https://raw.githubusercontent.com/systemd/systemd/v255/src/core/exec-invoke.c>
- Systemd 255 execution policy (`PrivateTmp`, `PrivateUsers`, mount protection):
  <https://www.freedesktop.org/software/systemd/man/255/systemd.exec.html>
- Kernel ptrace access and user-namespace capability rules:
  <https://man7.org/linux/man-pages/man2/ptrace.2.html>
  <https://man7.org/linux/man-pages/man7/user_namespaces.7.html>
- Kernel executable-link access:
  <https://man7.org/linux/man-pages/man5/proc_pid_exe.5.html>

Decision: the user approved this scoped native-attestor design; implement its
separate task plan. A source review and actual Linux evidence are required
before implementation closure. Approval would not authorize deployment or native
activation.

## Design self-review

This proposal keeps the namespace-sensitive observations explicit, binds the
helper's actual native executable to immutable root proof, and prevents
in-place exec or listener-FD transfer after readiness. The helper has one fixed
read-only identity operation. Any later protected guest observation is audited
as a separate narrow requirement; it does not authorize a generic privileged
API. Namespace-aware proof loading must not assume host UID0 is visible as UID0
inside the broker's private user namespace; administrator and initial-namespace
helper perform host ownership validation, while the broker safely reads the
immutable root-installed proof path. All resource, lifecycle, restart and failure
checks remain explicit exit gates. No acceptance result is invented.

