# Elice turtle graphics inspection

Date: 2026-10-08

Purpose: understand the reference before specifying turtle practice in Cove.

Method: inspect the user's logged-in Elice course through Chrome, read visible lesson/editor/environment controls, and run a temporary example. No exercise submission or authoring save was made. The temporary code was restored and the run stopped.

## Observed behavior

The [course material list](https://dlab.elice.io/courses/765886/lectures/all) contains a turtle introduction chapter, a separate mission chapter, and later turtle robot/game chapters. Tkinter and Pygame also have separate chapters; those are broader GUI capabilities than introductory turtle drawing.

The [introductory turtle chapter](https://dlab.elice.io/courses/765886/lectures/6637927#list) contains 18 materials, all labelled **Grading Excluded / Excluded from score**. Topics include coordinates, movement, rotation, triangles/squares, polygons, circles/arcs, and repeated patterns. The separate mission chapter displays a completion denominator, so the introductory chapter's exclusion must not be generalized to every Elice turtle exercise. Automatic drawing assessment was not investigated or verified.

The [preparation exercise](https://dlab.elice.io/courses/765886/lectures/6637927/lecturepages/54488204) shows instructions beside a Python editor with `main.py`. Its file tree also contains a data directory and supporting files. Starter code imports `turtle` and calls `Screen().setup(1.0, 1.0)`. Instructions introduce `Turtle()` and `shape('turtle')`. View Solution opens a solution modal.

The editor has Run, Submit, editor-connection status, and a result area divided into **GUI execution result** and **text terminal output**. Lesson Previous/Next and the lesson position are separate from execution controls. A completed starter run reports completion in the terminal. The mere presence of Submit does not establish that introductory drawings receive a score.

The visible authoring environment settings for that exercise show:

| Setting | Observed value |
|---|---|
| Exercise environment | Java 8 + Python 3 |
| Time limit | 1800 seconds |
| Memory limit | 512 MB |
| Use GUI View | Enabled |
| GUI option | VNC selected |
| GUI dimensions | 1024 × 640 |

The form also offers an HTTP port option. It was not selected or tested. These are reference settings, not recommended Cove limits. Opening authoring and leaving triggered an unsaved-changes warning even though no fields were intentionally edited; leaving discarded the unsaved form and did not save it.

In the [pattern lesson](https://dlab.elice.io/courses/765886/lectures/6637927/lecturepages/54488218), the instructions use nested Python loops with forward movement and left turns. I temporarily ran an original four-sided drawing example ending with `turtle.done()`. A white GUI surface, turtle cursor, and drawn lines appeared in the result panel, while the terminal reported that code was running. Run changed to Stop and showed a remaining-time countdown. The GUI resize control reported that its ratio could not be changed during execution. The run was stopped and the exact starter text restored; no Submit was used. This verified rendering of graphics, not drawing correctness or grading.

## Interpretation and limits

The configured **VNC GUI view** is direct evidence that this exercise uses a remote GUI display rather than an ordinary browser turtle library alone. Python running in the configured environment and a GUI streamed to the page is the reasonable architectural interpretation. Its container implementation, VNC transport, grader, persistence, isolation, and infrastructure costs were not inspected.

The product behavior worth reproducing is Python code → Run → turtle drawing inside the lesson, with terminal output and Stop. Replicating Elice's VNC infrastructure is a separate implementation choice, not a requirement established by the user's request.

## Cove constraints checked in the repository

- `packages/web/public/pyodide-worker.js` runs vendored Pyodide 0.27.5 in a worker and currently handles text execution, input, and structured errors.
- `packages/web/src/lib/pyodide/interactiveRunner.ts` manages worker lifecycle and SharedArrayBuffer input, with a buffered fallback.
- `packages/web/src/lib/workspace/use-python-runner.ts` and `use-sample-runner.ts` provide execution and sample-check behavior. Graphical practice must not run through stdout comparison.
- `packages/api/prisma/schema.prisma` currently has programming exercises and PDF documents. Programming exercises carry assessment fields and relationships.
- `packages/api/src/learn/curriculum-outline.service.ts` counts programming-exercise records as exercises. `isRequired = false` alone does not make an exercise ungraded.
- Existing draft/workspace and teacher-monitoring entry points need explicit support for another material type; simply adding a canvas to the current scored exercise page is insufficient.

Pyodide's version-specific documentation lists `tkinter` and standard-library turtle among unavailable modules. Cove cannot enable desktop turtle by adding an ordinary import. Standard CPython turtle relies on Tk. [Pyodide 0.27.5 constraints](https://pyodide.org/en/0.27.5/usage/wasm-constraints.html), [Python turtle documentation](https://docs.python.org/3.12/library/turtle.html)

The proposed implementation and its explicit compatibility boundary are in the [Cove turtle design spec](../superpowers/specs/2026-10-08-turtle-graphics-design.md).
