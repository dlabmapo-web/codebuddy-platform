# Student result cards and optional correction notes

Date: 2026-11-12

Teachers, Team Leads and Managers can update a published grade or learning outcome without writing a reason. In the grading sidebar, select **Learning complete** and click **Update grade**; the existing score can stay unchanged. The optional reason is under a collapsed disclosure. Existing notes remain visible in review history when present.

The shared request schema accepts empty or omitted notes, normalizes omission to an empty string and retains the 1,000-character limit. Migration `20261112164000_optional_programming_review_reason` removes the database's nonempty-correction-note condition while retaining its length check. Permissions, immutable submitted code, version/concurrency checks, idempotency and audit records remain intact. No read path, SQL statement count or refresh interval changes.

The migration was first verified in disposable PostgreSQL, then applied to the configured **development** database after confirming it was the only pending migration and matched the local API's configuration. The local API was restarted to load the updated shared validation. Existing user scores and completion flags were not changed; all grading writes during verification use isolated fixtures.

## Student presentation

Results remain in the existing output pane. Pending submissions use an amber clock, saved/pending state and a message to talk to the teacher. Graded results have a blue score card, separate green completion or amber needs-work badge, teacher feedback, reviewer/time and a contextual next step. Completed students are invited to continue; students needing more work are asked to discuss improvements with their teacher. The manual-grading request notice is shown while awaiting review, rather than after grading is complete. Color does not infer a pass threshold from the score.

Light/dark surfaces use readable foregrounds and mobile wrapping. The Refresh assessment action retains the existing callback/event. Practice-only receipts remain separate and never acquire fabricated scores.

## Checks

| Check | Result |
| --- | --- |
| Focused web grading/result/drawer tests | 9 passed |
| Shared programming-review contract tests | 3 passed |
| i18n catalog checks | 144 passed |
| Web/E2E typechecks and changed-component ESLint | Passed |
| Disposable migration/API integration | 30 passed |
| Chromium and WebKit workflow | Both passed, with application runtime-error checks enabled (5.8 min total) |

The integration regressions cover reason-free completion changes with an unchanged 79/100 score for all three staff roles, review history and idempotent replay. Browser coverage omits reasons for score corrections, tutoring and live grading; the last update changes only learning completion while retaining 98/100. It also verifies the student's live result and history labels. Existing statement-count assertions remain 22/22 for student materials and 15/15 for mixed work history (small/expanded fixtures).

Reproduce with `bash packages/api/scripts/test-manual-programming.sh`; this creates disposable local PostgreSQL/Redis and local auth/API/web fixtures.

## Screenshots

All images use disposable fixtures. The output pane retains its existing independent scrolling and resize divider.

- [Waiting for teacher review](../qa/assets/2026-11-12-student-grading-results/chromium-student-result-pending.png)
- [English mobile score and completion](../qa/assets/2026-11-12-student-grading-results/chromium-student-manual-result-mobile.png)
- [Korean/dark mobile score and completion](../qa/assets/2026-11-12-student-grading-results/chromium-student-manual-result-ko-dark-mobile.png)
- [Student result after a completion-only update](../qa/assets/2026-11-12-student-grading-results/chromium-student-result-complete.png)
- [Live grading with optional note](../qa/assets/2026-11-12-student-grading-results/chromium-live-grading-sidebar.png)
- [WebKit live grading with optional note](../qa/assets/2026-11-12-student-grading-results/webkit-live-grading-sidebar.png)
