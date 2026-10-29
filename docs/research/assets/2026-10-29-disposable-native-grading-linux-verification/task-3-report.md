# Task 3 implementation report

Status: CODE and local checks complete; actual Linux execution, controller source
review/push, downloaded evidence and final evidence closure remain pending.
No native/kernel success is claimed by the local fixture results.

Base: `40df68c2d9b335d17fa6594f33331c6a029140ea`.
Worktree: `/Users/jurabeksamiev/Developer/codebuddy-platform-native-grading`.
Branch: `feat/production-native-grading`.
Commit: `46647577` — `test(grading): wire disposable Linux kernel CI evidence`.
The working tree was clean after this scoped commit (scratch report is ignored).

## Scoped outputs

- `.github/workflows/native-grading-kernel.yml`: exact feature push, Ubuntu24.04,
  45minutes, contents:read, concurrency cancel=false, frozen pnpm/Node22 setup,
  local contracts/BuildKit canary, disposable kernel wrapper, always-run
  one-day bounded summary upload. No PR trigger, production environment,
  deployment credential, continue-on-error, publication or production mutation.
- `deploy/scripts/grading/ci/run.sh`: empty-based narrow sudo environment,
  setup-node source handoff through GRADING_CI_NODE_SOURCE only, read-only host
  guard, dependencies/images, prepare/observe/kernel and EXIT-trap observation,
  pre-cleanup infrastructure snapshot, exact cleanup, collection/finalization.
- `deploy/scripts/grading/ci/evidence.py`: privileged fixed-path bounded reads,
  root kernel authority, allowlisted JSON projections, sanitized lifecycle
  diagnostics and exact-unit journal excerpts; unprivileged final summary write.
- `deploy/scripts/grading/ci/test_kernel.py`:14 additional collector/workflow/
  lifecycle/diagnostic contracts; original Task2 tests retained.
- `.dockerignore` and `deploy/scripts/grading/tests/test_build_context.py`: entire
  CI controller directory excluded; real synthetic BuildKit export tests current
  controller names and a nested future file while retaining safe package.json.
- `docs/research/2026-10-29-disposable-native-grading-linux-verification.md`:
  truthful local results and explicitly pending actual run/cases/identity/cleanup.

## TDD RED/GREEN

1. Added a docstring-only importable evidence.py and initial contracts. The first
   run failed on absent collect/read_json/project_report/encode/write_summary,
   absent wrapper/workflow; the module import itself succeeded. One test fixture
   initially selected a fault case without stdout; corrected it to select an
   actual capture case, then verified projection behavior.
2. Implemented bounded collectors, wrapper and workflow. Focused35-case Task2+
   Task3 suite passed, including real structured YAML parsing via Node
   createRequire from the frozen web ESLint js-yaml dependency, JSON_SCHEMA and
   actual duplicate-key rejection. No YAML dependency or hand parser was added.
3. Extended the real BuildKit synthetic-canary test before editing .dockerignore.
   RED: exported COPY contained `deploy/scripts/grading/ci/run.sh`. Added the
   entire CI path to .dockerignore. GREEN: all CI/private canaries absent and
   safe package fixture present in actual exported filesystem.
4. Added lifecycle diagnostics at controller request. Exact reviewed invariant
   literals can survive; raw arbitrary stderr/source/env cannot. Added bounded
   journal subprocess checks for only the known UID and two owned service units,
   secret-redaction and metadata exclusion, malformed-collector fallback and
   actual output schema/required-case positive/negative contracts. A fixture
   initially used nonroot temporary-directory ownership for the privileged root
   boundary; explicitly mocked that boundary, preserving production ownership.
5. Self-review found and corrected status loss when privileged collection emits
   no JSON, plus a possible zero-primary/failed-root-report discrepancy. All
   original and new focused tests are GREEN after corrections.

## Final local verification

- `python3 -m unittest discover -s deploy/scripts/grading/ci -p 'test_*.py' -q`:
  **60 pass** (Task1 19 + Task2 27 + Task3 14).
- `python3 -m unittest discover -s deploy/scripts/grading/tests -p test_build_context.py -v`:
  **pass**, real local Linux BuildKit, synthetic context only.
- `pnpm --filter @cove/grading-runtime test`: TypeScript build and **41 pass**,
  zero skips. This is the existing runtime local suite, not kernel execution.
- `python3 -m py_compile deploy/scripts/grading/ci/evidence.py`: pass.
- `bash -n deploy/scripts/grading/ci/run.sh`: pass.
- `git diff --check`: pass.

## CLI and output contract

`bash deploy/scripts/grading/ci/run.sh` is the workflow entrypoint. Its initial
exact GitHub-hosted disposable environment guard and privileged read-only host
guard precede mutation. Dependencies and local AMD64 image builds finish before
provisioning. The wrapper captures `command -v node` before sudo and passes that
absolute executable only for prepare as GRADING_CI_NODE_SOURCE; no caller PATH,
PYTHONPATH, app or GitHub credential environment survives `sudo env -i`.

`evidence.py invoke --stage STAGE --diagnostics DIRECTORY -- sudo ...` runs the
fixed lifecycle calls unprivileged, discards stdout and drains stderr without
writing raw bytes. At most a fixed invariant classification is retained.
`evidence.py snapshot` is root/guarded, reads validated private state only to
identify the owned grading UID and account, and writes root-owned mode0600
`/var/lib/cove-grading-ci/infrastructure.json` before cleanup. This file is
additional bounded evidence beneath the retained state root; Task1 owned-file/
owned-path cleanup selection is unchanged.

Journal capture uses `journalctl --lines=40 --output=json
--output-fields=MESSAGE,PRIORITY _UID=UID _SYSTEMD_USER_UNIT=EXACT_UNIT` for only
cove-grading-docker.service and cove-grading-broker.service. Pipe reads cap64KiB
per unit and15seconds; output messages cap1KiB each; printable text is redacted
for sensitive assignments/credential URLs. Unknown journal fields are dropped.
No guest/container/worker/broad host logs are read. This is diagnostic-only.

`evidence.py collect --primary N --observation N --cleanup N --infrastructure N
--stage STAGE` is privileged and guard-bound, with no caller-selected input root.
It reads only root kernel, prepare/last observation, cleanup and infrastructure
JSON plus optional five fixed worker phase summaries. Root report mode0600,
owner0, regular file, single hardlink and no group/world write are mandatory.
Dirfd/O_NOFOLLOW walks reject any intermediate symlink, plus path escapes,
nonregular files, duplicate keys, oversized bytes and malformed projections.
Kernel report limit2MiB, observations1MiB each, phase summaries256KiB each,
cleanup64KiB, infrastructure128KiB; combined output at most20MiB.

The authoritative root report is projected and passed through Task2's real
validate_results for a success claim: exactly24 required cases, actual GATE/EXEC
bindings, effective ceilings, local OOM/victim/removal/receipt/source proof.
Convenience worker-host-proof/kernel copies and phase request/reply handshakes
are never read. Private state/configs/env/keys/raw source/output are excluded.
Every stdout/stderr capture is reduced to validated bytes/sha256.

`evidence.py finalize --directory DIRECTORY --primary N --observation N --cleanup
N --infrastructure N --collection N` runs unprivileged, records strict40-hex
GITHUB_SHA, preserves actual process statuses even if privileged collection
could not emit JSON, appends bounded lifecycle classifications and writes fresh
summary.json via no-symlink/O_EXCL output. Temporary projected pieces are removed.
The workflow uploads only summary.json, retention1day. Separate statuses:
primary, observation, cleanup, infrastructure, collection and finalization.
Primary wins shell exit precedence, then observation/cleanup/collection/finalize.
Infrastructure failures make collection fail while leaving other failures intact.

## Self-review and concerns

- Fixed literal diagnostics are derived from AST constants in reviewed controller
  source, avoiding a duplicated list of invariant strings or arbitrary error text.
- Setup-node Node22 is preserved by exact executable handoff, never broad sudo
  PATH/environment preservation. All administrative calls remain root guarded.
- Authoritative host proof never comes from worker-writable files. Success cannot
  be inferred from zero CLI exit codes or incomplete case lists alone.
- Additional diagnostics do not alter Task1 resource ownership, deletion scopes,
  broker/guest policy, accounting or fault semantics. Journal queries are exact
  owned service/UID filters; cleanup cannot destroy the only first-failure record.
- Optional phase files are marked as diagnostics and cannot establish success.
- No Next.js code/API or production runtime file is changed; no Next guide was
  required for this CI/Python/shell/YAML-only change.
- Actual Ubuntu packages, AppArmor/userns/controller/probe capabilities, image
  builds, service startup, actual24 cases and exact cleanup remain unexecuted.
  An unsupported capability fails; it is never skipped or called native success.
- The actual workflow may expose genuine integration defects. Preserve that
  failed run, fix a reviewed source revision and run the new revision; no
  repeated unchanged sampling or paid-runner escalation.
- App/native E2E, paired100-sample cohorts, mixed-load p95, production host
  equivalence and every release/activation gate remain unverified.
- No push, remote workflow, cloud provisioning, Mac provisioning, subagent,
  reviewer dispatch, merge, deployment or production action was performed.


## Review follow-up I1: prerequisite failure evidence

Fixed the Important first-failure gap from `task-3-review.md`. Stable workflow
IDs identify checkout, pnpm, Node, frozen install, grading build, local contracts,
BuildKit and the kernel wrapper. The always-run `evidence_summary` step is inline
Python stdlib only, independent of checkout and installed dependencies. Source
revision and actual outcomes arrive through explicitly named env values; no
GitHub expression is interpolated into shell/Python code.

When no wrapper summary exists, the fallback records the exact40-hex revision,
first failed/cancelled (or otherwise incomplete) workflow stage, sanitized actual
step outcomes and success:false. Wrapper skipped means native and cleanup are
unexecuted. A wrapper that started without a summary means native and cleanup
are unknown. Numeric CLI/cleanup statuses are null rather than invented; host
proof is false and evidence is empty. The fallback returns nonzero, preserving
or adding job failure instead of creating a green result.

An existing valid wrapper summary is read through bounded owner/mode/single-link/
regular-file/no-follow checks, duplicate/nonfinite-key-safe JSON validation,
source and status-shape checks, then preserved byte-for-byte and inode-for-inode.
No raw setup/test output, secrets or arbitrary environment values are retained.
Directories use dirfd no-follow traversal and exclusive writes, and the20MiB
limit remains. Unsafe/malformed/oversized existing paths fail without becoming
uploadable. A fixed `uploadable=true` output is emitted only after path safety;
the upload condition remains always-evaluated and additionally requires that
safe-path receipt, preventing upload-artifact from following an unsafe path.
The artifact path/one-day retention/production authority boundaries are unchanged.

TDD RED: added four regression tests before adding the fallback. All failed with
`Always-run prerequisite fallback is absent` (13 failing subcases across the
seven prerequisites, two existing-summary outcomes, three unsafe-path forms and
one missing-wrapper case). GREEN: the exact workflow inline script executes in
an empty synthetic workspace for each prerequisite failure, with no checkout,
Node package or repository-module dependency. Both failed and successful valid
wrapper records retain bytes and inode. A started wrapper with failure, success-without-summary, cancellation or an
unknown outcome records unknown native/cleanup; parent/file symlinks and oversized files are refused.
The existing structured YAML test also checks the guarded always-run upload.

Focused validation after the fix:

- `python3 -m unittest discover -s deploy/scripts/grading/ci -p test_kernel.py -k Prerequisite -q`: four pass, all16 subcases after adding success/cancellation/unknown outcome coverage.
- `python3 -m unittest discover -s deploy/scripts/grading/ci -p 'test_*.py' -q`:64 pass (four new Task3 regressions).
- Structured YAML parsing still uses frozen web ESLint js-yaml/createRequire,
  JSON_SCHEMA and duplicate-key rejection; inline code is executed by the tests.
- `git diff --check`: pass after removing inline-block blank-line whitespace.

Self-review: the fallback cannot establish native/cleanup proof or overwrite a
valid first record, cannot mask earlier failed steps, works without checkout,
and gates uploads on the guarded artifact path. Production/runtime/host
authority code is unchanged. No runtime or BuildKit retest was needed for this
workflow/test/documentation-only fix; their previous41-test and real-context
results remain local evidence. Actual Linux execution, controller push/download
and evidence closure are still pending. No subagents, push or provisioning.

Follow-up commit: `19ae8a29` — `test(grading): retain prerequisite failure summaries`.
Working tree clean after the three-file scoped commit; scratch report remains ignored.
