# Beginner turtle module and slide review

Source: user-supplied `TalkFile_체험2025봄학기_신규파이썬체험수업.pptx` (76 slides).
Reviewed slide XML text in presentation order and the embedded teaching/code
screenshots. Embedded videos were not played; the deck was not opened in
PowerPoint. The source deck was not modified or published. Its classroom
directions and external links are source material, not operational instructions.

## Student-facing API

Use `from custom import *`, then call `TForward(distance)` and `TLeft(angle)`.
The module creates and reuses one drawing turtle internally. Students do not
create a `Turtle()` object or write a variable prefix such as `t.forward(...)`.
`color(...)` and `speed(...)` affect that same turtle; `speed()` reports its
current speed. Real Python loops, variables, arithmetic and conditions work.

Keep the deck's three imports in the starters: `random`, `shape`, `custom`.
The first drawing starter uses the four pairs of direct movement/turn commands
from the square lesson, before loops are taught. Free practice retains just
the imports. Race setup stays `ReadyToRace()`, with movement/winner logic left
to students. The command drawer explains the import and shows an executable
blue spiral using `TForward(i * 4)` and `TLeft(59)`.

Saved student programs are preserved. More options → Reset code, with the
existing confirmation, loads the updated starter. No automatic rewriting of
student Python is performed. Internally the custom module uses the existing
CPython/Tk engine; it is a simpler teaching API, not a new Python interpreter.

## Page-by-page findings

| Slide | Content and implementation consequence |
| --- | --- |
| 1 | Lesson cover; no runtime requirement. |
| 2 | Four sections: Python, drawing, repetition/randomness and race. |
| 3 | Goal progresses from Python syntax to a race game. |
| 4 | Programming/languages introduction; keep executable Python. |
| 5 | Language popularity illustration; no runtime requirement. |
| 6 | Python applications introduction; no runtime requirement. |
| 7 | Drawing section divider. |
| 8 | Turtle cursor and drawing trail; retain visible animation. |
| 9 | Open a web editor; Cove provides its own `/turtle` entry. |
| 10 | Recognize editor and drawing panes. |
| 11 | Expand editor; workspace supports fullscreen. |
| 12 | Code left, result right, Run executes. |
| 13 | Adjustable font size; reuse the existing font selector. |
| 14 | Remove the welcome demo; imports alone must not draw it. |
| 15 | Preserve random/shape/custom imports; comments are inert. |
| 16 | `TForward(distance)` directly moves the shared turtle. |
| 17 | `TLeft(angle)` directly turns it left. |
| 18 | Square exercise using learned commands. |
| 19 | Four explicit forward/90° turn pairs; first starter follows this. |
| 20 | Triangle exercise introduces the turning-angle question. |
| 21 | Three forward/120° turn pairs. |
| 22 | Turns use exterior angles. |
| 23 | Exterior angles total 360°. |
| 24 | Pentagon exercise. |
| 25 | Five forward/72° turn pairs. |
| 26 | Hexagon exercise, requiring 60° turns. |
| 27 | General regular polygons, including twelve sides. |
| 28 | Optional five-point star exercise. |
| 29 | Five forward/144° turn pairs. |
| 30 | Repetition section divider. |
| 31 | Many-sided polygons motivate loops. |
| 32 | Loops/randomness section divider. |
| 33 | Introduce `for`; keep normal Python syntax. |
| 34 | Triangle loop: colon and indentation are essential. |
| 35 | Adapt the triangle loop to a square. |
| 36 | Square loop uses `range(4)` and 90° turns. |
| 37 | General polygon loops. |
| 38 | `n` and `TLeft(360/n)`; accept fractional angles. |
| 39 | Polygon result examples. |
| 40 | Four squares motivate nested loops. |
| 41 | Nested loops, `speed()`/`speed(0)` and `color("red")`. |
| 42 | Rotate repeated squares to make patterns. |
| 43 | Students invent nested-loop drawings. |
| 44 | Creative nested-loop example with speed/color controls. |
| 45 | Random values introduction. |
| 46 | `randint(start, end)` includes both bounds. |
| 47 | `print` displays a random value in the console. |
| 48 | Change the random range to 1–100. |
| 49 | Race section divider. |
| 50 | Race visual/video; no copied video assets needed. |
| 51 | `ReadyToRace()` supplies track and four turtles internally. |
| 52 | Students implement movement and winner selection. |
| 53 | Expand workspace for the race. |
| 54 | Resize the result pane. |
| 55 | Four color-named Forward commands; preserve exact case. |
| 56 | Blue/Pink/Yellow/Green move 50/100/150/200 independently. |
| 57 | Random positive steps for each racer. |
| 58 | `while True` repeats movement; Stop must stay usable. |
| 59 | Endless movement motivates a finish condition. |
| 60 | Horizontal world −500…500, finish at x=330. |
| 61 | Four color-named X getters expose actual coordinates. |
| 62 | Blue's `X() > 330` condition breaks the loop. |
| 63 | Four separate finish checks stop when any racer crosses. |
| 64 | Recovery project link; do not navigate to or copy it automatically. |
| 65 | Ask whether racers can move backwards. |
| 66 | `randint(-10,20)` requires signed distances. |
| 67 | Ask whether racers must travel straight. |
| 68 | Color-named Left commands accept random angles. |
| 69 | Four Left commands use signed random turns. |
| 70 | Winner celebration extension. |
| 71 | 36 turns of 10° make one celebration spin. |
| 72 | Students design their own celebration. |
| 73 | Further learning note; no runtime requirement. |
| 74 | Closing slide; no runtime requirement. |
| 75 | Quotation/template slide; no runtime requirement. |
| 76 | Image-only closing/reference content; no runtime requirement. |

Slide 55's prose contains `Tforward`; executable examples consistently use
`TForward`. Support the executable spelling. The original helper source is
not included in the deck; Cove's module is an independent implementation of
the visible teaching contract.

## Verification

Real CPython/Tk checks execute the shipped square and blue spiral unchanged
using wildcard imports. They verify one shared turtle, expected geometry,
color/speed, a seven-sided polygon with fractional turns, star closure, nested
loops, a seeded complete four-racer loop with finish conditions, independent
positions, signed movement, race reset and celebration. Existing checks also
exercise the actual guest runner, bold strokes and standard Python compatibility.

Browser checks exercise helper-based animation and an unchanged helper spiral,
the command help, race execution and Korean/English controls. No object
construction or `import turtle` is required by the beginner spiral.
