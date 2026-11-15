# Shared mouse pointer flicker

Date: 2026-11-15
Status: Implemented and verified on localhost. See the [verification report and screenshots](../../research/2026-11-15-shared-pointer-flicker-verification.md).

## Problem and evidence

Feedback: shared mouse pointers flicker heavily, regardless of role.

The supplied recording, `_talkv_dJMcbyzhjyv_NehVkDUTfSKPz2tYYF2bZk_talkv_high.mp4`, is approximately 21.7 seconds long at 30 frames per second. Its purple remote pointer and name label repeatedly disappear for short intervals during movement over the editor. For example, the marker is visible at 0.033 seconds, absent at 0.067 seconds, and visible again at 0.100 seconds. Code changes continue to appear during the recording. The recording establishes visible flicker; it does not establish a socket disconnection or identify the exact deployed revision.

Inspection and an isolated reproduction against the current `RemotePointer` component identify a rendering defect consistent with the recording:

1. `placementKey(pointer)` includes changing coordinates and code/anchor metadata.
2. A received position updates the pointer prop before its measured placement has been updated.
3. The render rejects the previous placement because its key no longer matches and returns `null`, removing the portal's marker and label.
4. A passive effect schedules measurement with `requestAnimationFrame`.
5. Measurement updates state, recreating the marker after the temporary absence.

The isolated reproduction observed an initially visible marker, no marker immediately after a position update, and a newly created marker after the animation callback. This also interrupts the existing CSS movement transition, which depends on retaining the same element. The component rebuilds its geometry observers on pointer changes, adding avoidable work to frequent movement updates.

This defect exists in the current shared renderer. It is not proof that every disappearance in the supplied recording has the same cause: explicit clears, expiry, or failed editor projection can independently hide or change pointer presentation.

## Goals and scope

- Keep a valid remote arrow and its name continuously visible during ordinary movement within the same eligible presentation context.
- Preserve smooth movement on the existing element, including when position packets arrive faster than a browser frame.
- Correct the common rendering path used by students and authorized monitoring staff: Managers, Team Leads and assigned Teachers.
- Cover collaborative code pointers and observation/snapshot pointers, as well as statement, terminal, manual, media and other existing supported surfaces.
- Preserve accurate projection, immediate suppression of incompatible lessons, lifecycle cleanup, independent peers and realtime collaboration.

This builds on [cross-material tutoring presence](2026-11-15-cross-material-tutoring-presence-design.md) and [bidirectional material pointers](2026-11-03-bidirectional-material-pointers-design.md). Their material/privacy rules remain authoritative. Earlier pointer lifecycle documents contain historical caret and blur behavior; this task preserves the current caller policies and capture behavior rather than reintroducing those older behaviors.

## Approaches considered

| Approach | Benefit | Limitation |
| --- | --- | --- |
| **Selected: retain eligible presentation and update its geometry before paint** | Fixes the shared rendering gap, keeps arrow identity and existing transitions, and preserves React ownership of the overlay. | Requires explicit separation of content eligibility, pending movement and geometry results. |
| Update a persistent overlay entirely through imperative DOM writes | Can avoid React work on every position. | Adds a second state-management path and more manual lifecycle/portal cleanup than this defect requires. |
| Increase packet frequency, add delayed hiding, or always reuse the last placement | Superficially masks some gaps. | Does not fix removal/recreation, can show stale pointers on another lesson, and may increase traffic. |

## Required presentation behavior

| Situation | Required result |
| --- | --- |
| Valid position changes on the same eligible material and surface, with a valid projection | Update the existing arrow and label without an intermediate empty presentation or DOM removal. |
| Several positions arrive before a frame is drawn | Present the newest valid position; obsolete measurements cannot overwrite it. |
| The pointer stops moving | Keep the existing caller-specific lifetime: teacher markers shown to students expire after three seconds; student markers shown to staff remain until the existing lifecycle clears them. |
| Same-material position becomes unavailable or off screen | Use the existing truthful fallback or direction control. Do not retain an arrow at an invalid location to conceal flicker. |
| Pointer is explicitly cleared, its accepted source is lost, or its lifecycle expires | Remove it promptly under the current lifecycle rules, including while a geometry callback is pending. |
| Displayed material changes, source material becomes unknown/conflicting, or history covers the live workspace | Hide incompatible presentation immediately; no old arrow, direction control or generic banner may appear on the replacement content. |
| Another peer moves, expires or leaves | Update only that peer's marker and preserve other eligible peers. |
| Pane scrolls/resizes, code changes, or a media surface mounts late | Reproject current awareness against the current layout without creating a movement-driven blank frame. |
| Reduced motion is enabled | Keep continuous visibility with motion animation disabled according to the existing preference. |

Continuity applies to valid arrow-to-arrow movement. A legitimate arrow/fallback/direction change, surface change, source change or explicit clear is not required to reuse the same DOM element. The arrow must not remain painted after its projection becomes invalid.

## Design

### Separate eligibility from coordinates

Keep the material and covered-history guard at the `RemotePointer` boundary, before geometry or fallback selection. Eligibility remains based on the displayed content, accepted source context and embedded material identity. Null/null identity is not a match.

Within an eligible instance, distinguish a measurement's position/version from the context in which an existing placement is safe to use. A new coordinate sample alone must not make the portal disappear. Retaining presentation is limited to the same peer instance, eligible content context, coordinate space and surface; it must never bridge an incompatible context or conceal a source clear. Code placement continues to validate draft, document/model and relative-position identity. Snapshot placement continues to validate file/content identity.

Do not weaken `projectCodePointer`, snapshot projection, `pointerIsPlaceable`, or the cross-material guard to obtain continuity. If the current projection cannot be trusted, use the existing unavailable-position behavior instead of displaying a stale arrow.

### Commit position updates without a visible empty state

Use React-owned placement state and retain the arrow element through ordinary valid position changes. Measure a changed pointer/projection in a layout effect so the new validated result is committed before the browser paints. A previous placement may bridge the render-to-measurement interval only within the eligible context described above; it must not be painted as a substitute for a failed new projection.

The implementation must avoid the current sequence of returning `null` for each new position and recreating the portal in a later animation frame. Merely moving the same removal/recreation cycle into a layout effect is insufficient: tests must prove that the arrow element itself remains the same during valid movement, allowing the existing position transition to continue.

Retain animation-frame coalescing for bursts of scroll, resize, mutation and editor geometry notifications. Read the latest accepted pointer/projection when measuring. Cancel or invalidate obsolete callbacks so an older frame cannot restore a cleared pointer, overwrite a newer position, or repaint after a lesson/source change or unmount. Repeated equivalent geometry results should not cause redundant state updates.

Keep the existing name, colors, pointer size, non-interactive overlay and motion preference. No header, toolbar or workspace layout changes are needed.

### Geometry observation and cleanup

Observe the active surface, relevant ancestors and anchor content as needed by existing placement behavior. Geometry subscriptions should depend on the observed context rather than being rebuilt for every coordinate update. If a surface or anchor target changes, refresh the relevant observation deliberately; keep late-mounted media recovery working.

The overlay's own portal insertion or position writes must not create a self-sustaining observer/animation loop. Disconnect observers, remove listeners and cancel outstanding frames on teardown or context replacement. Do not add a perpetual animation loop or a new polling timer.

### Realtime boundaries

Keep existing socket ownership, watch identity, source/generation/sequence fencing, publication suppression and reconnect handling. Moving, reprojecting or hiding a pointer must not stop/restart a watch or disconnect its socket.

Preserve the existing 80 ms mouse publication interval, volatile movement delivery and reliable lifecycle clears. Do not change expiry timing or add extra publication to mask the renderer defect. Preserve code synchronization, run/output updates, tutoring, grading and feedback behavior.

No API, socket protocol, permissions, database schema, database read path or persistence change is expected. Added SQL statements: zero. If implementation unexpectedly changes a read path, apply the integration statement-count requirements in `AGENTS.md` against disposable Docker PostgreSQL through `COVE_INTEGRATION_DATABASE_URL`.

## Expected implementation locations

- `packages/web/src/components/monitoring/remote-pointer.tsx`: presentation continuity, measurement scheduling and geometry subscription lifecycle.
- `packages/web/src/components/monitoring/remote-pointer.spec.tsx`: deterministic continuity and suppression regressions using the actual portal output.
- `packages/web/src/components/monitoring/material-mouse-pointer.tsx` and `observation-presence.tsx`: audit their projection inputs and shared renderer integration; change only if required.
- `packages/web/src/lib/monitoring/awareness/code-pointer.ts`, `snapshot-pointer.ts` and their existing tests: preserve projection validity and geometry notifications.
- Existing pointer browser journeys such as `e2e/specs/monitoring-pointer-parity.spec.ts` and cross-material presence coverage: extend or add focused coverage using existing disposable fixtures.

Keep any extracted geometry/scheduling helper narrowly scoped to the renderer. A transport redesign or general monitoring refactor is unnecessary.

## Verification and acceptance

### Deterministic component coverage

Use controlled animation frames and React commits. Observe the portal in `document.body`, not only internal helper state. Assertions must cover the interval immediately after a position update, rather than waiting until a delayed measurement has settled.

1. Place a valid arrow, record its DOM node, update its position repeatedly, and assert continuous presence of the same node and label. Assert that coordinates actually advance to each accepted newest position.
2. Repeat for normalized surface/anchor movement, collaborative editor projection and snapshot/custom projection. Include position changes caused by updated projection inputs rather than only `pointer.x`/`pointer.y`.
3. Deliver multiple positions before a scheduled geometry callback; the final result must use the newest sample. Pending callbacks must not overwrite a newer committed placement.
4. Change lesson/source eligibility, clear the pointer, cover the workspace, and unmount with frames pending. Incompatible markers must disappear immediately and must not return when callbacks execute. Preserve different-ID/same-title and missing-identity coverage.
5. Exercise valid-to-invalid editor/snapshot projection and arrow/fallback/direction transitions. Never hold an invalid arrow just to satisfy a continuity assertion.
6. Preserve scroll/resize/anchor reflow and late-mounted media placement. Unchanged geometry must settle without an observer feedback loop or unnecessary state churn.
7. Preserve independent markers for multiple teachers and existing three-second teacher-pointer expiry versus non-expiring student-pointer policy. Position traffic must not change unrelated lifecycle behavior.

Run the existing cross-material pointer, projection, peer-awareness and lifecycle regression suites, plus typecheck and focused lint appropriate to the implementation.

### Localhost browser verification

Use separate authenticated learner and staff contexts against controlled local/disposable fixtures. Exercise Manager, Team Lead and assigned Teacher access; validate both pointer directions. Include a second monitoring staff member to check independent markers.

- Sweep through valid editor coordinates repeatedly, including whitespace, while code edits and run/output updates are arriving. Check continuous arrow/label visibility and correct movement in both directions.
- Repeat over the statement and terminal, and exercise at least one observation/snapshot material path using its existing fixtures. Verify resize/scroll and reduced-motion behavior.
- During continuous valid movement, sample the receiver at animation frames and audit marker removals/replacements. Require no unexplained missing/hidden frames or DOM replacement within that eligible movement segment. A test that only eventually finds a visible arrow does not prove flicker is fixed.
- Track accepted awareness traffic so missing packets can be distinguished from presentation gaps. Establish the eligible movement segment before counting frames; intentional expiry, projection failure and context changes must be tested separately rather than excluded without explanation.
- Stop moving and verify the applicable asymmetric lifetime. Switch lessons, return, disconnect/reconnect and clear the session; confirm correct suppression and recovery without stale pointers.
- Verify two-way code updates and inspect actual socket/watch events during movement and pane changes. No movement-induced transport close/reopen or watch stop/start is permitted; separately initiated disconnect/reconnect tests should recover normally.

Record the browser/version, scenario, commands and outcomes in `docs/research/2026-11-15-shared-pointer-flicker-verification.md` when implementation is tested. Capture a short before/after screen recording or consecutive-frame sequence plus representative screenshots showing both roles. Screenshots alone cannot establish continuous visibility. Report any remaining gaps and whether they were caused by a legitimate projection/lifecycle transition.

Stop temporary task servers and leave Cove API port 4000 free after verification as required by `AGENTS.md`. Inspect process identity before terminating a listener.

Acceptance: ordinary valid shared-pointer movement stays continuously visible on the same arrow element; projection and context changes remain truthful; existing lifecycle and realtime behavior passes regression checks; verification evidence demonstrates the absence of the recorded hide/show cycle.

## Out of scope

- Changing whether pointers are allowed in the chapter selector or header. That is separate feedback.
- Restoring the reverted same-student Tutoring change or changing saved-submission navigation.
- Changing grading for Output Statements, Exercise 2.
- New pointer styling, remote caret features, student-device lesson synchronization or additional monitoring authority.
- Guaranteeing network delivery or redesigning Socket.IO, Yjs or observation transport.
