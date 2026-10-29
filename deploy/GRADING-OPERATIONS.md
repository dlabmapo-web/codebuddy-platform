# Rootless grading: disabled release and explicit handover

Native selection defaults to **false**. Ordinary deployment remains the legacy
sandbox until an explicitly approved resource handover. This guide is an operator
procedure, not permission to perform production maintenance. Local ARM64 Docker
Desktop builds cannot supply Linux AMD64 containment or performance acceptance.
No installer in this change has been run against an account, daemon or systemd.

## Artifacts and build interface

From the repository, install the frozen workspace dependencies and run:

```sh
pnpm --filter @cove/shared build
pnpm --filter @cove/grading-runtime build
bash deploy/scripts/build-grading-images.sh review linux/amd64
docker build -f deploy/docker/api.Dockerfile --target runtime -t cove-api:review .
docker build -f deploy/docker/judge-worker.Dockerfile -t cove-judge:review .
```

The guest preparation script uses the pinned installed Pyodide 0.27.5 and actual
upstream runner; native Python is 3.12.16 and compatibility embedded Python is
3.12.7. Generated package manifests/identity files are build outputs. The release
v2 matrix registers broker, native and compatibility images with provenance,
SBOMs and its existing critical-vulnerability scan. It does not enable grading.
Tag publication still requires the existing ancestry/production workflow; never
push/tag merely to run acceptance. Task 6's isolated workflow owns Linux tests.

Record **both** immutable registry `repository@sha256:manifest` pull references
and `docker image inspect .Id` config IDs after pulling the exact architecture.
The runtime descriptor's `imageDigest` is the config ID. These are different
identities. Never pull a config ID as a registry manifest, or use a base index
digest as the guest ID. Preserve package/shim/interpreter identity and all
previously referenced images. No prune/GC command is part of this procedure.

The broker image is an artifact carrier. Extract `/opt/grading-runtime` from an
owned stopped container into an immutable root-owned release directory, retain
its symlinks, and use `/opt/cove/grading/current` as the reviewed release symlink.
Do not run a broker container or mount a daemon socket into an application.
`python3 deploy/scripts/grading/artifact.py EXTRACTED_DIRECTORY` calculates the
content identity including symlink targets; external symlinks are rejected.
A host Node 22 installation and Docker CLI are independently provisioned/scanned.
API/worker production deploys include compiled `@cove/grading-runtime` and Prisma;
the experimental prototype, source tests and package source are excluded.
The migration image retains its Prisma schema, migrations and operator scripts.
The shared Docker context excludes deployment secrets/state/generated files,
non-dot environment files and private-key formats before any COPY layer. A
BuildKit scratch-export test uses synthetic canaries to verify that boundary;
it never reads real credentials. Migration files remain root-owned and readable
by the non-root process, matching its read-only production filesystem.

## Dedicated account and installation (administrator-reviewed)

Provision a distinct `cove-grading` account with primary group
`cove-grading-control`, its own subordinate UID/GID ranges, linger, rootless Docker
prerequisites, and a systemd user manager. Do not give it the rootful Docker group,
application DB/Redis credentials, Turtle account or Turtle daemon. Restart a
previously running user manager after changing its primary group.

The administrator must delegate `cpu memory pids` to this user manager on cgroup
v2 (verify effective `cgroup.controllers` and `cgroup.subtree_control`, including
CPU), and provision `/run/cove-grading-control` as owner `cove-grading`, group
`cove-grading-control`, mode **2710**. Persist that directory with a reviewed
systemd-tmpfiles entry; `/run` disappears on reboot. Setgid plus a shared primary
group makes the created 0660 socket reachable by the rootful worker's explicit
supplementary GID. The control directory contains only `broker.sock`. Private
`/run/user/UID` and its daemon directory remain 0700; no traversal widening.

As `cove-grading`, run `bash /opt/cove/scripts/setup-grading-rootless.sh`.
This installs fixed user unit/config names and reloads definitions only. It never
enables or starts a service. Existing different config fails rather than being
overwritten. User service groups are inherited; no privileged `Group=` assumption.
The slice is exactly 1280 MiB, 1.5 CPUs, zero swap, 256 PIDs for broker, daemon,
helpers and all guests. Worker stays 768 MiB, .75 CPU, 256 PIDs. Two whole-job
slots, at most one background, **zero extra spare** in resource-bank v1. Preserve
Turtle limits and reserve system/deployment/image/scratch headroom separately.

Create private `~/.config/cove-grading/host.json` and `broker.env`. The environment
validator accepts exactly these non-secret settings (no shell quotes/expansion):

```text
GRADING_RUNTIME_MANIFEST_PATH=/opt/cove/grading/bundle/manifest.json
GRADING_WARM_PROFILES_PATH=/opt/cove/grading/bundle/warm-profiles.json
GRADING_DAEMON_SOCKET=/run/user/UID/cove-grading/docker.sock
GRADING_CGROUP_PARENT=/sys/fs/cgroup/user.slice/user-UID.slice/user@UID.service/cove-grading.slice
GRADING_SYSTEMD_PARENT=cove-grading.slice
GRADING_DAEMON_PID_FILE=/run/user/UID/cove-grading/host-dockerd.pid
GRADING_DAEMON_ID=INDEPENDENTLY_OBSERVED_DEDICATED_DAEMON_ID
GRADING_DAEMON_DATA_ROOT=/home/cove-grading/.local/share/cove-grading/docker
GRADING_BROKER_OWNER=PERSISTENT_OWNER_UUID
GRADING_WORKER_GENERATION=EXPECTED_WORKER_UUID
GRADING_JOURNAL_DIRECTORY=/home/cove-grading/.local/share/cove-grading/journal
GRADING_OBSERVATIONS_PATH=/home/cove-grading/.local/share/cove-grading/observations.json
JUDGE_SANDBOX_SOCKET=/run/cove-grading-control/broker.sock
```

Replace placeholders from verified host state; the example is intentionally not
launchable. Keep the owner/journal stable for recovery. Warm profiles contain the
complete registered descriptor, declared `memoryLimitMb` and `targetReady`; one
or two total funded guests are required. Mixed pools can warm one per engine.
The API, worker and broker receive the **same complete immutable manifest** and
expected worker UUID. API gets only its existing private Redis readiness authority
(GET/PTTL, 6-second expiry); it receives no broker/daemon socket. Worker receives
only the control socket. Neither broker env nor release bundle contains DB/Redis.

`host.py CONFIG --write-daemon-pid` is the daemon unit's ExecStartPost. It connects to the actual Unix endpoint, obtains the Linux kernel SO_PEERCRED
PID/UID, checks `/proc/PID/exe` against the reviewed executable path, inode and
SHA256, matches the exact `--config-file`, and proves cgroup membership before
recording its host PID and `.identity.json` sidecar. It compares kernel process
start time and socket device/inode before/after to reject restart and PID reuse.
This requires the installed non-socket-activated daemon; an intermediary or socket
activation owner fails the executable check. Broker startup verifies the sidecar
and streams the executable hash; every subsequent daemon attestation verifies
process start time, executable inode/path and socket continuity. It
never trusts RootlessKit MainPID or Docker's namespace PID file. Normal
`python3 /opt/cove/scripts/grading/host.py CONFIG` is read-only and fails on Desktop.
Run full verification as an administrator able to inspect both daemons; do not
solve that requirement by giving the grading account rootful daemon access.

Full host JSON keys are `uid`, `controlGid`, `daemonConfig`, `daemonExecutable`, `daemonExecutableSha256`, `cgroupParent`, `daemonSocket`,
`daemonPidFile`, `daemonId`, `daemonDataRoot`, `socketInode`, `socketDevice`,
`brokerEntrypoint`, `manifestPath`, `images`, `applicationImages`, `workerGeneration`, `applicationSocket`, `composeProject`,
`rootfulRunningIds` (full IDs of running containers EXCLUDING this project's API/worker, whose exact pinned images/config/budgets are checked separately), `turtleServices`, `externalCgroups`, `turtleIdentity`,
`systemMemoryBytes`, `systemCpus`, `headroomMemoryBytes`, `headroomCpus`, and
`diskRequiredBytes`. Daemon ExecStartPost needs only the PID-matching subset.
`externalCgroups` entries have `{path, role, limits}`; limits contain
`memoryBytes, cpus, pids, swapBytes`. Include the separate rootless Turtle family
and other running services outside the rootful daemon. The verifier compares
actual kernel limits; it refuses overlapping parent/family entries and changed
running-container inventories. `turtleIdentity` is the canonical SHA256 of
`{containers: selectedRootfulTurtleObservations, cgroups: externalTurtleLimits}`.
Capture a reviewed baseline before handover. Never reduce Turtle to fit grading.
Unknown/unbounded workloads or physically unfundable active profiles block rollout.

## Trusted inventory and signed acceptance bundle

Inside the existing trusted API environment, run
`node scripts/grading-inventory.mjs > /private/inventory.json`. This CLI never
loads dotenv; use explicit application environment or `compose exec -T api`.
It performs a PostgreSQL READ ONLY repeatable-read transaction and Redis reads.
Only profiles, counts and descriptors leave the process. Source/expected output,
student IDs and credentials do not. It conservatively retains all historical
recorded descriptors plus lease/checkpoint/sample references. Preserve 16..4096
MiB semantic limits; an active Pyodide profile above the physically funded 704
MiB ceiling blocks handover instead of reducing its declared allowance. Future
image GC needs a separate reviewed reconciliation policy.

First roll out the pinned runtime-aware API/worker images on the legacy path with native disabled. Configure the API alone with the target manifest/incarnation and no corresponding readiness publisher, then collect final inventory while admission is fenced and queues finish. The inventory records missing readiness and the handover checks the running API configuration. The existing
manifest-aware API rejects new executable admission without fresh expected
worker readiness; coordinate that fence in the approved maintenance plan.
Redis and PostgreSQL are separate stores: inventory is not an atomic cross-store
snapshot, so never use a live, unfenced snapshot as proof of a completed drain.
`control.py drain-check --bundle BUNDLE` requires zero pending, recoverable,
ephemeral and all four queue backlogs, including unversioned legacy practice.

A root-owned immutable bundle contains `manifest.json`, `warm-profiles.json`,
`release.json`, `inventory.json`, `acceptance.json`, detached `acceptance.sig`,
`evidence.json` and `reports/<sha256>` report bytes. The shared JS schema validates
the manifest. Canonical hashing uses sorted keys, compact UTF-8 JSON, retained
array ordering. The manifest schema contains only ASCII property names and
integer numeric identity fields, matching API readiness identity.

`release.json` version 1 contains:

- `sourceCommit`, `manifestIdentity`, `workerGeneration`, `concurrency:2`, `maxSpare:0`.
- `images`: guest `{configId,pullReference,architecture,packageManifestHash}` entries
  for every capability and retained queued/recoverable descriptor.
- `brokerArtifact:{configId,pullReference,treeIdentity}` and
  `applicationImages:{api,worker}` immutable registry references for proven readers.
- `rollback:{policyVersions:[1,2,3,4],practiceVersions:[1,2],imageConfigIds:[...],brokerConfigId}`.

`evidence.json` has `compatibility, containment, recovery, performance, mixedLoad,
browser, scans, certifications, observations`, each `{version:1,passed:true,
reportHash:<64hex>}`. Actual report bytes must exist and match their hashes. Task 6
owns report generation, cohort validation, real browser and matching-Linux runs.
A trusted reviewer signs only complete passing evidence, including 100-sample
paired 1/5/10-case cohorts, first/repeat points, 2/10-client mixed load, reference
reads, active Turtle and all failure denominators. Synthetic unit fixtures are
not acceptable evidence. This repository supplies no production signing key or
shortcut certification issuer.

`acceptance.json` has version 1, Unix-second `issuedAt/expiresAt` (at most 24h),
`releaseIdentity`, `manifestIdentity`, `workerGeneration`, `hostIdentity` (SHA256
of machine-id bytes), `configurationIdentity` (full host JSON hash),
`inventoryIdentity`, `evidenceIdentity`, and `nativeAcceptancePassed:true`.
The boolean is insufficient: all bindings, report bytes and the detached RSA-SHA256
signature must verify against an independently pinned public-key file SHA256.
Keep the private signing key outside the host/bundle; reviewer trust configuration
must not be supplied by the bundle author. Host observations must be <=60 seconds
old (collected live by preflight); inventory <=300 seconds. Changed socket inode,
images, host budget, incarnation or inventory requires new reviewed proof.

## Explicit handover, activation and rollback

Use `python3 /opt/cove/scripts/grading/control.py plan --bundle BUNDLE` to review
ordering. `handover --apply` additionally requires `--trusted-key KEY
--trusted-key-sha256 PIN --host-config CONFIG --grading-uid UID --control-gid GID`.
It verifies the signed content and drain, persists a retained handover marker,
stops legacy worker then sandbox, starts the dedicated user daemon then broker,
runs live preflight, and starts immutable runtime-aware worker/API with native
selection **false**. Images/configs must already be prepared for that target host
in an explicitly approved acceptance arrangement; there is no auto-install,
auto-pull, positive-proof fabrication or fallback to a spare host. First host
bootstrap/acceptance requires a separately approved resource transfer with
restoration; signed acceptance from a different machine cannot activate this one.
If any step fails, the marker remains and ordinary deployment stays blocked.
The code does not auto-restore the old full pool alongside the new family.

`python3 /opt/cove/scripts/grading/release.py BUNDLE --host-config CONFIG
--trusted-key KEY --trusted-key-sha256 PIN` verifies signed content, actual rootless
host/image/package checks, extracted broker content, supported readers and host
budget. `control.py activate --apply` uses the same verifier and arguments (except
UID/GID), requires the retained handover identity, then changes API future selection.
Expand academy/revision/context certification only with a new approved bundle.

`control.py rollback --bundle BUNDLE --apply` disables **future native selection
only**. It preserves the manifest, worker incarnation, accepted snapshots, images,
v4/v2 readers and additive schema. Accepted native work finishes on its recorded
runtime. Unsafe isolation requires stopping launches, scoped cancellation and
non-scoring infrastructure resolution through the trusted coordinator; never
replay native work as Pyodide. No destructive migration or historical regrading.

After the marker exists, ordinary `set-v2-release.sh`, `deploy.sh`, `rollback.sh`
and common base-Compose helpers still fail before mutation. Use the supported
retained commands below rather than editing the marker or omitting the override.

### Retained updates, binary rollback and interrupted-release repair

All commands use the shared deployment lock and require an explicitly approved
maintenance window. They stop the API to fence new admission while the existing
worker drains; the CLI never applies this procedure as part of ordinary release.

```sh
python3 /opt/cove/scripts/grading/control.py retained-update --apply \
  --bundle /opt/cove/grading/bundles/CANDIDATE \
  --current-host-config /private/CURRENT-host.json --host-config /private/CANDIDATE-host.json \
  --trusted-key /private/reviewer-public.pem --trusted-key-sha256 TRUSTED_PIN
```

`binary-rollback` has the same arguments and may select older compatible API,
worker and broker binaries, but requires the **exact current complete manifest
and worker authority**, all v4/v2 readers and retained images. It does not restore
older certification metadata or change accepted runtime descriptors. Both actions
finish with native selection false; `activate` remains a separate fresh-proof gate.

The candidate bundle also contains fresh `previous-inventory.json`. Its signed
`acceptance.json` adds `transition:{previousReleaseIdentity,
previousInventoryIdentity,previousConfigurationIdentity}`. These bind the retained
source release, the fresh source inventory and source host config; the ordinary
acceptance fields bind the target release/config/inventory/evidence. The old
release's original signature still authenticates its immutable content; the NEW
fresh signature authorizes this transition and both inventories. Candidate
capabilities retain every current full descriptor and historical decoder mapping,
plus all inventory references. A schema-valid certification/academy expansion is
supported by `retained-update`; native activation remains separate.

Target host config adds `brokerEnvironmentPath` (the existing credential-free
broker.env), `brokerArtifactDirectory` (pre-extracted immutable artifact), and
`requireConfiguredApplications:true`, plus `warmProfilesPath` and its canonical
`warmProfilesIdentity` SHA256. Warm configuration is installed with the candidate
manifest and bound through the signed host configuration. Source and target configs retain the same
account, daemon executable/socket/data-root, family, broker entrypoint, other host
workloads/Turtle budgets and reserves. Existing pinned guest and app images must
already be present. The tool never pulls a mutable tag or starts a second family.
`rootfulRunningIds` excludes API/worker IDs so recreating those containers does not
invalidate unrelated-host evidence. Their actual pinned images, env, group,
mounts and prospective budgets are verified even while stopped. Broker artifacts
must be prepared in advance; the fixed `current` symlink is changed only while
broker/worker are stopped. Journal/owner and descriptor identities remain intact.

The durable intent is written/fsynced before stopping anything. The stopped API's
allocation is used by a bounded one-shot of the freshly validated candidate API image to run the
read-only inventory CLI, with existing app credentials staying in that container.
This image override is process-local and preserves the current manifest/env; a
broken pending API image therefore cannot trap compatible repair at inventory.
A fresh live projection must match the signed inventory and show all four queues,
DB-backed work, ephemeral work and recoverable leases drained. The projection
omits only observation time and readiness-fence metadata; full original inventory
bytes remain signature-bound. A mismatch leaves the API fenced and worker able
to finish old work; refresh inventories/proof and resume rather than erase state.

The worker stops before broker replacement. Candidate env/artifact pointers are
installed, stopped candidate consumers are created, then broker starts. Full
live target preflight runs before consumers start and again after readiness.
The retained pointer commits last. On **any** exception the pending intent remains;
a post-start failure may already have accepted target work, so its descriptor
manifest/images cannot be discarded. `resume-release` retries the same target with
fresh evidence/inventories and re-fences/drains target work first.

If that immutable candidate cannot become healthy, `repair-release` is the explicit
escape route. Supply a newly signed compatible binary candidate and the same
arguments. Its previous release/config/inventory identify the FAILED TARGET;
its complete manifest and worker authority must exactly preserve that target.
The repair intent is durably installed before any service command, then follows
the same fenced drain/non-overlap/preflight/commit sequence. Thus a known-good
older reader binary can recover service with current metadata, without marker
edits or automatic restoration of an older runtime manifest. Interrupted repairs
are themselves resumable. Stale or missing proofs never authorize a bypass.

## Observations and acceptance interfaces

The broker writes `GRADING_OBSERVATIONS_PATH` atomically every second, mode0600:
`{version:1,observedAt:<ms>,brokerGeneration,workerGeneration,pool,family,children}`.
Pool contains actual reservations, running/preparing/ready/quarantine counts,
cleanup failure counter, readiness, funded bytes/PIDs, waiting count and monotonic
oldest funding wait. Family and guest cgroup measurements include current/peak
memory, OOM/OOM-kill, PIDs, CPU usage/periods/throttled periods/throttled microseconds.
Children carry only engine and declared memory profile; no paths or identifiers.
Read failures do not produce invented zero observations.

`python3 /opt/cove/scripts/grading/metrics.py OBSERVATIONS` emits bounded fixed
Prometheus metrics and rejects stale (>6s), missing or malformed observations.
A narrowly privileged collector can atomically publish these to node_exporter's
textfile directory; never expose raw journal/stdout or application environment.
Record generation continuity before counter deltas. Child sums are gauges across
current allocations; sum of guest peaks is not a simultaneous execution peak.
Family counters and per-generation cleanup failures supply continuity. The API/
worker existing metrics retain queue, dispatch, comparison, actual transaction
acknowledgement and readiness; Task6 adds the browser clock boundary. Health does
not run learner programs, and no legacy sandbox diagnostics are fabricated.

## Clean bootstrap and packaging warning audit

`pnpm prepare:grading` emits shared then grading-runtime; root dev/dev:api/typecheck,
ordinary CI prerequisites and API pretest use this dependency order. It does not
launch services or read a database. The clean-path check removes reliance on both
ignored dist directories before emitting/importing them.

`python3 deploy/scripts/grading/audit-build-warnings.py KIND BUILD_LOG` audits
expected pnpm production-deploy dev-bin ENOENT names only: API acorn/browserslist/
esbuild/terser/vite/webpack, worker prisma. These are excluded build tools, not
service executables; the migration image separately retains and checks Prisma/tsx.
Any new bin name or different failure rejects the audit. Output is never globally
suppressed, and the production import/filesystem/migration smoke remains required.
