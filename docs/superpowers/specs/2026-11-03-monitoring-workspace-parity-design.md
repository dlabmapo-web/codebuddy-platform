# Monitoring workspace parity and material awareness

The user's four screenshots specify this correction to the approved all-material
monitoring design. The fourth screenshot is the reference for the persistent
monitoring chrome. This work continues on the existing feature branch.

Use the existing LiveHeader, curriculum trigger and navigator for all materials.
Keep selected content independent of student activity. Selecting a coding material
always renders its complete statement/editor/output workspace, including when the
student is elsewhere. Saved previews retain the same layout and feedback dock;
only actions requiring an active code attachment are unavailable.
Retain at most five last-observed material work snapshots in the scoped monitor
component, so leaving Turtle/answers does not blank the selected view. Clearly
label these as last observed and clear access on revocation; a cached running
status must not claim that the runtime is still running.

Turtle uses the student's manual workspace geometry and shared editor, resizing,
drawing layout controls and execution labels. Staff see file tabs, a read-only
Monaco editor, actual drawing and terminal output. Short/written answers reuse
WrittenAnswerCard, including question, hint, answer label and character count;
instructions occupy the same adjacent pane as in the student workspace. Reuse the
existing palette, fonts, spacing and responsive breakpoints.

Preferred approach: reuse existing presentation components and add observation
inputs. Merely restyling the generic cards would retain two inconsistent layouts;
embedding the student's interactive page would mix student and staff authority.
The monitor remains an authorized read-only observation of manual answers/runs.

Add a bounded, rate-limited, ephemeral observation-awareness event on the existing
student socket. The server derives the student identity and requires the currently
selected source/material/class. Forward only to the authorized observation room.
Include sequence/source fencing and expire inactive markers. Reuse existing
surface/anchor geometry for instructions, outline rows, answers, PDF pages, video,
drawing and terminal. Show the focused region; Turtle also carries the selected
file and logical editor caret/mouse position. Render arrows only on matching
materials/content; other selections show location information without a misplaced
arrow. Blur, leave, navigation, disconnect and revocation clear stale markers.
Awareness must not save answers or grant runtime/editor authority.

Verify contract bounds, authorization/source fencing, stale awareness expiry,
selection/layout stability and shared answer presentation. Extend the real local
Chromium/WebKit journeys with pointer/focus checks and full coding workspace
retention after the student leaves coding. Capture Turtle, answer and coding-away
screenshots. Preserve the previous bidirectional coding and permission checks.

Implementation checks and local browser evidence are recorded in the
[verification report](../../research/2026-11-03-monitoring-workspace-parity-verification.md).
