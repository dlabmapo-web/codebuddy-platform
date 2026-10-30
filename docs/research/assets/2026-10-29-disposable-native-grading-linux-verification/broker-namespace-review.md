# Broker namespace diagnostic review — 2026-10-30

Reviewed `8e87354c..6e1cea33a8f494051f1830a5f1de9edfd652c1c2` using the code-review skill. Scope is the added kernel namespace observation, its binding/projection, and breakage introduced by this four-file diagnostic change. Read actual run41013115176's archived preflight failure and inspected the existing kernel/SO_PEERCRED daemon attestation implementation. No implementation was edited and no provisioning, push or remote run was performed.

## Findings

No blocking issue found in the scoped diagnostic change.

- `provision.py:163` reads only `/proc/1/ns/user` and `/proc/<already-attested-endpoint-pid>/ns/user`. The host guard already requires systemd PID1 on the disposable VM. The daemon PID comes from the private state's endpoint identity, not caller-selected arguments, process-name discovery or a worker-selected proc path.
- Before and after those reads, `attest_daemon(state)` must equal the full original identity. Inspected actual attestation: it connects to the exact dedicated socket, obtains kernel SO_PEERCRED, verifies the dedicated UID, kernel executable/path/inode/hash/config argument/cgroup, PID start time and socket device/inode, and repeats continuity checks. A changed endpoint/PID incarnation refuses this diagnostic rather than rebinding it silently. Kernel namespace strings must match the fixed user:[digits] form. These are pre-launch namespace observations; they are not a claim that a daemon can never change afterward or that namespace inequality alone proves the complete causal chain.
- Only those two identifiers are passed as fixed positional comparison inputs to the already-reviewed unchanged-policy transient service. The JS probe reads its own actual `/proc/self/ns/user`, compares all three pairs and emits exactly three booleans. It never selects another host target or exports raw namespace IDs/paths. `namespaceProjection` rejects non-identity strings.
- The namespace observations are supplementary. Once reached, the same production imports, manifest/sidecar loading, driver construction and driver.verify path execute. Its existing success/failure/stage/error projection is unchanged, with the boolean object appended afterward. A namespace setup/read failure instead remains a truthful configuration-stage diagnostic failure; it does not fabricate a driver result. No exception is converted to success and namespace equality does not bypass any check.
- `project_broker_preflight` permits exactly brokerMatchesHost, brokerMatchesDaemon and daemonMatchesHost, requires actual bool values, and copies only that closed object. Missing fields, extra fields and string values are rejected. Existing root-owned fixed-path4096-byte artifact collection, diagnostic-only label, original lifecycle status handling and required authoritative kernel evidence remain intact.
- No production unit, filesystem/user namespace policy, module authority, guest execution, accepted release gate or cleanup target changes. The dedicated service's existing runtime/heap/family budgets and exact-unit stop/collect paths are unchanged. This source can explain the observed EACCES/stat/daemon-proc-executable failure; it cannot resolve that product architecture issue or establish native acceptance.

## Verification

Independently ran87 CI contracts: pass in4.575seconds. Node syntax check and `git diff --check 8e87354c..6e1cea33`: pass. Added tests bind fixed kernel reads to the attested PID and detect endpoint changes before/during observation, execute the JS pairwise projection for distinct/equal identities, reject malformed identity strings, and verify strict collector boolean projection. These are source/contract results; actual namespace relationships remain to be measured in the new-source Linux run. No Next.js code/API changed.

## Verdict

**APPROVE the scoped namespace diagnostic6e1cea33.** The controller may perform the already-authorized new-source disposable Linux run. Original failed runs remain preserved, and broader architecture changes remain outside this source gate.
