# Grading sidebar clarity and Safari scroll boundaries

Date: 2026-11-12
Status: implementation requested by the user, refining the existing sidebar.

Keep grading in the right sidebar and keep the existing workspace. Use Cove's existing typography, blue actions, muted surfaces and border tokens. Tighten the student/problem header, group score and learning outcome visibly, replace the easy-to-miss footer checkbox with explicit Learning complete / Needs more work choices, and retain a docked publish action. Existing false completion values and grades remain unchanged. A score never silently marks learning complete. Grade status and learning completion have separate labels.

The history material list will receive only the manual assessment state and completion flag, computed from its existing batch reader. Show Graded for a current assessed manual receipt and Learning complete / Needs more work beneath it. Preserve the underlying progress status, filters and completed totals. Pending and previous revisions remain distinct. No new SQL statement or per-row read is introduced; exercise the existing disposable query-count integration fixture.

The Safari image is consistent with native horizontal history-swipe panning, rather than a normal page column. Add authenticated-app root horizontal overscroll containment and a non-passive, scroll-aware wheel boundary handler: consume horizontal gestures only when no nested scroller can continue in that direction. Preserve vertical scroll, pinch zoom, editor-owned handled wheel events, local tables/code scrolling, and Back/Forward controls. WebKit's open issue 240183 documents that CSS alone does not reliably suppress swipe navigation. Verify actual native Safari where available and WebKit wheel behavior, without changing browser/OS gesture preferences.

Keep live peer pointers beneath the grading surface so remote cursor labels cannot paint over form controls. Retain snapshot pinning, permissions, guards, decimal validation and publication events. Do not modify the user's saved grades during testing.

Verification: focused outcome/history/wheel tests; web/API/shared types and changed-file lint; existing 15-statement small/expanded student-material read in disposable integration; isolated Chromium/WebKit grading, completion/history, sidebar geometry and scroll scenarios; native Safari read-only check.
