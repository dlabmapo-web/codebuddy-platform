# Whole-Page Student Pointer Monitoring Design

## Summary

Extend the existing live teacher-monitoring session so the teacher can see the
student's pointer across the entire fullscreen problem-solving workspace, rather than
only inside the right-side editor.

The direction is intentionally asymmetric:

- **Student → teacher:** the teacher sees the student's pointer in the header,
  curriculum navigator, problem statement, editor, and terminal.
- **Teacher → student:** the existing experience remains unchanged. The student sees
  the teacher's pointer and text cursor only inside the editor.

Whole-page student pointer monitoring is available only while the teacher and student
are connected to the same live problem session. It is transient presence information,
not recorded activity history.

## Goals

- Let a teacher understand where the student is currently focusing on the whole
  problem-solving page.
- Show student pointer movement over the problem statement, sample cases, curriculum
  navigator, editor, terminal, and fullscreen header.
- Preserve the existing editor collaboration behavior, including teacher cursor
  visibility on the student side and Monaco text-cursor synchronization.
- Keep teacher preview navigation independent from the student's navigation.
- Avoid forcing the teacher's page to scroll, open the curriculum navigator, or change
  problems when the student moves.
- Keep realtime traffic bounded and responsive.
- Avoid exposing pointer activity outside the authorized live collaboration session.

## Non-goals

- Showing the teacher's whole-page pointer to the student.
- Mirroring the student's full browser window, browser tabs, address bar, or anything
  outside the Cove Studio problem-solving page.
- Recording, replaying, or permanently storing pointer history.
- Capturing clicks, keyboard input outside the existing code collaboration, selected
  text, clipboard contents, or browser-level activity.
- Automatically scrolling the teacher's problem statement or curriculum navigator to
  match the student.
- Automatically opening or closing the teacher's curriculum navigator or terminal.
- Moving the teacher to another problem when the student navigates.
- Replacing screen sharing or full remote-desktop monitoring.

## Experience Model

### Student view

The student view does not gain a whole-page teacher pointer.

The current behavior remains:

- The teacher's pointer is visible within the editor pane.
- The teacher's Monaco text cursor is visible at the relevant code position.
- Teacher movement in the problem statement, header, terminal, or curriculum
  navigator is not broadcast to the student.

No new status, overlay, or permission control is added to the student page in this
version.

### Teacher live view

When the teacher is monitoring the student's current live problem, the student's
pointer is rendered above the matching teacher workspace surface.

The pointer uses the existing student color and label style. It must:

- remain non-interactive and never block teacher clicks;
- appear above normal page content but below blocking dialogs;
- move smoothly without a long trailing animation;
- use the monitored student's display name;
- disappear after the student stops moving for the configured idle period;
- disappear immediately when the student disconnects, leaves the problem, or the
  teacher leaves live mode.

The feature covers these surfaces:

1. Fullscreen header and problem navigation controls.
2. Curriculum navigator, including stage, chapter, and problem rows.
3. Problem statement, metadata, samples, copy buttons, hints, and constraints.
4. Code editor pane.
5. Terminal header, sample-run controls, output, and input area.

The existing Monaco text cursor remains the authoritative indicator for the student's
code insertion position. The page-level student pointer may also appear over the
editor, but it must not replace the Monaco cursor.

### Teacher preview mode

When the teacher deliberately previews a problem that is not the student's live
problem:

- the preview remains fixed;
- the student's pointer is not drawn over the previewed problem;
- the student's latest live problem continues to be shown through the existing
  `Live` marker and compact header status;
- a small, non-blocking status may say that the student is active on the live problem;
- returning to the live problem restores whole-page pointer monitoring.

The student's movement must never pull the teacher out of preview mode.

## Coordinate Model

Raw browser viewport coordinates must not be sent because the student and teacher
layouts can differ in width, split ratios, scroll positions, open panels, and terminal
height.

Each pointer event identifies a semantic surface and normalized coordinates within
that surface:

```ts
type CollaborationSurface =
  | 'header'
  | 'curriculum'
  | 'statement'
  | 'editor'
  | 'terminal';

type StudentPointerMovePayload = {
  senderId: string;
  sessionId: string;
  problemId: string;
  name: string;
  role: 'student';
  surface: CollaborationSurface;
  xPct: number;
  yPct: number;
  sentAt: number;
};
```

`xPct` and `yPct` are clamped to the inclusive `0..1` range and calculated from the
student surface's current bounding rectangle.

Both fullscreen pages mark equivalent regions with stable collaboration-surface
identifiers. The teacher maps the normalized position into the matching surface in
the teacher layout. This keeps the pointer meaningful when the two screens have
different dimensions.

### Scrollable surfaces

For the problem statement, curriculum navigator, and terminal, pointer coordinates
are relative to the visible surface viewport. The feature does not synchronize scroll
positions.

If the matching teacher surface is available and visible, render the pointer at the
equivalent normalized position. If it is unavailable—for example, the student's
curriculum navigator is open while the teacher's is closed—do not open it
automatically. Show a compact activity indicator at the matching trigger or boundary:

- `Student is in the curriculum navigator`
- `Student is viewing the problem statement`
- `Student is using the terminal`

The indicator disappears or changes as soon as a new pointer event arrives from
another visible surface. It must not cover content or create a modal interruption.

## Realtime Behavior

### Student broadcast

The student page installs one pointer-movement observer for the fullscreen workspace
and the portal-rendered curriculum navigator.

On pointer movement:

1. Resolve the nearest registered collaboration surface.
2. Calculate normalized coordinates within that surface.
3. Confirm an authorized teacher peer is present in the current session.
4. Broadcast `student:pointer:move` at most once every 80 milliseconds.

When the pointer exits the Cove Studio workspace, the tab becomes hidden, the session
ends, or the component unmounts, broadcast `student:pointer:leave` when possible.

The student must not broadcast whole-page pointer events when no teacher peer is
present.

### Teacher receive

The teacher accepts a student pointer event only when:

- the sender is the student authorized for the monitored session;
- `sessionId` matches the teacher's active collaboration session;
- `problemId` matches both the session problem and the teacher's live displayed
  problem;
- the teacher is in live mode rather than preview mode;
- the payload contains a supported surface and finite normalized coordinates.

Invalid, stale, mismatched, or teacher-originated events are ignored.

The teacher stores only the latest pointer position in component memory. No pointer
event is written to the database.

### Idle and disconnect behavior

- Reset the existing three-second pointer idle timer whenever a valid student event
  arrives.
- Remove the pointer after three seconds without movement.
- Remove it immediately on `student:pointer:leave`.
- Remove it when realtime presence no longer contains the student.
- Remove it when the teacher enters preview mode, changes session, or unmounts.
- Never retain a pointer from the previous problem during a problem or session
  transition.

## Component Design

### Shared surface registry

Add a small shared collaboration-surface module that provides:

- the supported surface type;
- stable `data-collaboration-surface` attributes or equivalent registration helpers;
- coordinate normalization and validation;
- lookup of the teacher's matching surface element.

This prevents the student and teacher pages from maintaining different string values
or coordinate rules.

### Pointer overlay

Generalize the current `PointerOverlay` so it can be mounted for a specific semantic
surface instead of being tied to the editor pane.

Each registered teacher surface receives an overlay layer with:

- `position: absolute`;
- `inset: 0`;
- `overflow: hidden`;
- `pointer-events: none`;
- a z-index above local content.

The surface's content wrapper becomes a positioning context where necessary. The
overlay must not change layout dimensions.

The existing editor-only teacher pointer shown on the student page continues using
its current event and overlay path. It is not migrated to whole-page monitoring in
this feature.

### Portal curriculum navigator

Because the curriculum navigator is rendered through a document-level portal, it
must register itself as the `curriculum` surface independently of the main workspace
root.

Student events from the navigator use the same live collaboration channel. Closing
the navigator emits a leave event for that surface or allows the next workspace move
to replace it.

## Event Compatibility

Keep the existing events temporarily:

- `cursor:move` for Monaco text cursor collaboration;
- the existing teacher `pointer:move` and `pointer:leave` used by the student-side
  editor overlay.

Add direction-specific whole-page events:

- `student:pointer:move`;
- `student:pointer:leave`.

Direction-specific names avoid accidentally rendering the teacher across the
student's whole page and make the asymmetric privacy boundary explicit.

The new event must not overload the existing `pointer:move` payload because older
listeners assume editor-pane coordinates.

## Authorization and Privacy

- Use the existing authorized session channel; do not create a public global pointer
  channel.
- The server remains the authority for which teacher can access a student's session.
- Client payload identity is not sufficient authorization by itself.
- The teacher page validates the expected student ID, session ID, and problem ID
  before rendering.
- Whole-page events contain no DOM text, element values, code, clipboard data, or click
  targets.
- Pointer data is ephemeral and is never inserted into Supabase tables, logs, analytics,
  submissions, or feedback records.
- Monitoring stops when the live collaboration relationship ends.

## Performance and Reliability

- Throttle student whole-page movement to one event per 80 milliseconds, matching the
  existing pointer cadence.
- Keep at most one pending pointer event; newer movement replaces older unsent
  movement.
- Avoid React state updates on every raw browser `pointermove`.
- Update only the active surface overlay instead of rerendering the full problem page.
- Prefer `requestAnimationFrame` for visual pointer placement.
- Use transforms for pointer movement when practical.
- Clean up document listeners, timers, animation frames, and channel references on
  session change and unmount.
- Pointer failures must never interrupt code synchronization, terminal streaming,
  submissions, feedback, or navigation.
- Touch input is out of scope for the first version; mouse and trackpad pointer events
  are supported.

## Accessibility

- Remote pointers are decorative and hidden from screen readers.
- Activity indicators use polite, concise status text without announcing every
  movement.
- Overlays never receive keyboard focus.
- The feature does not alter tab order.
- Motion follows reduced-motion preferences by removing interpolation while retaining
  the latest position.

## Error and Edge Cases

- **Different problem:** show only the existing live-problem status; render no pointer.
- **Teacher previewing:** render no pointer over preview content.
- **Student changes problem:** clear the pointer immediately; do not navigate the
  teacher.
- **Student opens a drawer the teacher has closed:** show curriculum activity at the
  teacher's drawer trigger; do not open the drawer.
- **Teacher opens or closes a panel:** remap the next received event to the new surface
  geometry.
- **Window resize or split resize:** use the current surface rectangle for the next
  render.
- **Pointer over a dialog:** unsupported dialogs are treated as outside the registered
  workspace and the pointer is hidden.
- **Malformed event:** ignore it without throwing or disconnecting the channel.
- **Realtime reconnect:** do not restore a stale pointer; wait for the next movement.
- **Student offline:** clear all student pointer and activity state.

## Testing Strategy

### Unit tests

- Surface detection returns the nearest valid registered surface.
- Coordinate normalization clamps values to `0..1`.
- Invalid coordinates, surfaces, roles, session IDs, and problem IDs are rejected.
- Teacher events cannot enter the student whole-page event path.
- Preview mode and different-problem state reject student pointer rendering.
- Idle cleanup removes pointer state.

### Component tests

- The teacher renders the student pointer in every supported visible surface.
- Moving from statement to editor removes the previous surface pointer.
- A closed teacher curriculum navigator shows activity status instead of opening.
- Entering preview mode removes the pointer.
- Returning to the live problem allows new pointer events to render.
- The student still renders the teacher pointer only in the editor.
- Remote overlays do not intercept clicks or keyboard focus.

### Realtime integration tests

- A student and authorized teacher on the same session exchange whole-page student
  pointer events.
- Another teacher, another student, another session, and another problem cannot
  display those events.
- Student disconnect, problem transition, and channel reconnect clear stale state.
- Code, Monaco cursor, terminal, feedback, and presence events continue to work.

### Browser end-to-end tests

Use separate authenticated student and teacher browser contexts:

1. Open the same live problem and confirm student movement appears on the teacher's
   statement, editor, terminal, header, and open curriculum navigator.
2. Move the teacher across the statement and confirm no whole-page teacher pointer
   appears for the student.
3. Move the teacher within the editor and confirm the existing student-side teacher
   pointer still works.
4. Close the teacher navigator, move the student inside their open navigator, and
   confirm an activity indicator appears without opening the teacher navigator.
5. Put the teacher in preview mode and confirm student pointer movement is not drawn
   over the preview.
6. Change the student's problem and confirm the teacher stays on the selected problem,
   the pointer clears, and only the existing `Live` marker moves.
7. Return the teacher to the student's live problem and confirm new movement appears.
8. Disconnect the student and confirm the pointer disappears immediately.

## Acceptance Criteria

- A teacher in the student's live session can see the student's pointer across every
  registered problem-solving surface.
- The student continues to see the teacher only inside the editor.
- Whole-page teacher activity is never broadcast to or rendered for the student.
- Pointer monitoring works only for the authorized student, session, and live problem.
- Student navigation never moves the teacher automatically.
- Teacher preview mode never displays a misleading live pointer.
- Closed or unavailable teacher surfaces are not opened automatically.
- Pointer data is throttled, transient, and never stored.
- Existing code collaboration, Monaco cursors, terminal mirroring, feedback,
  navigation, samples, and submissions continue to work.
