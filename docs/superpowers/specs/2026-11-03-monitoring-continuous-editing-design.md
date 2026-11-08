# Continuous monitoring workspace and automatic editing

The user's second screenshot defines the workspace, including when the student
is elsewhere. The user's latest clarification is to remove the manual edit
switch and automatically enable authorized live-code editing. This supersedes
the earlier interpretation of editing inactive saved problems.

Keep the same header, statement/editor/output/feedback geometry and controls.
Remove the additional Return/Preview strips and the edit On/Off toggle. Put
Return to live in the existing header actions when the selected material differs
from student activity. Keep that activity and the sidebar LIVE badge accurate.

Reuse the existing live watch, class/enrollment/material predicate, Yjs room,
watch lease, visit identity, synchronization, persistence and permission
revocation. The current monitoring UI requests editing with the watch; the server
grants it in the acknowledgement. It must not unlock before this watch's document
sync. Older clients retain their existing explicit mode behavior. Returning or
reloading reauthorizes automatic editing. Inactive problems retain the complete
layout and saved code view. Local Run executes the selected saved snapshot,
rather than the hidden live document. Feedback drafts remain editable and scoped
to that problem; sending still needs its live authorized watch. Runs remain the
monitor's own runs. This change does not add editing authority for saved previews.

All student mouse markers follow coding's held-marker lifecycle: inactivity,
window blur and crossing an unshared area do not erase the last representable
position. Navigation, source replacement, disconnect and access revocation clear
or suppress it. Reject delayed, out-of-order or wrong-scope frames as before.
Turtle transmits the mouse's displacement from its text position in line-height
units, as coding does. Project against matching file/content, current Monaco
geometry, and render the same named pointer. PDF/drawing/answers/video retain
content anchors so independent sizes and zoom map onto the same content.

Implement in three parts: automatically authorized live
editing; stable workspace presentation; shared pointer lifecycle and geometry.
Verify authorization, synchronization/recovery and source fencing with focused
tests. Extend real Chromium/WebKit journeys with automatic edits, reload,
student return/convergence, inactive local runs, stable pane coordinates, held markers after idle and
blur, numerical pointer positioning on PDF/Turtle code, and actual drawing frames
with their shared pointer. Keep the
existing cross-instance, role and revocation coverage. Use disposable local
services and record actual results separately; do not merge or deploy.

Actual checks and browser evidence are in the
[verification report](../../research/2026-11-03-monitoring-continuous-editing-verification.md).
