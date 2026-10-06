# Grading and recovery follow-up — 2026-10-06

Branch: `fix/auth-google-login-password-recovery`. Code commit: `73aa8d2`.
This report supersedes the configuration and cleanup status in the initial browser report. Production remains on v2.0.27 / 2ffa32a; the new code is not deployed.

## Actual Chrome results this follow-up

Used the user's existing Chrome profile and John account. No protection was disabled and no CAPTCHA was bypassed.

- Enabled Dlab-Mapo's existing server-sample feature, refreshed the workspace and observed server Queued/Running, disabled Submit/navigation and Stop during Test run.
- Tower bounded four-second monotonic loop: five public sample summaries said “Skipped the comparison because the program did not finish”; two samples with 60-second limits completed and displayed wrong output. The server path ran, but precise timeout presentation **fails** in the deployed batch panel.
- Tower reference solution: all five intact public samples displayed matching output; the two damaged public samples displayed generic skipped results. Only seven public samples appeared (fixture positions 1, 3, 4, 5, 6, 8, 9), with no hidden inputs or expected outputs rendered.
- Restored John's original Tower draft and observed Saved. No Submit clicks in this follow-up, so no additional official attempts. Earlier six test submissions remain unchanged.
- Recovery: earlier password form was still blank. Requested another email for `qa-92b144b720cd` using the deployed form; observed Sending and Check your email. Opened the newly delivered link, clicked Continue and reached Choose a new password.
- Password entry/save is pending user handoff. New-password login, old-password rejection and reused-link rejection have **not** passed. The browser tool explicitly requires the user to enter, confirm and submit a changed credential. No existing user's password was changed.

The initial report separately records the previously completed Google login, Tower 78/100, Card correct/wrong/runtime/timeout submissions, Rods 100/100, and refreshed historical review results. Those were not rerun here.

## Backend and local evidence (not browser passes)

- Audit `1b12b87f-61ca-4980-9c89-2c02a3e7a364`, 09:14:08 UTC: `academy.feature.updated`, SERVER_SAMPLE_CHECKS=true, via the existing audited AcademyFeaturesService under the authorized academy manager.
- Ephemeral server records for the actual browser runs: bounded probe produced five TIME_LIMIT at configured 3,000 ms and two WRONG_OUTPUT at configured 60,000 ms. Reference code produced five PASSED and two RUNTIME_ERROR. These records corroborate execution; they do not make the faulty UI verdict presentation pass.
- Read-only progress check: Tower unchanged at one attempt, best 78, seven passed, IN_PROGRESS, revision 6. All three saved drafts exactly matched their preserved originals.
- Actual fresh recovery email delivered at 09:24:05 UTC, from no-reply@mail.coveedu.com, subject Reset your password. Mailbox is controlled and disposable.
- Focused API tests: 49 passed across LearnService, sample snapshot and sample runner; prior focused evaluator/capacity batch also passed (35 tests including overlapping runner tests). Web narration/local verdict tests: 43 passed. API and web TypeScript checks passed; changed web files passed ESLint; git diff whitespace check passed. No claim of new browser verification for undeployed code or a new full sandbox benchmark. Database/Redis integration suite was not run.

## Configuration and code

Root causes: the rollout flag was off, and the existing server path explicitly excluded legacy grading at both workspace advertisement and admission. This was the intended initial rollout behavior, not a sandbox protocol mismatch. Separately, batch UI discarded server narration and rendered timeout/runtime verdicts as generic skipped comparisons.

- Dlab-Mapo SERVER_SAMPLE_CHECKS is now enabled. Other academies unchanged.
- Both supported modes use the enabled server path. Legacy snapshots use Submit's runtime identity, per-case execution/memory limits, default output ceiling and exact output normalizer; enhanced comparison stays unchanged.
- Preserve server verdict messages, stderr and truncation/staleness notes in per-sample batch results. No new translations needed.
- Existing authorization, public-case selection, revision checks, idempotency, cancellation, rate limits and reserved official-grading capacity remain in place. Sample checks still write no official submissions or progress.

Deploy `73aa8d2` (or a release containing it) to the judge worker **first**, retiring all old workers before new legacy jobs can be admitted; then deploy API and web. New workers accept older enhanced snapshots. No schema migration or sandbox-protocol change is needed. Rollback starts by disabling the academy flag through the same audited service and draining active sample jobs before reverting worker code.

After deployment, repeat Card correct/wrong/runtime and bounded four-second Test run, alongside Submit; verify explicit timeout/error messages, Stop/loading behavior, no hidden cases and unchanged sample-only attempts. Also recheck enhanced Tower narration. This production verification is blocked on deployment, not claimed complete by local checks.

## Exact Tower repair awaiting approval — NOT APPLIED

Live recheck: exercise revision **6**, exercise updatedAt **2026-10-06T01:36:18.236Z**, comparator budget **100 ms**. Both before-input and before-output SHA-256 values still match the validated private plan. Material updatedAt differs (01:36:18.269Z); the authoring concurrency guard uses the exercise timestamp.

Private, Git-ignored files (mode 0600 for the new files):

- `packages/api/.migration-artifacts/grading/2026-10-06-tower-full-size-repair-plan.json` — existing exact replacement fixtures.
- `packages/api/.migration-artifacts/grading/2026-10-06-tower-pre-repair-backup.json` — fresh complete definition and four progress records.
- `packages/api/.migration-artifacts/grading/2026-10-06-tower-repair-publication-payload.json` — concrete full authoring payload, validated by updateProgrammingExerciseSchema, **8,046,208 bytes**, SHA-256 **88b63cb5b6b485d65491b9c6888aaa3384940123152a3719e8a22d4c288f5ec7**.

The payload replaces only the contents/expected outputs of positions 8 and 9 with complete 10,000- and 500,000-item inputs and changes comparatorTimeLimitMs **100 → 1,000**. These are new valid fixtures: preserve the complete prefix, discard its possibly partial final token, extend with unused descending heights, recompute all receivers. They are not recovered missing originals. All replacement outputs/counts/hashes were independently recomputed and checked again locally. Positions 8/9 remain SAMPLE, weight 1, STDOUT, 60,000-ms overrides, no soft limits. Other definition fields and case contents stay the same. Historical snapshots never change.

| Case | Input SHA-256 | Expected-output SHA-256 |
| --- | --- | --- |
| 8 | f436a028c70f275fcf2338b7a0015f765d698679e1bb66faa8e84be2546135d2 | 73241466f87c012195c22de78a6c168a463e49679a3323cc7240db3289800cf5 |
| 9 | d5e50c8ca9214f0f2e3a8b2f9764847f03bf612c5e34e35267a8c2f111e6b184 | a8632dc40598474ec068658e6c5ce8475a60733de99440a6d23ebb2c5ec937a8 |

Supported execution, only after explicit approval:

1. Recheck revision, exercise timestamp, all definition hashes, progress and in-flight official submissions; pause if any differ. Refresh the private backup. Do not overwrite concurrent student work.
2. Publish the prepared payload through CourseService.updateExercise with normal manager authorization/audit, preserving the optimistic timestamp guard. Publication advances **6 → 7**, bumps course content revision and recreates test-case/hint rows (IDs change). It resets **all four** progress rows to NOT_STARTED, attempts 0, best score/passed 0, revision 7, firstSolvedAt/lastAttemptAt null. John loses the current progress display of attempt 1 / best 78; the other three currently have zero progress. Drafts and old submission/code/case snapshots remain.
3. Optional, **separately approved** supported RegradeService plan/execute: creates new repair submissions against revision 7. Current eligibility is four students, from latest PASSED/FAILED snapshots: John revision-6 score 78, and three prior snapshots with revision/score 4/78, 3/67, 3/0. Later ERRORED records do not exclude an older terminal attempt. Review the actual post-publication plan before execution. This is not limited to John.
4. Regrade leaves originals immutable and hidden from mutation, and ordinary answer history filters repair rows. It rebuilds current results without incrementing attempts: after publication those counts remain **0**, not restored historical counts. Successful repairs can award exercise/lecture/course points and alter rankings; do not promise four passes or an unchanged point balance. If preserving current attempt counts is required, stop: ordinary publication plus supported regrade does not provide that behavior. Do not invent a direct database progress copy.
5. Verify new hashes, audits, revision, immutable historical snapshots, progress and browser grading after the approved operations. Never rewrite old history to make a test pass.

No production fixture update, progress reset, regrade plan creation or regrade execution occurred in this follow-up. The 1,000-ms comparator change is explicitly part of the approval scope; the prior full-size diagnostic is prior evidence, not a new production test here.

## Temporary data and session status

Temporary Cove profile, Supabase identity and mail.tm mailbox for `qa-92b144b720cd` are retained only to finish the pending handoff. Their credentials and recovery links are outside Git and omitted from this report. Cleanup has **not** occurred. After the user saves the password: verify new login, old-password rejection and replay of the delivered link; then delete the isolated profile/auth identity and mailbox, verify absence, remove temporary secret files and sign John back in.

John was signed out to open the temporary recovery flow. His original tab and all drafts are preserved; the shared Chrome session cannot be restored to John while the temporary password-form handoff is still pending. Restore it after finishing or abandoning recovery, not while claiming recovery is complete.
