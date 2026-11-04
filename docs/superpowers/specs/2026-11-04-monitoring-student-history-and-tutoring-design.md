# Student history and submission tutoring inside monitoring

Date: 2026-11-04.
Status: **Proposed — pending user approval. No implementation authorized by this document.**
Evidence: [Elice browser and Cove source research](../../research/2026-11-04-monitoring-student-history-elice-research.md).

## 1. Problem and intended result

A Teacher, Team Lead or Manager watching a student must currently leave monitoring, open student analytics, find that student, and navigate again to inspect previous work. Course tutoring exists, but is not accessible as a submission-review workflow inside monitoring.

Provide a direct path from the monitored student to their history, statistics and submitted work. Opening a coding submission shows the statement and an editable private copy in a proper editor with Run, Stop, input and output. Closing review returns to the existing monitoring session without a browser refresh.

The user explicitly chose **private testing copies**: editing or running historical work never changes the student's draft, submitted answer, grade, completion, learning-time total or submission count. Existing live collaborative editing remains a separate activity and keeps its automatic editing behavior; do not reintroduce an edit-on/off switch.

## 2. Approach and boundaries

Considered three approaches:

| Approach | Benefit | Cost |
| --- | --- | --- |
| Contextual history panel plus expanded submission workspace — recommended | Immediate access, room for evidence and code, preserves live context | Requires explicit ownership of history state and private execution |
| Deep link to existing analytics/review pages | Small initial change | Still leaves monitoring and does not add private runnable review |
| Put history and statistics inside the student-switcher popover | Close to student identity | Crowds switching, gives insufficient room for curriculum and attempts |

Choose the contextual panel. Reuse existing tutoring roster behavior, attempt read models, editor primitives, assessment rendering and execution infrastructure. Do not mount the existing tutoring or manual grading workspace unchanged: both have responsibilities that historical review must not inherit.

In scope: contextual student overview, grouped material history, tutoring by selected material, paginated attempts, private coding/Turtle reruns, read-only quiz/written responses, and monitoring continuity.

Out of scope: rebuilding academy-wide analytics, changing grade rules, submitting/regrading on behalf of students, publishing historical feedback, exporting reports, session replay, EPS/class ranking, new PDF tracking, and new durable Run-count instrumentation.

## 3. Entry points and identity

- Add a clearly labelled **Student history** button beside the student switcher in every monitoring material type, including saved previews and offline states when history access remains authorized.
- Opening it selects the currently monitored student's history and initially filters to the displayed material's course. Offer **All assigned courses** and individual authorized course filters; the heading always states the active scope.
- Add **Tutoring** in the material action area for materials with submissions. It opens the same history surface in **By material** mode, preselected to the displayed material and monitored student.
- The panel has **By student** and **By material** views. Switching views keeps student/material selection where applicable. Student history is not hidden behind the switcher menu.
- Keep `watchedMembershipId` separate from `reviewMembershipId`. In By material, choosing another student's historical work does not silently switch the live watch. Show “Monitoring [A]” and “Reviewing [B]” whenever they differ. Switching the actual live target continues to use the existing student switcher and its pending-edit guard.
- Historical browsing works for authorized offline students. Online availability controls live actions, not whether a saved submission can be read.
- All selections use academy/class/membership/material IDs. Display names and user IDs are not authorization keys.

## 4. History panel and student overview

Use Cove's existing typography, colors, avatars, borders and controls. Adopt Elice's information hierarchy rather than its branding or entire application navigation. Fit the new actions into the existing header/toolbars; do not add permanent full-width banners or change the coding workspace geometry while history is closed.

On desktop, open a right-side panel up to 960px wide, bounded by the viewport. Keep the monitoring header and live connection status available. Provide an expand control for a full workspace view. On narrow screens, use a full-width surface with explicit Back/Close actions; do not squeeze a large results table into the switcher popover.

The top contains the selected student's identity, class, current live location/availability, course filter, and last-updated timestamp. Use enrollment information only when the existing authorized read model supplies it; do not invent an enrollment date from account creation.

Below it show a compact overview, then the material evidence:

- Required assessed materials completed / eligible total.
- Counted programming submissions and manual submissions, separately labelled.
- Average evaluated score, with its included item count and denominator explanation.
- Recorded active learning time for this class/course, with the recording period and coverage note.
- Last recorded activity/submission, labelled according to the source.

Large decorative charts are unnecessary. The curriculum table should appear within the first screen after the compact overview. No academy-level dashboard redesign is part of this feature.

## 5. Curriculum history and metric definitions

Group rows by course → module → lecture in curriculum order. Lecture headers show completed required assessed items / required assessed items. Load groups progressively and paginate material rows server-side; show when a lecture continues on another page.

Rows show material type/icon, title, status, submission count, score, latest submission time, and explicit **View attempts** or **Open material** actions. Optional and excluded-from-score items carry labels. Search titles, filter by material type and work status, and allow clearing all filters. Totals describe the full selected course scope, not the current search result or page.

| Measure | Definition |
| --- | --- |
| Programming submission count | Existing counted PASSED/FAILED attempts. Pending, cancelled and judge-faulted work does not count as a failed student attempt. Keep existing Solution status semantics. |
| Manual submission count | Number of saved immutable manual submissions for this student, material and class, including awaiting assessment. Distinguish pending from graded. |
| Programming completion/score | Existing progress at the current grading revision. Historical attempts remain inspectable after a revision change, but are not relabelled as current completion. |
| Manual completion/score | Latest submission at the current material revision, interpreted with `effectiveManualResult`, including current assessment/review. Awaiting/unavailable results are not numeric zero. |
| Overview completion | Completed required assessed materials / eligible required assessed materials, combining the two adapters above. Keep a per-type breakdown. Exclude PDFs/videos and optional materials from this particular denominator; label it “Assessed work completion,” not generic course completion. |
| Average evaluated score | Arithmetic mean of normalized current scores for assessed, score-included items with an evaluated result. Programming uses current progress best score; manual uses latest effective result divided by its saved maximum. Exclude zero-maximum, excluded and unevaluated items. Show included count; empty denominator is a dash. |
| Recorded learning time | Existing class-aware daily active-learning projection for the selected courses. It is recorded active time, not time since opening the page or time spent on a particular problem. Do not credit staff review/runs. |
| PDF/video | Include the material row. Show existing recorded video progress when available, without treating it as coding completion. For PDFs with no durable reading record, show “Reading history not recorded.” No fabricated completion or attempt history. |
| Run counts | Not available from current durable student data. Omit the Runs column in this release and explain the difference from Elice in the design review. Live terminal events and monitoring visits must not be counted as historical runs. |

Authorization is class-scoped, but existing programming work is stored per student/material and may have been done in another class using that course. Preserve that established scope and describe it as course work, not “work done during this class.” Manual submissions retain their explicit class scope. Class learning time remains explicitly class-attributed.

## 6. Tutoring by material

By material displays the selected material and a searchable class roster with submission status, latest result and submission count. Offer All / Submitted / Not submitted filters, with live availability as supporting information rather than a history-access gate.

Selecting a student opens their attempts for that material. The default attempt is the newest available submitted attempt; it is never chosen by highest score implicitly. Clearly distinguish **Latest**, score and result. Provide explicit previous/next attempt navigation and a paginated newest-first list with stable timestamp/ID ordering.

Changing material in the review controls retains the review student where authorized. Student movement in the live session does not replace the selected historical attempt. A new submission can produce a “New submission available” action; it must not overwrite an editor being inspected.

Share roster filtering/presentation with the existing course tutoring drawer where practical. Do not introduce a second set of submission-status definitions. Existing course tutoring can expose the same history/review surface through an action without changing its current collaborative behavior.

## 7. Submission review and private execution

Opening **Review submission** expands within the monitoring shell, in the same browser tab. Keep an unambiguous header: student, material, attempt timestamp, result, score and **Historical submission · Private testing copy**. Historical content must never carry a Live badge. The separate monitoring connection indicator remains truthful.

Use the familiar statement/editor/output layout. Show attempt results and sample-case evidence through a collapsible panel, preserving space for the editor. Display saved labels and statement snapshots where actually stored. If only the current statement/hierarchy is available, label it “Current material”; do not claim it was frozen at submission time.

### Programming

- Load the immutable code from the selected submission review, not from `getStudentContext` or the current draft.
- Initialize a separate scratch string immediately editable without a toggle. Use the saved language; offer Run only for supported runtimes. Unsupported languages remain readable with a reason.
- Reuse the private Python runner and terminal: Run, Stop, stdin, EOF, output/error states and bounded output. Do not call the student's submission/judge path.
- **Reset to submission** restores the original saved code. Keep original verdict/score separate from private output; running does not create a new official result.
- Preserve sample/hidden-test disclosure rules. Hidden test inputs and expected/actual outputs remain absent from the payload.

### Turtle/graphics

- Show saved files, file tabs, entry point, instructions, drawing viewer and terminal in the established Turtle layout.
- Private scratch files are editable without an edit toggle. Run uses the saved submission profile/runtime/assets and the scratch files through a dedicated reviewer execution operation.
- Validate the immutable submission and authorized class/student/material again on the server. Accept only bounded source files as overrides, never client-supplied runtime images, asset paths, permissions or resource limits.
- Isolate review session ownership from the student's run and the monitor's live/private run. A review-instance ID belongs in the runtime owner key; rerunning replaces only that instance's earlier execution.
- Run, Stop, drawing input and terminal input target only the reviewer-owned session. Closing review stops/disposes that session. Never attach input controls to the student's session.
- Missing historical assets or unavailable runtime versions produce an explicit unavailable state with the saved files still readable. Do not silently substitute a new runtime/profile.

### Quizzes, written responses and reading materials

- Show saved answers with the existing quiz/written-answer rendering, saved option ordering, assessment state, score and authorized explanation policy. No Run, Submit or grade-edit controls.
- PDFs/videos open as authorized material previews with available progress metadata, not invented submitted answers. Keep them distinct from an attempt review.
- No submission means an empty state and an Open material action. Starter code/current draft may be offered only as explicitly labelled current material content, never as submitted work.

Scratch state is memory-only, keyed by actor/academy/class/student/material/submission. Back to history retains the selected attempt's scratch copy and stops its private run; reopening that attempt restores the copy. Reset, switching to another attempt/student/material, or closing the entire history/review surface asks before discarding changed scratch code; cancelling retains the current review. Stop any private run before an accepted switch. Retain at most one scratch copy per open surface. No persistence to local storage or student drafts.

## 8. Monitoring continuity and pointer isolation

History is a presentation state above the coding/non-coding branches of `AllMaterialMonitor`. Opening/closing it must not remount the observation owner, destroy the coding document/session, or invoke an end-watch command. Keep the active coding owner mounted while hidden; background student transitions still use the approved availability recovery behavior.

Historical review cannot change the live workspace's selected draft/material, change the student's route, hydrate the live Yjs text, reuse a live editor model, or write through manual draft APIs. Any extraction of session ownership must remain scoped to preserving these existing responsibilities, not redesign the monitoring protocol.

While the historical surface covers the workspace:

- Continue authorized presence, observation, draft synchronization and connection recovery.
- Suspend outgoing live pointer/awareness publication for the covered monitor workspace and clear the previously published pointer. Do not send scratch-editor positions, review interactions, private terminal events or private drawing input to the student.
- Do not draw student pointers over historical content. Resume normal pointer sharing on return to the visible live workspace using its current material/document identity.
- Existing pending live edits and feedback remain held by their owners. Opening history alone does not switch a document or discard them. A true student/material navigation continues to use existing transition safeguards.
- Reconnection cannot replace scratch content or claim a historical editor is live. Access revocation does clear restricted history and stops private execution, consistent with existing access revocation behavior.

**Back to history** restores filters, group expansion, paging and scroll. **Return to monitoring** restores the previously displayed material, layout, terminal selection and feedback draft. The existing **Return to live** action may then follow the student's current material explicitly. No refresh is required.

## 9. Read contracts and backend composition

Add a focused `studentWorkHistory` read namespace and server service rather than expanding the read-only `teacherProgress` namespace with mutations. Proposed operations:

| Operation | Inputs beyond authenticated actor | Result |
| --- | --- | --- |
| `getStudentSummary` | academy, class, membership, optional course | Identity, authorized course facets, full-scope metrics, coverage and `asOf` |
| `listStudentMaterials` | same scope, course/module/lecture, type/status/search, page | Code-free grouped material rows and pagination |
| `listMaterialStudents` | academy, class, material, search/submission filter, page | Code-free student results and totals |
| `listAttempts` | academy, class, membership, material, page | Code-free discriminated attempt summaries |
| `getSubmission` | academy, class, membership, material, attempt kind and ID | One discriminated immutable programming/manual review payload |

Keep bounded page sizes aligned with current history: 25 material/student rows and 20 attempts. Include stable IDs, course/module/lecture ordering, material type, current revision applicability, actual score maximum, assessment state, and metric coverage. Null/unknown is distinct from zero. The server returns facets from the authorized scope, not the client page.

Programming adapters reuse `TeacherProgressAccessService`, repository aggregates and submission-review redaction. Manual adapters use `ManualSubmission`, saved profile and `effectiveManualResult`; add real pagination rather than relying on the current roster's 30-attempt cap. PDF/video adapters expose only existing records and authorized current content.

Add a separate reviewer execution operation for Turtle scratch reruns, with actor-owned status/input/stop operations. Reuse the GUI session manager and existing validation/resource limits internally. The present `ManualService.start(submissionId)` intentionally replaces supplied files with original submitted files, so it cannot implement edited private reruns unchanged. Do not weaken that existing behavior.

No new historical source of truth or run-count table is required. Reuse current aggregates and validate query plans; add indexes only when the actual scoped queries require them. Do not fetch all student code/files to construct a roster or overview.

## 10. Authorization, cache and request lifecycle

- Apply the shared current class-teaching policy: assigned Teachers/assistants; active Team Leads/Managers within their academy. Preserve existing support/platform view-role rules, without new authority inferred from presence.
- Every read/run validates academy, active class, current membership/enrollment, assigned course, effective curriculum visibility and exact submission ownership. A submission ID from another class/student/material cannot authorize a read or execution.
- Programming retains existing visible-course/history identity checks. Manual reads/runs additionally require matching saved class ID. Deleted/hidden/removed content follows current access policy; no broad historical-access exemption.
- Runtimes, asset reads, stdin and Stop are scoped to the authorized reviewer session. Do not assume permission to publish grades is required merely to inspect and privately run assigned student work.
- Query keys include actor/view-role, academy, class, membership and applicable course/material/submission/filters/page. Switching identities cancels/ignores stale requests and immediately removes the old student's visible data. Revocation clears affected cache entries.
- Fetch history on demand. While visible, refresh summaries/lists at most every 30 seconds and after relevant known updates; no fetch-all-pages loop. Pin an opened submission to its ID and keep scratch code stable. Assessment metadata may refresh without resetting code.
- Prefer scoped aggregate queries and bounded pagination. Do not issue one request per material/student row. Opening a single attempt is the only source-code read in this flow.

## 11. Navigation, errors and accessibility

Use client-owned view state inside the mounted monitoring shell for the panel and review. Opening/closing history must not perform a Next route transition. Browser Back closes review first, then the history surface, before leaving the workspace; use the existing history/navigation coordinator so material selection and unsaved-edit guards still work. Full reload may discard private scratch state and should warn while dirty; shareable history URLs are outside this release.

Keep loading/errors local to each region. Distinguish no work, no matching results, pending assessment, unavailable history and lost access. Retry uses the same explicit scope. A failed history request does not disconnect monitoring; an unavailable runtime does not hide saved work.

Give the panel an accessible title and predictable focus return to its opener. Use a nonmodal desktop panel; use a focus-trapped modal surface on narrow screens, with the monitored identity and connection state inside its own header. Keep covered live editors mounted but inert so they cannot take focus or input. Use actual buttons/links for actions; selecting table text must not navigate. Escape closes the topmost surface subject to the dirty-scratch guard. Keep Run/Stop keyboard accessible, announce loading/execution/errors, and support fullscreen portals. At narrow widths, prioritize title, result and Review; put secondary measures in row details. Use existing localized date/number formatting and translation namespaces.

## 12. Implementation boundaries after approval

1. Define typed read models and programming/manual adapters with common class authorization, counts and pagination.
2. Extract focused history/attempt/roster presentation from existing features; keep live editing and grading owners separate.
3. Add Student history/Tutoring entry points and one persistent review controller above material branches.
4. Add isolated programming scratch execution and authorized Turtle reviewer sessions with separate ownership.
5. Add mixed-material rendering, coverage/error states, localization and responsive/focus behavior.
6. Verify the full workflow and monitoring regression criteria below before marking implementation complete.

Read applicable repository instructions and installed Next.js guides before any implementation. This document does not authorize merging, deploying, replacing dev servers or modifying Elice.

## 13. Acceptance and verification

Automated integration/component coverage must establish:

- Same authorized results for Teacher, assistant Teacher, Team Lead and Manager, including offline students; denied foreign academy/class/member/material/submission combinations and revocation.
- Full-scope metrics across multiple pages, optional/excluded items, no data, pending/error assessments, changed revisions, different score maxima and existing cross-class programming semantics.
- Complete manual attempt pagination beyond 30 and stable order for equal timestamps. No source code in roster/list/summary payloads; hidden cases remain redacted.
- Correct immutable attempt loaded even when the current draft differs or a newer submission arrives.
- Scratch edits, Run, Reset, stdin, Stop and disposal affect only the reviewer copy/session. Assert original draft/submission/result records and student counters are unchanged.
- Turtle saved profile/assets used, edited scratch files executed, no client runtime override, no session replacement outside the review instance, and ownership enforced on status/input/stop.
- Late responses from student A cannot paint over student B; no rehydration of a live document from historical code; pointer publication disabled only while the corresponding live surface is covered.

Local end-to-end matrix after implementation:

1. In paired student/monitor sessions, open history from coding, Turtle, PDF, video, quiz and written-answer monitoring; inspect prior work and return without refresh.
2. Edit a private copy of an older coding submission, run with input, stop an infinite run, reset, and inspect a second attempt. Confirm the student sees no code, terminal, pointer or score changes from review.
3. Rerun a multi-file Turtle submission with a private modification, inspect drawing/output, close it and confirm the student's own Turtle session continues.
4. While review is open, move the student coding → PDF → Turtle → coding, including a few minutes of inactivity. Return and verify observation, code synchronization, student monitoring indicator and bidirectional pointers recover without refresh.
5. Switch the actual monitored student through existing guards, then reopen history. In By material, inspect another/offline student's submissions without changing the live target; identities must remain explicit.
6. Exercise dirty-copy cancellation, filters/pages/scroll restoration, failed reads, pending assessment, removed access, fullscreen and narrow viewport.
7. Run Chromium and Playwright WebKit coverage. Also check the paired flow in actual Chrome and native Safari; WebKit automation alone must not be reported as native Safari verification. Record unavailable native coverage explicitly.

This spec has been reviewed for scope, metric ambiguity, live/private data separation and implementation dependencies. Implementation and verification remain pending approval.
