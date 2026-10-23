# Course Turtle workspace controls and solution dialog

Status: approved by the user on 2026-10-23; implementation in progress.

## Scope and reference

Improve the course Turtle workspace using the four screenshots supplied by the
user: Cove's current workspace/drawer and Elice's workspace/centered solution
dialog. Keep Cove's brand colors, existing light/dark theme, and Korean/English
translations. The public `/turtle` playground is outside this change.

The recommended approach is to reproduce the reference's compact controls and
solution interactions within Cove's existing components. A smaller alternative
would change only the icons and leave the duplicate solution interfaces. A larger
alternative would replace the entire lesson shell and theme; that would affect
unrelated exercise types and is unnecessary for this request.

## Findings in the current implementation

- The drawing layout dropdown is in the file toolbar, away from the drawing.
- The drawing toolbar has large text controls and verbose connection status.
- A range input controls editor height without a visible explanation.
- Two solution interfaces exist: inline details in `ManualWorkspace`, plus
  `AssessmentDrawer` in `ManualStaffActions`.
- Inline details concatenate all solution files. The drawer stacks all files.
  Neither intentionally selects the configured entry point first, so `custom.py`
  can dominate the display instead of the student's `main.py` answer.
- The drawing connection and completed frame already support a stable foreground
  dialog. Preserve that behavior while changing its controls.

## Proposed workspace

Instructions stay on the left. The editor has file tabs above it and a compact
Run/Stop/Submit toolbar below it. Below that, a drawing panel sits beside the
terminal by default, matching the reference's panel arrangement.

The drawing header contains its title, a short state indicator, and icon buttons:

1. Expand/restore drawing: expand arrows; opens the existing foreground view.
2. Drawing placement: panel-layout icon; switches drawing below/right using the
   existing Cove dropdown/menu primitives, with the current choice indicated.
3. Fit/actual size: scaling icon; retains accessible state and scrollable actual
   size. This control may be grouped with other secondary drawing options.

Icon buttons have translated accessible names and tooltips on hover/focus. They
have a consistent hit area of at least 36 pixels, visible focus styles, and no
layout movement when hovered. Controls remain available before the first run;
expansion requiring a frame is disabled until there is a display to expand.

Remove the layout dropdown and unexplained range from the file tabs. Provide an
accessible resize separator between editor/actions and results instead: drag or
keyboard arrows adjust the editor/result proportions within safe bounds. Drawing
right uses the existing side-by-side arrangement and retains useful minimum
areas. Mobile retains Code/Drawing/Terminal tabs and reachable controls.

Reduce the vertical space used by Turtle preview and assessment notices without
removing their meaning. Keep ordinary written/quiz workspace presentation intact.
Use a clear empty drawing/terminal state before Run. After normal completion,
show Completed rather than presenting an expected socket closure as a drawing
failure. Genuine interruptions during an active run remain visible.

Changing placement or opening/closing the foreground view must not restart the
program, reconnect the viewer, change Turtle coordinates, or discard the frame.
Foreground view keeps an explicit Close button, focus containment and restoration,
Escape handling, fitting, and Stop while a program is active.

## Proposed solution behavior

For Turtle, View solution opens one centered Cove modal with a dimmed background,
matching the reference interaction. Remove the duplicate inline solution details
from the instructions pane. Keep tutoring and other assessment drawers intact.

- Display the activity title and a read-only code viewer.
- Select `config.entryPoint` first when present in the solution files; otherwise
  select `main.py`, then a deterministic fallback. Additional files such as
  `custom.py` are available as named tabs, not concatenated into the answer.
- Provide Copy for the selected file with success/error feedback, and a clear
  Close button. Code supports horizontal scrolling and fits smaller screens.
- Retain explicit Run solution in authorized Turtle preview as a secondary action.
  It closes the modal and runs the complete solution file set without replacing
  the learner's editable files. Identify the result as a solution run.
- Opening or copying a solution never changes source, saves a draft, submits an
  answer, awards a grade, or starts execution.
- Continue using the server's `canViewSolutions` and private reference response;
  do not add solutions to student responses or authorize them by a client flag.
- Loading, unavailable/empty reference, and clipboard failures receive translated
  states. The modal supports Escape, outside dismissal, keyboard navigation,
  focus containment, and focus return to View solution.

## Verification

Component checks cover entry-point-first file selection, Copy/failure feedback,
modal open/close, icon accessible names, layout selection, and stable viewer/run
identity. Existing connection lifecycle tests remain required.

Local browser checks use the created Turtle Drawing Lab course: run an example,
move the drawing right and below, expand/close it, resize the result area, and
confirm the painted frame remains. Open View solution, check `main.py` is first,
switch to `custom.py`, copy, close with Escape/outside click, and confirm the
editable code is unchanged. Check authorized solution execution separately.
Verify a student cannot fetch the private reference. Cover desktop Chromium and
WebKit, a narrow viewport, keyboard navigation, and English/Korean labels.

This is local implementation and verification only; deployment is a later task.

## Implementation sequence

1. Add shared icon controls, result layout actions, and accessible panel resizing.
2. Replace Turtle solution surfaces with a centered, file-aware read-only modal.
3. Compact workspace notices, file tabs, execution actions, and result states.
4. Add English/Korean copy and focused behavior tests.
5. Run local browser checks against the real course runtime and record results.
