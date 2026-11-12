# Grading sidebar polish, assessment labels and Safari scrolling

Date: 2026-11-12

The grading action still opens the shared right sidebar in saved history, live monitoring and tutoring. The revised sidebar uses a compact student/problem header, a score card, explicit Learning complete / Needs more work options, shorter feedback area and a docked publish action. The grading surface sits above collaborative cursor labels. Submitted-code snapshots, permissions, correction reasons and publication guards retain their existing behavior.

## A published score and completed learning

The reported score/status mismatch came from a graded receipt whose learning-completion flag was false. A full score does not implicitly finish learning. History now shows **Graded** with **Learning complete** or **Needs more work** underneath, while retaining the original progress filters and completion totals. Previous revisions and pending work keep their existing labels.

The list response adds only assessment state and completion from the existing batched reader; it does not add code, feedback, a database query or polling. The disposable PostgreSQL regression verifies pending → graded/incomplete → graded/complete and the corresponding lecture completion total. Existing user grades and completion flags were not modified.

SQL statement counts remain unchanged in the small and expanded fixtures: **22 / 22** for student materials and **15 / 15** for mixed work history. The integration suite also retains the existing counts for student results, staff review, latest receipts and learner bootstrap.

## Safari horizontal gestures

Authenticated academy pages now contain root horizontal overscroll. A non-passive wheel handler consumes predominantly horizontal gestures only when no nested scroller can continue in that direction. It preserves vertical input, Ctrl/pinch zoom, handled editor events, RTL scrolling and local horizontal tables/code. Rich-text iframe documents receive the same guard because their wheel events do not bubble to the outer page. A regression covers the transient rootless document exposed while `srcDoc` loads.

WebKit documents that [CSS containment alone can still allow history swipe navigation](https://bugs.webkit.org/show_bug.cgi?id=240183); a separate [WebKit report describes wheel cancellation affecting that navigation](https://bugs.webkit.org/show_bug.cgi?id=240892). Browser Back/Forward controls and macOS preferences remain unchanged.

Native Safari verification used a separate QA tab and existing local read-only pages. After creating a Back entry, horizontal scroll inputs in both directions left the class dashboard and its URL anchored. The saved-work sidebar showed the existing 50/50 grade with Needs more work selected; no fields were edited or grades published. The QA tab was closed and the user's original tabs restored. This verifies native scroll inputs and observed layout; it does not cover every physical trackpad gesture phase or macOS gesture setting.

## Validation

| Check | Result |
| --- | --- |
| Full web unit suite | 1,602 passed, 214 files |
| Full shared unit suite | 939 passed, 56 files |
| Student-work-history API unit suite | 12 passed |
| i18n checks | 144 passed; no stale keys/copy markers |
| Web, API and E2E typechecks | Passed |
| Changed-file ESLint | Passed |
| Disposable database integration | 27 passed, including completion and statement-count regressions |
| Chromium / WebKit workflow | Chromium passed (2.3 min); final WebKit confirmation passed (3.2 min) with runtime-error assertion enabled |

Reproduce the isolated integration/browser workflow with `bash packages/api/scripts/test-manual-programming.sh`. It creates disposable local PostgreSQL/Redis and auth/API/web fixtures; it does not use shared Supabase databases. Browser coverage includes staff grading/corrections, live student result updates, help requests, tutoring, student switching, desktop/mobile and Korean/dark presentation, horizontal boundaries, nested and iframe scrolling, and graded learning outcomes.

The browser error assertion exposed a WebKit outgoing outline-fetch cancellation during an intentional student reload. The test records this exact resource exception only inside that reload window; application exceptions and fetch exceptions elsewhere still fail the check. The subsequent result assertion verifies the reloaded student sees the published score.

The final staff-switch steps also wait for the monitored student's connection and current-material indicator to be live before opening grading. This avoids clicking during the initial collaboration attachment/reconnecting transition; the sidebar's own validation and publication assertions remain unchanged.

One WebKit run completed every interaction and outcome assertion but failed the added runtime-health assertion on a development-server `Maximum call stack size exceeded` / client-render fallback. This was not suppressed. The final isolated WebKit confirmation passed the entire scenario with no application exceptions. The fallback was not reproduced in the native Safari read-only checks. Its intermittent occurrence in development remains a limitation; the clean confirmation does not establish a fix for that separate rendering failure.

## Screenshots

All screenshots use disposable fixtures.

- [Saved-work grading sidebar](../qa/assets/2026-11-12-grading-sidebar-polish/webkit-teacher-history-grading-sidebar.png)
- [Mobile grading sidebar](../qa/assets/2026-11-12-grading-sidebar-polish/webkit-teacher-grading-sidebar-mobile.png)
- [Live monitoring grading sidebar](../qa/assets/2026-11-12-grading-sidebar-polish/webkit-live-grading-sidebar.png)
- [Tutoring grading sidebar](../qa/assets/2026-11-12-grading-sidebar-polish/chromium-tutoring-grading-sidebar.png)
- [Korean/dark correction history](../qa/assets/2026-11-12-grading-sidebar-polish/webkit-manager-grading-history-ko-dark.png)
- [Graded; needs more work](../qa/assets/2026-11-12-grading-sidebar-polish/webkit-history-graded-needs-work.png)
- [Graded; learning complete](../qa/assets/2026-11-12-grading-sidebar-polish/webkit-history-graded-complete.png)
