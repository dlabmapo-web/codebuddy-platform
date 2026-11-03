# Continuous monitoring workspace and automatic editing

The user's second screenshot defines the workspace, including when the student
is elsewhere. The user confirmed that monitors may edit the selected coding
problem anytime and save changes to that student's draft.

Keep the same header, statement/editor/output/feedback geometry and controls.
Remove the additional Return/Preview strips and the edit On/Off toggle. Put
Return to live in the existing header actions when the selected material differs
from student activity. Keep that activity and the sidebar LIVE badge accurate.

Authorize a code watch for the selected material independently of student
presence. Reuse the existing class/enrollment/material predicate, draft creation,
Yjs room, watch lease, visit identity, synchronization, persistence and permission
revocation. The current monitoring UI requests editing with the watch; the server
grants it in the acknowledgement. It must not unlock before this watch's document
sync. Older clients retain their existing explicit mode behavior. Returning or
reloading reauthorizes automatic editing. Saved work must converge across API
instances and be present when the student returns to the problem. Runs remain
the monitor's own runs; feedback belongs to the selected problem.

All student mouse markers follow coding's held-marker lifecycle: inactivity,
window blur and crossing an unshared area do not erase the last representable
position. Navigation, source replacement, disconnect and access revocation clear
or suppress it. Reject delayed, out-of-order or wrong-scope frames as before.
Turtle transmits the mouse's displacement from its text position in line-height
units, as coding does. Project against matching file/content, current Monaco
geometry, and render the same named pointer. PDF/drawing/answers/video retain
content anchors so independent sizes and zoom map onto the same content.

Implement in three parts: selected-material watch authorization and automatic
editing; stable workspace presentation; shared pointer lifecycle and geometry.
Verify authorization, synchronization/recovery and source fencing with focused
tests. Extend real Chromium/WebKit journeys with inactive-problem edits, reload,
student return/convergence, stable pane coordinates, held markers after idle and
blur, and numerical pointer positioning on PDF, Turtle and drawing. Keep the
existing cross-instance, role and revocation coverage. Use disposable local
services and record actual results separately; do not merge or deploy.
