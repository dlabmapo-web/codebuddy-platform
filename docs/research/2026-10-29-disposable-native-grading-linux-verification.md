# Disposable native grading Linux verification — 2026-10-29

Status: **local contracts pass; actual disposable Linux execution is pending**.
No native containment, OOM, cancellation, recovery or production acceptance
success is claimed. The controller owns the feature-branch push, actual workflow
observation, evidence download and evidence closure after source review.

## Source and execution

- Source base: `40df68c2d9b335d17fa6594f33331c6a029140ea`.
- Branch: `feat/production-native-grading`.
- Workflow: `.github/workflows/native-grading-kernel.yml`.
- Trigger: pushes to that branch only; Ubuntu24.04 AMD64 hosted runner; 45-minute
  timeout; read-only repository permission; no deployment environment/credentials.
- Concurrency queues newer revisions without cancelling the active first record.
- Actual run URL, Linux source commit, artifact digest and runner identity:
  **pending; no run has been started by the implementer**.
- Production remains untouched. No merge, deployment or activation is authorized
  by this verification stage.

## Local verification

These results establish source contracts and synthetic build-context behavior;
they do not establish Linux execution or containment.

| Check | Local result |
| --- | --- |
| CI Python contracts, including actual JS transport/schema helpers | 64 pass |
| Runtime TypeScript build and runtime tests | 41 pass, zero skips |
| Real BuildKit synthetic COPY-context export | pass |
| Python compilation, shell syntax and whitespace checks | pass |

The BuildKit test exports an actual scratch `COPY .` context containing only
synthetic fixtures. All CI controller canaries, including a nested future file,
are excluded by `.dockerignore`; the safe package fixture remains.

## Required actual case execution

| Required group | Required count | Actual Linux result |
| --- | ---: | --- |
| Functional cases, CPython and Pyodide | 16 | pending |
| Native isolation and charged scratch | 1 | pending |
| Native learner memory and PID limits | 2 | pending |
| Native cancellation | 1 | pending |
| Retained receipt and active broker restart | 2 | pending |
| Distinct guest-parent and control-local OOM | 2 | pending |
| Total | 24 | pending |

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
The actual values, system reserve observations and cleanup receipt are **pending**.

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

The prior17-case Pyodide browser CI is a separate result. This task has not
executed complete application/native E2E, paired100-sample cohorts, mixed-load
p95 or production host equivalence. Release signatures, activation, performance
acceptance and every production gate remain unverified unless separately
executed. The disposable kernel stage cannot close those gates.
