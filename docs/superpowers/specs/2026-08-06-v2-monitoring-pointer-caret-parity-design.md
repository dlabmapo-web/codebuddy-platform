# V2 Monitoring Pointer and Caret Parity

**Date:** 2026-08-06
**Status:** Approved for implementation
**Reference:** Observable monitoring behavior on `main`

## Problem

V2 synchronizes the student and teacher Monaco documents and transports
awareness through the authenticated monitoring gateway, but its visibility
rules drift from the established `main` experience:

- the teacher's purple Monaco caret and generic label remain indefinitely on
  the student screen instead of disappearing after three seconds of inactivity;
- the student's mouse arrow remains indefinitely on the teacher screen instead
  of disappearing after three seconds;
- browser blur and pointer-leave handling can clear an arrow immediately when
  one person tests Student and Teacher in two windows on one computer, making
  working pointer transport look broken before the other window can be viewed.

The active collaboration room and cursor transport are functioning: the
screenshots show the teacher and student Monaco caret labels on the opposite
screens. The required change is to reproduce `main`'s marker lifecycle and make
the mouse path reliably observable without replacing v2's backend.

## Reference Behavior

The implementation on `main` establishes these product rules:

- the teacher's Monaco caret and generic name on the student screen disappear
  three seconds after the teacher stops moving the caret;
- the student's Monaco caret and name remain at the last active line on the
  teacher screen while the live collaboration session remains active;
- teacher and student mouse arrows disappear three seconds after their last
  movement;
- a new pointer or caret event makes the corresponding marker appear
  immediately and restarts its timer;
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
| Teacher | Student mouse | Expires after 3 seconds |
| Teacher | Student Monaco caret/name | Held until cleared/session end |

Pointer and caret expiry are independent. Cursor traffic cannot keep a mouse
arrow alive, and mouse traffic cannot keep a Monaco caret alive.

## Focus, Leave, and Disconnect Semantics

Moving onto an unsupported area inside the same visible page may clear the
arrow because the peer is no longer pointing at a shared Cove surface.

Browser `blur`, document `pointerleave`, and `visibilitychange` will not send an
immediate pointer clear. The last valid pointer remains subject to the normal
three-second receiver expiry. This preserves `main`'s visible idle behavior and
lets a developer switch between Student and Teacher windows to inspect it.

Component teardown, draft replacement, confirmed watch end, access revocation,
and socket departure still clear awareness immediately. Those events mean the
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
- The last successfully received marker expires according to policy.
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
- student mouse movement appearing on the teacher screen and expiring;
- switching focus between the two windows without an immediate clear;
- teacher caret appearing on the student screen and expiring;
- student caret appearing on the teacher screen and remaining;
- movement after expiry restoring each marker;
- watch end clearing every marker;
- WebKit and Chromium behavior on supported parent surfaces.

The affected web and API unit suites, type checks, lint checks, production
build, and targeted Chromium/WebKit monitoring projects must pass.

## Scope

This work changes only transient pointer and Monaco-caret visibility in the v2
live workspace. It does not alter authorization, document synchronization,
autosave, run/submission permissions, feedback persistence, roster presence,
or monitoring audit records.
