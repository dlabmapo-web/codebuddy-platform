# Native grading resume checkpoint

## Approved repair implementation in progress — 2026-10-30

The user explicitly approved the attestor design: “okay i will approve and do
what is needed”. No further approval of that same scoped repair is required.
Approved spec and new implementation plan were committed in1fe39720, with
canonical-release/evidence clarifications in90bf52ef.

Current plan: `docs/superpowers/plans/2026-10-30-native-grading-daemon-attestor-implementation.md`.
Current ledger: `.superpowers/sdd/2026-10-30-native-grading-daemon-attestor-implementation/progress.md`.
Task1 native static helper/client source is committed in8b8a078a, with the
reviewed packaging fix in134c54b3. Independent source review is approved;
actual AMD64 run41038461369 on published3ea3e796 failed native bootstrap.
Six native methods passed, including real policy enforcement; all13 live methods
failed shared setup with ATTESTOR_CLIENT_PEER. Root cause: producer umask0077
creates0700 while the strict bootstrap requires0600. Fix round2 changes the
producer to0177, preserves the verifier and adds a shared-production bind
regression in9475775d. Round3 fixture0257fc29 holds the forged peer alive and
uses valid/instance-only-mutation/valid controls with unchanged proof/PID/socket.
Independent source rereview is approved; actual new-source CI is next.
No unchanged rerun or Task2 dispatch before the actual native gate passes.
Pure native5, CI87,
runtime41 and real BuildKit1 local checks pass; the static broker artifact was
extracted and inspected. The full local native suite fails under Desktop
AMD64 emulation: an independent minimal seccomp filter returns EINVAL and
close_range returns ENOSYS. These are retained failures, not policy passes.
Packaging canary regressions now pass BuildKit2/2, package and actual extracted
broker probes; native hashes are unchanged and artifact tree identity is
8cadb5fec7e50efecfc6661e4602eb2ca5f127d1898ae5373b53b6b5c73520b5
for the historical packaging-only source. The rebuilt socket-fix artifact is
fb5e4a385a598408585f8a9cab9c94740511123fe62ddf47232e69624548ddb2;
fixture-only0257fc29 does not change its runtime binaries or package.
The failed run's kernel wrapper was skipped,0/24 guest cases, wrapper cleanup
unexecuted. Ordinary41038461105 passed17 browser and2 actual DB timing contracts;
paired native acceptance skipped. Read the new report
`2026-10-30-native-grading-attestor-verification.md` and its source-bound assets.
Branch CI must pass mandatory real AMD64 native contracts before Task2; do not
skip unsupported cases or weaken the production filter.
Read this plan's ledger before any redispatch. Task2 is root bootstrap/production
transport/lifecycle; Task3 is actual disposable Linux integration/evidence.
The earlier CI extension below is a historical failed baseline, not a reason
to ask for the already-granted attestor design approval again. Production
deployment/SSH/resource handover/activation remain excluded.

## Prior failed verification checkpoint — 2026-10-30, Asia/Seoul

The user resumed the work. The prior paused state below is historical; use this
section and the current verification report for next steps. No production
service/account/resource, grading flag or original IDE checkout changed.

- Worktree/branch unchanged: `/Users/jurabeksamiev/Developer/codebuddy-platform-native-grading`,
  `feat/production-native-grading`. Original checkout remains
  `feat/public-turtle-browser-pilot`.
- Latest reviewed, pushed and actually tested source:
  `6e1cea33a8f494051f1830a5f1de9edfd652c1c2`. Subsequent documentation-only
  checkpoint is local; do not push it merely to save notes.
- Safe prerequisite selection is fixed: matching official Docker CE/rootless
  extras, all protected package versions pinned/verified, removal/change guard
  preserved and bounded diagnostics retained.
- Dedicated user-manager runtime environment is fixed and actually verified.
  The incorrect intermediate transient `%t` probe and its failed run/review
  remain recorded; the corrected actual RuntimeDirectory probe passed Linux.
- Real dedicated rootless Docker28.0.4 starts, is attested, and loads both
  immutable guest images. Production broker startup is still blocked.
- Final diagnostic [run41013987308](https://github.com/dlabmapo-web/codebuddy-platform/actions/runs/41013987308)
  fails production driver verification with `EACCES` / `stat` / daemon process
  executable. Broker, daemon and host user namespaces differ. Systemd255 source
  shows the broker's mount protections implicitly create a separate userns.
  Actual observations support this mechanism; they are not a causal
  counterfactual or positive containment acceptance.
- All six failed source records are preserved. **0/24 required guest cases
  executed; exact cleanup succeeded for every record.** No unchanged sample was
  rerun to select success.
- Final-source [ordinary run41013987237](https://github.com/dlabmapo-web/codebuddy-platform/actions/runs/41013987237)
  succeeded:17 browser cases and2 actual DB timing contracts; paired native
  acceptance skipped. Local87 CI contracts,41 runtime tests, actual synthetic
  BuildKit export, syntax/compile/whitespace passed.
- Final independent whole-extension review approved CI source and failed-evidence
  bookkeeping, retaining a HIGH inherited production integration blocker.
  Task3 source/run inspection/evidence are closed with FAILED outcome; the
  positive24-case verification goal is incomplete. Tasks1/2 and original product
  plan are not to be redispatched.

## Prior verification records

Read `docs/research/2026-10-29-disposable-native-grading-linux-verification.md`,
its assets `run-index.json`, six summaries, scoped reviews and
`whole-extension-review.md`. Durable current SDD ledger snapshot:
`assets/2026-10-29-disposable-native-grading-linux-verification/progress-2026-10-30.md`.
The ignored SDD workspace remains available. Raw ignored downloads are under
`test-results/native-linux-run<runId>/`.

A concrete repair is written in
`docs/superpowers/specs/2026-10-30-native-grading-daemon-attestor-design.md`.
It retains broker hardening and full live kernel identity checks using a small
unprivileged initial-userns native attestor and credential client, root-owned
proof and strict IPC/lifecycle/resource controls. **The user subsequently
approved this repair; its implementation is in progress as recorded above.**
Use the new plan and reviews, then new source-revision disposable runs. Do not weaken executable
identity, drop broker hardening, substitute a CI guest driver, or rerun failed
unchanged samples. Audit later protected guest observations before growing any
helper API.

No merge/tag/deployment, production SSH, paid runner/server purchase, activation
or production resource handover is authorized. Complete native app E2E, paired
100-sample cohorts, mixed-load p95, host equivalence and release/activation gates
remain unverified.

---

# Historical paused checkpoint — 2026-10-29

Paused explicitly at the user’s request. Continue only after the user resumes.
No production service, account, grading flag or VPS resource allocation changed.

## Location and source

- Same repository, existing linked worktree:
  `/Users/jurabeksamiev/Developer/codebuddy-platform-native-grading`.
- Branch: `feat/production-native-grading`.
- Latest pushed code: `19ae8a290158df943b1d6292c6d655595071dd92`.
- This checkpoint is a local documentation commit; do not push it merely to save
  notes, because a push starts verification workflows.
- Original checkout `/Users/jurabeksamiev/Developer/codebuddy-platform` remains on
  `feat/public-turtle-browser-pilot`; do not switch or modify it.

## Completed — do not restart these tasks

The original production-native implementation is complete, reviewed and committed
through `ef1541a2`. Its completed implementation plan must not be redispatched.
Native selection remains disabled pending the full release/host acceptance gates.

The user has only production. They approved the written **disposable Linux CI**
design, avoiding production SSH, maintenance or a VPS purchase for this stage.

The new plan is
`docs/superpowers/plans/2026-10-29-disposable-native-grading-linux-ci-implementation.md`.
Tasks1 and2 are complete and independently reviewed. Task3 code and its scoped
review are complete; actual passing Linux execution, evidence closure and final
whole-change review remain incomplete.

Implemented guarded rootless provisioning, actual production broker/client
kernel checks, bounded privileged observation/fault injection, and branch-scoped
GitHub CI with strict first-failure artifacts. CI controllers are excluded from
production Docker build contexts. Fixed reviewed cgroup/control-path, detached
output-pipe and prerequisite-failure-summary issues without weakening production.

Parent independently verified64 CI contracts,41 runtime tests, real synthetic
BuildKit context export, syntax/compilation and whitespace checks. These are
local contracts, not positive native containment acceptance.

## Actual runs

1. Existing isolated baseline: [40835892964](https://github.com/dlabmapo-web/codebuddy-platform/actions/runs/40835892964), source`ef1541a2`: passed17 browser cases and2 actual PostgreSQL timing contracts. Stock rootful capability probe is not native acceptance; paired Linux acceptance skipped.
2. New ordinary isolated run: [40848107576](https://github.com/dlabmapo-web/codebuddy-platform/actions/runs/40848107576), source`19ae8a29`: last read still running browser job, capability success, paired acceptance skipped. Check its final result on resume.
3. First disposable native kernel run: [40848107655](https://github.com/dlabmapo-web/codebuddy-platform/actions/runs/40848107655), source`19ae8a29`: **failed at prerequisite preparation**.64 contracts and the real BuildKit canary passed on Linux. All three AMD64 images built. APT simulation proposed changing a protected rootful-engine package, so the guard correctly refused. No grading daemon or required guest case started: **0/24 executed**. Cleanup succeeded; preserve this failed record.

Archived sanitized evidence and complete task reports/reviews/rulings:
`docs/research/assets/2026-10-29-disposable-native-grading-linux-verification/`.
The downloaded run artifact has one-day retention, so use the tracked snapshot.
Raw ignored downloads are under `test-results/native-linux-run40848107655/`.

## Exact next work

1. Read the approved disposable design, this checkpoint, the verification report
   and the plan’s own SDD ledger before doing anything. Its ignored workspace is
   `.superpowers/sdd/2026-10-29-disposable-native-grading-linux-ci-implementation/`.
   A durable ledger snapshot is `assets/.../progress-at-pause.md`.
2. Fix **CI prerequisite selection**, starting at
   `deploy/scripts/grading/ci/provision.py:396`. The current implementation selects
   latest `docker-ce-rootless-extras`; simulation then rejects any protected
   rootful package change. The exact proposed package/version was not retained,
   so do not pretend the cause is more specific than the recorded guard failure.
3. Proposed next approach, **not implemented**: use the actual installed Docker
   package versions to select matching official rootless extras, pin protected
   installed packages, and verify the chosen version’s official noble/amd64
   origin. Keep the existing no-removal/no-protected-engine-change guard and
   executable/daemon identity checks. Add bounded non-secret installed/selected
   version and simulation-plan diagnostics so another failure is actionable.
   If no safe official combination exists, fail explicitly; do not upgrade the
   rootful engine, weaken isolation, use privileged DinD or rootful guests.
4. Add focused regressions, use the existing subagent-driven review process,
   verify source, and push a **new reviewed source revision** to the same feature
   branch. Do not rerun unchanged failed samples to select success. No production
   change, paid runner or new server is authorized by this stage.
5. Complete all24 actual kernel cases and exact cleanup if the environment
   supports them; otherwise retain the concrete failing/unexecuted result. Then
   close Task3 and perform the final whole-change review for this extension
   (`ef1541a2..FINAL`), archive evidence, and keep the feature worktree.

Do not merge/tag/deploy, contact others, enable native grading, purchase a VPS or
resume the previously stopped production experiment. Complete app/native E2E,
paired100-sample cohorts, mixed-load p95, host equivalence, signed release proof
and the five-second production target remain unverified. A hosted kernel smoke
cannot close those production gates.
