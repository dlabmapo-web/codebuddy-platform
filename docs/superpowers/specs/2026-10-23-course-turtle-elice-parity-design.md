# Course Turtle execution and layout repair

Date: 2026-10-23
Status: implemented on the local `feat/course-turtle-parity` branch. Verification is recorded separately; production deployment and reviewed content conversion remain separate operations.

Evidence: [detailed Elice/Cove audit](../../research/2026-10-23-course-turtle-elice-parity-audit.md). This supplements the [original Turtle design](2026-10-08-turtle-graphics-design.md), rather than replacing its permissions, runtime isolation, or manual-assessment model.

## Outcome

A student opens a Turtle activity from a class/course, writes normal Python Turtle code, and sees its drawing and text output. A completed or failed run retains a useful picture. The student can expand the drawing in front of the workspace, close it, and continue editing without losing the session. Existing keyboard/timer activities, files, drafts, and authorized teacher review continue to work.

The implementation has four separate work areas: content mapping, execution/display lifecycle, workspace presentation, and authorized course navigation. A layout change alone does not fix the photographed import error.

## 1. Material and assessment mapping

The photographed activity must use the dedicated CPython/Tk Turtle path rather than Pyodide. Produce a dry-run inventory mapping source activity identifiers to existing Cove academy/course/lecture/material identifiers. Include current type, visible ancestors, starter/solution files, entry point, assets, assessment policy, existing drafts, submissions, and historical grades.

Use explicit source/configuration evidence to classify an activity. Do not infer GUI execution from a substring in arbitrary source, a Korean title alone, or a chapter-wide update that also converts its quizzes and written responses.

Plan conversion using the existing typed `TURTLE_EXERCISE` model. If an in-place conversion cannot preserve existing history consistently, create a replacement with an explicit legacy mapping/redirect and retained historical records. Do not delete the old programming record/history or reinterpret its submitted scores as manual grades. Preserve stable links or provide authorized redirects. Document progress/points consequences and rollback before applying the plan.

For the inspected CH09 introductory materials, match the source's score exclusion. Submission availability remains an independent setting. Missions that need teacher assessment retain that policy; automatic stdout comparison must not judge their pictures. Changing a runtime or opening a preview never awards completion.

The browser error must remain an actionable error until migration is complete. Do not hide the import failure behind a generic successful canvas. Student outlines must not reveal hidden staff-only material.

## 2. Execution and final display lifecycle

Retain isolated CPython/Tk and the existing network/resource limits. Preserve explicit `done()`/`mainloop()`, timer, keyboard, pointer, multiple-turtle, and interactive-input semantics.

Course activities retain standard Turtle pen/shape behavior and the learner's explicit settings. Do not apply the public trial's beginner pen-width or icon defaults globally to course programs.

For source that returns without an explicit loop:

1. Complete pending Tk drawing updates while the graphical window is still alive.
2. Make the completed frame available before destroying the Python/Tk display. Cover a program that finishes before the viewer connects.
3. Expose successful code completion separately from display retention. The UI can enable rerun while showing the retained result; it must not describe a static result as code still executing.
4. Retain frames transiently in the current browser/session. Do not introduce persistent screenshot recording or embed drawing data in logs.
5. Bound any post-execution runtime retention and preserve current authorization/deadline/capacity accounting. After runtime release, the retained browser frame should not occupy a live sandbox slot.

Prefer one shared course runtime completion protocol over appending source text to every teacher's file. An explicit event loop must not be entered a second time after the user's program has closed its window. A destroyed Tk root, a Python error, a non-graphical program, and `SystemExit` need explicit tests.

For exceptions, retain the last drawable frame and the real traceback/error/exit code. For Stop or timeout, preserve a frame when available and terminate the full owned runtime. If no frame is available, display the actual state and a recovery action. Never return a stale successful picture as the output of a new failed run without identifying it as the previous result.

Each Run owns an execution generation. Starting again clears the prior terminal/error and replaces the prior display only as an explicitly identified new run. Old status polls, frame events, and disconnect callbacks cannot overwrite the next run. Stop during preparation must not admit a late runtime or viewer afterward. Navigation/leave must release the owned runtime even if its last picture is retained.

## 3. Workspace presentation

Use Cove's components, spacing, and Korean/English translations. Reproduce the interaction model rather than Elice colors, branding, or reference-specific rendering defects.

### Default view

The course list is available from the header. It should not reserve a permanent empty column while loading. Use a collapsed navigator by default for a new Turtle workspace unless a valid user preference says otherwise. Keep this preference separate from unrelated Python workspace preferences.

Instructions occupy the left pane. The right pane contains source files/editor, execution actions, and drawing/terminal results. Give the drawing useful area; do not stack a 220-pixel minimum editor, oversized control rows, verbose keyboard help, and a compressed display into an unadjustable remainder.

Illustrative layout, with resizable proportions rather than hardcoded reference pixels:

```text
Course / activity              Instructions  Files  Drawing layout  Leave
┌───────────────────┬──────────────────────────────────────────────────┐
│ Instructions      │ main.py / helper files                           │
│                   │ Python editor                                    │
│                   ├──────────────────────────────────────────────────┤
│                   │ Run / Stop     execution state                   │
│                   ├─────────────────────────────┬────────────────────┤
│                   │ Drawing                     │ Terminal / input   │
│                   │ Fit   Expand drawing        │                    │
└───────────────────┴─────────────────────────────┴────────────────────┘
Previous                        activity position                   Next
```

Also offer a tall right-hand drawing placement with code above terminal beside it. Changing placement is a presentation change, not a new execution. Do not remount the viewer, reconnect the socket, resize the remote world, or lose the completed frame just because the layout changes.

### Foreground drawing

**Expand drawing** opens an accessible view above the current workspace and uses almost the full available viewport. It must work as an in-page foreground view even when the native Fullscreen API is unsupported, rejected, or not activated.

Its visible toolbar contains activity/drawing title, execution/connection state, Fit, optional actual-size/zoom with panning, Stop while active, and Close. Native browser fullscreen may be an additional control with an explicit exit action. Display a useful fallback/error if it fails; never silently leave a button appearing to do nothing.

Keep one stable viewer/session instance across docked, expanded, and browser-fullscreen states. Keep the drawing's intrinsic dimensions and aspect ratio. Scaling the view must not change turtle coordinates or the Python `Screen` size. Browser resize updates fitting, not the student's program. A user must still be able to pan at actual size when the drawing is larger than the viewport.

Move focus into the foreground view, contain Tab navigation there, and restore focus to the opener on Close. Escape while the canvas captures keys first releases drawing keyboard input; a subsequent Escape from the surrounding view closes it without stopping the program. Provide visible Close at all sizes. Returning to the workspace retains source, terminal transcript, frame, run identity, and editor position.

Fullscreen the drawing independently of the whole lesson. A separate workspace expansion may hide header/navigation chrome, but must not be mislabeled as drawing-only expansion. Mobile should use clear Code/Drawing/Terminal tabs and the same foreground drawing action; controls must not cover the canvas.

### States and errors

Localize preparing, queued, running, waiting for input, completed, stopped, timed out, disconnected, and failed states instead of displaying raw enum names. Differentiate code errors from display connection errors. Keep Python tracebacks intact. Show a compact keyboard/focus hint on demand rather than permanently spending most of the drawing height on it.

## 4. Course and preview navigation

Provide an explicitly authorized preview outline for staff with curriculum-review permission. Its hierarchy must contain the current hidden activity and be the same hierarchy used to calculate its position and Previous/Next. Carry class, preview, and academy scope into destinations. Students continue to receive only the visible assigned hierarchy.

Represent loading, request failure, current-material unavailable, and loaded-empty as different states. A completed request whose hierarchy lacks the material must not remain on an infinite loading label. Provide Retry for recoverable failures and a useful back-to-course route when access/content changed.

Elice's footer position is local to the current lecture in the inspected activity. Cove currently uses a whole-course sequence. This repair keeps Cove's established whole-course navigation policy and makes it correct for mixed materials; it does not change every workspace's numbering to mimic the reference. If lecture-local numbering is later desired, label and implement that as a separate consistent product choice.

Navigation while code is running must stop the owned run before committing the transition or offer a clear cancel/leave decision. Keep draft autosave and submission semantics unchanged. Viewing a solution must not overwrite source; running an authorized solution must remain an explicit action.

## 5. Files and saved work

Use the existing safe source-manifest and declared asset boundaries. File creation and structural edits mark the draft dirty, including creation of an empty file. Validate names inline; do not accept traversal, absolute paths, reserved asset paths, duplicate names, or unsupported file types and wait until Run to explain the error.

Preserve entry point and additional modules across edits/save/reload. Source files remain editable; teacher data assets remain separately identified and read-only. Keep private solutions private. Existing helper files are migrated only when required and supported, with an explicit mapping to source/data assets.

## 6. Implementation locations

| Area | Starting points |
|---|---|
| Student routing/runtime | `packages/web/src/lib/routes.ts`, ordinary exercise workspace, `packages/web/src/lib/workspace/use-python-runner.ts`, typed material readers |
| Material/history repair | Prisma material relationships, manual and programming submission projections; legacy migration `packages/api/src/migrations/mvp-curriculum/target.ts` is evidence to inspect, not a command to rerun blindly |
| Python completion | `packages/gui-runtime/docker/run.py` |
| Runtime/session lifecycle | `packages/gui-runtime/src/server.mjs`, runtime policy/parser and API GUI adapter/shared schemas |
| Viewer and retention | `packages/web/src/components/manual/gui-viewer.tsx` and its tests |
| Layout and files | `packages/web/src/components/manual/manual-workspace.tsx` |
| Preview hierarchy | `use-material-navigation.ts`, `learn.getCourseOutline`, `curriculum-outline.service.ts`, shared navigator helpers |
| Workspace expansion | `packages/web/src/components/workspace/lesson-chrome.tsx`; coordinate with dedicated drawing expansion |
| Language | Existing manual/learn English and Korean namespaces |

Read the installed Next.js documentation before editing routes or React components. The public PIN trial is a separate workflow; shared runtime/viewer changes need regression coverage there, but this work does not change its authentication, beginner API, or deployment configuration.

## 7. Local acceptance and release gates

Use real local API/web, isolated CPython/Tk, and disposable classes/materials/learners. Repeat browser interactions with the repaired UI; an HTTP success or printed marker alone is not proof of a drawing.

Required execution cases:

- Animated square and `speed(0)` star return normally without `done()` and remain visible.
- Instant `tracer(0)`/`update()` drawing completes before viewer attachment and still yields a completed image.
- Explicit `done()`/`mainloop()`, multiple turtles, fills/circles, text, callbacks, and timers work.
- Partial drawing plus Python exception retains the image and actual error; corrected rerun clears the old error and runs cleanly.
- Close/destroy window, `SystemExit`, non-GUI source, infinite loop, input wait, Stop during preparation, Stop during callback execution, timeout, output limit, and reconnect have truthful state and bounded cleanup.
- Rapid Run/Stop/Run and navigation do not show stale frames/output or retain an orphan sandbox.

Required presentation cases:

- Dock below, dock right, foreground expand/close, and native fullscreen exit preserve the same viewer/run and image.
- Foreground expansion works when native fullscreen rejects; Escape, Close, Tab focus, keyboard release, and focus return work.
- Resize and mode changes preserve coordinate geometry, aspect ratio, code, scroll position, and terminal output.
- Large drawings can be viewed without clipping; narrow/mobile layouts keep Run/Stop/Close accessible.
- Chrome and Safari/WebKit receive real drawing and focus checks; automation-only fullscreen limitations are reported separately.

Required data/navigation cases:

- The photographed student activity reaches the GUI path from both course and class, with no turtle import error.
- Dry-run migration identifies only intended activities, retains historical records/links, and states score/progress changes.
- Hidden staff preview has valid outline/index/Previous/Next; unauthorized students cannot obtain the hidden hierarchy.
- Loading failure shows Retry; absent/current-material mismatch shows unavailable rather than endless loading.
- Add an empty module, save/reload it, import it from the entry point, and verify path/duplicate validation.
- Run never creates a submission or grade. Use disposable fixtures to test submit → teacher review → progress separately for included/excluded policies.

Run affected runtime, shared, API, and web checks plus the relevant builds. Record actual local browser screenshots and cleanup results. Deployment and production material publication/conversion follow as a separate reviewed operation after local acceptance; this document does not claim they have occurred.

Measure click-to-first-drawing and corrected-rerun latency before/after using the same source, display size, browser, and runtime profile. Separate preparation, execution, and viewer connection; do not attribute a delay to the VPS without phase evidence. Mode changes must not add runtime startup latency because they must not create a new run.
