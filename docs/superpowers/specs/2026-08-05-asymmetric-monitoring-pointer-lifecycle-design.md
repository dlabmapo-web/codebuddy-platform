# Asymmetric Monitoring Pointer Lifecycle Design

**Date:** 2026-08-05  
**Status:** Approved design  
**Parent design:** `2026-08-04-teacher-live-monitoring-design.md`

## Summary

Cove Studio v2 already provides the production live-monitoring foundation: a
teacher and student edit one Yjs-backed code document, see one another's Monaco
carets and selections, and exchange transient pointers over semantic workspace
surfaces. This change makes the pointer lifetime match the intended classroom
behavior from the legacy platform without copying its component architecture.

- A teacher pointer shown to a student disappears after three seconds without
  a new teacher pointer event.
- A student pointer shown to a teacher does not expire because of inactivity.
  It remains until the student explicitly leaves the supported surface, hides
  or blurs the page, disconnects, or the monitoring session ends.
- Editor carets remain independent of mouse-pointer expiry. They continue to
  identify the peer's last code position while the shared document is active.

## Goals

- Preserve symmetric realtime code collaboration and exact editor caret
  rendering.
- Apply the three-second inactivity timeout only when a student renders a
  teacher's mouse pointer.
- Keep the student's last valid mouse position visible to the teacher while
  the student remains connected and on a supported collaboration surface.
- Preserve the v2 design system, semantic surface mapping, authorization,
  revocation, throttling, reconnection, and privacy behavior.
- Make the lifecycle rule explicit and independently testable.

## Non-goals

- Replacing Socket.IO, Redis, Yjs, Monaco, or the monitoring gateway.
- Persisting pointer or caret coordinates.
- Replaying pointer events after reconnection.
- Supporting arbitrary DOM coordinates outside registered Cove workspace
  surfaces.
- Changing teacher assignment, watch authorization, feedback, presence, run
  mirroring, or submission behavior.
- Reproducing legacy layout or styling in v2.

## User experience

### Student view

When the teacher moves over a supported workspace surface, the student sees a
non-interactive pointer labeled `Teacher` at the corresponding position in the
student's own layout. Each valid teacher pointer event restarts a three-second
idle timer. If no newer teacher pointer event arrives before the timer ends,
the pointer disappears. A later teacher movement shows it again immediately.

The teacher's Monaco caret and selection use editor line and column coordinates,
not pointer coordinates. They remain visible while the collaboration document
is active, even when the teacher's mouse pointer has expired.

### Teacher view

When the student moves over a supported workspace surface, the teacher sees a
pointer labeled with the authorized student display name. Inactivity alone does
not hide it. It clears only when the client receives an explicit null pointer
state or when the shared monitoring context is torn down.

The student's Monaco caret and selection remain visible while the shared
document is active. Student and teacher edits continue to converge through the
existing Yjs document and appear in both editors in real time.

## Architecture

### Viewer-side policy

Pointer expiry is a rendering policy in the shared `useAwareness` hook. The
hook accepts an explicit remote-pointer expiry policy in addition to the peer
origin it already receives:

- the student monitoring caller selects the three-second expiry policy for its
  remote teacher pointer;
- the teacher live-workspace caller selects no idle expiry for its remote
  student pointer.

The policy is expressed by behavior rather than inferred from names, routes, or
membership roles. This keeps the hook reusable, prevents accidental coupling to
UI structure, and makes each caller's privacy and lifecycle decision visible at
the call site.

The existing `monitoringTiming.pointerExpiryMs` value remains the single source
for the three-second duration. The no-expiry policy does not create a timer.

### Event flow

1. A local `pointermove` resolves the event target to a registered semantic
   surface.
2. The sender normalizes the position inside that surface and publishes the
   latest awareness state through a volatile, throttled socket event.
3. The server validates the active watch/document scope, stamps the trusted
   origin, and forwards the awareness state without persisting it.
4. The receiving `useAwareness` instance accepts only the configured peer
   origin and updates its remote state.
5. On the student, a teacher pointer update replaces the existing timer and
   starts a fresh three-second timeout.
6. On the teacher, a student pointer update changes the rendered position but
   creates no idle timeout.
7. Leaving every supported surface, hiding the document, or blurring the window
   sends a non-volatile null pointer update. Pointer movement remains volatile;
   clearing does not, because a lost clear would leave the non-expiring student
   pointer frozen on the teacher's screen.
8. When a socket disconnects or a watch is torn down, the gateway publishes a
   server-owned null awareness state to the remaining peer before room cleanup.
9. An explicit null awareness state, loss of the active draft, watch
   termination, or component cleanup removes the rendered pointer.

Cursor events follow the existing line/column awareness path and are not
affected by the pointer timer.

### Component boundaries

- `useAwareness` owns transient pointer state, throttled publishing, incoming
  peer filtering, optional expiry, reliable clear publishing, and timer
  cleanup.
- `useStudentMonitoring` declares that remote teacher pointers expire.
- `useLiveWorkspace` declares that remote student pointers do not expire.
- `RemotePointer` remains presentation-only. It maps semantic coordinates into
  the local layout and renders the existing v2 label, colors, and off-screen
  surface message.
- Monaco cursor helpers remain responsible for caret and selection rendering.
- The gateway remains responsible for authentication, authorization, trusted
  origin stamping, scoping, rate limits, revocation, and peer clearing when a
  connection or watch ends without a client-authored leave event.

No component should infer expiry from the displayed label, translate a role
string into a timeout, or implement its own duplicate timer.

## Cleanup and failure behavior

- Replacing a teacher-pointer event cancels the previous timer before the next
  timer becomes authoritative.
- Changing drafts or ending a watch clears remote state immediately, regardless
  of the configured expiry policy.
- Explicit pointer leave, hidden document, and window blur publish a
  non-volatile clear. Socket disconnect, watch teardown, and authorization
  revocation publish a server-owned clear to the remaining peer.
- Component unmount clears every pending expiry timer. A stale timer must not
  update state after the hook has moved to another draft or unmounted.
- Dropped volatile movement events are not retried. The teacher pointer
  self-clears after three seconds. Student-pointer clear events are not sent
  through the volatile movement path, and abrupt connection loss is covered by
  gateway cleanup.
- Reconnection does not replay an old pointer. A pointer appears again only
  after fresh awareness from the peer.

## Privacy and performance

Pointer and caret data remain transient and are never written to PostgreSQL,
Redis history, logs, analytics, or monitoring visits. The student continues to
receive the generic `Teacher` label rather than a staff identity. The teacher
receives only the student identity already authorized for the active class and
watch.

The change removes the teacher-side idle timer for the student pointer and adds
no server state. Existing client throttling, volatile delivery, normalized
coordinates, and bounded payload validation remain unchanged.

## Testing

### Hook tests

- With expiry enabled, a remote pointer is present immediately, remains present
  before three seconds, disappears at three seconds, and reappears on later
  movement.
- Every new teacher-pointer event restarts the timeout from that event.
- With expiry disabled, advancing fake timers beyond three seconds does not
  remove the student pointer.
- An explicit null pointer clears both expiring and non-expiring pointers.
- Pointer movement uses volatile delivery while an explicit client leave uses
  the reliable awareness-clear path.
- Draft removal and unmount cancel pending timers and clear derived remote
  awareness.
- Cursor state is unchanged when a mouse pointer expires.

### Component and integration tests

- The student monitoring hook configures teacher-pointer expiry.
- The teacher live-workspace hook configures no student-pointer expiry.
- Gateway tests prove that student disconnect and watch teardown publish null
  awareness to the remaining authorized peer.
- Pointer rendering keeps the current v2 label and semantic-surface placement.
- Existing collaboration tests continue to prove two-way Yjs editing and exact
  Monaco caret/selection propagation.

### Browser end-to-end test

Using simultaneous authenticated student and teacher browser contexts:

1. Move the teacher pointer over the statement, editor, and terminal and verify
   the student sees the labeled pointer on the corresponding surface.
2. Stop teacher movement and verify the student pointer overlay disappears
   after three seconds.
3. Move the teacher again and verify the overlay reappears.
4. Move the student pointer and verify it remains visible to the teacher for
   longer than three seconds.
5. Blur or leave the student's workspace and verify the teacher overlay clears.
6. Place and type from each editor at different lines and verify the other
   browser receives both the code changes and correctly labeled caret.
7. End or revoke the watch and verify pointers, carets, and collaborative
   editing are removed immediately.

## Acceptance criteria

- Only the teacher mouse pointer expires after three seconds of inactivity.
- The student mouse pointer remains visible to the teacher until an explicit
  leave, disconnect, watch end, or revocation.
- Teacher and student editor carets render at the exact peer line and column.
- Teacher and student code edits synchronize in real time through the existing
  shared document.
- Pointer expiry never removes a remote editor caret.
- No pointer or caret coordinates are persisted or logged.
- The behavior uses the v2 monitoring components and visual language.
- Unit, integration, typecheck, lint, and two-browser monitoring tests pass.
