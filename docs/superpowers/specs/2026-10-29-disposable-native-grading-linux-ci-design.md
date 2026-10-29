# Disposable Linux native-grading verification

Date: 2026-10-29, Asia/Seoul.
Status: proposed test-environment extension; no new workflow or host provisioning
has been implemented or authorized by this document. The existing isolated CI
run is separately authorized by the user's request to perform the next steps.

## Purpose and measured starting point

The user has only the current production VPS. Preserve its services and resource
allocation while establishing initial real Linux native-runtime evidence.

Branch `feat/production-native-grading` was pushed at
`ef1541a2baaba72e83a8c8e7d91ce6095f452b7a`. Its existing isolated verification run is
<https://github.com/dlabmapo-web/codebuddy-platform/actions/runs/40835892964>.
The downloaded capability report establishes Linux x86_64, systemd cgroup driver,
cgroup v2, AppArmor and seccomp. Docker is rootful, so the actual capability
probe correctly returned unsupported with `nativeAcceptanceExecuted:false`.
That completed capability job is not native execution acceptance.

## Options and decision proposed for approval

1. **Disposable standard GitHub Ubuntu 24.04 x64 VM (recommended first).** Prepare
   the required dedicated rootless/systemd grading family inside the job, run
   real kernel and guest checks, retain bounded evidence, and let GitHub destroy
   the VM. This uses the existing public repository and standard hosted runner;
   it does not provision a paid VPS. The hardware and database placement differ
   from production, so it cannot certify the production five-second target.
2. **Separate production-equivalent test server.** A supplied Linux AMD64 server
   with SSH and sudo can support the later complete acceptance stack and paired
   cohorts. No provider, purchase, price or server access is selected here.
3. **Scheduled production resource handover.** This needs a separately reviewed
   host budget, maintenance window and tested restoration plan. The user's earlier
   stopped production experiment is not revived by this proposal.

## Scope of this first extension

Add one isolated, push-triggered test workflow for the feature branch. It uses a
fresh standard `ubuntu-24.04` VM, a maximum 45-minute job budget, no production
secrets, no deployment environment and read-only repository permissions. The
workflow is not triggered by untrusted pull-request input.

Preparation is limited to that ephemeral VM: install official rootless Docker
prerequisites, create a distinct `cove-grading` account/control group and safe
subordinate UID/GID ranges, start its systemd user manager, delegate CPU/memory/PID
controllers, and install the existing grading units/configuration. Use the
distribution/Docker AppArmor profile for rootlesskit. Do not disable AppArmor,
seccomp or kernel isolation, use privileged Docker-in-Docker, or execute a guest
through a rootful fallback.

Build the pinned Linux AMD64 native, compatibility and broker artifacts locally
inside the VM. Do not publish images, tags or releases. Extract the broker from
an owned stopped carrier using the existing strict tree policy. Load only the
registered guest images into the dedicated rootless daemon. The broker gets no
application database/Redis credentials, expected outputs or rootful daemon
authority. Test expectations live in the trusted test coordinator.

Use the same execution-family ceiling as the approved design: 1280 MiB, 1.5 CPU,
zero swap, 256 PIDs including daemon, helpers, broker and guests; control reserve
256 MiB; two reservations, at most one background, no extra spare. Guest PID cap
32 and the frozen learner memory policy remain unchanged. The trusted test
coordinator runs in a separate worker-equivalent cgroup capped at 768 MiB,
0.75 CPU and 256 PIDs; combined grading remains 2048 MiB / 2.25 CPUs. Account for
the runner agent, artifact-building daemon and test collection in the separately
observed system/headroom reserve; artifact builds finish before learner tests.
Before source release,
verify effective kernel limits, actual daemon executable/socket/process/cgroup
identity and the learner's pre-interpreter cgroup assignment. Unfundable profiles
or absent delegation fail closed.

## Required initial real checks

- Execute fresh native CPython and pinned compatibility Pyodide guests through
  the production broker/client protocol, retaining their full actual descriptors.
  Check stdout/Unicode, input/prompt behavior, program error and one-second timeout
  classifications against trusted expectations outside the learner.
- Check actual non-root learner identity, private PID/filesystem/network state,
  absent app/control/daemon sockets and host-only canaries, read-only root and
  writable private scratch, and no inherited trusted control FDs.
- Exercise native learner memory growth, PID/descendant limits and bounded output;
  verify real learner versus parent/control OOM evidence. Unknown or parent OOM
  must not become a student memory-limit grade.
- Verify confirmed exit/removal and descendant cleanup, cancellation and broker
  restart with actual owned guests. Recover a known retained receipt without
  relaunching its source. Preserve uncertain cleanup as a failing/quarantined
  state, never a successful result or prematurely free capacity.

Use the existing production modules, verified images and kernel checks. There is
no production startup bypass or substitute guest driver for these positive tests.
Existing deterministic tests retain their separate contract-test role.

## Evidence, failures and cleanup

Capture actual architecture/kernel/Node/Docker versions, immutable image config
IDs and package/shim hashes, broker tree identity, effective cgroup settings,
daemon/worker identity where applicable, guest observations, source-run identities,
failed outcomes and cleanup results. Keep wall, monotonic and diagnostic timing
boundaries separate. A short kernel smoke run is not a grading latency cohort.

The new job passes only when its required positive tests actually execute and
pass. Unsupported capability, invalid isolation, wrong output, uncertain cleanup,
missing evidence or exhausted budget fails the job and is reported distinctly;
do not label skipped native tests as successful native validation. Preserve the
first failure and do not repeatedly rerun to select successful samples.

Keep uploaded evidence bounded to summaries and relevant diagnostics (at most
20 MiB, one-day retention). Never upload real credentials, raw host environment,
production accounts, signing keys or registry credentials. Cleanup can stop and
remove only this job's exact owned services, guests, carriers and files. No
production SSH, global prune or unrelated-host cleanup is part of this workflow.
The runner VM is disposable after the job.

## Explicit remaining gates

This extension establishes initial Linux kernel/native-runtime correctness only.
It does not perform the complete application/native browser pipeline, certify all
course revisions/packages, run representative database placement, establish the
100-submission paired 1/5/10-case cohorts and browser/mixed-load p95, supply release
scans or signatures, authorize production maintenance, or enable native selection.

After this first stage succeeds, prepare the existing full isolated acceptance
stack and complete the remaining checks as a separate concrete stage. A hosted
runner's different hardware/placement remains in every report. Production
activation stays disabled until all applicable gates and host-specific proofs
are satisfied.

## Sources and review

- GitHub documents standard public Ubuntu x64 runners as fresh VMs with four CPUs,
  16 GB RAM and standard-runner public compute free of charge:
  <https://docs.github.com/en/actions/reference/runners/github-hosted-runners>.
- Docker requires rootless Docker with systemd and cgroup v2 for enforced resource
  flags and describes CPU controller delegation:
  <https://docs.docker.com/engine/security/rootless/tips/#limiting-resources>.
- Docker describes Ubuntu 24.04 rootlesskit AppArmor preparation:
  <https://docs.docker.com/engine/security/rootless/troubleshoot/>.

Self-review: this proposal changes only isolated test provisioning. It preserves
the original native runtime, resource and release contracts; distinguishes stock
runner capability from prepared rootless execution and production acceptance;
contains no purchase, production side effect, acceptance signature or invented
performance result. Written-design approval is required before implementation.
