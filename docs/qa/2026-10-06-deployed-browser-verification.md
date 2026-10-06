# Initial deployed browser verification — 2026-10-06

Historical first-pass report. See `2026-10-06-grading-recovery-followup.md` for subsequent configuration changes, code fixes and the current recovery status.

Tested the actual deployed site in the user's regular Chrome profile and existing John session using browser controls. No browser pass below is inferred from unit tests, screenshots alone, or backend requests. Production images identify release `v2.0.27`, commit `2ffa32a`, which contains grading commit `0f37b4a`.

## Actual browser results

| Flow | Observed result |
| --- | --- |
| Tower Test run | First five public examples executed with matching output; enhanced comparison explicitly deferred to Submit. Large public examples 6–7 failed locally on incomplete inputs. Not a full pass. |
| Tower Submit | Observed Preparing / judge running, disabled controls, intermediate 3/9 and 7/9, and final 78/100. Cases 1–7 passed; 8–9 runtime errors. Completed in 25.9 seconds by persisted timestamps; no premature judge-unavailable error. |
| Card exercise, correct | Test run matched; Submit accepted, 100/100, 9/9. |
| Card exercise, `print(-1)` | Test run mismatch; Submit 0/100, all nine wrong output. |
| Card exercise, explicit RuntimeError | Test run showed error guidance; Submit 0/100, all nine runtime error. |
| Card exercise, bounded 4-second monotonic loop | Test run ran to completion and reported output match. Submit enforced its limit: first case time limit exceeded at 3,050 ms, remaining eight skipped, 0/100. |
| Rods exercise, correct | Both public samples matched; Submit accepted, 100/100, 9/9. |
| Hidden-case UI privacy | Tower's two, card's eight, and rods' seven hidden cases showed verdicts/timing, without input or expected/actual-output detail. This verifies rendered UI, not a separate network-payload privacy audit. |
| Refresh / history | Plain tower editor refresh cleared the result panel. Answer records retained all six test submissions. Opening tower Review (and selecting the original class) restored 78/100 and all case verdicts; refreshing that review retained them. |
| Google entry | Google icon present after OR and before signup in login UI. Click showed Connecting to Google, then the existing Google session automatically completed the callback to a signed-in Cove welcome page. Existing account has no username, so onboarding remains incomplete. No credentials or account settings were changed. Signed out afterward. |
| Recovery request | Public deployed form submitted for one controlled temporary user. Cloudflare completed normally in regular Chrome without manual solving or protection changes. Sending state followed by Check your email. |
| Recovery delivery | Controlled mailbox actually received Reset your password from no-reply@mail.coveedu.com at 08:53:46 UTC. |
| Recovery confirmation | Delivered production link opened confirmation interstitial. Continue reached deployed /reset-password with both password fields and Set new password. No cookie edits or URL-origin substitution. |
| Password save / new-password login / reused link | Pending user handoff. Computer-use rules require the user to enter, confirm, and submit a changed password. These flows have NOT passed yet. |

## Test submissions and progress impact

Class context: `f4e68195-0760-4b7b-9102-929a196bc238`.

| Exercise / probe | Submission ID | Score |
| --- | --- | ---: |
| Tower, original algorithm with output corrected to print(*result) | d2f4fb7f-6e92-4ca4-ab9f-363dce4c0f99 | 78 |
| Card, correct | 9d80855b-2050-4b67-bfeb-5dec7ab61caf | 100 |
| Card, wrong output | 26179ee4-8f34-4d00-a1a1-72d72b786d4d | 0 |
| Card, runtime error | 4e63eba0-306f-4982-ab18-ea78dc9220ad | 0 |
| Card, time limit | 200da267-6d9d-4028-9714-fce596326eb7 | 0 |
| Rods, correct | 2bbd8ebe-7eda-45aa-81a0-a8ef5cf3cdcd | 100 |

These are real production student attempts, intentionally retained. Tower revision-6 attempts increased from 0 to 1, best score 0 to 78, best passed 7, IN_PROGRESS. Card attempts increased 2 to 6, retaining SOLVED and best 100. Rods attempts increased 2 to 3, retaining SOLVED and best 100. The course remained 7/29 solved. Learning time, recent-work ordering, and activity statistics also changed through real use. The dashboard's 30-day submission metric changed from 6/9 passed to 8/15 passed.

All three original drafts were copied before editing, restored verbatim through the editor, and observed Saved. A subsequent database read confirmed the restored drafts persisted, including tower's original print(result). No old submission was regraded or deleted.

## Backend / local diagnostics, separately identified

Read-only production checks confirmed revision 6, exercise updatedAt `2026-10-06T01:36:18.236Z`, four progress records, persisted submission outcomes, and the existing disabled SERVER_SAMPLE_CHECKS academy flag. Local Test run is therefore not exercising the shared server sample-check evaluator in this academy.

Live tower cases 8 and 9 each contain exactly 50,000 input characters. They declare 10,000 and 500,000 heights but contain 5,623 and 5,626 tokens. Both are SAMPLE visibility. The two hidden cases are different cases; hidden data was not published.

The private full-size repair plan's before-input and before-output hashes still match live data. Its replacement counts and every expected receiver were independently recomputed locally and verified. This is a fixture validation, not a new production sandbox benchmark.

Previously reported protocol-2 and full 500,000-item / 3.39 MB sandbox diagnostics remain prior evidence, not new browser tests or rerun diagnostics in this session.

## Reviewable fixture repair — not applied

Exact private artifact in the main checkout:
`packages/api/.migration-artifacts/grading/2026-10-06-tower-full-size-repair-plan.json`.

Replace only cases 8 and 9 with complete 10,000 / 500,000-height fixtures. Preserve each complete original prefix, remove the possibly partial last token, append unused descending heights, and recompute expected output. These are new valid fixtures, not recovered missing original data. Preserve ordering, visibility, comparator, weights, and limits. Correction: supported authoring publication recreates test-case rows, so case IDs change; historical submission case snapshots remain immutable. The existing plan also changes comparatorTimeLimitMs from 100 to 1,000.

| Case | Replacement input SHA-256 | Replacement output SHA-256 |
| --- | --- | --- |
| 8 | f436a028c70f275fcf2338b7a0015f765d698679e1bb66faa8e84be2546135d2 | 73241466f87c012195c22de78a6c168a463e49679a3323cc7240db3289800cf5 |
| 9 | d5e50c8ca9214f0f2e3a8b2f9764847f03bf612c5e34e35267a8c2f111e6b184 | a8632dc40598474ec068658e6c5ce8475a60733de99440a6d23ebb2c5ec937a8 |

Normal publication increments revision 6 to 7 and resets four progress records. Three remain NOT_STARTED with zero attempts/score; John's record now has one attempt and best score 78. Thus the earlier claim that all four records were empty is stale. Immutable submission history remains. Recheck immediately before any approved publication. No publication or historical regrade was performed.

## Remaining work and cleanup

- Finish user-assisted password saving, browser login with the new password, and used-link rejection.
- Delete the isolated temporary Cove user, Supabase identity, and controlled mailbox after those checks; currently retained only to complete this handoff. Existing users' passwords are unchanged.
- Restore John's signed-in browser session after recovery tests. Currently the auth workflow is at the temporary user's reset form.
- Consider whether Test run should use the existing server-sample-check feature for this academy, or clearly communicate its different runtime limits. No feature flags changed.
- Plain editor result persistence differs from submission Review. No code change made for that behavior.
- Publish the reviewed fixture repair only after approval of its progress reset impact, then rerun the full browser matrix.

The first pass only produced this report in an isolated worktree. The follow-up continues on the same combined branch in the main checkout.
