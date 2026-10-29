# Task 1 implementation report

Status: implemented and locally verified; disposable Linux execution remains unexecuted.
Base: `38e05b54b1b1dbdd41c872c46639722babd93c23`.
Worktree: `/Users/jurabeksamiev/Developer/codebuddy-platform-native-grading`.
Branch: `feat/production-native-grading`.
Commit: `5d2c00d1e897728b9d803d6bfcc9bba6eef7096d` — `test(grading): prepare disposable rootless Linux host`.

## Files

- `deploy/scripts/grading/ci/provision.py`: guarded prepare/observe/cleanup; existing production `install.render`, `artifact.tree_identity`, SO_PEERCRED `daemon_identity.attest_daemon`, `host.group`/`host.limits`, canonical identity helpers.
- `deploy/scripts/grading/ci/bundle.mjs`: actual image projection/label/package-byte validation, production runtime descriptor and manifest schemas, one 128 MiB declared warm guest per engine, immutable image config IDs, maxActive 2/maxBackground 1/maxSpare 0.
- `deploy/scripts/grading/ci/test_provision.py`: 18 local contract tests, including real production JS schema execution with Node.
- This ignored scratch report documents producer/consumer details; no neighboring task files changed by this task.

## TDD RED and GREEN

1. Created importable `provision.py` with only a docstring and four first tests (non-CI, architecture, nonroot refusal and exact guard acceptance). Executed:
   `python3 -m unittest discover -s deploy/scripts/grading/ci -p 'test_provision.py' -v`.
   RED: four errors, specifically `AttributeError: module 'ci' has no attribute 'require_ephemeral_host'`. Import succeeded; this was a real absent-implementation failure, not a swallowed import error.
2. Implemented the exact six-part environment/platform/EUID guard and host harness. Those four cases passed.
3. Added ownership, subordinate database/allocation/overlap, changed configuration, changed file/symlink, immutable image/label/architecture, manifest mutation, exact container cleanup selection, idempotence, pre-mutation refusal, official apt origin and production schema/funding tests.
4. Schema integration test exposed an incorrect public-index import of `gradingDataLimits`. RED failed with the actual ESM missing-export error. Corrected to its existing production module `packages/shared/dist/grading-limits.js`; GREEN.
5. Added subordinate revalidation to cleanup; a local Mac test initially attempted `/etc/subuid`. Introduced injectable `subordinate_contents` boundary and mocked it for that refusal test, preserving production behavior. All 18 tests pass.

Final local checks:

- `python3 -m unittest discover -s deploy/scripts/grading/ci -p 'test_provision.py' -v`: 18/18 pass.
- `python3 -m py_compile deploy/scripts/grading/ci/provision.py`: pass.
- `node --check deploy/scripts/grading/ci/bundle.mjs`: pass.
- `git diff --check`: pass.
- `python3 deploy/scripts/grading/ci/provision.py prepare .` on this Mac: expected nonzero `Disposable grading host refused: Disposable Ubuntu AMD64 GitHub host required`, before any mutation. This is refusal evidence only.

## CLI and host lifecycle

All three commands require root and the exact environment guard:
`GITHUB_ACTIONS=true RUNNER_ENVIRONMENT=github-hosted GRADING_DISPOSABLE_CI=1`, Linux x86_64, Ubuntu 24.04, systemd PID1, unified cgroups, enabled AppArmor and the enabled Ubuntu userns restriction. No local host setup was performed.

`prepare REPO` additionally requires `GRADING_CI_NODE_SOURCE` to be an absolute regular executable Node22 path captured by the unprivileged wrapper (e.g. `command -v node`) and passed narrowly through sudo. The source is resolved, actual major verified, copied into `/opt/cove/bin/node`, source/destination SHA256 equality checked and subsequent commands receive only a fixed sanitized PATH/LANG/noninteractive apt environment. Do not preserve the full caller environment or PATH.

The three prebuilt Linux AMD64 local tags are inspected through the explicit rootful socket, never through caller Docker context. Only native and compatibility image config IDs are saved/loaded into the new dedicated rootless daemon. No rootful guest is run. The broker is extracted from an exact named/stopped, UUID-labelled carrier by immutable broker image config ID; strict tree identity is computed and rechecked. No image publication occurs.

A fresh `/opt/cove`, state root, both account homes, control path, owned apt paths, delegation file and worker slice are required. Existing different accounts/groups/configs/paths fail closed. Used real IDs and all subordinate entries are excluded from the newly allocated nonoverlapping 65536-span; both mappings are checked again after allocation and during observation/cleanup. Accounts use nologin shells, no automatic subids and no Docker group.

Official Docker rootless extras are installed from the official signed Docker noble AMD64 apt candidate (reuse existing official source, otherwise own HTTPS key/source). An apt simulation refuses removals or changes to rootful Docker/containerd/runc packages, and existing dockerd bytes, rootful daemon ID and running-container census are checked after prerequisite install. Rootlesskit uses the distribution's shipped userns AppArmor profile, explicitly loaded and checked. No AppArmor/userns/seccomp restriction is disabled.

The grading user manager receives an exact per-UID `Delegate=cpu memory pids` drop-in and linger. Production installer files are rendered unchanged and compared byte-for-byte with `install.render`. The worker slice is separate, exact 768MiB/.75CPU/256PID/zero-swap. Both cgroup paths come from actual systemctl ControlGroup, including systemd dash-name ancestry. Actual effective limits and delegated child controllers are checked, not inferred from unit text.

The broker environment contains exactly the production `broker-env.py` allowlist. Startup polls actual bounded production health wire response plus fresh actual broker observation (`ready` and exactly two prepared guests); no startup bypass or fake driver is used.

## Public config contract (exact five keys)

Path `/opt/cove/grading/ci/config.json`, root owned mode0644, with read-only root-owned parents:

```json
{
  "version": 1,
  "manifest": "FULL production runtimeManifestSchema object, including both complete descriptors",
  "brokerSocket": "/run/cove-grading-control/broker.sock",
  "workerGeneration": "canonical UUID",
  "evidenceDirectory": "/var/lib/cove-grading-ci/evidence"
}
```

The string placeholder above describes the actual nested manifest object; the generated config contains the object, not a string.

Coordinator account `cove-grading-ci-worker`, primary group of the same name, with only `cove-grading-control` as supplementary membership. It can traverse the broker control directory and use its mode0660 socket; it cannot traverse grading home/mode0700 or private daemon runtime/mode0700. Its home is `/home/cove-grading-ci-worker`, mode0700. Evidence directory is mode0700 owned by that worker; state root is root-owned mode0711 so the worker can traverse to evidence without reading private state.

## Private state contract

`/var/lib/cove-grading-ci/state.json`, root-owned regular file mode0600, version1. Persisted atomically after intent/each owned resource, with these keys:

- `version:1`, `runId` canonical random UUID, `owner` exactly the **bare runId UUID** (production driver requirement), `workerGeneration` independent canonical UUID, `phase` (`initializing`, `daemon-starting`, `broker-starting`, `prepared`, `cleaning`, `cleaned`), optional `cleaned:true`.
- `uid`, `controlGid`, `workerUid`, `workerGid`: nonroot IDs selected unused in 10000..59999; grading primary group `cove-grading-control`.
- `home:'/home/cove-grading'`, `workerHome:'/home/cove-grading-ci-worker'`.
- `workerSlice:'cove-grading-ci-worker.slice'`, `workerService:'cove-grading-ci-worker.service'`, `workerCgroup`: actual `/sys/fs/cgroup` + systemctl ControlGroup for that slice; do not assume it is root-level.
- `cgroupParent`: actual `/sys/fs/cgroup` + user systemctl ControlGroup for `cove-grading.slice`; do not assume it omits `cove.slice`.
- `delegationPath:'/etc/systemd/system/user@UID.service.d/cove-grading-ci.conf'`.
- `subordinateStart`, `subordinateCount:65536`.
- `daemonSocket:'/run/user/UID/cove-grading/docker.sock'`, `daemonConfig:'/home/cove-grading/.config/cove-grading/daemon.json'`, `daemonPidFile:'/run/user/UID/cove-grading/host-docker.pid'`, `daemonDataRoot:'/home/cove-grading/.local/share/cove-grading/docker'`.
- `daemonExecutable` resolved host dockerd path, `daemonExecutableSha256`, `daemonIdentity` full production SO_PEERCRED/executable/startTime/socket identity, `daemonId` actual Docker server ID.
- `brokerEntrypoint:'/opt/cove/grading/current/dist/main.js'`, `brokerArtifact:{configId,treeIdentity}`, `nodeSha256` for `/opt/cove/bin/node`.
- `manifestPath:'/opt/cove/grading/ci/manifest.json'`, `manifestIdentity` canonical SHA256.
- `warmProfilesPath:'/opt/cove/grading/ci/warm-profiles.json'`, `warmProfilesIdentity` canonical SHA256.
- `journalDirectory:'/home/cove-grading/.local/share/cove-grading/journal'`, `observationsPath:'/home/cove-grading/.local/share/cove-grading/observations.json'`.
- `images`: two `{configId,architecture:'amd64',packageManifestHash}` entries (native then compatibility).
- `rootfulImages`: three actual built config IDs (native, compatibility, broker); `rootfulBaseline:{id,runningIds}`.
- `carrier:null` after extraction; during extraction `{id,name:'cove-grading-ci-carrier-'+runId,image}`.
- `ownedPaths`: allowlisted exact root path -> `{device,inode,uid,gid,mode,type,sha256?}`. `ownedFiles`: exact production-rendered units/config, host.json and broker.env -> same snapshot. Modes are numeric. Regular files include SHA256; directory contents can grow without invalidating their directory inode/mode identity.

Task2 can import `load_state`, `user_command`, `docker`, `service_pid`, `census`, `observe`, `health`, `save` from this module. `docker(state,*args,rootful=False,timeout=60)` always selects an explicit endpoint; `user_command(state,*args,timeout=60)` uses the grading account's existing user manager environment. Public coordinator work must not receive private state.

## Observation and cleanup contracts

`observe` emits bounded non-secret JSON and writes `/var/lib/cove-grading-ci/observation.json`; prepare writes `prepare-observation.json`. Projection includes actual daemon/process identities, broker/service PIDs, kernel/Node/Docker, complete runtime descriptors, immutable package/tree/config identities, actual family/worker limits/controllers, private socket modes, owned guest IDs/images/PIDs, global memory available/used and external rootful numeric resource limits with remaining headroom/disk. Rootful daemon ID/running census must remain unchanged. It deliberately does not call production `collect_host` (no app/Turtle stack exists), and explicitly sets `productionEquivalent:false,nativeAcceptanceExecuted:false`.

`cleanup` validates account/group/subordinate ownership, all registered path/file identities, rootful baseline, any exact stopped carrier, real daemon incarnation and complete dedicated-daemon guest census **before mutations**. Unknown image/container/owner/name, changed daemon/files or unowned paths refuse cleanup. It stops only the fixed worker service (after checking User/Slice), owned broker/daemon/user manager/slices; re-inspects and removes exact container IDs, never names/globs/prune; verifies no unexpected dedicated containers, original process/startTime or private PID namespace survivors and no worker/family cgroups. Only registered roots are removed. Existing rootful services/containers/images and installed distro packages/profiles are left intact. State and bounded evidence remain as the cleanup receipt; successful cleanup is idempotent, and reappeared owned roots refuse a second cleanup.

The wrapper owns primary-vs-cleanup status preservation (Task3). This CLI does not swallow primary exceptions or replace them with an implicit cleanup exception; it returns nonzero sanitized error text. Partially prepared state supports exact scoped cleanup; interrupted/changed resource identity is conservatively a failed cleanup rather than a broader search/removal.

## Self-review and corrections

- Fixed initial `ci-UUID` owner after parent pointed out production UUID-only owner contract.
- Derived both family and worker cgroup paths from real systemctl hierarchy and separately verified manager controllers.
- Narrow Node-source interface agreed with parent; no full caller environment preservation.
- Preserved production installer rendering and production manifest/descriptor schemas; no runtime startup or resource-accounting weakening.
- Added worker control-only supplementary group to make actual broker access possible while preserving daemon/home separation.
- Recorded intent before account creation; used explicit unused IDs, avoided useradd default overlapping subids, and revalidated subids.
- Added immutable file content/inode snapshots, complete unowned-container refusal, namespace/process/startTime checks and remaining cgroup absence for cleanup.
- Avoided copying full image Config.Env into persisted image projections; observation only projects bounded non-secret fields.
- Added rootful baseline preservation and apt simulation safeguards; reused existing official apt source to avoid conflicting Signed-By definitions.
- Fixed a pre-slice delegation check to target the actual user manager (the family ancestor may not exist yet).
- Checked Node ESM/schema test end to end and corrected the real missing export.

## Concerns / limits

No actual Ubuntu provisioning/native/kernel success is claimed; local unit fixtures establish contracts only. Official apt/package availability, installed profile layout, real delegated controllers, Node dynamic libraries and production broker/rootless warm startup must be established by the authorized disposable workflow. They fail closed here rather than using fallback execution. An unexpected daemon incarnation or changed owned file during fault tests intentionally refuses cleanup; Task2 must preserve that as uncertainty, not rewrite identity merely to make cleanup pass. The host observation is a capacity/headroom projection on different hardware, not a production app/Turtle proof, release signature, performance cohort or five-second acceptance.

No push, publication, production access, locally provisioned Linux resources, subagent or reviewer was used by this task.

## Review follow-up: Minor M1

Closed the review's already-cleaned receipt gap. Before accepting a repeated
cleanup as `alreadyAbsent:true`, the harness now looks up both fixed account
names (`cove-grading`, `cove-grading-ci-worker`) and both fixed group names
(`cove-grading-control`, `cove-grading-ci-worker`). Any reappeared name raises a
refusal; the branch never deletes or alters that new principal. Existing path
reappearance checks remain in place.

TDD RED: added the focused reappeared-principal contract with four subcases
(two accounts, two groups). The 19-test suite failed each new subcase with
`AssertionError: ValueError not raised`; ordinary idempotence still passed.
TDD GREEN: added the explicit account/group absence checks; all 19 tests now
pass, including the four reappearance subcases. Each refusal asserts that no
administrator command, user command or recursive removal is invoked. The
ordinary idempotence test now explicitly models both lookup APIs returning
`KeyError` (all fixed principals absent), preserving its host-independent scope.

Validation: the 19-test provisioning suite, Python compilation, Node syntax
check and `git diff --check` pass. Self-review confirms this only adds refusal to
the completed-cleanup branch, performs read-only principal lookups, and never
widens deletion authority. No provisioning, agents or push were performed.
Commit: `eefbad9b804bf79a200a75f366f6d92d8b963e47` — `test(grading): refuse recreated cleanup principals`.
