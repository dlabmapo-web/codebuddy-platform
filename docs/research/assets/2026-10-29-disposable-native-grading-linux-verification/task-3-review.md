# Task 3 source review

Reviewed base `40df68c2d9b335d17fa6594f33331c6a029140ea` through head `46647577fbbb3c5bf1b449753bb891c3a4ddc04e` in the supplied complete diff, Task 3 brief, and implementation report. This is the CODE/local-check source gate only. Actual feature-branch push, Linux workflow execution, downloaded evidence and final evidence closure belong to the controller and remain **unverified**; their absence is not a missing code deliverable or a native success claim.

## Verdicts

- **Spec Compliance: Request changes.** One bounded first-failure evidence path is missing before the wrapper begins.
- **Task quality: Request changes.** The implementation otherwise follows the intended privilege, authority and cleanup boundaries; resolve the concrete workflow evidence gap below before approval.

## Strengths

- `.github/workflows/native-grading-kernel.yml:2` limits execution to the authorized feature-branch push; lines 5–15 enforce contents-read permission, non-cancelling concurrency, Ubuntu 24.04, a 45-minute budget and the explicit disposable guard. No PR trigger, deployment environment, deployment credentials or continue-on-error was added. Lines 28–34 select only the summary artifact with one-day retention.
- `deploy/scripts/grading/ci/run.sh:7`, `:16`, `:53` and `:59` capture setup-node's actual absolute executable, clear the sudo environment, run the host guard, and pass only the specific Node source assignment into prepare. The wrapper's prepare/observe/kernel/cleanup CLI arguments and fixed evidence paths agree with the producer APIs.
- `deploy/scripts/grading/ci/run.sh:21` preserves primary, observation, cleanup, infrastructure, collection and finalization outcomes; diagnostics are captured before cleanup, and the original primary failure wins exit precedence. `deploy/scripts/grading/ci/evidence.py:326` retains actual statuses even when privileged collection emits no valid JSON.
- `deploy/scripts/grading/ci/evidence.py:99`, `:112`, `:145` and `:375` implement guarded fixed-root collection, dirfd/no-follow reads, owner/mode/regular-file/single-link/size checks and exclusive summary creation. The root-owned report is the authority; `:168` validates projected successful reports using the real kernel validator, while worker copies cannot establish success. Payload captures are reduced to byte counts/hashes and unknown fields are excluded.
- `deploy/scripts/grading/ci/evidence.py:225` bounds diagnostics to the validated owned UID and the two exact daemon/broker units before cleanup, with time/byte/message limits and sensitive-assignment redaction. This follows the controller's explicit permission for infrastructure journals and does not query worker, container or broad host logs.
- `.dockerignore:33` excludes the full CI controller tree; `deploy/scripts/grading/tests/test_build_context.py:11` extends the existing real synthetic BuildKit COPY test with current and nested future CI canaries while retaining the safe package fixture.
- The implementation report and `docs/research/2026-10-29-disposable-native-grading-linux-verification.md:3` clearly distinguish local contracts from pending native execution and wider acceptance gates.

## Critical

None found.

## Important — blocks approval

### I1. Failures before the wrapper produce no first-failure summary artifact

**Evidence:** `.github/workflows/native-grading-kernel.yml:23` through `:27`; `deploy/scripts/grading/ci/run.sh:12`, `:40` and `:49`.

The workflow runs frozen installation, `pnpm prepare:grading`, the CI contract suite and the BuildKit context test as separate prerequisite steps before `run.sh`. If any one returns nonzero, GitHub's normal success condition skips the wrapper. Consequently its output directory, EXIT trap and finalizer never run. The always-run upload at workflow lines 28–34 then finds no `summary.json` and reports a second missing-file failure. There is no bounded downloadable record of the original setup/test stage, exact source revision or native checks being unexecuted.

This is a concrete gap in the Task 3 requirement to upload relevant first-failure diagnostics even on failure. Existing job logs retain the failing step, but the promised summary artifact does not exist. In particular, the duplicate pre-wrapper `pnpm prepare:grading` can fail before the wrapper's own `dependencies` stage has a chance to record it.

**Required change:** Ensure pre-wrapper prerequisite failures also reach a bounded summary finalizer, for example by recording step outcomes and running a safe always-run fallback when no wrapper summary exists, or by moving these prerequisites under the evidence lifecycle. Preserve the first failed stage and source commit, explicitly mark native execution unexecuted, keep the job failed, and keep raw dependency/test output and secrets outside the artifact. Add a focused contract covering a prerequisite failure that skips native execution yet leaves an uploadable failure summary.

## Minor

None requiring action.

## Verification and limits

Read the complete supplied diff (the tool-truncated middle was retrieved separately), brief and report. Inspected unchanged producers only to resolve concrete integration questions: CLI signatures, Node handoff, fixed report/observation/cleanup paths, successful report validation, exact diagnostic account/unit ownership and Docker COPY inputs. No source changes, provisioning, pushes, remote runs or existing-suite reruns were performed. No focused execution was necessary to establish I1: its prerequisite/default-step-condition control flow is explicit in the workflow. The report's 60 CI contracts, 41 runtime tests and real BuildKit local result are reported evidence, not independently rerun results and not proof of Linux kernel execution.
