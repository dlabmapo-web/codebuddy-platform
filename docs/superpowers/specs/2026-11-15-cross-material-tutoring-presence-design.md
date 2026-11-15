# Tutoring presence across different lessons

Date: 2026-11-15
Status: Implemented and verified on localhost. See the [verification and screenshots](../../research/2026-11-15-cross-material-tutoring-presence-verification.md).

## Problem and intended behavior

Feedback: while an instructor browses a chapter different from the student's current chapter, moving the student's mouse causes a message equivalent to “[Student] is looking at the code” to appear at the top.

For example, the student is solving Problem A and the instructor opens Problem B. Movement over A must not produce a cursor or a message suggesting that the student is looking at B. The instructor must remain free to browse B while the student's live session stays connected.

The boundary is the individual material ID, rather than the chapter name. Different problems within the same chapter are different materials, and two materials can have identical titles.

## Findings from the current code

- `packages/web/src/components/monitoring/remote-pointer.tsx` renders both cursor arrows and the `peer.looking_at` fallback. Failed editor projection and failed material/space placement both become `elsewhere`, which renders the fallback banner. This conflates a different document with an unavailable position on the current document.
- The programming `live-workspace.tsx` renders `live.remote.pointer` without an explicit check against the material currently displayed in the instructor's preview. The workspace intentionally keeps live state while displaying a separate snapshot.
- `packages/web/src/lib/monitoring/awareness/code-pointer.ts` already checks the pointer's material, draft, Yjs document and Monaco model during projection. A failed projection prevents an arrow but currently still allows the generic banner.
- `ObservationPresence` already compares its awareness envelope's `materialId` with the displayed material before rendering. Observation envelopes provide material identity even when a surface pointer's own `material` is null.
- Shared `pointerIsPlaceable` checks material identity for canvas coordinates; ordinary surface coordinates are allowed without their own material. Changing this helper to reject every null material would break otherwise valid terminal, outline and media pointers.
- The existing live header already reports the student's actual current material and reconnecting/not-solving state independently of the lesson being displayed.

These findings explain a plausible route to the reported banner. The original feedback attachment is not present in this task, so exact reproduction remains part of implementation verification.

## Approach

Use material-aware presentation gating before pointer placement. Treat a pointer belonging to a different or unverifiable material as hidden, rather than as an `elsewhere` fallback.

This changes the cross-material region-chip behavior specified in [the fixed-canvas design](2026-08-20-monitoring-pointer-fixed-canvas-design.md) and [the pointer/reading-position design](2026-09-14-monitoring-pointer-and-reading-position-design.md). Their same-material geometry and scrolling rules remain applicable. It preserves [the bidirectional pointer design's](2026-11-03-bidirectional-material-pointers-design.md) requirement that an instructor browsing another material cannot point into the student's view.

Alternatives considered:

1. Remove all fallback banners. This would remove the reported message but also discard useful same-material feedback when a pane is hidden or a position cannot be placed.
2. Stop the live watch while browsing another lesson. This would interrupt monitoring and make returning to the student less reliable.
3. **Selected: gate pointer presentation by the displayed material, preserving the watch and valid same-material placement behavior.** This addresses the misleading presence without changing collaboration ownership or transport lifecycles.

## Presentation rules

| Situation | Required result |
| --- | --- |
| Student and instructor display the same material; position is valid | Preserve the existing cursor marker and applicable off-screen direction controls. |
| Same material is verified, but the pane or position is unavailable | Preserve the existing truthful surface fallback; do not guess coordinates. |
| Instructor displays B while student is on A | Hide the student's pointer, direction controls and generic pointer fallback. Keep the existing header showing the student's actual lesson A. |
| Student moves to C while instructor remains on B | Keep B selected. Update the existing actual-location status to C; keep incompatible pointer presentation hidden. |
| Displayed material or the pointer's source material cannot be established | Hide material-specific pointer presentation until identity is established. Do not interpret two null IDs as a match. |
| Instructor returns to the student's current material | Resume eligible pointer presentation from current, unexpired awareness without requiring a new watch. |
| History/tutoring presentation covers the live workspace | Preserve the existing covered-state suppression. Underlying live pointers must not appear on saved work. |

Mouse movement must not change the displayed lesson, scroll the instructor's page automatically, open a notification or add another header row. Reuse existing “Live on …”, “Student is on …”, reconnecting and no-material strings where appropriate. The compact header, selector and inline class counts retain their layout.

## Identity and lifecycle requirements

1. Resolve the **displayed** material from the content actually being rendered, including a preview snapshot. Do not substitute the student's current live session ID when the instructor is viewing another material. While a replacement material loads, suppress pointers unless they match the content still actually visible.
2. Resolve pointer source identity from the existing accepted observation/watch context and pointer metadata. A non-null `pointer.material` must agree with its accepted source context. An observation envelope can establish identity for a pointer whose own material is null. Do not infer identity from a title, coordinates or a stale last-known session.
3. Scope accepted awareness to the current student and watch/session using the existing generation, sequence and expiry rules. Preserve those rules; a delayed event from a previous student or visit must not reintroduce a marker.
4. Material equality is necessary, but does not replace editor projection checks. Preserve draft, Yjs and Monaco-model validation. Do not project a live code anchor onto an unrelated saved snapshot merely because both use the same material ID.
5. Hide incompatible presentation immediately when content identity changes, before the next mouse event or animation-frame measurement. A cached placement must not survive a switch from A to B. Geometry observers must not revive a suppressed banner.
6. Preserve same-material handling of surface pointers with no embedded material when their accepted envelope/session establishes the material. Do not require a new wire field for this fix.
7. When the instructor is browsing another material, suppress that student's incoming pointer presentation across surfaces, including header and outline pointers. This prevents the same fallback from appearing through another surface. Existing same-material outline/header behavior remains unchanged; broader pointer placement in chapter selectors is a separate feedback item.
8. Apply the same identity principle to instructor pointers received by students where the shared presentation path is used. One teacher's mismatched pointer must not suppress another teacher's valid pointer. Private teaching work must remain private under the existing publication guards.
9. Hide stale pointers on offline/reconnecting/source-loss transitions according to existing awareness cleanup. A reconnect must require valid current context before showing them again. Do not add polling or alter pointer expiry to fix this issue.

## Implementation boundaries

- Extend the receiver/presentation boundary with explicit material eligibility, keeping the rule reusable rather than duplicating different comparisons for each rendering branch.
- Keep eligibility separate from geometry failure: hidden/incompatible pointers must never reach the generic `elsewhere` banner. Geometry failure for an eligible pointer retains current behavior.
- Cover both programming `RemotePointer` rendering and the `ObservationPresence` / `MaterialMousePointer` path. Audit student-side shared consumers when changing component props or defaults.
- Preserve live document updates, watch identity, pending-edit guards, tutoring ownership, grading and feedback behavior. Browsing or suppressing a marker must not emit watch-stop, close a socket or modify student code/progress.
- Managers, Team Leads and assigned Teachers receive the same correction within their existing monitoring permissions. No role or authorization expansion is required.
- No API, database, migration or protocol change is expected. Add no database reads or background refreshes. If implementation unexpectedly changes a read path, measure its statement count against disposable Docker PostgreSQL through `COVE_INTEGRATION_DATABASE_URL` as required by `AGENTS.md`.

Likely implementation and regression locations:

- `packages/web/src/components/monitoring/remote-pointer.tsx` and `remote-pointer.spec.tsx`
- `packages/web/src/components/monitoring/observation-presence.tsx` and `material-mouse-pointer.tsx`
- `packages/web/src/components/monitoring/all-material-monitor.tsx`
- `packages/web/src/app/(studio)/academy/[academySlug]/teach/classes/[classId]/students/[membershipId]/live/_components/live-workspace.tsx`
- `packages/web/src/lib/monitoring/awareness/code-pointer.spec.ts` and related awareness lifecycle tests
- `packages/web/src/components/monitoring/student-material-pointers.spec.tsx` and student programming pointer consumers

## Verification and acceptance

Automated component tests must assert rendered output, including the portal in `document.body`, rather than only testing an identity helper:

1. A pointer for A while displaying B renders no cursor, direction control or `peer-pointer-elsewhere` banner. Repeat after moving the pointer and after resize/scroll/DOM mutation events.
2. Switching from A to B while a marker/banner is visible removes it without waiting for another awareness packet. Returning to A allows only valid, unexpired awareness.
3. Different material IDs with identical titles stay incompatible. Missing identities and null/null do not pass accidentally. Envelope-proven surface pointers continue working.
4. Valid same-material arrow placement, direction controls, unavailable-pane fallback and late-mounted media surfaces retain their behavior. Existing code-pointer draft/model mismatch checks continue passing.
5. Exercise programming-to-programming and programming-to-other-material transitions, student changes while the instructor is pinned, covered history, offline/reconnect and student switching with a delayed old event.
6. Preserve valid pointers from other teachers when one teacher has incompatible context. Verify private teaching previews do not leak pointers to students.

Browser verification must use separate instructor and student contexts with controlled local/disposable fixtures. Verify Manager, Team Lead and assigned Teacher access. Student A remains open while the instructor selects B; moving the student's mouse must leave B selected, show no misleading banner, and continue updating the actual-location status. Return to A and verify code updates and valid pointer movement still work. Assert watch/transport stability during browsing, rather than relying only on a “Live” label.

Capture English and Korean screenshots for the same-material and different-material cases, with the displayed lesson and actual student lesson visible. Record the reproduction outcome, checks and screenshot paths in a verification note. Do not claim the reported image/video was reproduced unless it was observed. Stop task development servers and leave Cove API port 4000 free after implementation verification according to `AGENTS.md`.

Acceptance: mouse movement on another lesson cannot imply that the student is viewing the instructor's displayed lesson; valid same-material collaboration remains functional; browsing and returning preserve realtime monitoring and the compact workspace layout.

## Out of scope

Global cursor flicker, broader cursor placement in chapter selectors, student-device lesson synchronization, grading the “Output Statements 2” exercise, and a monitoring transport redesign are separate tasks.
