# A teacher score finishes the programming problem

Date: 2026-11-12

Publishing any valid teacher score now finishes a manual programming problem, including zero. The grading sidebar and legacy grading form no longer ask for Learning complete / Needs more work. Student results, review-history entries and material status badges no longer display those separate learning outcomes. They show the grade, feedback and graded state. Notes remain optional.

## Current and historical submissions

The shared publication schema defaults omitted completion to true and normalizes legacy true/false input to true. New reviews therefore store completed=true. The shared current-assessment parser treats an existing valid GRADED snapshot as complete, so the existing batched readers count it as finished. Pending submissions remain pending, and newest-attempt/current-revision eligibility remains unchanged.

This requires no migration, score rewrite or historical-review rewrite. Review rows retain their original completion values for audit purposes, while the retired choice is hidden in the UI. Idempotent replay ignores that retired request field and still verifies submission, version, score, feedback and reason. A legacy graded snapshot with completed=false is verified to return complete, count in history/outline totals, retain its stored JSON and immutable review row, and replay without a new review.

All database test writes use disposable PostgreSQL. No user grades or review rows were changed. The development API watcher reloaded the updated shared validation. No new SQL reads or polling were added; existing statement-count assertions remain **22/22 student materials** and **15/15 mixed work history** for small/expanded fixtures.

## Verification

| Check | Result |
| --- | --- |
| Full shared suite | 940 passed, 56 files |
| Focused grading/result/history-status tests | 10 passed, four files |
| i18n catalogs | 144 passed; no stale keys/copy markers |
| Web and E2E typechecks | Passed |
| Changed-component ESLint | Passed |
| Disposable migration/API integration | 31 passed, including zero, legacy snapshots, completion totals and replay |
| Chromium / WebKit workflow | Both passed, with runtime-error checks enabled (6.0 min total) |

Reproduce with `bash packages/api/scripts/test-manual-programming.sh`. Browser coverage asserts no completion controls, a single Graded history state, reason-free grade updates and student live-result updates across Teacher, Team Lead, Manager and tutoring flows. Existing bounds/conflict/permission coverage remains in place.

## Screenshots

All screenshots use disposable fixtures.

- [Score and feedback grading form](../qa/assets/2026-11-12-score-completes-programming/chromium-teacher-history-grading-sidebar.png)
- [Mobile grading form](../qa/assets/2026-11-12-score-completes-programming/chromium-teacher-grading-sidebar-mobile.png)
- [Student score with a single Graded badge](../qa/assets/2026-11-12-score-completes-programming/chromium-student-manual-result-mobile.png)
- [History after grading](../qa/assets/2026-11-12-score-completes-programming/chromium-history-graded-after-correction.png)
