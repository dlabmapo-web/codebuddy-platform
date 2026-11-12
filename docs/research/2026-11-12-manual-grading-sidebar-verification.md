# Grading sidebar in history and live monitoring

Date: 2026-11-12

This replaces the terminal grading layout at the user's request. Student history keeps its normal Run / Saved submission result area. Authorized manual submissions have a Grade submission / Edit grade action beside the existing workspace controls. It opens a shared right sidebar, also available directly from the live monitor header.

## Scope and behavior

The sidebar identifies the student, problem and submission time, provides the immutable submitted code, and keeps score/feedback, correction reasons, completion and publication together. Its form scrolls independently of its docked publication controls. The sidebar is non-modal. At 1280px and wider, the workspace reserves its width; below that it overlays from the right, and on phones it fits the viewport. The course-list toggle and existing split dividers remain available to give more space to code.

The opened saved receipt stays pinned while live code changes or a new receipt arrives. A newer receipt for the same student and material produces an explicit switch action; changing to it is guarded for unsaved grading edits. Opening the sidebar does not create a receipt, fetch another review, submit live draft code, or detach the monitored session.

Tutoring and the student selector use the same sidebar from the chosen student's saved workspace. The underlying live student's grade action is hidden while saved tutoring covers that screen. Grading guards compose with the existing monitoring/history navigation and collaboration-save guards; closing/navigation/unload protect unsaved work, and navigation is blocked during publication. Existing backend permissions, version checks, immutable snapshots, idempotency and live grade events are reused.

All writes during verification use disposable local fixtures. No user's development submission is graded. No API/Prisma schema/service/SQL/polling change is part of this UI revision. Explicit History/Refresh retains the existing review reader. Existing SQL counts remain unchanged.

## Validation

| Check | Result |
| --- | --- |
| Full web unit suite | 1,595 passed, 212 files |
| Final focused grading/history/live-workspace checks | 28 passed, eight files, including the focus regression |
| Web and E2E typechecks | Passed |
| i18n catalog checks | 144 passed, no stale keys/copy markers |
| Changed-file ESLint | Passed without warnings |
| Disposable database migration/integration regressions | 26 passed, four files |
| Chromium and WebKit workflow | Both passed; final WebKit follow-up passed in 1.6 minutes |

The browser scenario verifies the original history output with no grading tab, right-sidebar placement, validation/unsaved-close protection, phone form bounds, Teacher publication and Team Lead/Manager corrections. Its live portion covers resubmission pinning, student result updates, a help request, saved tutoring, offline student selection with a separate grade target, and direct live grading by all three staff roles.

Reproduce with `bash packages/api/scripts/test-manual-programming.sh`. This starts separate PostgreSQL/Redis containers, a local auth provider, API and web servers, applies migrations, checks integration regressions and runs both browser engines. It does not use shared Supabase databases.


The first browser assertion was corrected to wait for the sidebar's slide animation before measuring its final edge. The student returns to a desktop viewport for the live-edit/resubmit steps after the phone result screenshots, keeping the existing phone course overlay from intercepting Submit. WebKit then exposed focus restoration racing a newly opened student selector after closing grading. The sidebar now preserves focus already chosen outside it, with a focused regression; browser interactions also wait for the closing sidebar to unmount. The complete WebKit follow-up passed after that fix. The isolated test script accepts normal Playwright arguments, for example `--project=webkit`, for focused reruns.

## Screenshots

All images contain disposable local fixtures.

- [History, original output area](../qa/assets/2026-11-12-manual-grading-sidebar/chromium-teacher-history-1440.png)
- [History grading sidebar, WebKit](../qa/assets/2026-11-12-manual-grading-sidebar/webkit-teacher-history-grading-sidebar.png)
- [Phone grading sidebar, WebKit](../qa/assets/2026-11-12-manual-grading-sidebar/webkit-teacher-grading-sidebar-mobile.png)
- [Live grading sidebar](../qa/assets/2026-11-12-manual-grading-sidebar/webkit-live-grading-sidebar.png)
- [Saved tutoring grading sidebar](../qa/assets/2026-11-12-manual-grading-sidebar/chromium-tutoring-grading-sidebar.png)
- [Selected offline student's separate grade](../qa/assets/2026-11-12-manual-grading-sidebar/webkit-selector-grading-sidebar.png)
- [Korean/dark correction history](../qa/assets/2026-11-12-manual-grading-sidebar/webkit-manager-grading-history-ko-dark.png)
