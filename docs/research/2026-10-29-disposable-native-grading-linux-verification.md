# Disposable native grading Linux verification — 2026-10-29

Status: **verification remains failed at broker driver verification** after the
user resumed on 2026-10-30, Asia/Seoul. Package selection and dedicated runtime
setup were fixed and reviewed. Latest source `6e1cea33a8f494051f1830a5f1de9edfd652c1c2`
ran on Linux and retained `EACCES` while checking the daemon executable.
The broker, daemon and host have distinct user namespaces. No required guest
case executed (0/24); every recorded exact cleanup passed. Production is
unchanged and native selection remains disabled. The proposed production
service repair needs a separate approved design; it is not implemented.

## Actual run dispositions

Each row is a distinct reviewed source revision. Failed records were retained;
no unchanged sample was rerun to select success. All three AMD64 images built
in each resumed run, and each source's CI contracts/real BuildKit check passed.

| Run | Source | First failure or observation | Required guest cases | Cleanup |
| --- | --- | --- | --- | --- |
| [40848107655](https://github.com/dlabmapo-web/codebuddy-platform/actions/runs/40848107655) |19ae8a29| APT proposed protected engine change |0/24|pass|
| [41011046173](https://github.com/dlabmapo-web/codebuddy-platform/actions/runs/41011046173) |5177da10| Matching packages installed; daemon inherited wrong XDG runtime |0/24|pass|
| [41011581831](https://github.com/dlabmapo-web/codebuddy-platform/actions/runs/41011581831) |3d9ee69e| Incorrect transient `%t` probe rejected setup |0/24|pass|
| [41012042378](https://github.com/dlabmapo-web/codebuddy-platform/actions/runs/41012042378) |29f0bfe5| Runtime probe/daemon passed; broker startup failed |0/24|pass|
| [41013115176](https://github.com/dlabmapo-web/codebuddy-platform/actions/runs/41013115176) |8e87354c| Actual production driver: EACCES/stat/daemon executable |0/24|pass|
| [41013987308](https://github.com/dlabmapo-web/codebuddy-platform/actions/runs/41013987308) |6e1cea33| Same error; all three user namespaces differ |0/24|pass|

The bounded summaries and exact source/artifact IDs, compressed sizes and SHA256
hashes are preserved in `assets/2026-10-29-disposable-native-grading-linux-verification/run-index.json`.
The final artifact12958544193 (1887compressed bytes) was downloaded; its archived
summary SHA256 is `1d37a760672fcd617a4fe912e0a68daf74dee46a71e00f2195da2cc0c9ee44b7`.

## Current blocker and scope boundary

The final read-only diagnostic ran the deployed production RootlessDriver.verify
under the exact current broker process policy. It retained stage `driver-verify`,
errno `EACCES`, syscall `stat`, role `daemon-proc-executable`, plus:

```json
{"brokerMatchesHost":false,"brokerMatchesDaemon":false,"daemonMatchesHost":false}
```

The root controller bracketed fixed host/daemon namespace reads with actual
SO_PEERCRED, executable/PID/start-time/socket continuity checks. The trusted
root-staged service read its own namespace and emitted only these three booleans.
Raw namespace identifiers, arbitrary paths, error text and environment were
excluded. These are diagnostics rather than positive containment acceptance.
They are prelaunch host/daemon observations, not a complete causal counterfactual.

Systemd255's `exec_context_need_unprivileged_private_users` enables a separate
user namespace for user-service PrivateTmp, ProtectSystem and ReadWritePaths,
even if PrivateUsers is explicitly false. This mechanism and the observed
distinct namespaces are consistent with the cross-user-namespace executable
permission failure. Source inspection does not authorize dropping a kernel
identity check, removing the broker's protections or changing service architecture.

The disposable plan requires existing rendered units. A [proposed initial-user-namespace native identity attestor design](../superpowers/specs/2026-10-30-native-grading-daemon-attestor-design.md),
retaining the current broker sandbox and full live daemon identity proof, is
ready for a separate production implementation decision. No such helper or relaxed production policy exists in this source.
Complete kernel execution, final acceptance and activation remain open.

## Source and execution

- Source base: `40df68c2d9b335d17fa6594f33331c6a029140ea`.
- Branch: `feat/production-native-grading`.
- Workflow: `.github/workflows/native-grading-kernel.yml`.
- Trigger: pushes to that branch only; Ubuntu24.04 AMD64 hosted runner; 45-minute
  timeout; read-only repository permission; no deployment environment/credentials.
- Concurrency queues newer revisions without cancelling the active first record.
- First actual run: <https://github.com/dlabmapo-web/codebuddy-platform/actions/runs/40848107655>.
- Tested source: `19ae8a290158df943b1d6292c6d655595071dd92`.
- Outcome: failed at `prepare`; official prerequisite installation simulation
  proposed changing a protected rootful-engine package, so the guard refused.
  The current artifact does not identify which protected package/version.
- Downloaded artifact: ID `12886185688`, compressed size634 bytes. Sanitized
  summary archived in `assets/2026-10-29-disposable-native-grading-linux-verification/`.
- Archived summary SHA256: `f2f7b4167b24d21a9fe6b529a387e1b6154fd051d20b056a0d73c3c5efc64cd0`.
- Linux AMD64 image builds succeeded. The dedicated grading daemon and all24
  required kernel cases remained unstarted; no positive native proof exists.
- Production remains untouched. No merge, deployment or activation is authorized
  by this verification stage.

## Resumed execution — 2026-10-30

The reviewed prerequisite fix `5177da1002f33096e23e92e0a6e0b1d44f2dfaac`
passed76 local CI contracts,41 runtime tests and the real BuildKit context
check. Its independent scoped review approved the new source revision before
the controller pushed the existing feature branch.

[Run41011046173](https://github.com/dlabmapo-web/codebuddy-platform/actions/runs/41011046173)
passed all76 CI contracts and the real BuildKit check on Linux. All three
AMD64 images built. Prerequisite selection/install then succeeded: installed
Docker CE/CLI and selected official noble/amd64 rootless extras were
`5:28.0.4-1~ubuntu.24.04~noble`; installed containerd.io was
`2.4.2-3~ubuntu.24.04~noble`. The simulated transaction installed/configured
only matching extras. Protected package versions, dockerd hash and the existing
rootful daemon/workload checks passed before preparation advanced.

This run failed later at dedicated-daemon startup. Its bounded unit journal
records `XDG_RUNTIME_DIR needs to be set and writable` while checking
`/run/user/1001`, which differs from the harness-selected grading UID
(range10000–59999). The origin of that runtime environment is unproven.
No guest case started:0/24. The exact-owned cleanup receipt succeeded, with
original owned namespaces/processes absent and no unexpected containers.
Primary1, observation1, cleanup0, infrastructure0, collection1, finalization0
were preserved separately. Artifact12957466761 (874compressed bytes) was
downloaded; the projected summary is archived alongside the first failure.
At that point, a focused CI user-manager environment fix was needed. The
subsequent fixes below kept production rendered units and isolation contracts
unchanged.

The next reviewed source `3d9ee69ef83af204b3bdb5d8e21e6a16c7f09415`
added dedicated-manager environment normalization and an actual transient service
probe. All81 contracts passed locally and on Linux, and independent scoped review
approved before the new push.
[Run41011581831](https://github.com/dlabmapo-web/codebuddy-platform/actions/runs/41011581831)
failed at `Dedicated user manager service environment differs`, before daemon
startup or any guest case (0/24). Exact cleanup again passed. Its downloaded
artifact12958036618 (807compressed bytes) is archived. The parent subsequently
identified a deterministic probe defect: systemd255's D-Bus Environment setter
merges raw values and escapes specifiers when serializing, so a transient
Environment property containing `%t` remains literal. This source did not
establish that the actual manager runtime prefix was wrong. The earlier scoped
review missed that API distinction and is retained as superseded evidence.
The corrected RuntimeDirectory probe was committed in29f0bfe5 and independently
reviewed against the actual systemd255 implementation. Its83 local contracts
and range checks passed before the controller pushed the new source.
[Run41012042378](https://github.com/dlabmapo-web/codebuddy-platform/actions/runs/41012042378)
failed later at broker readiness after the corrected runtime probe passed.
The dedicated rootless Docker28.0.4 daemon initialized at
`/run/user/10000/cove-grading/docker.sock`, and host daemon identity/image
loading checks passed. The broker unit emitted only its generic
`Grading broker startup failed closed` message, so the actual broker failure
cause was unknown at that point. No required guest case started (0/24), and exact
cleanup again passed. The downloaded projected summary is archived. The
subsequent read-only production-driver preflight below used the exact broker
service policy; it created no guest and did not establish native acceptance.
Primary source: [systemd255 D-Bus execution properties](https://github.com/systemd/systemd/blob/v255/src/core/dbus-execute.c#L2677-L2701).
Ordinary isolated runs41011046179 and41011581840 were cancelled automatically
after newer source pushes; no passing result is claimed for either. Ordinary
[run41012042330](https://github.com/dlabmapo-web/codebuddy-platform/actions/runs/41012042330)
at29f0bfe5 completed successfully:17 browser cases and2 database timing
contracts passed; paired Linux acceptance remained skipped.

The reviewed read-only preflight source8e87354c then ran as
[run41013115176](https://github.com/dlabmapo-web/codebuddy-platform/actions/runs/41013115176).
It retained a concrete failure: `driver-verify`, `EACCES`, syscall `stat`,
path role `daemon-proc-executable`. Raw error text, paths and environment were
excluded. This run also executed0/24 required guest cases and completed exact
cleanup successfully. Artifact12958198846 (1849compressed bytes) is archived.
Systemd255's unprivileged user-service mount protections automatically enable
a user namespace, which is a likely explanation; actual namespace relationships
are recorded in the final source/run above.
The CI design does not authorize weakening identity checks or changing the
production rendered service arrangement. A repair outside that boundary needs
a separately approved production design update.

The final namespace run retained primary1, observation1, cleanup0,
infrastructure0, collection1 and finalization0. Kernel and full prepare/after
observation reports are absent because preparation failed; those gaps remain
explicit collector failures. Latest-source
[ordinary run41013987237](https://github.com/dlabmapo-web/codebuddy-platform/actions/runs/41013987237)
completed successfully at6e1cea33:17 browser cases and2 actual database timing
contracts passed. The paired Linux acceptance job was skipped; the capability
job is not native acceptance. Its bounded controller-verified metadata is
archived separately.

## Final whole-extension review

Independent review of `ef1541a2..6e1cea33` approved the CI source and truthful
failed-evidence disposition, with no new CI security/correctness blocker. It
retained the inherited production integration issue as HIGH: the broker's
protected daemon-executable inspection fails under the current user-service
sandbox. All six source/summary hashes, failure states and cleanup receipts
matched the index; the final-source ordinary17-case/2-contract success was
verified separately. The full review is archived as
`assets/2026-10-29-disposable-native-grading-linux-verification/whole-extension-review.md`.

Task3 source, run inspection and evidence closure finish with a **FAILED Linux
verification outcome**. The positive24-case goal remains incomplete. The
proposed production attestor design is neither approved nor implemented. The
final review grants no production eligibility, release or activation approval.

## Local verification

These results establish source contracts and synthetic build-context behavior;
they do not establish Linux execution or containment.

| Check | Local result |
| --- | --- |
| CI Python contracts, including actual JS transport/schema helpers | 87 pass at6e1cea33 |
| Runtime TypeScript build and runtime tests | 41 pass, zero skips |
| Real BuildKit synthetic COPY-context export | pass |
| Python compilation, shell syntax and whitespace checks | pass |

The BuildKit test exports an actual scratch `COPY .` context containing only
synthetic fixtures. All CI controller canaries, including a nested future file,
are excluded by `.dockerignore`; the safe package fixture remains.

## Required actual case execution

| Required group | Required count | Actual Linux result |
| --- | ---: | --- |
| Functional cases, CPython and Pyodide | 16 | not executed |
| Native isolation and charged scratch | 1 | not executed |
| Native learner memory and PID limits | 2 | not executed |
| Native cancellation | 1 | not executed |
| Retained receipt and active broker restart | 2 | not executed |
| Distinct guest-parent and control-local OOM | 2 | not executed |
| Total | 24 | not executed |

The actual summary can pass only with all24 unique required cases, validated
source/allocation/receipt bindings, actual GATE/EXEC events, native local OOM
counters/victims, removal proof and successful lifecycle statuses. Unsupported
capability fails the job. No skipped check, capability-only observation or
worker-writable success flag substitutes for the authoritative root report.

## Evidence and cleanup contract

`run.sh` builds shared/runtime dependencies and the three local AMD64 images
before provisioning or guest work. It passes setup-node's actual absolute
executable through only `GRADING_CI_NODE_SOURCE`; privileged calls receive a
fixed empty-based environment with the three exact disposable-CI guard values.
Its EXIT trap observes, captures diagnostics, cleans up exact owned resources,
then collects evidence. Primary, post-observation, infrastructure collection,
cleanup, privileged collection and finalization statuses remain separate. The
primary failure determines the shell exit before secondary failures.

The collector opens the fixed root-owned mode0600
`/var/lib/cove-grading-ci/kernel.json` through guarded privileged reads.
Symlinks in any component, path escapes, nonregular/multilink files, incorrect
owners/modes, duplicate JSON keys and oversized inputs are rejected. It projects
only bounded identity/counter/status fields. Root observations retain
architecture/kernel/Node/Docker, immutable daemon/image/package/broker-tree and
runtime identities, effective family/worker limits and remaining host headroom.
Full daemon/family/system-reserve observations are unavailable because
preparation stopped early. The actual cleanup receipt reports success, original
owned processes/namespaces absent and no unexpected containers. Primary exit1
was retained separately from cleanup exit0 and collection exit1.

Optional worker phase summaries are diagnostic only. Internal request/reply
handshakes, convenience `evidence/kernel.json`, worker host-proof copies, private
state, raw environment, keys, guest/container logs, source and output payloads
are excluded. Captures contain only byte counts and hashes. Fixed invariant
failure reasons are allowlisted from reviewed literal controller messages;
arbitrary exception text is discarded.

Before cleanup, only the exact owned grading UID's
`cove-grading-docker.service` and `cove-grading-broker.service` journals are
queried. Diagnostic excerpts select only priority and printable message text,
with at most40 messages/unit, 1KiB/message, 64KiB read/unit and a15-second deadline.
Sensitive assignments and credential-bearing URLs are redacted. Worker,
container and broad host journals are never queried. These excerpts are clearly
labelled diagnostic, separately from authoritative kernel proof.

Every prerequisite has a stable workflow step ID. An always-run stdlib-only
inline finalizer receives only source revision and step outcomes through explicit
environment values, so checkout, tool setup, installation or local-check failure
still produces a bounded failure summary. A skipped wrapper is recorded as
native/cleanup unexecuted; missing evidence from a wrapper that started is
recorded as unknown. No host or cleanup proof is invented. Valid wrapper
summaries retain their exact bytes and inode. Missing authoritative evidence
makes the fallback fail; earlier failed steps remain failed. Upload runs only
after the finalizer marks the regular, owned, bounded, no-symlink path safe.

The upload contains only `test-results/disposable-native-kernel/summary.json`,
with a strict20MiB total bound, exact source commit, explicit failure dispositions
and one-day retention. No artifact success is claimed before downloading the
actual run's evidence. A defect must preserve the failed run, receive a reviewed
source fix, and run a new source revision; unchanged samples are not rerun to
select a passing record.

## Remaining acceptance limits

The prior17-case Pyodide browser CI is a separate passing result
(run40835892964). Ordinary isolated
[run40848107576](https://github.com/dlabmapo-web/codebuddy-platform/actions/runs/40848107576)
at source19ae8a29 completed successfully, verified on2026-10-30:17 browser
cases passed; the paired Linux acceptance job was skipped. Its capability
job does not establish native execution acceptance. This task has not
executed complete application/native E2E, paired100-sample cohorts, mixed-load
p95 or production host equivalence. Release signatures, activation, performance
acceptance and every production gate remain unverified unless separately
executed. The disposable kernel stage cannot close those gates.
