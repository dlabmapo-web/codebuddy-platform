# Monitoring problem editor shortcut

Date: 2026-11-04. Status: implemented locally. Scope: the user's request to edit the displayed problem directly from monitoring.

Add **Edit problem** beside the existing monitoring actions. Use the existing content editor route for the displayed exercise's course, lecture and material, so staff can edit the statement and grading test cases without finding the course manually. This is same-tab navigation; it does not edit the student's code.

Resolve visibility from `canManageExercises(roles)` using the server route guard's effective academy roles, matching the destination editor. Managers and Team Leads currently have `exercises.manage`; Teachers retain read-only review. Do not add or broaden permissions. The destination page and mutation APIs continue enforcing authorization.

The link follows the displayed exercise when the student moves elsewhere and is absent when no coding problem is displayed. Before ordinary navigation, honor private-copy discard and pending live-edit guards. Mark this as leaving the monitoring class so the existing feedback-note guard applies. Preserve native modifier-click link behavior.

Reuse the canonical content path builder, existing action styling and English/Korean translations. No backend contract or realtime protocol change is needed.

Verify role-based visibility and opening the existing statement/test-case editor in Chromium and WebKit, plus scoped type, lint and translation checks. Navigation-guard coverage must check cancellation before leaving. Do not merge or deploy.

Verification: six Manager/Team Lead/Teacher × Chromium/WebKit checks passed; 239 web/path regression tests, one asynchronous exit-guard test and 140 translation tests passed. See the [verification report](../../research/2026-11-04-student-history-implementation-verification.md). Native Safari coverage remains unavailable as documented there.
