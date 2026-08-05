# Main-Style Monitoring Caret and Iframe Pointer Design

**Date:** 2026-08-05  
**Status:** Approved design  
**Parent designs:** `2026-08-04-teacher-live-monitoring-design.md`,
`2026-08-05-asymmetric-monitoring-pointer-lifecycle-design.md`

## Summary

The v2 teacher workspace must make the student's live editor position as clear
as it is on `main`. The remote student caret becomes the primary editing
indicator: a blue caret and attached blue student label at the exact Monaco line
and column. The separate purple `Editing with …` badge is removed.

Student pointer capture must also cover the complete visible workspace. V2
sandboxes authored problem HTML in a same-origin, script-disabled iframe.
Pointer events inside that document do not bubble to the parent document, so
the monitoring hook must listen inside registered workspace iframes and map
their coordinates back to the owning semantic surface.

## User experience

### Teacher view

- The student's Monaco caret is blue (`#1B64DA`), matching `main`.
- A blue label containing the authorized student display name is attached to
  the caret at the exact code line and column.
- The label remains visible until the student leaves the shared document; it
  does not fade merely because the student pauses to read or think.
- The purple `Editing with …` badge above the editor is removed.
- The student's labeled mouse pointer appears over the statement, editor,
  terminal, and other registered shared surfaces, including content rendered
  inside the statement iframe.
- The student pointer follows the previously approved lifecycle: inactivity
  does not hide it; explicit leave, disconnect, watch end, or revocation does.

### Student view

- The teacher's Monaco caret remains purple (`#7C3AED`) with the generic
  `Teacher` label.
- The teacher mouse pointer still expires after three seconds without teacher
  mouse movement.
- No teacher identity is disclosed.

## Architecture

### Role-specific remote caret

The Monaco remote-cursor helper accepts an explicit visual role, `STUDENT` or
`TEACHER`. It applies the corresponding `main` color through role-specific CSS
classes while retaining Monaco's content-widget positioning. The role is
declared by the caller, never inferred from translated label text:

- `LiveEditor` renders its remote peer as `STUDENT`;
- `useStudentMonitoring` renders its remote peer as `TEACHER`.

The widget continues to expose its received line and column for deterministic
browser assertions. Caret events retain trailing-edge coalescing so the final
position cannot be lost inside the throttle window.

### Cross-document pointer capture

The awareness layer owns pointer capture for both the parent document and any
same-origin iframe located within a registered collaboration surface.

For each frame it:

1. finds the nearest registered surface in the parent document;
2. attaches pointer listeners to the iframe document after each load;
3. translates iframe-local `clientX` and `clientY` through the iframe bounding
   rectangle into parent-viewport coordinates;
4. normalizes that point against the owning surface rectangle; and
5. publishes the normal semantic surface plus fractional coordinates through
   the existing throttled awareness event.

A mutation observer discovers frames added after monitoring begins. Frame load,
mutation, draft change, and component teardown all remove their listeners.
Cross-origin or inaccessible frames are skipped safely; Cove's authored-content
frame is accessible because it uses `srcDoc` with `sandbox="allow-same-origin"`
and does not permit scripts.

The rich-text component remains unaware of monitoring. No transparent overlay
is added, so text selection, links, scrolling, and accessibility are unchanged.

## Failure and cleanup behavior

- A frame that is not loaded yet begins reporting after its `load` event.
- Accessing an unavailable frame document must not break parent-document
  pointer capture.
- Repeated discovery must not attach duplicate listeners to one document.
- Removing or reloading a frame detaches the old document listener.
- Leaving a frame or the owning surface publishes the same non-volatile clear
  used by parent-document pointer capture.
- Socket disconnect and watch teardown retain server-owned awareness clearing.
- Pointer and caret coordinates remain transient and are never persisted or
  logged.

## Testing

### Unit and component tests

- Student and teacher caret roles map to the `main` blue and purple colors.
- Updating a remote cursor records the exact line and column on the Monaco
  widget and retains the label while idle.
- Iframe-local coordinates map correctly into the owning surface fraction.
- Frame discovery, reload, removal, and teardown attach and remove listeners
  exactly once.
- An inaccessible frame is ignored without affecting parent pointer capture.

### Browser test

With simultaneous teacher and student contexts:

1. Put the student caret at a known line and column and type immediately.
2. Verify the teacher sees a blue student label at the final coordinate and no
   `Editing with …` badge.
3. Wait beyond three seconds and verify the student caret label remains.
4. Move the student inside the problem-description iframe and verify the
   teacher sees the student pointer on the `statement` surface.
5. Move the student across editor and terminal surfaces and verify continuous
   teacher-side updates.
6. Verify explicit leave and disconnect clear the pointer.
7. Verify teacher pointer expiry and two-way code synchronization still pass.

The browser suite runs in Chromium in CI and includes WebKit coverage for the
caret and iframe-pointer cases to exercise Safari's event and iframe behavior.

## Acceptance criteria

- The teacher sees the student's blue, labeled caret at the exact active line
  and column, visually matching `main`.
- The teacher-side `Editing with …` badge is absent.
- The teacher sees student mouse movement over all registered v2 workspace
  surfaces, including the problem-description iframe.
- Student pointer inactivity does not hide the pointer.
- Student leave, disconnect, watch end, and revocation clear pointer and caret
  state.
- The student sees the generic purple teacher caret and the teacher pointer
  still expires after three seconds of teacher mouse inactivity.
- No pointer or caret state is persisted.
- Unit, typecheck, lint, Chromium, and focused WebKit tests pass.
