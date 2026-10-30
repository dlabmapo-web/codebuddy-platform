# Task 1 scoped packaging rereview

**Source spec: ✅. Quality: Approved.** The Important packaging finding from `task-1-review.md` is closed at `134c54b3bfa854068ae1842b9b58b3fb0692800b`. **Task 1 execution/closure remains pending actual AMD64 native contracts.**

This rereview covers only `review-8b8a078a..134c54b3.diff`, the appended report fix round, the affected packaging boundaries and focused retained evidence. The prior native C/security review was not repeated, and no broad tests, implementation changes, provisioning or Git mutations were performed.

## Packaging finding resolution

- `.dockerignore:32-33` now excludes the entire locally generated `packages/grading-runtime/host/bin` tree. Neither source COPY can import stale native binaries or extras; the broker build-stage bin directory is populated from the pinned compiler stage. The source C, Makefile and vendor inputs remain in the context.
- `packages/grading-runtime/package.json:25-34` replaces the broad directory inclusion with the exact two executables, manifest and seven intended notices. This closes the independent direct-package leakage route, including arbitrary files under licenses.
- `deploy/scripts/grading/tests/test_build_context.py:25` adds a real BuildKit regression that puts fixture/bin/license canaries into a synthetic context, verifies their exclusion from the COPY output, verifies three required native source paths remain, and scans for the canary marker. This exercises the previously failing boundary rather than merely asserting ignore-file text.

No remaining Critical, Important or Minor source findings in this scoped fix.

## Evidence inspected

The retained context log shows **2/2 passing**, including the new generated-native exclusion test and the existing secret-canary test. The package probe script refuses to overwrite existing outputs, exercises actual pnpm pack with all three canaries, compares the exact native inventory to the manifest, and removes its canaries. Its retained GREEN log has no canaries and exactly ten intended native files.

The artifact probe script verifies all three canaries are present through the actual production Docker build, runs the retained archive/extraction verifier and scans the extracted artifact for both canary paths and marker bytes. The build log reaches successful image export; the artifact log confirms no canary leakage, preserved root archive ownership/0555 modes/single links, manifest hashes and removal of the self-workspace symlink. Current strict artifact identity is `8cadb5fec7e50efecfc6661e4602eb2ca5f127d1898ae5373b53b6b5c73520b5`. Both native binary hashes are unchanged from the original review. I inspected these scripts/results without rerunning their mutations or broad suites.

The earlier clean-artifact evidence alone could not establish the invariant. This round supplies the missing adverse-input build/package evidence and commits the BuildKit regression.

## Cannot Verify / remaining gate

Actual AMD64 live process/bootstrap/framing/restart/daemon observations and production-filter enforcement remain unverified. The documented Desktop seccomp/close_range limitations remain historical RED evidence. Source approval authorizes proceeding to that mandatory real-AMD64 evidence gate; it does not mark Task 1 complete, authorize Task 2 dependency closure, or establish broker/learner containment, production equivalence or production latency.

## Separate Task 2 launch-security interface note

The controller separately asked whether a read-only Yama gate plus root-controlled launch addresses the helper's startup ptrace window. This is a Task 2 launch requirement, not a reopening of the packaging fix, and no exploit was executed in this review.

Ordinary execve resets dumpability to 1. Therefore later native dumpable0, an executable-file hash and post-startup proc ownership do not alone establish that process memory was untouched before readiness. [Linux execve documentation](https://man7.org/linux/man-pages/man2/execve.2.html).

**Judgment:** Yama mode 1 is sufficient for the named same-UID attach/injection vector when enforced before a genuinely fresh trusted launch, with the conditions below. A stricter mode 2 is not necessary under those conditions. Mode 1 permits ancestor tracing, declared PR_SET_PTRACER relationships and CAP_SYS_PTRACE exceptions; mode 2 removes the ordinary relationship exceptions. [Kernel Yama documentation](https://docs.kernel.org/admin-guide/LSM/Yama.html).

The concrete Task 2 contract should be:

1. From the trusted initial host namespaces, read and validate an active Yama setting in the known set {1,2,3} **before starting any helper incarnation**, and recheck through readiness/proof publication. Missing, unreadable, zero or unknown settings fail closed. Do not change the sysctl as part of this work. A check made only after readiness cannot exclude earlier injection.
2. Create a fresh helper through the exact root-controlled direct launch path. Bind the kernel peer/pidfd/start time to that actual unit invocation and MainPID; reject preexisting/adopted processes. Establish launch/parent causality from the trusted launcher, rather than inferring history from a current PPid snapshot. No attacker-controlled same-UID ancestor, executable wrapper, tracing-enabled launch or PR_SET_PTRACER path may enter that chain. The absence of a historical exception must follow from that trusted launch, not be claimed from a later executable hash.
3. Preserve the helper's initial host user namespace and the threat-model exclusion of attacker CAP_SYS_PTRACE in that namespace. Helper zero capabilities alone does not establish that an attacker lacks this privilege. User-namespace capabilities do not grant authority over an initial-userns target. Yama gates ATTACH-class process-memory operations as well as ordinary ptrace attachment. [Linux ptrace access-check documentation](https://man7.org/linux/man-pages/man2/ptrace.2.html).
4. Reject a nonzero TracerPid observed by the trusted host-PID-namespace bootstrap observer, before proof publication and across its observations. This is useful fail-closed corroboration; zero is not historical proof against attach, modify and detach. Retain mandatory native NNP/dumpable0/filter-before-listen and the post-ready prctl prohibition.

These conditions prevent the named startup access path under the approved unprivileged same-UID attacker model without changing host sysctls, helper privileges or native C in this round. They are a source/design inference from kernel rules, not measured prevention evidence. Task 2/3 should retain an actual AMD64 adversarial launch observation, including rejection when the gate is unavailable and an attempted same-UID sibling attach during the pre-ready window. A missing or ambiguous causal launch must fail closed even when Yama is enabled.
