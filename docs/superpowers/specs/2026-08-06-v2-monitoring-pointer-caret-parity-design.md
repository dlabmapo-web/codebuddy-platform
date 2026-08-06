# V2 Monitoring Pointer and Caret Parity

**Date:** 2026-08-06
**Status:** Approved for implementation
**Reference:** Corrected teacher/student monitoring lifecycle approved by the user

## Problem

V2 synchronizes the student and teacher Monaco documents and transports
awareness through the authenticated monitoring gateway, but its visibility
rules drift from the established `main` experience:

- the teacher's purple Monaco caret and generic label remain indefinitely on
  the student screen instead of disappearing after three seconds of inactivity;
- the student's mouse arrow and caret must remain at their last valid positions
  on the teacher screen for the entire problem-detail visit;
- browser blur and pointer-leave handling can clear an arrow immediately when
  one person tests Student and Teacher in two windows on one computer, making
  working pointer transport look broken before the other window can be viewed.

The active collaboration room and cursor transport are functioning: the
screenshots show the teacher and student Monaco caret labels on the opposite
screens. The required change is to apply the corrected asymmetric lifecycle
without replacing v2's backend.

## Reference Behavior

The required product rules are:

- the teacher's Monaco caret and generic name on the student screen disappear
  three seconds after the teacher stops moving the caret;
- the student's Monaco caret and name remain at the last active line on the
  teacher screen while the student remains on the problem-detail workspace;
- the student's mouse arrow remains at its last valid position on the teacher
  screen while the student remains on that workspace;
- the teacher's mouse arrow on the student screen disappears three seconds
  after the teacher's last movement;
- a new pointer or caret event updates the corresponding marker immediately
  and, for teacher markers, restarts its timer;
- ending collaboration removes every remote marker.

V2 will match those observable rules. It will not copy `main`'s public
Supabase-channel transport, client-authored identity, session ownership, or
whole-document broadcasts.

## Architecture

V2 continues to use:

- the authenticated Socket.IO monitoring namespace;
- server-authoritative teacher/student origin stamping and draft access;
- Yjs document synchronization;
- normalized named surfaces and fractional pointer coordinates;
- generic teacher identity on the student screen;
- server-generated awareness clears when a participant leaves the draft room.

Marker visibility becomes a receiver-owned policy. `useAwareness` will keep the
latest server-validated pointer and cursor along with independent movement
timestamps. Callers choose a lifecycle for the remote pointer and remote
cursor:

| Reader | Remote marker | Lifecycle |
| --- | --- | --- |
| Student | Teacher mouse | Expires after 3 seconds |
| Student | Teacher Monaco caret/name | Expires after 3 seconds |
| Teacher | Student mouse | Held until the student leaves the problem workspace |
| Teacher | Student Monaco caret/name | Held until the student leaves the problem workspace |

Pointer and caret expiry are independent. Cursor traffic cannot keep a mouse
arrow alive, and mouse traffic cannot keep a Monaco caret alive.

## Focus, Leave, and Disconnect Semantics

Moving onto an unsupported area inside the same visible page does not clear the
last valid arrow. There is no meaningful shared coordinate for that area, so
the receiver retains the last representable position. Returning to a shared
surface updates it normally.

Browser `blur`, document `pointerleave`, and `visibilitychange` will not send an
immediate pointer clear. The teacher's last valid pointer remains subject to
its three-second receiver expiry; the student's remains visible to the teacher.
This also lets a developer switch between Student and Teacher windows to
inspect the behavior.

Student problem-workspace teardown, draft replacement, confirmed watch end,
access revocation, and socket departure clear awareness immediately. Closing
or navigating away from the student's problem-detail page therefore removes
both student markers from the teacher screen. Those events mean the
collaboration ended; they are not ordinary inactivity.

## Components and Data Flow

1. Student or teacher mouse movement resolves to a supported collaboration
   surface and is normalized before publication.
2. Monaco cursor/selection changes publish line and column coordinates.
3. The gateway validates draft access, stamps the authenticated origin, and
   forwards the compact awareness payload without persistence.
4. The peer records separate pointer and cursor activity timestamps.
5. The configured lifecycle exposes or suppresses each marker.
6. Rendering remains delegated to `RemotePointer` for arrows and
   `attachRemoteCursor` for Monaco content widgets.

The gateway payload stays unchanged because the receiving browser timestamps
validated arrivals. No identity, raw screen coordinate, keystroke, or history
is added to the protocol.

## Error and Recovery Behavior

- A dropped volatile movement frame is superseded by the next movement.
- The last successfully received marker expires or remains according to its
  receiver policy.
- Reliable server or lifecycle clears remove both pointer and cursor without
  waiting for an inactivity timer.
- Reconnection and document resynchronization do not revive an expired marker;
  the peer must move or type again.
- A marker from a previous draft can never render in a replacement draft.

## Verification

Unit tests will cover:

- expiring and held cursor lifecycles;
- independent pointer and cursor timestamps;
- exact three-second boundaries;
- cancellation and replacement of timers;
- cleanup on explicit clear and draft replacement.

Two-browser end-to-end tests will cover:

- teacher mouse movement appearing on the student screen and expiring;
- student mouse movement appearing on the teacher screen and remaining beyond
  three seconds of inactivity;
- switching focus between the two windows without an immediate clear;
- teacher caret appearing on the student screen and expiring;
- student caret appearing on the teacher screen and remaining;
- teacher movement after expiry restoring the teacher marker;
- student navigation away from the problem page clearing the student's pointer
  and caret;
- watch end clearing every marker;
- WebKit and Chromium behavior on supported parent surfaces.

The affected web and API unit suites, type checks, lint checks, production
build, and targeted Chromium/WebKit monitoring projects must pass.

## Scope

This work changes only transient pointer and Monaco-caret visibility in the v2
live workspace. It does not alter authorization, document synchronization,
autosave, run/submission permissions, feedback persistence, roster presence,
or monitoring audit records.
