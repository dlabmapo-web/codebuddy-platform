# Turtle graphics learning materials

Date: 2026-10-08

Status: proposed design for user review; implementation not started

Base: current `feat/lecture-pdf-materials` work

Reference: [Elice inspection](../../research/2026-10-08-turtle-graphics.md)

## 1. Purpose and release boundary

Authors can add a Python turtle practice material to a lecture. Students read instructions, edit Python, press Run, and watch a turtle draw inside Cove. They can stop execution, see Python errors and terminal output, and return later to their saved code. Turtle materials participate in the same lesson sequence as PDFs and ordinary exercises.

The proposed first release is **ungraded practice**. This matches the inspected introductory Elice chapter. The optional clarification about automatic grading has not been answered; this is a proposed default for review, not a confirmed grading preference. Opening or running a turtle material must not create submissions, accepted solutions, points, or a completion award. Automatic drawing assessment requires its own subsequent design.

Included: authoring and preview, student editor, an animated drawing surface, terminal input/output, saved drafts, mixed-material navigation, permissions, library copying/adoption, and meaningful localhost E2E verification.

Excluded: desktop Tkinter/Pygame applications, VNC hosting, turtle keyboard/mouse/timer callbacks, interactive games, arbitrary custom image assets/shapes, server judging, automatic picture comparison, drawing export, persisted drawing images, and live streaming of student drawings into teacher monitoring. The first release reproduces introductory drawing practice; it does not promise full desktop turtle compatibility.

## 2. Reference and implementation choice

Elice's inspected exercise enables **VNC GUI View**, with a 1024 × 640 display and a Python environment. Its lesson combines an editor, graphical output, terminal output, and Run/Stop. Those product behaviors inform this design. The research distinguishes direct observations from architectural inference.

| Approach | Trade-off |
|---|---|
| Existing Pyodide worker plus a Python turtle compatibility module and Cove canvas — recommended | Reuses Cove's Python semantics, input, errors, and execution controls without remote GUI sessions. Requires a defined turtle subset and drawing protocol. |
| Server CPython/Tk plus a remote GUI viewer | Closer to Elice's configured environment and potentially broader desktop compatibility. Requires isolated GUI sessions, resource management, authenticated display connections, operational capacity, and a separate security review. |
| A second browser Python interpreter with turtle support | May provide drawing sooner, but introduces another runtime and differences in Python semantics, input, errors, and package support. |

Use the first approach. Pyodide 0.27.5 does not ship desktop turtle/Tkinter, so implement and bundle a versioned compatibility module rather than attempting to import the desktop library. Document it as **Cove Turtle v1**. [Pyodide constraints](https://pyodide.org/en/0.27.5/usage/wasm-constraints.html), [Python turtle API](https://docs.python.org/3.12/library/turtle.html)

Keep Python execution in the worker. Python owns turtle state and geometry; the browser renders validated drawing data. Do not translate student Python into JavaScript or execute student-provided JavaScript in the page to draw.

## 3. Material model and access

Introduce `MaterialType.TURTLE_PRACTICE` and a one-to-one `TurtlePractice` record keyed by `materialId`. Keep it distinct from `ProgrammingExercise`: existing exercise records represent scored assessment and are counted in multiple services. Reuse UI and runtime components without reusing the graded database identity.

The practice record stores description, starter code, optional private solution code, `runtimeVersion = cove-turtle-v1`, and logical stage width/height. Defaults are 1024 × 640; each dimension is an integer between 320 and 2048. Existing `Material` owns title, lecture, position, visibility, and timestamps. Set `isRequired = false` for these materials, and reject attempts to turn them into required scored exercises. This flag is an additional invariant, not the mechanism for score exclusion.

Shared schemas, API response unions, outline entries, route helpers, library representations, and authoring validation must discriminate all three material types. Add a database migration without changing existing programming-exercise/PDF rows or their defaults. Existing scored exercise URLs and behavior remain valid.

Use the existing `ExerciseDraft` relation to save practice code, with explicit practice authorization in draft services. A draft does not imply assessment eligibility. For turtle materials, reject judge submission, server sample-check, grading-profile edits, test-case creation, solve-session admission, and point-award admission at the API boundary. Do not rely on hiding buttons. Course percentages, solved counts, completion awards, leaderboards, and exercise summaries continue to use eligible programming exercises only.

Require the same course/class membership and effective ancestor/material visibility as other learning materials. Authors need existing curriculum edit permissions. Teacher access to private solutions follows existing policy; student workspace payloads must never include solution code. Hidden practice URLs and drafts must not bypass access checks.

A turtle-only lecture is reachable and labelled as practice content without an artificial `0 / 0 exercises` completion badge. Report practice counts separately from exercise progress.

## 4. Authoring and curriculum behavior

Add **Add turtle practice** alongside Add exercise and Add PDF. The form includes title (trimmed, 1–128 characters), instructions using the existing supported editor, starter code, optional solution, and stage dimensions. Show a persistent “Ungraded practice” label and a link to the supported command reference. Do not offer test cases, scoring controls, or assessment limits.

New materials follow existing hidden-by-default behavior. Authors can edit, preview, show/hide, reorder, move, and remove them using normal curriculum concurrency, revision, audit, and position rules. Preview runs the same runtime and renderer as the student page, with separate transient state and no student draft changes. Viewing a solution is read-only unless the author explicitly edits its source.

Course/library copy and adoption preserve practice source, solution privacy, runtime version, dimensions, order, and visibility policy. Content synchronization follows existing revision/conflict rules and does not overwrite a student's saved draft. Unsupported runtime versions fail with a clear author-facing message rather than silently choosing another version.

Excel import/export currently expresses exercises, not arbitrary turtle practice. Reject attempts to replace a mixed course through a format that would discard turtle or PDF materials. Preserve existing exercise-only workbook behavior and clearly identify unsupported materials; do not silently coerce turtle practice into a graded exercise row.

Turtle practice is always a main lesson material. Reuse the canonical material navigation abstraction, extending it to route turtle materials to `/academy/[academySlug]/learn/turtle/[materialId]`. Previous/Next and the drawer follow the visible main-material order across exercises, main PDFs, and turtle practice. Supplementary-only PDFs remain outside that sequence. Material numbering counts visible main materials, while scored progress counts exercises.

## 5. Student workspace

Reuse Cove's instruction panel, Python editor, draft saving, breadcrumbs, material drawer, and lesson navigation. The output area contains distinct **Drawing** and **Terminal** regions. On desktop both can be visible; on narrow screens use labelled tabs with unread/error indicators. Keep Run, Stop, execution state, and terminal input reachable in either view.

Drawing starts as a white surface with an empty-state message before the first run. The stage has fit-to-panel and drawing fullscreen controls. Fullscreen affects presentation, not Python coordinate space, and exits without losing code or results. Resizing the panel scales the view and preserves geometry. The default coordinate origin is the center, positive x points right, positive y points up, and heading zero points right. Drawings clip to the logical stage rather than expanding the document.

Run resets the drawing, terminal run output, and all turtle state, then executes the current saved-in-memory editor text. Each run has fresh Python globals and fresh compatibility-module state. Save drafts independently of successful execution. Navigating away stops the worker before releasing the workspace; returning restores source, not a running program or old drawing.

Show Loading Python, Ready, Running, Waiting for input, Drawing, Finished, Stopped, or Error as appropriate. Python completion and animation completion are distinct; keep Stop enabled until the pending animation is drained. A second Run is disabled until the current run finishes or is stopped. New runs and Clear drawing cannot race with active execution. Clear drawing is available only while idle and clears the displayed scene without editing source.

`print()` and `input()` continue to use the existing terminal. Errors retain structured line information and editor highlighting. A Python error or Stop preserves the already displayed partial drawing, marks its state, and drops all remaining commands. Runtime load failure offers Retry and preserves source. The next Run starts clean.

No Submit, sample correctness result, score, accepted badge, grading AI feedback, or exercise timer appears on this page. Teacher author preview can execute practice independently; teacher monitoring must not automatically rerun student source. Existing student drafts can be inspected through authorized teacher access after its material-type gates are extended, but live graphics streaming is deferred.

## 6. Cove Turtle v1 compatibility contract

Support both `import turtle` with module-level calls and explicit `turtle.Turtle()`/`turtle.Screen()` objects. Module-level movement uses one lazily created default turtle. `Screen()` is a singleton per run. Independent turtles have separate pens, positions, colors, headings, and visibility.

| Group | Supported surface |
|---|---|
| Movement | `forward/fd`, `backward/back/bk`, `left/lt`, `right/rt`, `goto/setpos/setposition`, `setx`, `sety`, `setheading/seth`, `home` |
| Queries | `position/pos`, `xcor`, `ycor`, `heading`, `distance`, `towards` |
| Pen and color | `penup/pu/up`, `pendown/pd/down`, `isdown`, `pensize/width`, `pencolor`, `fillcolor`, `color`, `colormode` |
| Shapes and fill | `circle(radius, extent=None, steps=None)`, `dot`, `begin_fill`, `end_fill`, `filling` |
| Turtle display | `shape`, `shapesize/turtlesize`, `speed`, `hideturtle/ht`, `showturtle/st`, `isvisible`, `clear`, `reset` |
| Screen | `setup`, `screensize`, `bgcolor`, `title`, `tracer`, `update`, `clearscreen`, `resetscreen`, `done/mainloop`, `bye` |

Implement argument validation, getter return values, aliases, circle direction for negative radius, degree-based angles, and fill closure consistently with this documented subset. Coordinates and query results use Python numeric values; position queries return a two-item tuple. `colormode` accepts 1.0 and 255 and validates tuple colors accordingly. Support named CSS colors, hex colors, and numeric RGB tuples through a bounded color parser; never interpret color strings as markup.

Built-in shapes are classic, arrow, turtle, circle, square, triangle, and blank. The default is classic. Custom shape registration, stamps, text rendering, undo, world-coordinate changes, radians mode, direct Tk canvas access, files/images, dialogs, and event callbacks are unsupported in v1. Known unsupported calls raise a descriptive `NotImplementedError` with a link to the command reference; unknown names produce normal Python attribute/import errors. Do not silently ignore unsupported calls.

`setup(1.0, 1.0)` uses the entire configured logical stage. Fractional sizes are relative to that stage; integer sizes specify logical pixels within the configured maximum. Window-position arguments have no browser-window effect and are rejected when non-default. `screensize` may adjust the logical scene within the same dimension bounds. `title` changes a plain-text drawing label, not the browser document title.

Speed 0 renders without interpolation; speeds 1–10 animate movement and turns in order. Turtle geometry/query state updates synchronously in Python even while the UI is animating prior commands. Reduced-motion settings disable interpolation. `tracer(0)` batches display updates until `update()`; the run finalizer also flushes the scene so a finished program leaves a visible result. Document that final flush as a browser compatibility difference.

`done()` and `mainloop()` flush graphics and return; they do not keep a desktop event loop alive. `bye()` closes the drawing presentation for the current run without closing Cove. A subsequent Run recreates it. This explicitly differs from the Elice VNC example, where `done()` kept execution active until Stop.

Publish an original command reference and examples for a square, polygon loop, arc, filled shape, colors, multiple turtles, and terminal input. Do not copy Elice lesson text/assets into Cove.

## 7. Runtime, protocol, and limits

Keep changes behind an explicit runner mode: existing text Python uses its current path; turtle mode installs the bundled compatibility module before user execution. Extend `interactiveRunner.ts` and its worker integration, extracting focused turtle protocol/state/renderer units rather than embedding geometry in the exercise workspace.

The protocol carries a version, workspace generation, run id, monotonically increasing sequence, and a batch of drawing operations. Operations contain numeric geometry and controlled style values, never HTML, executable expressions, raw canvas contexts, or browser handles. Scope terminal/error/completion delivery to the same current worker generation/run, preventing a stopped worker's messages from updating a later run.

Validate at the browser boundary independently of Python-side validation. Reject unknown versions, operation kinds, non-finite numbers, malformed payloads, excessive arrays, oversized colors, and stale ids. The renderer maintains a bounded scene for redraw after resize and a separate cursor layer. Error messages and titles use plain text. Cap backing-store pixel ratio at 2 and each backing dimension at 4096.

Initial enforced limits per run:

| Resource | Maximum |
|---|---|
| Turtle instances | 8 |
| Drawing operations | 20,000 |
| Generated path/fill vertices, aggregate | 100,000 |
| Serialized graphics data, aggregate UTF-8 bytes | 4 MiB |
| Batch size | 256 operations |
| Pending render queue | 1,024 operations |
| Absolute coordinate magnitude | 1,000,000 logical units |
| Active execution time, excluding input wait | 30 seconds |
| Cumulative input waiting | 180 seconds |
| Total run wall time | 5 minutes |
| Animation drain after Python finishes | 30 seconds, then render remaining valid scene instantly |

Arc tessellation must count generated vertices against the aggregate budget before allocating them. Scene, batch, and queue limits apply even when student Python forges worker messages; limits in the Python shim alone are insufficient. Limit breaches terminate that run, drop pending animation, and show an actionable error. Timeouts terminate the worker; they must not depend on cooperative Python interruption.

For cross-origin-isolated execution, use bounded batches with a run-local SharedArrayBuffer credit/acknowledgement channel: the worker waits when the render queue is full and the main thread returns credits as it consumes batches. This supports synchronous Python without an unbounded message backlog. Keep input control and graphics control separate. Stop terminates the worker even while it waits for input or graphics capacity.

In the existing non-isolated buffered-input fallback, collect a budget-limited trace and deliver it after Python execution, then animate it with the same renderer. Clearly label buffered input; do not pretend interactive input or live drawing is available in that mode. All compute, trace, and geometry limits still apply. Regression-test the existing fallback for ordinary Python.

Keep current COOP/COEP and same-origin worker/runtime assets, including Safari behavior. No runtime CDN or new graphical server is required. The worker and drawing validation are responsiveness and rendering boundaries, not a claim that arbitrary Python is a new security sandbox; preserve and audit the existing Pyodide exposure when integrating the bridge.

## 8. Persistence and operational rollout

Postgres stores author instructions/configuration/source and student code drafts. Drawing state and animation remain in browser memory for the current run. No PDF bucket, binary upload, signed drawing URL, or 95 MB storage configuration is needed for this feature.

Bundle/pin the compatibility module and protocol together with the web release and use explicit asset cache versioning. Deploy the additive database/shared/API changes before the new web authoring entry point. Keep creation behind a feature flag until acceptance checks pass. Old web clients encountering the new material type show an unsupported-material notice rather than treating it as an exercise. Do not enable practice creation during a mixed-version deployment before compatible student clients are served.

Rollback disables creation/entry and leaves practice data intact. Existing exercise/PDF flows must remain available. Log runtime version, browser family, failure category, and aggregate command counts without student source, terminal input, solution text, or drawing payloads. Make errors useful without introducing a separate monitoring service.

## 9. Verification and acceptance

Implement semantic tests for movement/query return values, pen-up, negative-radius arcs, fills, colors, multiple turtles, reset, aliases, and unsupported APIs. Test malformed/stale protocol events, aggregate budgets, backpressure, stop during input/render waits, and timeout recovery. Geometry/state assertions are authoritative; avoid relying only on pixel screenshots across browsers.

API/integration tests cover author/student/teacher permissions, ancestor visibility, draft persistence, private solution omission, library copy/adoption, mixed-material order, turtle-only outlines, and rejection of direct judge/sample/solve/point admission. Assert existing exercise denominators and completion awards are unchanged by adding practice materials.

Run localhost E2E against the real local API/web and a designated development database, never production. Use a disposable course/class/student fixture and clean it up through supported test APIs. The flow must:

1. Create and preview a hidden practice as an author; verify source/configuration save and student denial while hidden.
2. Publish a lecture containing an exercise, a main PDF, turtle practice, and a supplementary PDF. Verify navigation order and separate progress counts.
3. Open practice as the student, run an original square and a filled arc, and verify both scene geometry and visible rendering/cursor with terminal output.
4. Change source, reload, and verify saved source returns; verify there is no restored execution or drawing.
5. Exercise interactive input, a Python error, Stop during drawing, an infinite loop timeout, and a successful subsequent Run.
6. Check multiple turtles, speed 0, `tracer(0)`/`update`, panel resize, fullscreen, reduced motion, narrow viewport, and a limit error.
7. Verify no submission, score, solve session, or points were created and direct prohibited API calls fail.
8. Confirm ordinary Python Run/input/sample checks and PDF reading/navigation still work.

Include Chrome and Safari coverage for the isolated runtime, plus the non-isolated buffered fallback. Run affected shared/API/web checks and production builds, and follow installed Next.js version documentation before writing route/component code. Record actual test commands/results and any browser gaps in the implementation report. This spec defines future verification; no Cove turtle implementation or localhost turtle E2E has been executed yet.

Release is acceptable when a student can run the documented v1 examples, see drawings and errors, stop runaway code, recover with another run, retain code across reload, navigate mixed lessons, and do so without changing scored exercise outcomes or opening access to hidden/private material.
