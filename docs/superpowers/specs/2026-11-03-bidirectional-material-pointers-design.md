# Bidirectional material mouse pointers

Implement the user's requested mouse-only monitoring across programming,
Turtle, PDF, video, quizzes and written answers. Both sides see the other's
mouse; teacher markers expire on the student after three seconds. Student
markers stay visible to monitors until their source leaves. Remove remote caret,
selection and line-label widgets on both sides; preserve code synchronization.

Extend the existing observation socket with an ephemeral teacher-pointer relay.
It must require the authorized observation lease, derive the peer identity on
the server, and match academy/class/student/current material and source. A
monitor browsing another material must not point into the student's view.
Support independent teachers with independent expiry and sequence/generation
fences. Forward no answer writes or editor authority through this channel.

Reuse the same surface/anchor and Monaco mouse geometry in both directions.
Give manual editors a shared snapshot-pointer binding and register it from both
the student editor and the observed editor, including content/file fencing and
pixel displacement. Preserve pointers across window changes, clear on navigation
or source loss, and expire only teacher-to-student markers after inactivity.

Reproduce programming → PDF/manual → programming with no refresh on either
side. React/Next cached-page restoration must create a usable collaboration
session after retirement and reacquire its authoritative document even if an
earlier watch-start push was missed. Recheck the current source on the server;
do not manufacture membership or attachment authority in the client.

Test authorization, source and sequence fences, independent marker lifetimes,
cached-session restoration and geometry. Extend the real local Chromium/WebKit
journeys to point in both directions, check three-second expiry, remove caret
labels, and verify pointer/code synchronization after repeated material returns
without reload. Use disposable local services, capture evidence, and do not
merge or deploy.

Implementation and browser evidence are recorded in the
[verification report](../../research/2026-11-03-bidirectional-material-pointers-verification.md).
