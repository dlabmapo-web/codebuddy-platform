# Course Turtle behavior comparison with Elice

Date: 2026-10-23, Asia/Seoul
Cove production source: `9015fda7`, release `v2.0.41`
Purpose: identify the remaining course/class Turtle repairs, including drawing layout and expansion.

The dedicated Cove Turtle runtime can draw and handle interactive Python. The student-facing introductory Turtle lessons currently use the wrong material/runtime path. Dedicated Turtle previews also lose drawings when Python exits, have a broken hidden-material outline, and compress the drawing into a small result area. These are different problems and require different repairs.

Implementation requirements are in the [course Turtle parity design](../superpowers/specs/2026-10-23-course-turtle-elice-parity-design.md). This audit changes documentation and screenshots only. It does not publish chapters, convert materials, change scores, submit answers, or deploy code.

## References and method

- [Elice robot chapter](https://dlab.elice.io/courses/765886/lectures/6637936#list).
- [Elice rectangle activity](https://dlab.elice.io/courses/765886/lectures/6637936/lecturepages/54488318).
- [Elice introductory Turtle chapter](https://dlab.elice.io/courses/765886/lectures/6637927#list).
- [Elice introductory preparation activity](https://dlab.elice.io/courses/765886/lectures/6637927/lecturepages/54488204).
- [Cove introductory activity in Test Class](https://cs.coveedu.com/academy/dlab-mapo/learn/exercises/2d83d1db-f1ff-5ac7-b277-45f2f874bdd7?classId=765ff8da-b032-476d-b403-9d4e7ceac61e&mode=student).
- [Cove dedicated rectangle preview](https://cs.coveedu.com/academy/dlab-mapo/learn/turtle/79741165-b4f2-4f2a-aa13-21f986ae4ca9?preview=true).
- [Cove dedicated robot preview](https://cs.coveedu.com/academy/dlab-mapo/learn/turtle/19389172-66d6-4d9d-8ccc-2672c63604ad?preview=true).

Tests used the user's logged-in Elice manager workspace, direct Cove manager login, and the authorized Cove student account. The Cove drawing tests used manager preview, which does not save or submit responses. The student test ran the existing starter without editing or submitting it. Temporary Elice source was restored to its original blank text; the second robot activity and introductory activity were inspected without changing their code. Explicitly running Turtle programs were stopped after testing. No feedback, grading, submission, account configuration, or publication actions were performed.

Screenshots and read-only repository inspection supplement the visible tests. A successful terminal marker alone is not counted as successful visual rendering. Measurements are approximate browser observations from one machine, not a load test or latency guarantee.

## Confirmed differences and repairs

### 1. Student Turtle lessons use the ordinary Python runner

In Cove's published **파이썬 기초 → [CH09] 터틀(turtle)**, the preparation activity opens under `/learn/exercises/`. Its UI labels it **Automatically graded · Up to 100 points**. Running its existing `import turtle as t` starter as the student fails on line 1:

```text
ModuleNotFoundError: No module named 'turtle'
```

The dedicated **[CH11] 터틀_로봇 그리기** materials instead open under `/learn/turtle/` and successfully use standard `turtle`.

The code confirms that the ordinary exercise workspace uses `usePythonRunner`, which uses Pyodide. The dedicated manual workspace sends source to the isolated CPython/Tk service. Installing a package inside the existing browser editor is not the repair for desktop Tk turtle.

The legacy MVP curriculum migration inserts its exercises as `PROGRAMMING_EXERCISE`. That is a migration path worth auditing; it does not, by itself, prove which historical job created every affected production record.

**Required repair:** inventory the affected source activities and existing Cove records, then plan an explicit typed-material conversion or replacement/redirect migration. Do not route arbitrary Python exercises to the GUI service merely because their code mentions `turtle`. Do not change `Material.type` alone and leave its related data/history inconsistent.

Evidence: [student error](assets/2026-10-23-turtle-elice-parity/cove-student-turtle-import-error.jpg).

### 2. Introductory grading settings differ from Elice

The Elice CH09 chapter lists 18 materials with **Grading Excluded**. The matching Cove preparation activity displays automatic grading and a 100-point maximum. A drawing activity completing successfully is not evidence that its picture should receive an automatic correct verdict.

**Required repair:** copy the intended assessment policy per material. The inspected introductory activities should not become stdout-graded drawing problems. Keep submission availability separate from score exclusion. The earlier Elice research found manually assessed missions elsewhere, so do not make every Turtle activity ungraded globally.

Preserve historical attempts and grades through a reviewed migration. Record any effects on course progress and points before applying it. Neither running a sample nor repairing the renderer should silently award completion or alter old scores.

Evidence: [Elice chapter labels](assets/2026-10-23-turtle-elice-parity/elice-intro-grading-excluded.jpg), and the earlier [assessment inspection](2026-10-08-turtle-graphics.md).

### 3. Normal completion can erase the Cove drawing

In the dedicated Cove rectangle preview:

- A program drawing a rectangle and then returning printed `Rectangle finished`, reached `FINISHED / Exit code 0`, and left a black result.
- Adding `t.done()` kept the rectangle visible while the program remained running.
- Stop preserved a last frame; a subsequent run worked.

Elice retained an animated rectangle and a fast star after normal completion without `done()`. Its viewed rectangle solution also does not explicitly end in `done()`.

There is an important reference edge case: an instant multiple-turtle drawing using `tracer(0)` and `update()` printed its completion marker but showed a blank result without an event loop in this audit. Adding `done()` made its filled circle and text visible. Therefore Elice is not evidence that every fast final frame is captured reliably.

Evidence: [instant Elice completion with blank drawing](assets/2026-10-23-turtle-elice-parity/elice-instant-completion-blank.jpg), compared with the [same drawing with an event loop](assets/2026-10-23-turtle-elice-parity/elice-event-loop-drawing.jpg). The exact cause inside Elice was not inspected.

**Required repair:** make Cove's static completion path reliable even when Python finishes before the viewer receives its first completed drawing. Treat final-frame capture/retention as part of execution completion. Requiring beginners to append `done()` only works around the defect. Existing explicit event loops must retain their real callback behavior.

The runtime entry script currently ends with `runpy.run_path(...)`; the broker marks completion when that process closes. The viewer captures a frame on disconnect, after the Tk window may already have disappeared. These source observations explain why merely waiting longer in the web component is insufficient.

Evidence: [Cove normal completion](assets/2026-10-23-turtle-elice-parity/cove-completion-black-panel.jpg).

### 4. Errors should preserve useful partial output

An original test drew a blue line, printed `BEFORE_ERROR`, and raised `ValueError("EXPECTED_TURTLE_TEST_ERROR")`.

- Elice showed the traceback and retained the line.
- Cove showed the traceback and `ERROR / Exit code 1`, but the drawing area became black.
- Both accepted a corrected next run. Cove then rendered the filled-circle/multiple-turtle test with `done()`.

**Required repair:** retain the latest available drawing on normal completion, Python error, Stop, timeout, and viewer disconnect. Retain the error state and exit code too; keeping a picture must never turn a failed run into success. Infrastructure failures with no drawing need an explicit message, not a misleading blank successful canvas.

Evidence: [Cove partial-drawing failure](assets/2026-10-23-turtle-elice-parity/cove-partial-drawing-error.jpg).

### 5. Elice has two drawing placements

The Elice Execution Result toolbar switches between:

1. A small drawing result beside the terminal underneath the editor.
2. A tall drawing column on the right, with code above the terminal in the middle and instructions on the left.

The separate ratio control changes display fitting/resizing and is disabled during an active run. It is not a verified foreground fullscreen dialog. The footer Fullscreen control hides the workspace header and exposes **Exit Fullscreen**; instructions, editor, terminal, and drawing remain present.

Switching drawing placement after a completed run cleared the displayed drawing in this session; rerunning restored it. Changing ratio after stopping could also clip or lose the retained picture. These are reference limitations to avoid reproducing.

**Required repair:** offer deliberate docked drawing placement and an independent **Expand drawing** foreground view. Keep one viewer/session alive across presentation changes. Closing the expanded view must restore the exact code, output, focus, and drawing without starting another run.

Evidence: [Elice tall drawing column](assets/2026-10-23-turtle-elice-parity/elice-event-loop-drawing.jpg), [Elice workspace fullscreen](assets/2026-10-23-turtle-elice-parity/elice-workspace-fullscreen.jpg).

### 6. Cove's result area becomes a thumbnail

With the course sidebar open, a live 1024×640 Cove desktop was rendered at approximately **235×147 CSS pixels**. Instructions, a permanent outline, editor, control rows, keyboard help, drawing, and terminal all compete for the same viewport. The desktop remains small even though the Python drawing is correct.

Cove's viewer scales the desktop and deliberately disables remote desktop resizing. Scaling is appropriate for preserving lesson coordinates; the surrounding layout needs enough room. Increasing pen width or turtle size is not the solution to this layout issue.

The existing **Fullscreen drawing** action did not expand in either the Playwright or native accessibility click attempt. `document.fullscreenElement` remained null. This establishes a failure in the tested automation/browser session, not that fullscreen fails for every human browser interaction. Source inspection shows a native Fullscreen API call whose rejection is silently ignored, with no in-page fallback.

**Required repair:** a foreground, accessible drawing view must work without relying on native fullscreen. Native browser fullscreen can be an additional action. Provide visible Close, Escape, fitting controls, connection/execution status, and Stop while a program is active.

Evidence: [Cove interactive result and fullscreen attempt](assets/2026-10-23-turtle-elice-parity/cove-interactive-and-fullscreen-attempt.jpg).

### 7. Preview navigation cannot locate hidden materials

Both dedicated previews stayed on **Loading the course outline…**, displayed **— / 295**, and disabled Previous/Next even when no program was running. The chapter and its Turtle activities are currently hidden from Cove students.

The code fetches the visible course outline, then calls `toNavigatorContext` with the previewed hidden material. That function returns null when the material is absent. The navigator interprets the missing context as loading although the request completed. Fixing the loading message alone would still leave the wrong hierarchy.

Elice Previous and Next moved between the first two robot activities and updated the index. Its material-list dialog temporarily failed to load this chapter, displayed an error and Retry, and recovered after one retry with all 13 entries. Cove needs a finite loading/error/unavailable state as well as a valid authorized preview outline.

**Required repair:** make staff preview an explicitly authorized outline mode. Include hidden material only for the entitled staff member and carry preview/class context into navigation. Never expose that hierarchy in the student's outline. Render an error/retry or unavailable state when a requested material cannot be resolved.

### 8. Files and starter content need an audit

The Elice introductory preparation activity has `main.py`, a data directory, an image, and a Python helper module. Its starter imports `turtle` and sets up the screen. Cove's corresponding ordinary exercise has a simplified single-file starter ending in a synthetic completion print.

Elice exposes a file tree, new-file, new-folder, and upload controls. Those controls were inspected; file creation/upload/deletion were not exercised. Cove's dedicated workspace exposes file tabs and a browser prompt for adding a filename. It lacks that file-tree experience.

Source inspection also found that Cove's add-file handler updates `files`/`selected` but does not mark the draft dirty. Adding an empty file alone can therefore miss the autosave trigger. This is a code-review finding, not a reproduced production data-loss test.

**Required repair:** inventory the files actually required by each migrated activity. Preserve safe source paths, entry point, and declared read-only assets. Provide inline filename validation and distinguish editable source from data assets. Mark file-structure changes dirty. Do not copy unused platform-specific helper files indiscriminately.

### 9. Keep the functioning runtime features

The same original interactive test succeeded in Cove's dedicated preview:

- `input()` displayed a prompt and resumed after terminal input.
- `onkey` with Right printed `RIGHT_KEY` and moved the turtle after focusing the canvas.
- `ontimer` printed `TIMER_OK`.
- Escape returned focus to **Release keyboard**.
- The on-screen Right button delivered a second callback.
- Multiple turtles, a filled circle, `goto`, text, `tracer(0)`, and `update()` rendered with an explicit event loop.
- Stop and a subsequent run recovered after the controlled error.

These are capabilities of the existing CPython/Tk service. Replacing it with a limited browser turtle shim would require reimplementing behavior that already works.

Cove status rendering currently prints raw session enum names. Localize the surrounding status UI consistently in Korean and English; preserve standard Python code and traceback content.

Evidence: [Cove successful compatibility drawing](assets/2026-10-23-turtle-elice-parity/cove-compatible-event-loop.jpg).

## Live case matrix

“Observed” means exercised in the browser. “Inspected” means controls or source were read but the full workflow was not executed.

| Case | Elice | Cove | Consequence |
|---|---|---|---|
| Animated rectangle without `done()` | Drawing retained after completion | Black result after successful exit | Repair completion/display lifecycle |
| Fast star without `done()` | Drawing retained in earlier pass | Not repeated as a course star | Do not generalize from one example |
| Instant `tracer(0)`/`update()`, no loop | Completion marker, blank result | Static completion already fails; exact case not repeated | Include a first-frame race test |
| Explicit `done()` | Drawing/event loop works | Drawing/event loop works | Preserve standard semantics |
| Multiple turtles, circle, fill, text, manual update | Visually passed with `done()` | Visually passed with `done()` | Keep existing runtime |
| Terminal prompt and resume | Observed | Observed with returned input text | Keep terminal separate from drawing keys |
| Focused Right callback | `RIGHT_KEY` observed | `RIGHT_KEY` observed | Keep focus handling |
| Timer callback | `TIMER_OK` observed | `TIMER_OK` observed | Preserve event loop |
| On-screen Right | No equivalent tested | Second `RIGHT_KEY` observed | Retain useful accessible control |
| Escape releases canvas focus | Not tested | Focus returned to Release keyboard | Require in expanded view too |
| Stop active event loop | Returns to Run; frame retained | STOPPED; last frame retained | Maintain clean stop/release |
| Error after a partial drawing | Traceback and line retained | Traceback with black drawing | Preserve failure frame |
| Corrected rerun after error | Successful | Successful | Add regression coverage |
| Bottom/tall-right drawing placement | Both exercised | No equivalent selector | Add presentation modes |
| Layout change after completion | Lost image in this session | Equivalent mode unavailable | Do not copy that limitation |
| Ratio control while running | Disabled | No equivalent exposed control | Keep world coordinates stable |
| Whole-workspace fullscreen | Header hidden; Exit Fullscreen works | Native API path inspected | Distinguish from drawing expansion |
| Foreground drawing-only view | Not observed | Fullscreen attempts did not expand | Implement requested robust foreground view |
| Previous/Next | Both directions exercised | Disabled for hidden preview | Repair preview context |
| Course material-list load failure | Error/Retry; retry recovered | Missing preview material remains “Loading” | Explicit request states |
| File tree/add/folder/upload controls | Inspected | Tabs/prompt inspected in source | File/asset parity work remains |
| Introductory grading | CH09 Grading Excluded visible | Tested lesson automatic, up to 100 | Review material policy/migration |
| Student `import turtle` | GUI activity visible in reference | ModuleNotFoundError in ordinary workspace | Highest-priority student blocker |
| Save/reload full file manifest | Not tested | Not tested in this audit | Local acceptance case |
| Submit → teacher grade → progress | Not executed | Not executed | Separate disposable assessment test |
| Multi-user load, expiry, reconnect, Safari/mobile | Not tested | Not tested here | Required release checks, not current claims |

The public `/turtle` PIN trial is a separate workflow. Its custom beginner commands, PIN access, and earlier startup measurements do not prove course/class parity.

One dedicated-course rerun in the preceding live pass took approximately **2.96 seconds** to show a blue drawing. There is no equivalent controlled Elice timing sample in this audit, so it does not establish a speed comparison or identify VPS hardware as the cause. Use the existing [startup performance design](../superpowers/specs/2026-10-23-turtle-startup-performance-design.md) and phase measurements for performance work.

## Repair order

1. **Student blocker:** inventory and correct the Turtle material/runtime mapping, starter files, and per-material assessment settings through an auditable migration plan.
2. **Drawing lifecycle:** preserve normal/error/Stop results, including instantaneous programs; isolate completion from display retention and release resources predictably.
3. **Layout:** add foreground drawing expansion, stable docked placement, appropriate pane sizing, and clear focus/close behavior.
4. **Navigation:** authorize a true preview outline, correct indexes, and show finite error/retry/unavailable states.
5. **Files and localization:** repair dirty-state handling and validate file paths; localize raw execution status.
6. **Local acceptance:** execute the design's test matrix with real isolated CPython/Tk and disposable students/classes before a separately approved production rollout.

## Verification limits

No production grades or submission flows were exercised. Empty/malicious files, long loops, resource exhaustion, capacity queues, network interruption, grant revocation, screen-reader behavior, mobile layouts, and cross-browser operation need controlled local fixtures. The audit is a detailed list of verified behaviors and remaining checks, not a claim that every Elice feature or every Cove edge case was tested.
