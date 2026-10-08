# Elice turtle graphics inspection

Date: 2026-10-08

Purpose: understand the reference before specifying turtle practice in Cove.

Method: inspect the user's logged-in Elice course through Chrome, read visible lesson/editor/environment controls, and run a temporary example. No exercise submission or authoring save was made. The temporary code was restored and the run stopped.

## Observed behavior

The [course material list](https://dlab.elice.io/courses/765886/lectures/all) contains a turtle introduction chapter, a separate mission chapter, and later turtle robot/game chapters. Tkinter and Pygame also have separate chapters; those are broader GUI capabilities than introductory turtle drawing.

The [introductory turtle chapter](https://dlab.elice.io/courses/765886/lectures/6637927#list) contains 18 materials, all labelled **Grading Excluded / Excluded from score**. Topics include coordinates, movement, rotation, triangles/squares, polygons, circles/arcs, and repeated patterns. The separate mission chapter displays a completion denominator, so the introductory chapter's exclusion must not be generalized to every Elice turtle exercise. Automatic drawing assessment was not inspected during the initial pass. The follow-up below verifies manual assessment for two coding missions and a written-response quiz.

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


## Follow-up: behavior parity requested by the user

The user clarified that Cove should match Elice's turtle behavior, rather than ship only the earlier proposed ungraded subset. The following observations supersede that scope recommendation.

### Coding mission assessment

In the [maze coding mission](https://dlab.elice.io/courses/765886/lectures/6637928/lecturepages/54488221/edit):

- Basic Info has **Don't include in score unchecked** and **Submit enabled**. Score inclusion and submission availability are independent author controls.
- The grading maker is enabled, uses absolute grading, and has no configured STDIO cases.
- The visible file `.elice/grader.sh` invokes `.elice/autograder.py`, whose displayed configuration path is `.elice/elice_exercise.json`.
- That configuration contains `grading_checks: []`. Its beginning message says, in translation, that this problem cannot be automatically graded and students should obtain manual grading from the responsible teacher.
- An additional `grader.py` contains a generic function-assessment template. It is not the grader invoked by the displayed shell entry point. Reading that file alone would have given the wrong conclusion.

In the [apple-game coding mission](https://dlab.elice.io/courses/765886/lectures/6637940/lecturepages/54488359/edit), the grading configuration also contains `grading_checks: []`. Its ending message asks the responsible teacher to grade manually. These are direct configuration observations for these materials, not proof that every Elice course uses the same grader.

**Conclusion:** the inspected turtle coding missions use submission plus manual teacher assessment; they do not have automatic drawing-comparison checks configured. Introductory materials are excluded from course score, whereas the inspected maze mission is included. Therefore “all turtle work is ungraded” does not reproduce this course.

### Companion written-response quiz

The [maze quiz](https://dlab.elice.io/courses/765886/lectures/6637928/lecturepages/54488220) has a free-text answer field and Submit, not a Python editor. Its authoring page shows **Subjective** and **Grade manually without specifying answers checked**. The answer-definition fields are disabled for published/submitted content. This is another manual-assessment activity in the turtle chapter, not an image grader or a multiple-choice question.

### Teacher review

The maze Tutoring screen shows a learner selector, submission/score summaries, a default read-only code view, an explicit edit-mode switch, Feedback, and Regrade. Its Feedback dialog has an editor, Cancel, and Submit. Existing entries distinguish not submitted from submitted entries with zero points. No student identities or contact details are retained in these notes.

Only the user's own empty workspace was inspected in the review panel. No student's code was edited, no feedback was sent, no submission/regrade was triggered, and no grade was assigned. The exact numeric-grade editing workflow, post-review completion threshold, which submission contributes to the final score, and any provisional-zero semantics remain unverified. They must not be represented as observed Elice rules.

### Full turtle behavior

The [apple-game lesson](https://dlab.elice.io/courses/765886/lectures/6637940/lecturepages/54488359) describes keyboard movement, collision detection, random relocation, a drawn score, and game termination at the screen boundary. Its displayed solution uses multiple Turtle instances, `onkey`, `listen`, `mainloop`, `write`, `window_width`, `window_height`, positions/headings, visibility, and distance queries. The solution was viewed without copying it into the editor or running it.

Its environment is **Python 3**, **1000 seconds**, **512 MB**, **VNC enabled**, **1024 × 768**. The introductory exercise used Java 8 + Python 3, 1800 seconds, and 1024 × 640. Environment dimensions and time limits are configurable per exercise, not universal constants.

A compatibility module excluding callbacks/text and returning immediately from `mainloop()` cannot reproduce those lessons. The revised spec selects standard CPython/Tk in an isolated remotely displayed GUI session, includes event-driven turtle programs, Submit/manual review, independently configurable score exclusion, and the companion written-response workflow.

### Verification boundary

The follow-up used read-only UI/configuration inspection. Elice exercises, grades, and feedback were not changed. Authoring warnings were discarded without Save; feedback was cancelled. The findings establish configured manual assessment and needed runtime capabilities. A full Elice submit → teacher grade → progress lifecycle was not performed. The revised spec explicitly separates that remaining reference verification from Cove's proposed implementation decisions.
