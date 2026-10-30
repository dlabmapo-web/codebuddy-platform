# Broker verification preflight review — 2026-10-30

Reviewed `29f0bfe..8e87354cd607d20a7c663d5f7b37097b271e7432` with the code-review skill, against actual failed run41012042378, the approved disposable-CI boundaries, current production installer rendering, and the deployed runtime APIs used by the new probe. No implementation was edited and no provisioning, push or remote run was performed.

## Findings

No blocking issue found in this scoped diagnostic addition.

### Actual APIs and unchanged startup gate

`broker-preflight.mjs` imports the actual deployed `rootless-driver.js`, `manifest.js` and `daemon-identity.js`. Its configuration matches the current production `main.ts` driver configuration, including seccomp location and complete registered runtimes. Inspected production `loadManifest`, `loadDaemonIdentity`, `RootlessDriver` constructor and `verify`: they read/validate manifest and identity files, read/verify the daemon socket/process/cgroup, and issue only Docker info/image-inspect commands. The probe calls no broker startup, server/listen, discovery, allocation, create, run, stop or removal operation. Its in-memory verified flag dies with the probe process.

Preflight runs after actual rootless daemon attestation, image loading and credential-free broker-env validation. A failed probe writes its bounded diagnostic then refuses preparation. On success, the unchanged real broker service still starts and must pass actual mixed-pool health/readiness. The preflight does not supply readiness, alter production code/units, or replace any kernel or acceptance evidence.

### Current service policy and systemd property semantics

`provision.py:159` derives the service properties from the current production renderer, after the rendered unit and env file have been identity-checked. It carries actual Slice, NoNewPrivileges, PrivateTmp, ProtectSystem, ReadWritePaths, EnvironmentFile, WorkingDirectory, PATH, Node heap option and UMask; all currently rendered values were compared to `install.py`. Unknown Service directives, missing or repeated required policies, unexpected Node entrypoint/environment and unknown percent specifiers fail. Restart/dependency/entrypoint operations are intentionally not reproduced by this one-shot read-only diagnostic; they remain on the real service.

Checked primary [systemd255 bus-unit-util.c](https://raw.githubusercontent.com/systemd/systemd/v255/src/shared/bus-unit-util.c): Slice/ProtectSystem/WorkingDirectory are string properties; PrivateTmp and NoNewPrivileges parse as booleans; ReadWritePaths parses into a string array; UMask parses as an octal mode; EnvironmentFile is explicitly converted to the EnvironmentFiles D-Bus tuple. Environment strings are supported and merge through the D-Bus setter. `%h` and `%t` are concretized by the trusted controller rather than assuming transient specifier expansion, avoiding the prior probe defect. Existing manager normalization independently checks the runtime prefix. Actual Ubuntu service behavior remains to be observed in the next run.

The probe runs as a bounded transient **user service**, not a scope: it inherits the dedicated manager and broker env-file values, belongs to the grading slice, uses the same Node executable/heap limit and sandbox properties, and adds RuntimeMaxSec60/client timeout75. Existing grading-family memory/CPU/PID ceilings still contain it. The exact unit must be absent first; both normal and launch-failure paths stop only that exact unit. Failed immediate stop preserves the primary error and falls back to existing exact owned-manager teardown.

### Evidence and staging boundaries

The probe emits only version, diagnostic-only authority, success, fixed stage, allowlisted error type/code/syscall, exact known path role and a closed mapping of reviewed production invariant literals. Arbitrary message, stack, stderr, environment, argv, source and actual paths are omitted. Unknown values become fixed unknown/unclassified identifiers. Producer and collector schemas use matching closed vocabularies; success requires complete stage and failure cannot use it.

The root controller validates the schema and4096-character bound before writing fixed root-owned `broker-preflight.json`. Collection uses the existing fixed-path, ownership/mode, no-symlink, regular-file, link-count and4096-byte checks and projects the closed structure again. Unknown fields are discarded. This optional diagnostic cannot satisfy the required authoritative kernel report or make a failed lifecycle successful.

The staged root-owned mode0644 script lives under already-owned `/opt/cove/grading/ci`, with source/destination hashes checked. This does not collide with the later kernel harness's `/opt/cove/scripts/grading/ci` directory, modify the extracted broker tree, or add a cleanup root. Existing exact `/opt/cove` ownership cleanup covers it.

## Verification

Independently ran86 CI contracts: pass in4.304seconds. `node --check deploy/scripts/grading/ci/broker-preflight.mjs` and `git diff --check 29f0bfe..8e87354c`: pass. New contracts check current policy projection and refusals, execute actual JS error projection, bind invariant messages to production source, ensure only driver.verify is invoked, compare producer/collector vocabularies and prove raw diagnostic fields are excluded. These are local source contracts, not actual Ubuntu execution or native acceptance. No Next.js source/API changed.

## Verdict

**APPROVE the scoped broker-preflight diagnostic.** Proceed with the controller-owned authorized new-source disposable Linux run. The existing broker failure remains unresolved until actual evidence identifies it; this approval makes no kernel or production acceptance claim.
