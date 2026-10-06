# Grading deadline investigation — 2026-10-06

Branch: `fix/auth-google-login-password-recovery`, together with the Google
sign-in and password recovery fixes.

## Production evidence

Investigated the screenshot's `[도전 기출문제] 탑` exercise,
material `c71fc00f-247d-4e27-803c-2ec939621d75` in `dlab-mapo`.
The 23 errored submissions inspected from the preceding seven days recorded
`TOTAL_DEADLINE`. Recent tower submissions passed the first three cases and
skipped the rest, ending after approximately 6–7 seconds despite a 60-second
total budget and 5 seconds of infrastructure overhead.

The shared enhanced case evaluator bounded the entire engine request by the
case limit plus 2,500 ms. The engine request includes acquisition of a fresh
isolated runner, execution, and retirement. Student execution has its own
timer once the interpreter is ready. After the initial warm runners were
consumed, replacement startup exceeded the evaluator's premature timer.

The fix waits for the engine within the remaining absolute grading deadline.
The engine's student execution limit, cumulative execution budget, comparator
deadline, memory/output limits, and sandbox isolation remain enforced.
If the overall deadline expires, the caller continues holding its execution
slot until the abandoned engine request settles. Both official submissions
and public sample checks use this evaluator.

## Verification

- New deterministic evaluator regressions failed on the original code and
  pass with the fix: slow acquisition followed by a pass, slow acquisition
  followed by a student time-limit verdict, overall deadline with an occupied
  runner, and an execution limit shortened by the overall deadline.
- Updated the existing cleanup regressions to exceed the actual overall
  deadline, rather than relying on the removed premature timer. The sample
  regression also checks that the capacity slot remains occupied after the
  timeout has been recorded.
- 145 tests passed across `case-evaluator`, `grading.service`,
  `sample-check.runner`, `execution-capacity`, `sandbox`, and `pyodide-engine`.
- API TypeScript check and judge-worker build passed. `git diff --check` passed.
- The separate database-backed weighted grading suite was not run: no
  disposable integration database was configured.

Replayed frozen submission `981e9534-c97d-4919-8d15-360ddf568bea` through the
actual production Linux sandbox and CPython comparator. The coordinator read
the existing snapshot and produced diagnostics; it did not persist a grade,
attempt, progress change, or reward. Student code ran only inside the sandbox.
The candidate evaluator was imported into that diagnostic process; the live
worker was not changed or restarted.

| Replay | Result |
| --- | --- |
| Deployed evaluator, unchanged frozen cases | Cases 1–3 pass; case 4 returns deadline at 6,221 ms |
| Fixed evaluator, unchanged frozen cases | All 9 receive verdicts in 33,593 ms; 7 pass, cases 8–9 return `IndexError` |
| Fixed evaluator with candidate fixture replacements | All 9 pass within the original overall deadline |
| Saved author solution on both replacement fixtures | Both execute successfully and match via the real comparator |

This was a backend/sandbox replay, not an authenticated browser submission.

## Separate fixture defect and reviewable repair

The final two exercise inputs are already incomplete in the database, before
the judge reads them. Both stop at exactly 50,000 characters:

| Case | Declared heights | Stored height tokens | Candidate complete heights |
| --- | ---: | ---: | ---: |
| 8 | 10,000 | 5,623 | 5,622 |
| 9 | 500,000 | 5,626 | 5,625 |

Their expected outputs are also inconsistent with the stored input length;
case 9's expected output stops at 50,000 characters too. This produces an
ordinary Python `IndexError` even after the judge deadline is fixed.
The private original MVP migration snapshot contains only the first two
tower cases, so it cannot restore these later fixtures.

A candidate repair retains each complete height token, drops the possibly
truncated final token, corrects the declared count, and recomputes the nearest
left receiving tower. Generated answers were checked against the complete
prefix of the existing expected output, then against the saved author
solution in the production sandbox. The same student's code passes all nine
cases with these candidates. Case ordering, visibility, weights, comparator,
and limits are preserved. The two hidden cases remain hidden.

These are valid smaller replacement cases. They do **not** restore the
original 10,000/500,000-size coverage. Restoring the largest case also requires
considering the current 100,000-character authoring limit and 256 KiB runner
output cap; a complete 500,000-tower answer exceeds that output cap even with
single-digit receivers. No grading limits were increased for this repair.

The reviewable plan, including before/after fixtures, source hashes, expected
revision 6, and the expected modification timestamp, is saved with owner-only
permissions at
`packages/api/.migration-artifacts/grading/2026-10-06-tower-case-repair-plan.json`.
It is gitignored because it includes grading data. Do not publish the raw
plan or diagnostic snapshots.

The plan is **not applied**. Four student progress records currently belong to
this material. The normal authoring update increments its grading revision
and resets those progress records. A follow-up read confirmed that all four
currently have zero attempts and zero best score at revision 6; none is solved.
Recheck this state before publishing, since students may work in the meantime.
Existing submissions keep their immutable case snapshots.
No automatic regrade or live content change was performed.

## Delivery state

The evaluator fix and regression tests are ready on the combined branch.
Production still runs the previous evaluator and original fixture data.
Deploying the code addresses the premature `채점 불가` failure. Publishing
reviewed replacement fixtures (or restoring complete original fixtures) is a
separate required step before this exercise can receive reliable full grades.
The hidden-case notice is expected behavior, not a grading failure.

## Follow-up: enlarged limits

The user subsequently approved increasing input/output limits while keeping
runtime and memory bounded. The branch now supports 8 Mi-character case input
and expected output, 8 MiB stdout, a 64 MiB sandbox frame, and a 1,000 ms
default comparison budget for new enhanced problems. Aggregate and encoded
authoring limits remain bounded. Older enhanced submission output caps and
comparison budgets remain frozen; clipped stdout cannot receive a pass.
Protocol 2 prevents an updated worker from using an older sandbox that could
ignore the requested output cap.

The original small-fixture proposal above is superseded by a private **full-size**
plan: `2026-10-06-tower-full-size-repair-plan.json` in the same artifact directory.
It contains valid 10,000/500,000-height fixtures, preserving each complete
original prefix and adding unused heights. Both passed trusted reference code
through the real local sandbox and comparator. No live data was modified.

See [the limits, authoring checklist, and release notes](../operations/2026-10-06-grading-limits-and-authoring.md).
