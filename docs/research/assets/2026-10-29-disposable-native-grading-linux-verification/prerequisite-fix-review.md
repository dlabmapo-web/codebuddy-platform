# Focused prerequisite fix review — 2026-10-30

Reviewed `4ea8b4c2..5177da1002f33096e23e92e0a6e0b1d44f2dfaac` using the code-review skill against the resume checkpoint, approved disposable Linux design, implementation plan and current SDD ledger. Scope is the four changed CI Python source/test files and adjacent integration needed to assess them. No implementation was edited and no provisioning, push or remote run was performed.

## Findings

No blocking correctness, security or diagnostic-boundary issue was found in this scoped fix.

- `provision.py:402` obtains installed package names, architecture, status and versions from dpkg, retains only the protected engine set plus rootless extras, and rejects malformed or oversized projections. `:amd64` selection is based on the installed `docker-ce` package rather than the current repository candidate. Missing CE fails before APT mutation with the initial diagnostic retained.
- `provision.py:386` searches the selected version independently of the latest candidate and requires its exact official Docker noble/stable AMD64 source. A second source advertising the identical version makes the selection fail, including wrong suite/architecture or an untrusted origin. The installed-database status row alone cannot establish official origin.
- `provision.py:457` supplies the exact selected extras version and every installed protected package/version to both simulation and real installation. The simulation guard at line464 rejects every removal and every protected `Inst`, including architecture-qualified names. The real command additionally uses `--no-remove`. Lines467–471 verify the protected installed package set/version map and selected extras version afterward while preserving the existing dockerd hash and rootful daemon/workload checks.
- `provision.py:438` creates a root-owned diagnostic under the existing private-state boundary before selection. The APT simulation parser retains only bounded action/package/old-version/new-version records; repository prose and stderr are discarded. A failed simulated command retains its exit status and parseable transactions and never proceeds to installation. Invalid or oversized transaction text fails closed.
- `evidence.py:173` reads only the fixed diagnostic filename through the existing no-symlink, regular-file, ownership, mode, hard-link and size checks. The projection at line204 allows only the closed package/version/status structure, caps counts and string sizes, drops unknown fields and labels the data `diagnostic-only`. It cannot create kernel success or bypass the root-authoritative report requirement. Existing primary/cleanup status handling is unchanged.

## Verification

Independently ran all76 CI contracts with `python3 -m unittest discover -s deploy/scripts/grading/ci -p 'test_*.py' -q`: pass,5.086seconds. Ran `git diff --check 4ea8b4c2..5177da1`: pass. The new contracts exercise older selected versions, exclusive official origin, architecture-qualified pins/refusals, simulation failure retention, absent/unavailable selections, post-install mismatch and bounded collector projection. Parent-supplied41 runtime and real BuildKit results were treated as separate supplied evidence.

Actual APT resolution, rootless provisioning and all24 kernel cases still require the controller-owned new Linux source run. This source review does not claim native execution or broader acceptance. No Next.js source/API was changed.

## Verdict

**APPROVE the scoped prerequisite fix.** The controller may proceed with the already-authorized feature-branch push and actual disposable Linux execution.
