# Task 1 scoped re-review

Scope: M1 and new breakage introduced by `5d2c00d1e897728b9d803d6bfcc9bba6eef7096d..eefbad9b804bf79a200a75f366f6d92d8b963e47`. Reviewed the supplied fix diff once, the original task brief, and the appended fix evidence in `task-1-report.md`. No suite reruns or host provisioning performed; only this review artifact was written.

## Finding verdict

**M1: ADDRESSED.** The already-cleaned receipt branch now checks both fixed account names (`cove-grading`, `cove-grading-ci-worker`) and both fixed group names (`cove-grading-control`, `cove-grading-ci-worker`). Any successful lookup raises a refusal before the branch can return `alreadyAbsent:true`. Only `KeyError` means absence; other lookup errors propagate. These read-only checks neither delete nor alter reappeared principals, and existing path-reappearance checks remain effective.

The added regression test exercises all four reappearance cases and asserts that administrator commands, user commands, and recursive removal are not called. The idempotence fixture now explicitly models absent principals. The appended report records RED failures for the four new cases and GREEN for all 19 tests plus compilation/syntax/diff checks; those results were assessed as supplied evidence, not independently rerun.

## New breakage

None identified in this fix.

## Out-of-scope observations

None raised. Unchanged implementation was not reopened, and disposable Linux execution remains unverified by this re-review.

## Round verdict

**PASS — M1 addressed; no new fix-induced findings.**
