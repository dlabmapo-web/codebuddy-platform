# Production grading execution package

This package owns execution resources and private receipts. It does not import the API, evaluate expected answers, calculate scores, write grades, or contain application credentials. Native selection remains disabled outside this package until the separate acceptance and activation gates pass.

## Interfaces

- `Broker(manifest, driver, journal, workerGeneration, warmProfiles)` exposes `start()`, `handle(request)`, `census()`, and `stop()`.
- `BrokerClient(socketPath).request(request, signal?)` validates framing, response schema, request correlation, complete runtime identity, attempt fencing and reservation identity. Transport errors require reconciliation; the client never retries execution automatically.
- `WarmProfile = { runtime: RuntimeDescriptor, memoryLimitMb: number, targetReady: number }`. Configure one or two total initial ready guests. A compatibility-only handover must configure a compatibility profile. Mixed deployments may prepare one guest per engine. Combined profiles must fit the physical bank or startup fails. Warm guests and all preparation count against the same bank.
- Shared protocol `reserve` now **requires `memoryLimitMb` and persisted `admissionEpoch`** from the frozen whole-job policy. `run.input.memoryLimitMb` must match. This was an approved Task 2 extension needed to fund preparation before code arrives. Native effective execution time can be 1 ms; native declared certification still starts at 100 ms.
- `EXECUTION_RESOURCE_MANIFEST` exports version 1 accounting: 1,280 MiB/1.5 CPUs/256 PIDs execution family, zero swap; 256 MiB/96 PIDs control reserve; guest hard ceilings of allowance + 128 MiB native or + 320 MiB compatibility; 32 PIDs and 16 MiB tmpfs per guest. These baseline/headroom assumptions require measured Linux acceptance, not merely unit tests.

Two whole-job reservations share both engines; at most one is background. Cases run sequentially and every interpreter is single use. Preparation/funding waits happen outside the journal mutex. FIFO funding prevents replacement preparation from bypassing an older large request. A fresh replacement may prepare while the worker checkpoints the previous receipt, but the next case cannot execute before acknowledgement. Current receipt/run/release acknowledgements never wait for future unused replenishment: it has a separate background tracker and remains charged to the two-allocation physical bank. Funded configured replenishment can finish after release; unused unmatched work retires asynchronously, and shutdown drains every tracked allocation. Matching configured unused guests survive release; unmatched unused guests may retire for a requested profile. No extra spare is configured.

A run normally returns `pending`; poll `receipt`. After the private case checkpoint is durable, send `ack` with its UUID and the receipt UUID. Then run the next case or `release`. Repeated known-case requests return the existing receipt/acknowledged state; they never execute again. `cancel` waits for owned cleanup. A cancelled case remains uncertain for result recovery even if cleanup is confirmed; it can then release its whole-job slot. Unconfirmed cleanup retains funding, quarantines the allocation, and fails readiness. A new broker generation requires a fresh health handshake; recovery reads old receipts using their original context/lease and the current broker generation. The receipt retains its original broker generation. Only the configured current worker generation can reserve or launch new code. To resume later cases after recovery, first acknowledge all old receipts, then reserve the same attempt with a strictly higher persisted generation and a new lease. The runtime and memory profile must match, no live/uncertain case may remain, and all prior case tombstones/checkpoints are retained. Known case IDs still cannot execute again.

The journal contains no source, stdin, answers, scores or credentials. It uses private mode-0700 storage and atomic fsync/rename binary snapshots with stdout/stderr stored as UTF-8 byte buffers (avoiding both JSON escaping and V8 whole-string UTF-16 expansion). Each snapshot is limited to 32 MiB, so the old file plus replacement remain within the 64 MiB disk quota even when stdout contains JSON-escaped control bytes. Raw receipts are limited to the two live reservations and disappear after durable acknowledgement. Admission is bounded to 1,024 reservations per epoch and 1,000 cases per reservation. Exact packed metadata size is checked before reservation, case admission and source delivery, reserving 17,301,504 bytes for two maximum stdout/stderr captures plus 128 KiB for transitions. Allocation facts and receipt metadata each have a 16 KiB transition cap. The record-count cap alone is not a snapshot-size guarantee; excessive retained history rejects admission before source. Terminal retirement and epoch sealing reclaim bounded history as described below. Missing receipts never authorize reruns.

## Durable terminal reconciliation and epoch sealing

`health` returns `admissionEpoch` (positive safe integer, initially 1); `reserve` requires it and `reserved` echoes it. The trusted worker must persist the epoch when assigning an immutable lease, before sending reserve. It must preserve that epoch on every recovery/takeover of the admission. An old admission must never adopt the latest health epoch just to retry.

After all case checkpoints are durable and acknowledged, persist the final job state and its `terminalCommitId` UUID in the application database. `release` confirms current cleanup; then send `retire` with the normal `{ brokerGeneration, context, runtime, reservationId }` fence and that terminal UUID. The response is `retired` with the same fence and UUID. This immediately compacts case history but retains the attempt tombstone. Repetition with the same UUID succeeds; a conflicting UUID fails. A removed uncertain case may retire only after the worker durably resolves the job terminally; uncertain/unconfirmed cleanup cannot retire. `receipt` or delayed `ack` against a retired reservation returns `retired`; `run` and generation takeover fail. Future unused preparation does not delay release/retire acknowledgements.

To reclaim attempt tombstones, the sole worker coordinator first stops assigning leases into the current epoch and reconciles **all database leases assigned to it**, including reserve-response uncertainty and earlier worker incarnations. Every known reservation must be released and retired, and every terminal commit must already be durable. Persist a sealing intent with `reconciliationId` UUID, then send `{ type: "seal", brokerGeneration, workerGeneration, admissionEpoch, reconciliationId }`. Unlike reservation operations, this control request has no runtime/context/reservation fields. All requests/responses include the existing protocol/requestId envelope. The response is `{ type: "sealed", brokerGeneration, workerGeneration, admissionEpoch, nextAdmissionEpoch, reconciliationId }` with next epoch exactly old + 1. Only the currently configured worker can seal. Sealing waits for quiescent preparation/cleanup as well as terminal records. READY unused guests may remain funded. Persist the successful seal acknowledgement before assigning leases in the next epoch.

The broker atomically persists the incremented epoch, drops the terminal records, and retains only the most recent seal acknowledgement. Prior-epoch reserve replay is rejected before record lookup, including unknown/delayed admissions and higher lease generations, across restart. Terminal UUID acknowledgement trusts the restricted worker's durable DB commit; epoch fencing independently prevents replay after deletion. No unbounded secondary tombstone list is kept. Plan reconciliation before the 1,024-record ceiling, and pause admissions at capacity until the epoch is sealed.

Lost case-ack response: use the original lease/context and current broker generation; `receipt` returns the raw receipt or `pending/acknowledged`, and repeating the same receipt/checkpoint IDs is safe. Never rerun that case. Lost retire response: repeat the same terminal UUID or query receipt for `retired`. Lost seal response: refresh broker generation from health and repeat the same epoch/reconciliation UUID; the last seal survives restart. A conflicting or older-than-last seal returns `STALE_GENERATION`, requiring reconciliation against durable coordinator history, never replay in a new epoch. An uncertain journal write fails readiness/sealing until restart reconciles the on-disk state. Keep all immutable lease history and terminal/sealing authority in the database until that reconciliation is complete.

## Native and compatibility boundaries

`RootlessDriver` uses fixed Docker CLI argument arrays, a dedicated Unix socket, immutable built-image config IDs, registered descriptors and immutable ownership labels. It refuses a non-rootless daemon, a non-systemd cgroup driver, a non-v2 hierarchy, an incorrect family ceiling, missing controllers, or broker/daemon/guest membership outside the delegated parent. It pins the independently attested daemon ID and data-root, checks socket device/inode continuity within each broker incarnation, and rejects unowned containers in that daemon without removing them. Allocations journal the immutable created container ID and verified host PID/cgroup facts, including unused preparation. An absent container on a changed endpoint cannot prove cleanup, and ambiguous creates without a confirmed owned container remain quarantined. The broker control socket is claimed before reconciliation, preventing a second instance on that socket from deleting the first instance's guests.

The guest supervisor starts a small C launcher, which blocks before interpreter initialization. The broker maps its namespace PID to the host PID, moves it into a private learner leaf, moves the supervisor to a sibling control leaf, and only then permits interpreter initialization. At READY it validates identity, dropped learner capabilities, no-new-privileges, PID/cgroup membership and charged-memory baseline; it writes and rereads baseline + allowance and zero swap before source can be delivered. The baseline stays frozen while idle. Family/guest-parent/control OOM is infrastructure failure. Only a proven native learner-leaf OOM produces a native memory verdict. There is no sampled-RSS native fallback.

Compatibility uses the unchanged `packages/api/src/judge/pyodide-runner.ts`, transpiled at artifact preparation time, plus the pinned installed Pyodide package. Its baseline charged RSS+swap growth and 100 ms sampling preserve the existing compatibility policy; the parent hard ceiling remains an infrastructure guard. Both guest families use distinct control and OS stdout/stderr channels, bounded nonblocking source delivery, private PID/network/mount namespaces, a read-only root, no mounts except bounded tmpfs, and a non-root learner. Expected output and daemon/broker sockets never enter the guest. The control FD closes before source execution. The supervisor captures exit/drain; the broker kills the owned guest cgroup, obtains container removal acknowledgement, and checks that no descendants remain before issuing a receipt.

The seccomp allowlist permits interpreter/libc operations and ordinary descendants, excludes namespace creation, ptrace, process-memory access, mounts, external socket creation/connect and privileged kernel facilities. `clone3` returns ENOSYS to permit libc fallback to filtered `clone`. Runtime syscall and adversarial coverage on matching Linux AMD64 is still required.

## Build and inspect

Run from the repository root:

```sh
pnpm --filter @cove/shared build
pnpm --filter @cove/grading-runtime build
node packages/grading-runtime/guest/prepare-artifacts.mjs
```

Preparation prints each package manifest hash. Supply the matching printed hash explicitly:

```sh
docker build -f packages/grading-runtime/guest/Dockerfile.native --build-arg PACKAGE_MANIFEST_HASH=sha256:PRINTED_NATIVE_HASH -t cove-grading-native:review .
docker build -f packages/grading-runtime/guest/Dockerfile.compatibility --build-arg PACKAGE_MANIFEST_HASH=sha256:PRINTED_COMPATIBILITY_HASH -t cove-grading-compatibility:review .
docker build -f packages/grading-runtime/Dockerfile.broker -t cove-grading-broker:review .
docker image inspect cove-grading-native:review cove-grading-compatibility:review --format '{{.Id}} {{.Architecture}} {{json .Config.Labels}}'
```

The pinned Python `3.12.16-slim-bookworm` OCI **base index** is `sha256:e697c81897302a4c4333bade000d98038fbb21eb064f8ee1fd42d02ebcd9d337`. It is not the built guest identity. Descriptors use the built immutable image config ID shown by inspection. Package manifest hashes cover guest sources, seccomp, the base index, and (for compatibility) the exact upstream runner and Pyodide artifacts. The compatibility build verifies actual embedded Python `3.12.7` and Pyodide `0.27.5`; native verifies actual CPython `3.12.16`. Build/import/version checks are not containment acceptance.

The broker Dockerfile packages the executable artifact; the production broker must run as the dedicated host systemd user with the Docker CLI installed so host `/proc` and delegated cgroups can be inspected. The artifact image intentionally receives no daemon mount and is not a privileged broker deployment recipe.

## Linux startup contract

Provisioning belongs to the separate deployment task. This package makes no systemd/daemon/account/host changes. Required environment variables are:

| Variable | Value |
| --- | --- |
| `GRADING_RUNTIME_MANIFEST_PATH` | Absolute immutable shared manifest path |
| `GRADING_WARM_PROFILES_PATH` | JSON array of `WarmProfile` objects |
| `GRADING_DAEMON_SOCKET` | Dedicated owned `/run/user/UID/...` Unix socket |
| `GRADING_DAEMON_PID_FILE` | Dedicated dockerd host PID file |
| `GRADING_DAEMON_ID` | Independently attested stable Docker info ID |
| `GRADING_DAEMON_DATA_ROOT` | Independently attested DockerRootDir |
| `GRADING_CGROUP_PARENT` | Canonical absolute `/sys/fs/cgroup/...` execution family |
| `GRADING_SYSTEMD_PARENT` | Corresponding delegated `*.slice` name |
| `GRADING_BROKER_OWNER` | Stable deployment ownership UUID |
| `GRADING_WORKER_GENERATION` | UUID of the sole worker incarnation allowed new launches |
| `GRADING_JOURNAL_DIRECTORY` | Private owned journal directory, on quota-accounted storage |
| `JUDGE_SANDBOX_SOCKET` | Group-restricted broker Unix socket in a private service directory |

After that configuration exists on an **isolated matching Linux host**, run the actual service and acceptance client as their dedicated accounts:

```sh
node packages/grading-runtime/dist/main.js
GRADING_LINUX_ACCEPTANCE=1 JUDGE_SANDBOX_SOCKET=/run/user/UID/grading/broker.sock node packages/grading-runtime/test/linux-containment.mjs
```

The service performs real parent/image/guest checks before health succeeds. The acceptance client covers both registered engines, maximum consumed and unconsumed stdin, full 8 MiB control-byte stdout, Unicode prompts, timeout, native allocation bursts and FD/cgroup boundaries. It is an initial executable acceptance subset; certification also requires cross-guest attacks, descendant/race/failure injection, mixed-load memory/PID peaks and full application/persistence tests from later tasks. Do not treat its success alone as production acceptance.

## Local validation

```sh
pnpm --filter @cove/grading-runtime test
python3 -m unittest discover -s packages/grading-runtime/test -p '*_test.py' -v
pnpm --filter @cove/shared exec vitest run src/grading-runtime.spec.ts
node packages/grading-runtime/test/host-capability.mjs
```

The deterministic driver tests prove state-machine/accounting behavior, not kernel isolation. Python shim tests run only trusted local unit fixtures and make no isolation claim. The read-only host probe returns exit 2 for unsupported environments. Docker Desktop ARM64/cgroupfs is unsupported; do not weaken checks to obtain a local positive containment result. Keep native selection disabled until matching-host acceptance, profile inventory, memory-headroom measurement, release scanning, recovery and application wiring are complete.
