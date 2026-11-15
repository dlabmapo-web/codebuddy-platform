# Preserve monitoring when Tutoring selects the current student

Date: 2026-11-15
Status: Proposed specification; implementation has not started.

## Problem and video evidence

Feedback: after opening a student's Live View, opening the top Tutoring drawer and selecting that same student, realtime monitoring appears to stop.

The supplied 33.7-second recording shows the following transition:

| Approximate time | Visible behavior |
| --- | --- |
| 5–18 seconds | The instructor sees the student's current code and execution output in the live workspace. |
| 20 seconds | The instructor opens Tutoring and selects the student already being monitored. |
| 22.5 seconds onward | The foreground changes to an older saved submission, with a submission date, 0/100 and older code. The outer header still displays Live. |

The recording demonstrates an unintended switch of the visible work source. It does not establish that the socket disconnected. In the current code, monitoring stays mounted underneath saved-work review; the visible editor is no longer the live document.

The required outcome is: **selecting the currently monitored student from Tutoring dismisses the drawer/review layer and reveals the existing monitoring workspace, without opening a saved submission or replacing its watch.** Explicit history and grading actions must still allow reviewing that student's saved submissions.

## Codebase findings

- `packages/web/src/components/student-history/monitor-history.tsx` owns the watched membership through its `membershipId` prop, a separate locally selected review student, a material and a boolean drawer state. Its `selectStudent` callback always sets the review student, including when it equals the watched membership.
- `TutorRoster` calls that callback for every clicked row. The row's selected styling does not change selection behavior.
- A selected review student mounts `TutorStudentWork`, which loads immutable attempts or saved draft data. `MonitoringLiveContent` hides/inerts the underlying monitoring content while leaving it mounted.
- `HistoryPresentationContext` exposes the same selection callback to `StudentSwitcher`, whose offline/other-material review paths legitimately need saved work. A blanket same-membership return inside that shared callback would change those deliberate review paths.
- `MonitoringHistoryActions` opens Tutoring with `open('material')`. The classroom's Grade Submission action in `packages/web/src/components/classroom/classroom-context.tsx` uses the same operation. Roster purpose therefore needs to be explicit before adding the new selection rule.
- `LiveHeader` displays the underlying workspace's save status and connection badge even while saved review covers it. An existing inline strip identifies reviewing saved work, but the header alone does not distinguish the foreground mode from the background connection.
- `e2e/specs/classroom-live.spec.ts` currently expects saved review after selecting the current student from Tutoring, then uses the top student selector to return to monitoring. That verifies recovery after another action, rather than the behavior requested in this feedback.

This spec changes the current-student Tutoring exception in [the history/tutoring design](2026-11-04-monitoring-student-history-and-tutoring-design.md), which otherwise sends Tutoring selections to immutable submissions. It preserves the classroom's explicit grading/history capabilities in [the classroom monitoring design](2026-11-13-classroom-live-monitoring-design.md) and the pointer isolation rules in [the cross-material presence design](2026-11-15-cross-material-tutoring-presence-design.md).

## Options and selected design

1. **Selected: distinguish Tutoring selection from explicit saved-review selection.** Tutoring reselecting the watched student reveals the existing monitor. Saved-review requests retain the current immutable-work behavior. This is a small presentation/selection change and preserves grading and offline review.
2. Special-case the watched membership in the generic `selectStudent` callback. This is smaller but conflates live resumption with deliberate saved review and risks breaking existing selector/grading consumers.
3. Route every Tutoring selection into live monitoring. This expands the feature into student switching and changes offline/other-material review behavior. It is unnecessary for the video case.

## Selection contract

The host must distinguish the **watched student**, **review student** and **roster purpose**. They must not be inferred from names, online status, score, row highlighting or the currently selected review student.

- Watched identity comes from the monitoring host's existing academy/class/membership scope. The teaching host has no watched membership; it must not fabricate one.
- Material-roster entry must state its purpose: `tutoring` or `saved-review`. The top Tutoring action uses `tutoring`; Grade Submission uses `saved-review`. Student history continues using its existing dashboard route.
- Keep the existing explicit review callback's semantics for consumers such as `StudentSwitcher`. Use a purpose-aware roster selection handler in the host rather than changing every selection based solely on membership equality.
- Store purpose with the open drawer, for example as a nullable typed drawer state. Closing clears that purpose. Opening via a different action establishes the new purpose after applicable guards; a previous grading intent must not leak into a later Tutoring selection.

| Entry and selected identity | Result |
| --- | --- |
| Tutoring; selected membership equals watched membership | Run applicable review/grading guards, close the drawer and any review layer, and reveal the existing monitor. Do not mount/fetch saved work for that selection. |
| Tutoring; a different membership | Preserve the existing saved-work review behavior for this fix, clearly identifying that mode and student. |
| Tutoring in teaching mode, without a watched membership | Preserve the existing saved-work review behavior and the instructor's private teaching workspace underneath. |
| Explicit saved review/Grade Submission; any authorized membership | Open saved work, including for the watched membership if one exists. Do not reinterpret the request as live resumption. |
| Student history or an explicit submission-history link | Preserve existing history navigation and guards, including access to the current student's old attempts. |
| Current student selected through the existing top selector | Preserve its existing guarded return-to-monitoring behavior. |

"Reveal the existing monitor" preserves the instructor's selected material. If they deliberately preview another lesson while monitoring A, choosing A from Tutoring closes the layer and restores that preview. It does not force-follow A to another material; the existing Return to live action retains that purpose. In the recording's same-material case, the revealed editor is the synchronized live document and continues receiving edits/output.

## Realtime, guards and identity

1. Same-student Tutoring selection is a local presentation transition. Preserve the underlying watch session/visit/generation, collaborative document, terminal state, edit mode and class transport pool.
2. Opening/closing this drawer or reselecting the current student must not emit a watch stop/start, close/create a socket, reload the route or require refreshing either browser. Normal awareness clears while a private layer is covered remain valid; they are not watch teardown.
3. Do not call a student-switch preparation routine solely to reveal the same mounted workspace. In particular, do not leave the existing `switching` flag latched after a transition that never switched students.
4. Keep receiving document, observation, result and terminal updates while the drawer/review covers monitoring. On reveal, show the latest synchronized work, rather than an earlier cached submission. The existing pointer coverage rules continue to hide live markers on saved work and restore eligible markers on monitoring.
5. Run existing review scratch-edit and grading guards before dismissing or replacing review. Declining a guard leaves selection, work and drawer state intact. Preserve underlying pending live edits without resetting or discarding them.
6. If connection state is reconnecting, offline, degraded or revoked, selecting the watched student reveals the existing appropriate state. It must not manufacture a Live status, silently substitute history or bypass authorization. Existing recovery/revocation rules remain authoritative.
7. Rapid repeated selections must be idempotent. A delayed selection/load from a previous class, watched student, material or roster purpose must not cover the newly active monitor with stale work. Reuse existing scope/query/guard handling rather than introducing global state.
8. Apply the same rule for Managers, Team Leads and assigned Teachers. Permissions remain unchanged; the comparison only affects an already authorized workspace.

## Foreground mode and header

- Keep the existing compact two-row header and inline class counts. Do not add another large banner or toolbar row.
- When actual saved review is selected, use the existing header status slot to identify **Saved review** / **저장된 작업 검토**, rather than showing only the background workspace's Saved/Unsaved or Teaching view status. Restore the original status when review closes.
- Keep the existing inline reviewing identity and submission date/result controls. The watched student and reviewed student must remain distinguishable when they differ.
- The connection badge continues to report the monitored connection. Its tooltip/accessibility description must identify that scope so a connected background watch cannot imply that the visible historical submission updates live. Preserve existing connection-state colors and labels.
- A drawer open without a selected saved review is still the underlying monitoring/teaching mode; do not label the roster itself as a saved submission.
- Reuse existing review/return labels where suitable. Add only necessary English/Korean strings and keep namespace size/parity checks passing.

## Implementation boundaries

Expected change locations are `HistoryPresentationContext`, `monitor-history.tsx`, `tutor-roster.tsx` only if its selection contract needs adjustment, `classroom-context.tsx` for explicit grading intent, and `LiveHeader` for foreground mode/status. Audit the `StudentSwitcher` review consumer without changing its intended routing or offline behavior.

No database migration, API contract, read implementation, new polling, transport or socket protocol is expected. Opening the existing roster may use its existing list request; reselecting the watched student must not trigger saved-attempt/submission/draft reads just to restore monitoring. Do not add a second roster/presence channel. If implementation unexpectedly changes a server read path, count its statements against disposable Docker PostgreSQL through `COVE_INTEGRATION_DATABASE_URL` and report the count as required by `AGENTS.md`.

## Verification requirements

### Component and integration regressions

- Extend `monitor-history.spec.tsx` with a real host/context/portal harness and observable roster/review stubs. Assert that Tutoring selecting the watched membership closes the layer, makes live content visible/non-inert, and never mounts the saved-work component or navigates. Cover no saved attempts and a visibly different historical attempt.
- Repeat selection after reopening Tutoring and after previously reviewing B while monitoring A. Verify the same live child/document remains mounted.
- Prove the inverse path: explicit saved review still opens A's saved submission, and selecting B or using the teaching host preserves the existing review behavior. Changing roster purpose must not retain a previous intent.
- Verify canceled scratch/grading guards, offline/reconnecting/revoked states, repeated clicks and scope changes. Ensure return does not leave live editing disabled through a stale switching state.
- Assert foreground Saved review status versus monitored connection status, including English/Korean labels and restoration of normal status. Existing saved-work pointer suppression and grading/history tests must remain valid.
- Keep the existing student-history, class assignment and authorization tests passing. No additional per-student database query loop is permitted.

### Localhost browser reproduction

Use separate student and instructor contexts with real Next/Nest and Socket.IO against disposable PostgreSQL/Redis and local provider fixtures. Run the primary scenario for Manager, Team Lead and assigned Teacher, including Korean labels for at least one role.

1. Seed an older submission whose code, output and score differ from the student's live work. Start live monitoring and confirm incoming student edits and execution output.
2. Open Tutoring and select the same student directly, matching the recording. Without using the top student selector, a return button or refresh, assert no saved-review editor/old submission is opened and the synchronized monitoring content remains visible.
3. Type new code and run it from the student's browser. Verify the instructor receives the new code and student output. Repeat the drawer/reselection sequence, including selection while student updates arrive.
4. Compare socket creation/closure and watch-start/stop counts before and after. They must stay unchanged throughout same-student drawer/reselection. A Live label or unchanged code alone is not sufficient evidence.
5. Explicitly open historical work through history/grading. Verify the correct saved source and Saved review label, permitted grading, and pointer isolation. Return through the existing guarded action and verify all student edits made underneath are visible.
6. Preserve another-student review, teaching-mode grading, independent lesson previews and existing student-switch behavior. Cover network loss/recovery during the same-student flow without presenting a stale snapshot as live.

Capture before Tutoring, the open roster, immediately after same-student selection, later live code/output, explicit saved review and restored monitoring. Include desktop/mobile and English/Korean examples. Record tested roles, transport assertions, screenshot paths and any limits in a verification note. Update the old browser expectation that intentionally entered saved review on same-student Tutoring selection; retain explicit history coverage separately.

Stop task servers and relevant Cove API processes/watchers on port 4000 after implementation verification, according to `AGENTS.md`. This specification-only task starts no servers.

## Acceptance and scope

The video's exact sequence must leave the instructor viewing the current student's realtime work, with the existing socket/watch still active. Explicit saved review remains available and visibly distinct. Guards, permissions, grading, independent browsing and private teaching continue working.

This does not replace the history dashboard, convert all Tutoring rows into live navigation, redesign transport ownership, synchronize lessons onto student devices or address cursor flicker/grading feedback. The prior cross-material pointer fix remains intact.
