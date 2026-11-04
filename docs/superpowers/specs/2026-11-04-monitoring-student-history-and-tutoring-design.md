# Student history dashboard and submission tutoring

Date: 2026-11-04.
Status: **Implemented locally on 2026-11-04. Automated verification passed; native Chrome/Safari qualification remains unavailable.** See the [verification report](../../research/2026-11-04-student-history-implementation-verification.md).
Evidence: [Elice browser and Cove source research](../../research/2026-11-04-monitoring-student-history-elice-research.md).
Updated 2026-11-04: the user clarified that the feature must also provide a dedicated staff dashboard with a persistent student picker, like the supplied Elice dashboard. A monitoring-only panel is insufficient.

## User-directed revision: inline tutoring and full-page history

The user's follow-up screenshots and explicit implementation request replace the original expanded monitoring panel with the following presentation:

- Tutoring opens a compact material-specific student drawer inside the exercise. Rows show submission status and score; selecting a student opens their latest saved submission directly in that exercise's statement/editor area. No expanded dashboard dialog or modal is used.
- Saved-work selection does not follow a different student's current material. Offline students remain selectable. If no submission exists, show an explicitly labelled saved draft/current starter; private edits and runs do not mutate that student. Live switching remains available when a student is working on the displayed exercise.
- Each row in the existing top student switcher has its own History action. It opens the standalone class/student dashboard, with the correct membership selected. The toolbar History action has the same full-page behavior.
- Reuse Studio selector components for course and result filters; browser-native select elements are not used in this feature.
- With no active/selected material, load an authorized course outline and show a useful choose-material state. Do not wait indefinitely for an observation material that is absent.
- The original watch/document stays mounted during inline tutoring. Clearly separate the monitored student from the saved work under review; resume live code/pointers on return. Full-page history is an explicit navigation and uses existing pending-edit safeguards.

Verified locally: no-material landing, offline second student's submitted code in place, private-run isolation, per-student full-history links, custom filter controls, stale student responses, dirty-copy navigation cancellation, and live recovery after tutoring. The current browser matrix passed all six Manager/Team Lead/Teacher × Chromium/WebKit combinations, plus two focused navigation checks. Earlier overlay results describe the superseded presentation; native Chrome/Safari coverage remains unavailable.

## 1. Problem and intended result

A Teacher, Team Lead or Manager watching a student must currently leave monitoring, open student analytics, find that student, and navigate again to inspect previous work. Course tutoring exists, but is not accessible as a submission-review workflow inside monitoring.

Provide two entry experiences backed by the same history feature: a dedicated staff dashboard for selecting students and inspecting their work, and a direct path from monitoring into that history. Opening a coding submission shows the statement and an editable private copy in a proper editor with Run, Stop, input and output. Closing review restores its originating dashboard or monitoring state without a browser refresh.

The user explicitly chose **private testing copies**: editing or running historical work never changes the student's draft, submitted answer, grade, completion, learning-time total or submission count. Existing live collaborative editing remains a separate activity and keeps its automatic editing behavior; do not reintroduce an edit-on/off switch.

## 2. Approach and boundaries

Considered three approaches:

| Approach | Benefit | Cost |
| --- | --- | --- |
| Contextual expanded history panel — original proposal, superseded | Immediate access, room for evidence and code, preserves live context | Requires explicit ownership of history state and private execution |
| Deep link to existing analytics/review pages | Small initial change | Still leaves monitoring and does not add private runnable review |
| Put history and statistics inside the student-switcher popover | Close to student identity | Crowds switching, gives insufficient room for curriculum and attempts |

Choose a compact material roster and inline submission review for monitoring, with a dedicated dashboard for full history browsing. These are two presentations of one shared history/read/review feature, not competing history systems. The options above concern the monitoring entry; the standalone dashboard is now an explicit requirement. Reuse existing tutoring roster behavior, attempt read models, editor primitives, assessment rendering and execution infrastructure. Do not mount the existing tutoring or manual grading workspace unchanged: both have responsibilities that historical review must not inherit.

In scope: dedicated student-history dashboard, persistent searchable student selection, contextual student overview, grouped material history, tutoring by selected material, paginated attempts, private coding/Turtle reruns, read-only quiz/written responses, and monitoring continuity. Redesign the existing class Solution status By-student presentation for this purpose instead of leaving its current table/detail workflow as the main student-history experience.

Out of scope: rebuilding the academy-wide aggregate analytics table or overview, changing grade rules, submitting/regrading on behalf of students, publishing historical feedback, exporting reports, session replay, EPS/class ranking, new PDF tracking, and new durable Run-count instrumentation. A dedicated history dashboard is in scope; the analytics table remains a discovery entry into it.

### 2.1 Dedicated staff dashboard — required

This is an administrative-style teaching page, available to authorized Teachers, assistant Teachers, Team Leads and Managers. It does not require a new Admin role or a live monitoring session. Offline students remain selectable.

**Entry and canonical destination**

- Add **Student history** to the teaching navigation and the class page actions. The navigation entry `/academy/[academySlug]/teach/history` provides an authorized class chooser; with an explicit valid class context it opens that class directly. Never choose a student or class based solely on a stale browser preference.
- Use the existing `/academy/[academySlug]/teach/classes/[classId]/progress?view=students&student=[membershipId]` destination for the dashboard. Reuse its `course`, module, lecture and filter URL conventions. Retain valid existing Solution status links and the By-problem view; do not create a second competing class-history route.
- Student analytics rows gain **View history**, deep-linked to the exact authorized class/membership and applicable course. When a row spans multiple classes, show a class choice limited to that student's authorized classes; do not pick one arbitrarily.
- Course pages can link to the same dashboard with course and class preselected. Where class context is missing, resolve it through the same authorized class chooser.

**Layout and behavior**

On desktop, use the existing Studio navigation plus a two-pane work area:

| Region | Required content and behavior |
| --- | --- |
| Context bar | Class selector, course selector including All assigned courses, and By student / By material controls. Current scope remains visible while reading results. |
| Student pane | A persistent, independently scrollable roster, approximately 280–320px wide, with name/username/email search, avatar, selected-state styling and optional live status. Use paginated server search. Selecting a student updates the right pane in place and retains roster search, paging and scroll. |
| Student detail | Identity and class context at the top; a compact overview of completion, evaluated scores, submissions and recorded learning time; then curriculum grouped by module and lecture with scores, status, attempt counts and Review actions. Use the exact metric definitions in §5. |

The roster stays visible when a student is selected; do not place a second generic roster table above the detail or require going back to the full student list between selections. Keep the detail header compact enough that the first lecture's evidence is visible at normal desktop height. Avoid empty decorative cards, excessive vertical gaps, and repeating the same student identity in multiple large panels.

Start with a neutral “Select a student” state when no membership is specified. A direct valid student link opens that student's detail immediately. A selected student remains selected when their name falls outside a new roster search, with the selected identity still explicit in the detail. A class change clears the student, material and submission unless an explicit deep link supplies a valid selection in the new class; changing course clears only incompatible material/submission selections.

Course/lecture filter changes do not silently select another student. Requests from the previous selection cannot paint under the new student's name. Retain roster navigation and local retry when detail fails. Respect current access restrictions for students who leave a class; do not retain their work visibly after access is revoked.

On narrow screens, show the student list first and open the selected student's detail with a clear **Students** back action. Returning restores the list search/page/scroll. Keep identity and class/course scope visible. The submission review uses the shared private editor, with **Back to student history** restoring the exact student, filters, expanded lecture, attempt page and scroll.

The standalone dashboard does not open a monitoring watch just to read saved history. An explicit **Open live** action may use the existing authorized monitoring destination when live availability permits. Dashboard availability/error labels must not suggest that an offline student has no history.

**One implementation, two hosts**

Extract shared student overview, grouped curriculum, attempt list and submission review components for the dashboard and inline tutoring. The dashboard host owns URL-backed selection and roster navigation; the monitoring host owns its local review state and continuing live watch. Both use identical history adapters and metric definitions. A dashboard UI should not be embedded inside monitoring with a second Studio sidebar.

## 3. Entry points and identity

- Monitoring headers expose Student history and Tutoring for every material type, including saved previews and authorized offline states.
- Student history opens the full class dashboard with the selected student's membership and current course. Each student row in the existing top selector also has its own History link; it opens that student's dashboard directly.
- Tutoring opens a compact, searchable drawer for the displayed material, showing Submitted/Not submitted and score. Selecting a student opens their newest immutable submission directly in the statement/editor area, without a modal or expanded history window.
- Selecting an offline student or one on another material from the top selector opens their saved work for the displayed problem. Online students working on that problem retain the existing guarded live-switch behavior.
- Keep `watchedMembershipId` separate from `reviewMembershipId`; the inline strip identifies Monitoring [A] and Reviewing [B]. Saved-work selection never changes the student's current material or live watch target.
- All selections use academy/class/membership/material IDs. Names, user IDs and online availability are not history authorization keys.

## 4. Student dashboard and tutoring presentation

Use Cove's typography, colors, avatars, borders and custom Studio selector controls. The full dashboard has the persistent student rail described in §2.1, a compact selected-student summary and grouped material evidence. It is a full page; monitoring does not embed it in an expandable dialog.

The summary shows required assessed materials completed / eligible total, separately labelled programming/manual submission counts, evaluated average score, recorded active learning time and last recorded activity. Explain incomplete coverage and pending assessments. Use enrollment dates only if supplied by the authorized read model.

Tutoring uses a compact drawer inside the exercise body. Keep the monitoring header visible, preserve the mounted live owner, and display selected saved work in the familiar instructions/editor/output layout. Keep student identity, attempt timestamp and private-copy status explicit. On narrow screens the drawer is bounded by the viewport and review panes stack. Returning restores the live workspace without a refresh.

When no material is active or selected, load an authorized course outline and show an explicit choose-material state. Empty or failed outlines show unavailable/retry states instead of an indefinite loading message.

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

In inline tutoring, selecting a student opens their saved code immediately, with an attempt selector and pagination. In the standalone dashboard, selecting a student exposes their attempts for that material. The default attempt is the newest available submitted attempt; it is never chosen by highest score implicitly. Clearly distinguish **Latest**, score and result. Provide explicit previous/next attempt navigation and a paginated newest-first list with stable timestamp/ID ordering.

Changing material in the review controls retains the review student where authorized. Student movement in the live session does not replace the selected historical attempt. A new submission can produce a “New submission available” action; it must not overwrite an editor being inspected.

Share roster filtering/presentation with the existing course tutoring drawer where practical. Do not introduce a second set of submission-status definitions. Existing course tutoring can expose the same history/review surface through an action without changing its current collaborative behavior.

## 7. Submission review and private execution

Opening **Review submission** renders inside its originating dashboard or exercise body, in the same browser tab. Keep an unambiguous header: student, material, attempt timestamp, result, score and **Historical submission · Private testing copy**. Historical content must never carry a Live badge. In the monitoring host, the separate monitoring connection indicator remains truthful. Standalone review does not acquire a live watch.

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

Inline tutoring is a presentation state above the coding/non-coding branches of `AllMaterialMonitor`. Opening/closing it must not remount the observation owner, destroy the coding document/session, or invoke an end-watch command. Keep the active coding owner mounted while hidden; background student transitions still use the approved availability recovery behavior.

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
| `listClasses` | academy, class-name search, page | Authorized active class options for dashboard entry; no student work |
| `listStudentRoster` | academy, class, name/username/email search, page | Code-free membership identities and pagination; available offline |
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

In monitoring, use client-owned state for the Tutoring drawer and saved submission review. Opening/closing inline tutoring must not perform a Next route transition. Student history is explicit full-page navigation, using private-copy discard and pending-live-edit safeguards. Keep material selection coordinated with those safeguards. Shareable inline-review URLs are outside this release.

In the standalone dashboard, class, student, course and curriculum filters are URL-backed, using the canonical progress route. Add namespaced roster search/page parameters so roster search does not collide with the material-title search. Keep material row pagination independent from roster pagination. Extend the existing parser/serializer centrally; retain legacy By-problem links and ignore invalid optional filters safely. A selected review can use additive `reviewMaterial`, `attemptKind` and `attempt` parameters, scoped again on the server. Back/Forward restores the prior dashboard selection and filters; returning from review restores its list/lecture scroll state. Do not put source code, private input, scratch code or terminal output in a URL. Full reload may discard private scratch state and should warn while dirty in either host.

Keep loading/errors local to each region. Distinguish no work, no matching results, pending assessment, unavailable history and lost access. Retry uses the same explicit scope. A failed history request does not disconnect monitoring; an unavailable runtime does not hide saved work.

Give the Tutoring drawer an accessible title and close action. Use the same inline surface at narrow widths, bounded by the viewport, with the monitoring header and selected review identity visible. Keep covered live editors mounted but inert so they cannot take focus or input. Use actual buttons/links for actions; selecting table text must not navigate. Escape closes the topmost surface subject to the dirty-scratch guard. Keep Run/Stop keyboard accessible, announce loading/execution/errors, and support fullscreen portals. At narrow widths, prioritize title, result and Review; put secondary measures in row details. Use existing localized date/number formatting and translation namespaces.

## 12. Implementation boundaries after approval

1. Define typed read models and programming/manual adapters with common class authorization, counts and pagination.
2. Extract focused history/attempt/roster presentation from existing features; keep live editing and grading owners separate.
3. Build the standalone two-pane dashboard on the existing class progress By-student route, add teaching/class/analytics entry points, and preserve legacy By-problem navigation. Add Student history/Tutoring entry points and one persistent review controller above monitoring material branches, using the same shared history components.
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
- Standalone class/student/course selection and direct links, independent roster/material search and pagination, Back/Forward restoration, roster persistence across selections, and equivalent history/metrics in both hosts. Opening the standalone dashboard must not create a monitoring watch.

Local end-to-end matrix after implementation:

1. In paired student/monitor sessions, open history from coding, Turtle, PDF, video, quiz and written-answer monitoring; inspect prior work and return without refresh.
2. Edit a private copy of an older coding submission, run with input, stop an infinite run, reset, and inspect a second attempt. Confirm the student sees no code, terminal, pointer or score changes from review.
3. Rerun a multi-file Turtle submission with a private modification, inspect drawing/output, close it and confirm the student's own Turtle session continues.
4. While review is open, move the student coding → PDF → Turtle → coding, including a few minutes of inactivity. Return and verify observation, code synchronization, student monitoring indicator and bidirectional pointers recover without refresh.
5. Switch the actual monitored student through existing guards, then reopen history. In By material, inspect another/offline student's submissions without changing the live target; identities must remain explicit.
6. Exercise dirty-copy cancellation, filters/pages/scroll restoration, failed reads, pending assessment, removed access, fullscreen and narrow viewport.
7. Run Chromium and Playwright WebKit coverage. Also check the paired flow in actual Chrome and native Safari; WebKit automation alone must not be reported as native Safari verification. Record unavailable native coverage explicitly.
8. Open Student history without starting monitoring, choose a class and several online/offline students from the persistent roster, inspect lecture-grouped results, open an older submission and privately run it. Return to the exact dashboard state; repeat from an analytics deep link, with Back/Forward, in desktop and narrow layouts. Compare the same saved attempt against inline tutoring.

This spec has been reviewed for scope, metric ambiguity, live/private data separation and implementation dependencies. Implementation was approved by the user on 2026-11-04; verification is required before completion.

## 14. Direct problem review revision (2026-11-04)

The user requested that saved-work review retain the familiar problem workspace shown in live monitoring. From the student dashboard, both the material title and **Open work** action open the latest submission immediately. An intermediate attempt list is no longer the primary flow. The destination is an academy teaching route outside StudioShell, using the entire viewport rather than an editor card inside the dashboard. Returning preserves the dashboard's student and filters.

The review displays an explicit student identity, problem title, submission time and score, a private-copy indicator, and the existing Studio attempt selector. Older attempts and additional attempt pages remain available without leaving the problem workspace. The course outline, grading notice, full problem statement, examples, reference PDF pane, editor font controls and terminal reuse the ordinary workspace components. The statement reflects the current authorized problem; source and saved results remain those of the selected historical submission. Current draft code returned with reference metadata must never populate the review editor.

Tutoring uses the same submission presentation and private runner as dashboard review, while its underlying monitoring watch remains mounted. Switching a private review's material or attempt must honor the existing discard guard. Run, Stop and Reset operate only on the review copy/session; no Submit action is introduced. Fullscreen review authorizes the exact class, student and material before rendering the student identity. Its return destination is limited to that class's progress page.

Verification must check direct latest-work navigation, older attempt selection and pagination, full viewport geometry with statement left/editor right, visible selected identity, private Run/Reset/discard behavior, identical statement components from Tutoring, and unchanged student draft/submission results. Run the role matrix in Chromium and WebKit.

## 15. Consistent review and history design revision (2026-11-04)

The follow-up request explicitly includes **unsubmitted coding and Turtle work**, which must use the same full workspace as submitted work. The earlier standalone draft editor and read-only observation viewer are removed from these review paths. Both sources use the ordinary course navigator, two-row workspace header, named student, full statement/examples, font controls, editable private source and private Run/Reset. A compact private-copy badge replaces the large explanatory banner; the output area retains the isolation notice. Coding uses the familiar dark output tabs and public sample controls. A historical result remains a separate saved-result tab, never a live student's output.

Turtle uses the existing manual workspace grid, file tabs, keyboard/pointer resize control and drawing layout selector. Drawing and terminal occupy the available viewport beside the instructions. A history draft must never say "Waiting for live response" or disable its private Run merely because the student is not connected. Draft execution uses the current server-owned authorized material profile; submitted execution continues to use its immutable saved profile. Both remain under a reviewer-only runtime owner, reauthorize every operation, and create no student draft/submission/score mutations.

The class chooser becomes a searchable responsive grid with recognizable class icons and compact Open history actions. The student dashboard keeps its persistent roster and Studio selectors, with distinct completion/score/submission/time cards, a measured completion bar, colored material icons and status badges. Preserve the existing metric definitions and show unavailable measurements honestly.

Elice was inspected through the signed-in Chrome session before this revision: course lecture list, student Dashboard, per-material tutoring roster, selected submitted programming work and selected submitted Turtle work. The useful pattern is stable statement/editor geometry, student identity immediately visible above code, clear submission state and a persistent student list. Cove retains its own typography/tokens and private-copy semantics. No Elice edit, Run, Submit or regrade action was used.

Acceptance adds explicit zero-submission cases for coding and Turtle, saved draft versus starter source, private execution with visible terminal/drawing, unchanged source records/counts, and visual checks of the class chooser/dashboard in addition to the submitted-work and inline-tutoring regressions.
# Follow-up: empty work and course dashboard (2026-11-04)

The user confirmed that actual unfinished drafts remain reviewable. When neither a saved draft nor a submission exists, history/Tutoring keeps the normal statement and course navigator but shows an empty work panel. Starter code is not presented as student work, and the empty panel has no editor or private execution actions. Inline review uses one compact selected-student toolbar instead of repeating the full problem header already supplied by monitoring.

The student dashboard follows the supplied Elice references with Cove tokens: persistent roster; profile name/email; class enrollment period; separate Course Completion and Course Progress sections; then the existing grouped material list. Enrollment comes from `ClassEnrollment.enrolledAt`, not membership creation or first learning activity. Enrollment has no expiry in the current model; missing enrollment is explicitly unrecorded.

Completion uses the existing required-assessed-exercise denominator. Zero eligible work does not imply completion. Total assessed score sums the actual current-revision scored values and their maxima; average score retains its existing definition. No Elice EPS or class-average metric is invented. Course Progress charts recorded learning minutes over the last 14 academy-local dates and shows required-work completion by assigned course. Both use the same authorized class/student/course scope as the dashboard, with grouped daily reads and no source-code reads or student writes. Filtering individual material rows does not change these overview totals.

Qualification covers no-work coding and Turtle, saved drafts, submitted work, compact inline tutoring, enrollment distinct from first activity, missing dates, course-scoped daily activity and unchanged private-copy protections in Chromium and WebKit.
