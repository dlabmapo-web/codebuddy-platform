# Task 1 fix round 4 scoped source review

**Source spec: ✅. Quality: Approved.** The proc-status ownership correction is appropriate and its regression is meaningful. No blocking findings remain in this scope. **The actual current-source 26-method AMD64 contract run and Task 1 completion remain pending.**

Scope: `e4ba318cedac37fc5188689be2d458c8956cb785..7bb8f43e03e10d4e69f4e3e26830d51e7393cda1`, supplied five-file diff, appended round4 report, affected bootstrap callers, focused ownership regression, kernel implementation and retained evidence. Prior packaging, socket creation and forged-peer findings remain closed; the old full package was not reaudited.

## Source and security assessment

The original directory guard was based on an incorrect kernel assumption. I independently fetched the pinned upstream v6.8 source: `task_dump_owner` defaults to task effective ownership and exempts world-readable/executable process directories from the non-dumpability ownership adjustment. Other proc objects receive the task memory namespace's root ownership when dumpability is not 1; `pid_getattr` applies this rule when returning attributes. [Linux v6.8 task_dump_owner](https://github.com/torvalds/linux/blob/v6.8/fs/proc/base.c#L1814), [pid_getattr](https://github.com/torvalds/linux/blob/v6.8/fs/proc/base.c#L1957).

`identity.c:290` now builds only the fixed `/proc/<kernel-peer-PID>/status` path, bounds its formatting, opens it read-only/nonblocking/CLOEXEC/O_NOFOLLOW, fstats the held descriptor, requires a regular file with UID/GID 0 and closes the descriptor on the success/failure path. It adds no loop, caller-selected path, production test mode, wire operation or permissive fallback. Failure remains fail-closed through the existing bootstrap classification.

The replacement remains inside `bootstrap_snapshot`, so both existing client calls apply it: the initial snapshot at `attestor-client.c:63` and the post-exchange snapshot at `:119`, with existing comparison retained. I checked those adjacent callers specifically to ensure the new observation was not limited to one side of the exchange. Independent kernel peer/status UID/GID, initial host-userns, executable path/dev/inode/hash, cgroup, start time, socket mode/incarnation and config/proof checks are unchanged.

Requiring numeric root ownership is appropriate here because bootstrap separately binds the helper to the initial host user namespace. The status-owner observation still cannot distinguish dumpable 0 from 2. PROTOCOL now states the correct proc object and preserves that limitation; the proof evidencekind/schema is unchanged. Mandatory native PR_SET/GET_DUMPABLE=0 before readiness, authenticated native executable/launch causality and post-ready prctl denial remain necessary. The change does not claim file ownership alone establishes memory integrity or dumpable 0.

No Critical, Important or Minor code findings established in this scoped fix.

## Regression assessment

The separate unshipped fixture runs as nonroot UID/GID 23001, performs actual dumpability transitions 1 → 0 → 1, confirms each with PR_GET_DUMPABLE and calls the same production predicate. It independently checks that the process directory remains account-owned throughout. The expected `0 1 0` result rejects both a permanently failing old directory predicate and an always-accept predicate. It tests real kernel metadata rather than duplicating the predicate as a synthetic expected-value function.

The fixture reverses dumpability only inside the test executable; it does not change the production helper's policy or add any production switch. The test makes no full-bootstrap or seccomp-emulation claim. Production C, protocol ownership semantics and the new test agree on the observed object and retain the 0-versus-2 qualification.

## Evidence independently inspected

- Recomputed the retained run 41053652099 log hash: `35ef0df5d7c295a6dc07355723072bf87882ba4701e1461115d9488b26e50347`, matching the report. The log remains 25 methods / 15 failures, including a production-filter pass on that prior epoch. All live shared setups failed; later live assertions and learner execution were not thereby established.
- Read the isolated kernel control: confirmed PR_GET_DUMPABLE 0, process directory owner 23001:23001 and status owner 0:0. This corroborates the kernel-source interpretation without being represented as full helper success.
- Read the actual shared-predicate RED (`0 0 0` versus required `0 1 0`) and retained local GREEN (7 focused tests passing in 0.579 seconds). These cover the corrected ownership predicate plus existing bind/hash/schema/static artifact checks.
- Inspected successful current fixture/broker build logs and their absence of C warning/error diagnostics. The remaining Docker constant-platform advisory is unrelated to C compilation.
- Read the artifact verification log: strict tree identity `43a2eb6c4ccbf8a382c8150b4df6ab4103acbb6bb6a88305bfa343e0c3fecc7a`, expected native runtime inventory, original root archive ownership, 0555 tools/single links and preserved self-workspace-link handling.
- Independently hashed the current extracted binaries and matched the manifest/report: attestor `af80bb817ec41016ba46c7234ba15a6896cfa1559c3d72785e25ab959198ebae`, 1,210,320 bytes; client `b7cab3cde67b319f6a89a3e33503355a5f43e38039bc67ce675bb698b897eafc`, 1,210,448 bytes.

A nonblocking citation-location error was found during review: normalized web-display offsets had been used as physical kernel-source line numbers. The controller corrected the report to task_dump_owner 1814–1870 / pid_getattr 1957–1983 and the spec anchor to L1814. I confirmed those documentation corrections. No runtime/source change was needed for that note.

## Cannot Verify / disposition

This fixes a definite impossible directory-owner guard. It does not establish that all other bootstrap guards or subsequent daemon/client assertions pass. The retained local ownership regression cannot close those native execution gates, and the previous actual policy pass must remain attributed to its previous source. Current-source actual AMD64 execution of all 26 methods remains required before Task 1 closure and downstream approval. Learner execution remains 0/24 until actual new evidence says otherwise; production equivalence, containment and latency/control-reserve acceptance remain outside this source approval.

Proceed to the mandatory actual AMD64 native-contract run on the reviewed current source. No broad tests, implementation edits, Git/CI mutations, service/provisioning changes or host setting changes were made by this reviewer; only this scratch review was written.
