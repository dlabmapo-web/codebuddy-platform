# Turtle graphics: Elice behavior parity

Date: 2026-10-08

Status: implemented and verified on localhost on `feat/lecture-pdf-materials` alongside the PDF feature; production flags remain disabled; Elice reference gaps below remain unverified

Reference: [Elice inspection and follow-up](../../research/2026-10-08-turtle-graphics.md)

This revision supersedes the original browser-only, ungraded-practice proposal. The user explicitly requested the same turtle behavior as Elice. Desktop event-loop semantics, Submit, manual assessment, score inclusion/exclusion, and the associated written-response activities are now requirements.

## 1. Goal and evidence boundary

Cove authors can create turtle learning exercises with instructions, starter files, solutions, graphical execution, and configurable submission/score participation. Students write Python, run drawings or keyboard-controlled turtle programs, use the terminal, stop execution, save drafts, submit work, and receive teacher review. Authors can also add the written-response activities accompanying turtle missions.

The introductory Elice turtle chapter has 18 score-excluded materials. The maze coding mission is score-included and enables Submit. Its invoked grader has an empty automatic-check list and a message directing students to manual teacher grading. The later apple-game mission likewise asks for manual grading. The maze quiz is a subjective response with manual grading explicitly enabled. These observed rules replace the assumption that turtle is always ungraded.

Elice's configured GUI is VNC. The later game solution uses keyboard callbacks, text drawing, and `mainloop()`. The runtime must support these behaviors instead of imposing a drawing-only subset. See the research for exact reference URLs and values.

Observed reference behavior and proposed Cove policy are distinguished below. No Elice submission, grade assignment, or regrade was performed. The exact teacher numeric-grade editing UI, completion threshold, final-submission selection rule, and provisional zero semantics were not verified. Do not claim complete parity for these transitions until they are checked against authorized disposable reference work. Cove policies below are concrete proposed defaults, not claims about undisclosed Elice internals.

## 2. Scope and architecture choice

Required for the parity release:

- Instruction panel, Python file editor/tree, starter files, private solution, persistent drafts, and mixed-material navigation.
- Standard Python turtle drawings, animation, text, multiple turtles, screen queries, keyboard/mouse/timer callbacks, and an actual event loop.
- GUI execution result and text terminal, interactive input, Run/Stop, remaining execution time, and configurable display size/limits.
- Submit enabled/disabled independently of whether an exercise contributes to score.
- Immutable submitted source, teacher review, explicit teacher execution, score/feedback, and review history.
- Score-excluded introductory work and score-included manual missions.
- Free-text manual-response materials alongside turtle coding exercises.
- Author/library flows, permissions, operational deployment, and localhost E2E coverage.

General Pygame/Tkinter app authoring, arbitrary network services, automatic picture grading, public desktops, video/session recording, and importing Elice's proprietary course content are outside this feature. Tk is present because standard turtle needs it, but that does not create a separate general GUI-app product. Platform branding and existing Cove permissions remain Cove's own.

| Approach | Decision and trade-off |
|---|---|
| Isolated CPython/Tk GUI with a remote viewer | Selected. Provides standard turtle and real input/event-loop behavior; introduces session infrastructure and capacity costs. |
| Extend Cove's Pyodide worker with a turtle shim | Rejected for the requested parity release. It would require recreating substantial desktop behavior and the original limited subset fails the inspected game. |
| Add a second browser Python interpreter | Rejected. Adds semantic/runtime differences and still requires proof of the full observed interaction contract. |

Use standard CPython with Tk, a virtual display, and a VNC-compatible browser viewer connected through an authenticated gateway. Pin the complete image by digest and record its Python/Tk/runtime version. CPython 3.12 is the proposed compatibility baseline; Elice's exact Python minor version was not exposed. Test version differences rather than claiming identical binaries. Standard turtle requires Tk, while Cove's current Pyodide 0.27.5 excludes desktop turtle/Tkinter. [Python turtle documentation](https://docs.python.org/3.12/library/turtle.html), [Pyodide constraints](https://pyodide.org/en/0.27.5/usage/wasm-constraints.html)

Keep ordinary Python/quiz judging on its existing runtime. GUI execution is a new service with its own protocol, session lifecycle, and capacity; it is not an extension of the current stdout test-case engine. No automatic drawing grader is required by the inspected configurations.

## 3. Data and assessment model

Add material types `TURTLE_EXERCISE` and `WRITTEN_RESPONSE` with one-to-one typed content records. The former replaces the proposed `TURTLE_PRACTICE` type before any migration has shipped. Keep existing `PROGRAMMING_EXERCISE` and `PDF_DOCUMENT` data valid. Reuse editor/navigation/authoring components without attaching manual work to a legacy automatic grading profile.

`TurtleExercise` stores instructions, starter file manifest, entry point, optional private solution manifest, pinned runtime reference, GUI dimensions, time limit, memory limit, submission-enabled flag, score-inclusion flag, and maximum score in integer hundredths. `WrittenResponse` stores the prompt, instructions, input hint, optional private model response, maximum answer length, and the same manual-assessment configuration. All scoring for these two types is manual; there are no automatic drawing cases or regex checks in this feature.

Existing Material owns title, order, lecture, visibility, and identity. Score participation is explicit and independent of `isRequired`; audit all count/progress queries instead of assuming every material with code is an automatically graded exercise.

| Configuration | Run | Submit | Teacher review | Course score/completion |
|---|---|---|---|---|
| Turtle, score excluded, Submit enabled | Yes | Yes | Available | Excluded |
| Turtle, score included, Submit enabled | Yes | Yes | Required to determine assessed result | Included after published review |
| Turtle, score excluded, Submit disabled | Yes | No | Draft inspection only | Excluded |
| Written response, score included | Not applicable | Yes | Manual | Included after published review |

Reject score-included publication with Submit disabled. Initial author defaults are score excluded, Submit enabled, maximum 100 points, 1024 × 640 GUI, 1800-second wall time, and 512 MiB session memory. Authors can choose the observed game profile: 1024 × 768 and 1000 seconds. The memory units and limits are Cove policies, not an assertion about Elice's measurement. Dimensions are integers from 320 to 2048; wall time is 1–1800 seconds; memory is 128–512 MiB. Changing these bounds later requires a capacity review.

Reuse the existing material-keyed draft storage for code where practical, extending authorization/type gates. Persist a versioned file manifest and written-response drafts through an explicit typed payload; legacy single-file draft readers must not misinterpret them. Draft and submitted file size limits are enforced by shared schemas and the API, not only the editor.

Add a shared `ManualSubmission` record for the two manual material types: academy/class/learner/material, immutable submitted source or response, content/runtime/assessment revision snapshots, maximum-score snapshot, idempotency key, timestamps, and optional associated run id. Submission states are `AWAITING_REVIEW` and `REVIEWED`; runtime errors are execution results, not automatic grading verdicts. A stopped or never-run program can still be submitted for teacher review.

Append-only `ManualReview` records contain submission id, reviewer, score, completion decision, feedback, revision, and publication time. Scores range from zero through the snapshotted maximum. Teachers explicitly mark completed or needs revision; there is no unverified assumption that any nonzero score completes the task. Concurrent reviews require an expected version, and revised grades preserve the prior record. An author content edit does not reinterpret past submissions.

Proposed Cove selection rule: the latest submission is the active attempt; a new submission becomes pending and does not inherit an old attempt's review. Historical reviews remain accessible. Class/course projections select that active attempt consistently. Verify this rule against Elice before claiming exact final-score parity; revise the policy if the reference uses another rule.

Manual assessment has its own admission/projection path. Existing judge submission, stdout sample checks, test-case edits, and automatic regrade reject these material types. Extend solve-session tracking only as learning activity if needed; it must not automatically mark work solved. Existing automatic judging and its historical outcomes remain unchanged.

## 4. Authoring and course behavior

The lecture builder offers Add turtle exercise and Add written response. Authors can edit rich instructions, source files, default-open files, private solutions, submission availability, score exclusion, maximum score, and GUI execution profile. Written-response forms show the prompt and input hint without runtime controls. Display “Teacher graded” separately from “Excluded from score.” Neither label is inferred from the other.

Support `main.py` as the default entry point, additional Python files, and teacher-provided data/image files needed by lessons. Asset uploads use private storage and immutable object ids with content/type/size validation. Limit each file to 5 MiB and the complete starter or solution manifest to 20 MiB; reject path traversal, absolute paths, symlinks, duplicate normalized paths, and reserved runtime paths. Student source/draft manifests allow at most 64 text files and 1 MiB of UTF-8 source in aggregate. Uploaded starter data assets are read-only during execution; student writes go into bounded ephemeral storage.

Do not expose a shell-script editor, arbitrary package installer, image selection, or privileged environment controls to ordinary curriculum authors. They select the approved Python runtime and edit teaching content. The file-tree experience does not grant access to host/runtime internals.

Preview uses the same GUI runtime in an author-owned session, separate from student drafts and submissions. Solution visibility follows existing permissions and configured solution-release policy. Viewing a solution never silently replaces a learner's code. Students never receive private solutions in workspace responses, file manifests, or GUI containers.

Hidden-by-default creation, visibility inheritance, reorder/move/delete, revision locking, auditing, copy/adoption, and content synchronization follow existing curriculum conventions. Copy assets/configuration without copying student drafts, sessions, or grades. Preserve submitted content snapshots when authors edit source. Define deletion through existing recoverability/history policy; do not let active sessions keep accessing removed material.

Extend canonical material routes for turtle and written-response work. Previous/Next and the drawer follow visible main lesson order across ordinary exercises, PDFs, turtle exercises, and written responses. Supplementary-only PDFs remain outside main navigation. Lesson numbering includes all main materials; progress and score inclusion use assessment eligibility. A score-excluded-only lecture is still reachable and receives no synthetic completion award.

Score-included manual materials participate in class/course progress after a published completion decision. Pending review is shown separately from failed or completed. Teacher score changes update projections atomically. Preserve existing ordinary-exercise point rules; turtle/written-response inclusion affects grades and completion projections, but does not invent difficulty-based solve points. Completion awards must use idempotent event handling and the existing reversal policy, so a correction cannot create duplicate rewards. The exact Elice completion/award policy remains a reference-verification item.

Exercise-only workbook formats must refuse mixed-course replacement that would discard PDFs/manual materials. Preserve existing exercise-only behavior; do not silently export turtle or written-response work as legacy automatic exercises.

## 5. Student experience

Reuse Cove's instruction panel, editor, file tree, breadcrumbs, saved-draft indicators, material drawer, and lesson navigation. On desktop, show the GUI and terminal as separate execution-result areas. On narrow screens, use labelled tabs while keeping Run/Stop, Submit, input, and error indicators available.

Show Connecting, Ready, Starting, Running, Waiting for input, Stopping, Finished, Error, Timed out, or Disconnected. Display a remaining wall-time countdown while a program is active, including its event loop and input wait. Run executes an immutable snapshot of the current editor files in a clean session. A second Run is disabled until Stop/termination finishes. Saving drafts remains independent of execution success.

Preserve standard turtle coordinates, drawing speed, colors, shapes, fill, write/text, queries, callbacks, timer events, and Tk event-loop behavior. `mainloop()`/`done()` keep the program active until the window closes, Stop is requested, or the session expires. `tracer(0)` is not forcibly flushed at program end. Do not replace standard API returns or introduce silent browser-specific no-ops.

The viewer forwards pointer and keyboard input only while focused. Arrow/space keys then reach turtle rather than scrolling Cove; releasing focus restores normal page navigation. Provide an accessible focus indicator, a way to leave keyboard capture, and clear instructions. Mobile controls map arrow/space inputs for compatible activities; this is a Cove accommodation, not an observed Elice control. Coordinate mapping must track viewer scale and device pixel ratio.

Fit/fullscreen scales the display, not its configured logical resolution. Lock display-dimension changes during a run, matching the observed resize restriction. Preserve terminal `print`, `input`, stdout/stderr, error locations where available, and exit information. GUI disconnect and Python failure have distinct messages. Stop cancels the process/display session even if Python never yields; ensure subsequent Run can recover.

On natural process exit, retain the last delivered frame as a clearly finished result without retaining a writable desktop. On Stop/timeout, retain the last delivered frame labelled with that state. These retention details are proposed Cove behavior; verify Elice's final-frame handling before calling them identical. Code reload restores drafts; it does not restart student code automatically. Navigating away releases the session.

When Submit is enabled, save an immutable submission of the current source, even if no Run occurred. Disable duplicate submission while its request is pending and use idempotency keys. Show “Submitted — awaiting teacher review” plus the last submitted time, reviewed score when available, and feedback. Pending work is not marked wrong solely because an automatic grader has no cases. The reference has submitted entries displaying zero points, but whether zero is provisional was not tested; never assert it is a drawing failure.

Written-response materials present instructions, prompt, hint, a saved text draft, Submit, review status, and feedback. Default maximum answer length is 10,000 characters. Submit requires non-whitespace content; rendering treats text as data. No GUI/editor/test cases appear on these pages.

## 6. Teacher review and assessment

Provide an authorized class/material review list with not submitted, awaiting review, reviewed score, completion state, and submission times. Review starts read-only and opens the selected immutable submitted files/response. Clearly distinguish a student's current draft from their submitted attempt. Include feedback and review history.

A teacher can explicitly Run a selected code submission in a teacher-owned isolated GUI session with its snapshotted runtime/profile/assets. Never execute source just because a review page opens. The session cannot overwrite the student's files or influence their live run. A submission is code to inspect, not a trusted image: any preview image is optional evidence, never an automatic correctness signal.

Publish a manual score, completed/needs-revision decision, and feedback in one version-checked transaction. Validate academy/class teaching authority, submission ownership, and score bounds server-side. Show the learner the published result and retain reviewer/audit history. Draft feedback is private until published. Changing scores or writing feedback to Elice was not part of research; these are required Cove review controls based on the verified manual-assessment requirement.

Existing teacher live-workspace functionality should support authorized turtle draft/file inspection. Editing a draft requires an explicit edit mode and existing safeguards; submitted snapshots remain immutable. Live viewing of a student's GUI requires an explicit read-only session authorization and clear ownership; teacher rerun uses its own session. Never share the student's input-control token with a passive viewer.

Do not repurpose the ordinary automatic Regrade button to judge graphics. For manual work, revising a review is explicit; batch teacher review is outside this feature. No automatic image comparison, raster similarity, OCR, or AI score is implied.

## 7. GUI service boundaries and lifecycle

Use three focused components:

1. API session broker: validates membership, visibility, role, current content revision, and approved profile; creates/cancels bounded sessions and issues scoped viewer/terminal credentials.
2. GUI execution service: starts a clean sandbox containing CPython/Tk, a virtual display, and the learner file snapshot; executes an approved entry point; enforces quotas and termination; reports execution state/output.
3. Authenticated display gateway: carries the VNC display and scoped input plus terminal traffic to the owning Cove client. It does not expose unauthenticated VNC ports or public desktops.

Each session records an opaque id, owner, academy/material, purpose (student run, author preview, teacher rerun), content/runtime revision, start/expiry, and state. Session credentials are short-lived, scoped to one session/purpose, and kept out of URLs, logs, and persistent browser storage. Check WebSocket origin, authenticate before forwarding, validate session ownership on reconnect, and separate owner-input from read-only-view grants.

Every run receives a fresh process group, display, filesystem overlay, uid, and resource limits. Student code has no application secrets, database/Redis credentials, Docker socket, host mounts, or outbound network. The sandbox needs access only to approved local files/display endpoints; the trusted gateway/control plane runs outside student reach. Run without root/capabilities, use a read-only runtime, enforce process/memory/CPU/disk quotas, and validate startup isolation. A plain container process on the application host without proven isolation is not sufficient.

Use wall-time enforcement outside student code, with cleanup of all descendant processes and display services. Initial profile: one CPU, 512 MiB total memory, 64 processes, 32 MiB writable temporary storage, and 1 MiB combined retained terminal output. Output truncation is explicit. Wall time includes interactive waiting and GUI mainloop, matching the observed countdown behavior. When resources are exhausted, report the reason and preserve drafts; no grade is automatically assigned.

Allow one active student GUI run per learner, material workspace, and browser owner session; starting elsewhere must explicitly replace the prior run or report it as active. Total admission is bounded by the configured GUI-session capacity. When full, show a recoverable busy state with a cancellable queue; queued sessions consume no runtime quota. A queued start expires after 60 seconds. Do not silently run unlimited containers.

Every transport/control message has session/run generation, sequence, and bounded payloads. Drop obsolete events after Stop/navigation/new run. Apply backpressure to terminal and viewer traffic rather than accumulating browser memory. Viewer disconnection starts a 30-second reconnect grace, then cancels the run; successful reconnect must reauthorize and recover current state. Material access revocation terminates sessions immediately when signalled and at the next broker authorization check, with a maximum 30-second revalidation interval.

Creation/start/stop is idempotent. Unexpected service crashes produce an infrastructure error, not a wrong-answer verdict. A supervisor cleans abandoned sessions after restart and verifies no sandbox exceeds expiry. One learner's session failure must not kill the application API or the ordinary judge pool.

## 8. Storage, rollout, and capacity

Postgres stores author configuration, drafts, immutable submission manifests/responses, and review history. Private object storage holds author starter/solution data assets and immutable asset versions referenced by submitted snapshots. Keep assets alive while referenced by submission/history; garbage collection must check references. GUI desktops/files written by running code are ephemeral and are not arbitrary student uploads into persistent storage.

A frame retained in the current browser after completion is transient. Screenshot recording or persistent drawing files are not required. The earlier PDF 95 MB configuration is independent; turtle assets have their own enforced limits and private paths.

The current judge sandbox and browser Pyodide worker cannot provide this GUI service unchanged. Add a separately deployable GUI runtime/gateway with health checks, capacity admission, secure transport routing, image/version management, cancellation, and cleanup. Do not run untrusted GUI code inside the API process or expand the judge sandbox's network permissions to accommodate a viewer.

Deploy additive schema/shared/API/manual-review support and the GUI service before enabling turtle authoring in the web client. Keep creation behind a flag until runtime isolation, service capacity, and acceptance tests pass. Rollback disables new admission, terminates active sessions cleanly, and preserves source/submissions/reviews/assets. Existing automatic exercises and PDFs remain available.

Measure peak memory of representative drawing and game sessions and set production capacity from reserved GUI memory/CPU headroom, not total host RAM. A 512 MiB limit plus display/gateway overhead is not the same as a fixed 512 MiB cost per session. Record proposed concurrency, measured usage, and tested failure behavior in deployment documentation before enabling the flag. No production server changes are authorized by this design-writing task.

Log session ids, approved profile/runtime, failure category, resource metrics, and lifecycle transitions. Omit student source/answers, terminal input, desktop frames, tokens, private solution files, and feedback text. Enforce ordinary backup/retention/access policies for persistent teaching records.

## 9. Verification and parity acceptance

Separate verification into runtime/session infrastructure, manual assessment/content integration, and the end-to-end workspace. All three are required before representing the release as behavior parity. Implementation and verification results are recorded in the [runtime operations guide](../../operations/turtle-runtime.md). The unverified Elice transitions listed below remain reference gaps even after Cove's own tests pass.

Runtime tests must exercise standard movement/fill/circles, pen state, multiple turtles, text, dimensions, `tracer`/`update`, keyboard/pointer/timer callbacks, `listen`, `mainloop`/`done`, terminal input, and Python errors. Use original examples reproducing the same interaction classes without copying Elice lesson content. Test Stop during loops/input/event loops, process descendants, time/memory/disk/output limits, gateway authorization, reconnect, expiry, capacity refusal, stale traffic, and clean subsequent runs.

API/integration tests must cover file/path/asset validation, author and teacher permissions, visibility, solution omission, drafts, immutable submissions, resubmission policy, manual review/version conflicts, score bounds, exclusion flags, completion/grade projections, award idempotency/corrections, library copy/adoption, and rejection from the ordinary automatic judge path. Existing automatic exercise outcomes must remain unchanged.

Localhost E2E uses the real local API/web, the development GUI service, and disposable author/teacher/student course fixtures in a development database. Never test against production. Cover:

1. Author hidden turtle, score-included turtle, score-excluded turtle with Submit disabled, and written-response materials; preview each supported flow.
2. Publish mixed exercise/PDF/turtle/written-response content; verify visibility and Previous/Next, including supplementary PDF exclusion.
3. Student run a drawing with terminal output and input; verify visible result, Python errors, saved files across reload, and Run recovery after Stop/timeout.
4. Run an original keyboard-controlled turtle activity with text score and event loop; focus the viewer, send keys, verify movement/text, then Stop and rerun.
5. Submit code and written answers; assert pending review, immutable source, private solution omission, and no automatic correct/wrong verdict.
6. Teacher review read-only, explicitly rerun a submitted program, publish score/completion/feedback, revise it with version conflict protection, and verify learner display/history.
7. Compare score-included and excluded results; verify only included reviewed work contributes to configured progress/score, with no duplicate rewards.
8. Test a new pending submission after a reviewed attempt, viewer disconnect/reconnect, idle cleanup, capacity busy state, and cross-learner/class access denial.
9. Verify Chrome, Safari, keyboard focus/fullscreen, narrow-screen controls, and regression behavior for ordinary Python Run/sample/Submit and PDF reading.

Before claiming exact Elice parity, complete an authorized disposable reference submit → teacher review → score/progress check. Specifically resolve final-score selection, completion threshold, zero-point display while pending, numeric grade publication, final-frame retention, reconnect, and file/draft persistence. Until then label these Cove policies as proposed and report the verified behaviors accurately. This is a release-verification requirement, not permission to change real Elice student records.

Run affected shared/API/web checks and production builds during implementation, follow the installed Next.js documentation before route/component changes, and document actual localhost E2E commands/results and any browser/reference gaps. Implementation cannot be declared complete by showing only a static canvas or by testing only the introductory drawings.
