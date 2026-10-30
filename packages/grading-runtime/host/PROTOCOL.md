# Native daemon attestation protocol v1

This document is the complete producer/consumer contract for the Linux AMD64
host tools. It is not a learner protocol or a containment certification.
`attestor` accepts no arguments. `attestor-client` accepts no arguments for
ordinary operation, or exactly `--bootstrap` for the root observer. Neither
accepts environment configuration, caller-selected targets, or input on stdin.

## Installation and trust boundary

Logical entrypoints are `/opt/cove/grading/current/host/bin/attestor` and
`/opt/cove/grading/current/host/bin/attestor-client`. `current` is the existing
administrator-controlled release symlink. The administrator verifies that
pointer, resolves it once to the retained artifact, and records **canonical**
executable paths in config. For example,
`/opt/cove/grading/artifacts/<tree-id>/host/bin/attestor`. Native verification
never traverses the `current` symlink: every directory of each configured
executable is opened with `O_NOFOLLOW`, checked for the required owner and no
group/other writes, and the final regular file must have exactly one link.
Execution through the logical entrypoint is checked against `/proc/self/exe`
and the configured canonical path, device, inode and SHA256. A release-pointer
change is a fenced lifecycle operation, never a live proof update.

Root configuration and proof paths are fixed:

* `/etc/cove-grading/attestor/config.json`
* `/etc/cove-grading/attestor/proof.json`

Root owns every parent and both files, with no group/other write permission, no
symlink and no extra file hard link. Recommended directories are `0755`, config
and proof `0644`, and native tools `0555` or `0755`. Owner-write remains possible
for the trusted administrator. Open/fstat/read/fstat checks detect mutations
while reading; both config and proof bytes are hashed including whitespace.
Files are limited to 8192 bytes. Socket files must be single-link Unix sockets.

In the broker's private user namespace, host UID0 may be unmapped. The client
computes its visible representation from kernel `/proc/self/uid_map` and
`/proc/sys/kernel/overflowuid`, refuses an owner equal to its own nonroot UID,
and checks the entire root-anchored immutable path. Overflow ownership **alone
is not proof of host-root ownership**. The trusted administrator and the
initial-userns helper independently check real UID0 ownership; the connected,
authenticated helper must return the exact hash of its root-validated config.
The root-controlled broker mount namespace must expose these installed files.

The existing daemon config target remains an account-owned argument target;
this does not change the daemon policy. The daemon executable itself must be a
root-owned immutable canonical regular executable with safe parents. The root
controller additionally enforces the exact production account, cove family,
release tree, loaded unit/no overrides, launch causality and resource envelope.
The native parser cannot turn an arbitrary administrator-signed configuration
into production authorization.

## Strict JSON conventions

All objects reject unknown, missing and duplicate keys. Arrays, null, booleans,
negative numbers, fractional/exponent numbers, leading zeroes, escaped strings,
non-ASCII strings, control characters, trailing commas/data and depth greater
than three are rejected. Unsigned JSON integers must be at most
9007199254740991, so TypeScript must require `Number.isSafeInteger`. Version is
exactly numeric `1`. Hashes are exactly 64 lowercase hexadecimal characters.
Boot IDs are lowercase UUID strings of length 36. Decimal start times are
nonzero digit strings without leading zeroes, at most 31 characters.

All paths are absolute, canonical spelling without empty, `.` or `..`
components, trailing slash, escapes or symlinks where secure opening applies.
Path characters are ASCII letters/digits plus `/_.-:@`. General path maximum is
511 bytes; Unix socket path maximum is 107 bytes. Exact field bounds below
include characters, not a terminating NUL. JSON whitespace is allowed between
tokens; hashes bind exact file bytes, so consumers must not reserialize a proof
to calculate its generation.

## Configuration

Config v1 has exactly these 17 keys:

| Key | Value / bound |
| --- | --- |
| `version` | integer 1 |
| `uid` | dedicated host grading UID, integer 1..4294967295 |
| `gid` | dedicated primary control GID, integer 1..4294967295 |
| `hostUserNamespaceDevice` | initial host `/proc/1/ns/user` device, unsigned safe integer |
| `hostUserNamespaceInode` | initial host `/proc/1/ns/user` inode, unsigned safe integer |
| `daemonSocket` | exactly `/run/user/<uid>/cove-grading/docker.sock` |
| `daemonExecutable` | canonical immutable root-owned executable, max 511 |
| `daemonExecutableSha256` | reviewed daemon binary hash |
| `daemonConfig` | canonical existing daemon config argument, max 511 |
| `cgroupParent` | canonical `/sys/fs/cgroup` or a descendant, max 511 |
| `attestorSocket` | exactly `/run/user/<uid>/cove-grading/attestor.sock` |
| `attestorExecutable` | canonical path under `/opt/cove/grading/`, ending `/host/bin/attestor`, max 511 |
| `attestorExecutableSha256` | immutable helper hash |
| `clientExecutable` | canonical path under `/opt/cove/grading/`, ending `/host/bin/attestor-client`, max 511 |
| `clientExecutableSha256` | immutable credential client hash |
| `attestorUnitSha256` | SHA256 of exact administrator-approved unit bytes |
| `artifactTreeIdentity` | existing strict extracted broker artifact tree identity |

The helper freezes parsed config and its exact-byte SHA256 at startup, and
safely reloads and compares it on every operation. The unit/artifact hashes are
root-controller assertions: bootstrap checks their equality to the fixed config
and records them, while the administrator must independently check actual
loaded unit, overrides and extracted artifact. They are not self-issued root
proof. Config/proof refresh is forbidden under a running broker generation.

## Wire protocol

Unix `SOCK_STREAM`, at the single configured helper endpoint. Integers on the
wire are unsigned 32-bit network byte order. One connection carries one
operation. Maximum complete response frame: 8192 bytes. The server sets one
absolute `CLOCK_MONOTONIC` deadline of 1000 ms immediately after accepting; every
read, poll, hash chunk, daemon observation and response uses that same deadline.
The client separately uses one 1000 ms deadline from its startup verification.
Four pending connections maximum (Linux Unix backlog 3 admits backlog+1), with
one accepted connection processed serially. No threads, forks or subprocesses.

Request is **exactly 48 bytes**:

| Offset | Length | Value |
| --- | --- | --- |
| 0 | 8 | ASCII `COVEAT01` |
| 8 | 32 | fresh raw nonce from `getrandom()` |
| 40 | 4 | operation 1 |
| 44 | 4 | reserved 0 |

The sender must call `shutdown(SHUT_WR)` after these bytes. The receiver requires
EOF after byte 48 **before** doing any operation, rejecting pipelining or trailing
bytes without ambiguity. It does not interpret caller paths, PIDs, commands,
code, environment, image identifiers or JSON. A sender that never half-closes
consumes at most the same one-second deadline.

Response header is 48 bytes, then payload:

| Offset | Length | Value |
| --- | --- | --- |
| 0 | 8 | ASCII `COVEAR01` |
| 8 | 32 | exact echoed nonce |
| 40 | 4 | status |
| 44 | 4 | payload byte length, 0..8144 |
| 48 | length | JSON success payload; no terminating NUL |

Status 0 requires a nonempty valid success payload. Fixed errors are 1 (request),
2 (fixed configuration changed/unavailable), 3 (daemon identity unavailable or
changed). Errors have zero payload. Incomplete framing, trailing bytes or expired
deadline may close without response. The client rejects every nonzero/unknown
status, wrong magic/challenge, empty success, oversized or malformed payload,
embedded NUL, trailing data and missing EOF. Errors contain no raw paths, argv,
environment, exceptions or system error strings.

Successful payload has exactly `version`, `instance`, `configSha256`, `bootId`,
`daemon`. `instance` is the helper's internally generated 256-bit value encoded
as 64 lowercase hex, generated once before readiness. `configSha256` is the
exact-byte fixed config hash. `daemon` has exactly the existing fields:

| Key | Type |
| --- | --- |
| `version` | integer 1 |
| `pid` | integer 1..2147483647 |
| `uid` | nonzero uint32, configured dedicated account |
| `startTime` | decimal string from `/proc/PID/stat` field 22 |
| `executable` | canonical configured executable path |
| `executableDevice` | unsigned safe integer |
| `executableInode` | unsigned safe integer |
| `executableSha256` | reviewed actual proc-executable content hash |
| `socketDevice` | unsigned safe integer |
| `socketInode` | unsigned safe integer |

Each request connects to the daemon anew, gets kernel `SO_PEERCRED`, holds its
pidfd and connection, hashes the actual `/proc/PID/exe` descriptor, compares the
canonical immutable executable, and checks the exact single
`--config-file=<daemonConfig>` argument. A second config-file option is rejected.
The final `)` in proc stat delimits comm. Unified cgroup must be a strict
**descendant** of configured `cgroupParent`, not merely a string prefix. Process,
executable, config argument, cgroup, socket incarnation and pidfd liveness are
checked before/after while connected. The helper never uses Docker HTTP/API.
The broker retains its own frozen daemon comparison and all other Docker and
guest checks; an apparently valid changed daemon is not automatically adopted.

## Root bootstrap and proof schema

`attestor-client --bootstrap` is real/effective UID0 only. It does not read or
write proof. Its stdout is one JSON object, with exactly the **31** keys below,
plus a newline. The root controller can publish this object as proof only after
its independent launch/unit/resource checks pass. Bootstrap obtains helper
`SO_PEERCRED`, holds its pidfd, verifies the actual immutable kernel executable,
public start time, initial user namespace, credentials, cgroup, socket and config
across the live nonce exchange. It verifies its own actual executable too.

| Key | Meaning / value |
| --- | --- |
| `version` | 1 |
| `bootId` | current host boot UUID |
| `instance` | live authenticated helper instance, 64hex |
| `configSha256` | exact root config bytes SHA256 |
| `helperPid` | kernel peer PID, nonzero int32 |
| `helperUid` | kernel peer and all four status UID values, configured UID |
| `helperGid` | kernel peer and all four status GID values, configured GID |
| `helperStartTime` | proc stat field 22, max 31 |
| `helperUserNamespaceDevice` | device of `/proc/PID/ns/user` |
| `helperUserNamespaceInode` | inode of `/proc/PID/ns/user`, equals `/proc/1/ns/user` |
| `helperCgroup` | observed absolute `/sys/fs/cgroup/...` strict descendant, max 511 |
| `helperExecutable` | actual canonical executable, max 511 |
| `helperExecutableDevice` | actual executable device |
| `helperExecutableInode` | actual executable inode |
| `helperExecutableSha256` | actual content hash |
| `socketPath` | fixed configured helper socket |
| `socketDevice` | socket pathname device |
| `socketInode` | socket pathname inode |
| `socketUid` | configured UID |
| `socketGid` | configured primary GID |
| `socketMode` | integer 384, permission bits `0600` |
| `noNewPrivs` | integer 1, observed status |
| `seccomp` | integer 2, observed status |
| `dumpable` | integer 0, bound native invariant described below |
| `dumpabilityEvidence` | exact `native-prctl-and-proc-owner` |
| `clientExecutable` | actual canonical client path, max 511 |
| `clientExecutableDevice` | actual client executable device |
| `clientExecutableInode` | actual client executable inode |
| `clientExecutableSha256` | actual client content hash |
| `attestorUnitSha256` | exact configured approved unit hash |
| `artifactTreeIdentity` | exact configured strict artifact tree identity |

All device/inode/mode fields are unsigned safe integers. `CapEff`, `CapPrm` and
`CapAmb` are independently observed zero; helper startup permits no supplemental
groups other than its configured primary GID. Root compares the helper's namespace
to `/proc/1/ns/user`; the administrator must itself be in the real initial host
user/PID namespaces, not a container pretending to be the host.

Modern proc status does not expose `Dumpable`. Bootstrap confirms the nonroot
peer/status credentials, root-owned `/proc/PID` directory, observed NNP/seccomp,
and exact immutable native executable. That executable mandatorily executes
`PR_SET_DUMPABLE=0` and confirms `PR_GET_DUMPABLE==0` before installing seccomp
and listening; its policy then forbids every prctl, so dumpability cannot change.
Proc directory ownership alone does **not** distinguish dumpable 0 from 2. The
fixed evidence field explicitly records this combined code/kernel evidence.

The normal client never reads the helper's protected executable or namespace
link. It verifies proof, config, own native executable, current boot, kernel peer
PID/UID/GID, public start time/cgroup, held pidfd, socket mode/owner/incarnation,
nonce, instance, and config hash. It rechecks process/socket plus exact proof and
config bytes at the end. A helper restart cannot refresh its proof and therefore
fails closed until the administrator performs a fenced refresh.

Normal stdout is exactly one bounded object plus newline:
`{"version":1,"proofSha256":"<exact proof bytes hash>","daemon":<DaemonIdentity>}`.
The Node caller freezes `proofSha256` and daemon identity at broker startup.
Failure is nonzero, no stdout and one fixed stderr classification:
`ATTESTOR_CLIENT_ARGUMENT`, `STARTUP`, `CONFIG`, `BOOTSTRAP`, `PROOF`,
`EXECUTABLE`, `PEER`, `PROTOCOL`, or `CHANGED`, each with prefix
`ATTESTOR_CLIENT_` (the first item already shows it). No raw exceptions are
returned. Root bootstrap failures follow the same classification rule.

## Startup, filter and lifecycle requirements

Helper startup clears its environment and closes inherited FDs >=3 before
opening config. Unit and client launcher must also supply a fixed minimal
environment and remove loader/tunable variables, because static libc startup
runs before C main. The build is static PIE without PT_INTERP or DT_NEEDED,
and does not use NSS, dynamic loading, locale initialization or subprocesses.
Only the read-only SHA256 source closure is linked, not TLS/network libraries.

The helper compares its own kernel user namespace device/inode to the root-configured
`hostUserNamespaceDevice` and `hostUserNamespaceInode`; it cannot assume access
to root PID1 namespace links. Root bootstrap independently compares that tuple
to both PID1 and the live helper. The ordinary client never dereferences PID1.
The helper verifies configured UID/GID, zero permitted/effective/
ambient capabilities, safe supplemental groups, cgroup ancestry and its own
executable. It binds a fresh socket with umask 0177 (permission bits 0600), installs NNP/dumpable0 and
seccomp, then listens. It never unlinks an existing socket. Administrator cleanup
owns the exact socket; a stale one intentionally prevents startup.

The post-ready AMD64 seccomp allowlist denies unlisted syscalls with EPERM and
kills wrong-architecture execution. It rejects x32, exec/execat, fork/clone/
clone3/vfork, setns/unshare, ptrace/process memory writes, executable mmap,
all mprotect, all prctl, sendmsg/sendmmsg/SCM_RIGHTS, and descriptor-export
syscalls. openat permits only read-only flags, socket permits only nonblocking
CLOEXEC Unix streams, and sendto permits no destination address. Read-only proc/
file/stat operations, stream connection/accept/read/write, clock/poll, pidfd_open,
non-executable allocation and process exit are the only permitted workload.
The fixture executable shares this exact policy but is never shipped.

The helper has no broker mount sandbox. Its fixed unit omits directives that
implicitly create a private user namespace. Keep the broker hardening intact.
Root verifies exact unit/no overrides, launch causality, same cove family and
existing 1280MiB/1.5CPU/256PID/zero-swap ceiling, including its 256MiB control
reserve. Start daemon, helper, root proof, broker; stop admissions/guests, broker,
helper, daemon. Never refresh proof under a live broker. Uncertain cleanup or
changed identity remains fail-closed and keeps resource funding quarantined.

## Artifact and fixture evidence

`host/bin/manifest.json` records protocol version, pinned compiler image,
actual compiler/binutils versions, each runtime binary SHA256 and static ELF
checks, vendor provenance hash and exact upstream vendor file hashes. Runtime
`host/bin/licenses/` contains the Apache-2.0 and MIT notices. Only runtime tools,
manifest and licenses are deployed; source, fixture executables and compiler are
excluded. Build/test commands are in the Makefile and Dockerfile.test.

The local Docker Desktop fixture is AMD64 emulation and only host-tool contract
evidence. Its synthetic daemon exposes no Docker API or learner execution. A
fixture observer may need `--cap-add=SYS_PTRACE` to inspect a nonroot dumpable0
helper; that is solely the container's root administrator, never helper privilege.
The production Ubuntu24.04 AMD64 run must independently verify actual namespace
access, resource controls, all guest cases and exact cleanup. Local tests do not
establish native containment, production equivalence, or latency acceptance.
