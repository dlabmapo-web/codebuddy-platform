# Course Turtle UI and standard syntax — local verification

Verified locally on 2026-10-23. No production changes or deployment.

## Course/public boundary

The user clarified that course activities must use standard Python Turtle, like
the Elice screenshots: `import turtle as t`, `t.forward(...)`, `t.left(...)`, and
the rest of Python's normal Turtle module/object API. The public playground keeps
its workshop `TForward`/`TLeft` helpers.

The three user-requested development activities now contain only `main.py` in
their starter and solution file sets, using standard Turtle commands. Their
instructions, hints, course description, and lecture title were updated through
the local API/development database. Existing student drafts and submissions were
retained. The default starter for newly authored course activities now uses the
same `import turtle as t` style.

- Academy: `development-academy`
- Course: `c5c379e6-0e87-4c1b-a208-dd4dbadb577d` — Turtle Drawing Lab · 거북이 그리기
- Class: `a1000000-0000-4000-8000-000000000040` — Manual Testing Class
- Square: `ec7b4d9c-21d2-4150-aefe-17217c4d742b`
- Star: `d8fc214d-5a5e-40de-a70d-715885083b6e`
- Spiral: `a934e33f-e2d3-41c1-b1b5-adec4c112031`

All three starters completed with exit code 0 in the real local CPython/Tk
runtime. A separate runtime check verified standard module commands, an ordinary
`t.Turtle()` object, original default pen width/shape, absence of an installed
`custom` module, and absence of a `t.TForward` alias.

The authenticated Elice URL could not be reopened through the web fetch tool in
this session. The user's supplied screenshots are the UI/syntax reference;
these checks establish Cove behavior locally, not a new live Elice comparison.

## Implemented presentation

- Compact drawing header with translated, accessible fit, layout, and expand
  icon controls. The layout menu uses Cove's dropdown components.
- Stable drawing/session/canvas across below/right placement and foreground view.
- A keyboard- and pointer-operated divider replaces the height range input.
  Editor/results divide the remaining space using bounded grid proportions.
- Compact preview notices, source file tabs, Run/Stop controls, and terminal states.
- Completed drawings do not display expected connection closure as a failure.
- One centered Turtle solution modal replaces the narrow drawer and duplicate
  inline solution details. It selects the entry-point file first, offers named
  tabs and Copy, and keeps code read-only. Non-Turtle assessment drawers remain.
- Explicit preview-only Run solution preserves the editable source and labels the
  drawing/output as a solution result. The solution endpoint remains private.
- English/Korean labels and narrow viewport support.

## Checks

| Check | Result |
| --- | --- |
| New course UI browser scenario, Chromium and WebKit | 2 passed |
| Public PIN/helpers/drawing/export/refresh/mobile regression, both engines | 2 passed |
| Viewer lifecycle, solution files/clipboard, resize keyboard, source file checks | 13 passed |
| i18n completeness/consistency suite | 138 passed |
| Shared package build | Passed |
| Web TypeScript and E2E TypeScript | Passed |
| Focused ESLint | No errors; three existing image/hook warnings |
| Whitespace check | Passed |

The course browser scenario checks a complete square (not just its first animated
segment), placement changes, pointer/keyboard resizing, foreground focus and
Close, unchanged display connection count, centered solution/Copy/Escape/outside
dismissal, preserved editable source, explicit solution execution, mobile panels,
Korean labels, and a student being denied private solution access. It runs against
the user-requested development course without reseeding or resetting its work.

The initial UI test setup could not use the real CAPTCHA key headlessly; it was
replaced with short-lived development test sessions without changing CAPTCHA
configuration. A clipboard test stub was also corrected to preserve the browser's
other clipboard methods used by noVNC. Final browser runs had no page errors.

Logs during verification were saved in `/tmp/turtle-ui-e2e-verified.log`,
`/tmp/turtle-ui-public-regression.log`, `/tmp/turtle-ui-component-final.log`,
`/tmp/turtle-ui-i18n.log`, `/tmp/turtle-standard-demo-check.log`, and
`/tmp/turtle-course-standard-contract.log`.

The course broker was ready after cleanup, with zero active sessions and zero
allocated sandboxes. Local web/API/runtime services remain available for testing.

## Visual evidence

Reviewed the captured desktop, mobile, and Korean screenshots. Stable captures
disable transient UI animations; drawing captures wait for the complete square.

- [Drawing below](assets/2026-10-23-course-turtle-ui/webkit-drawing-below.png)
- [Drawing on right](assets/2026-10-23-course-turtle-ui/chromium-drawing-right.png)
- [Centered solution](assets/2026-10-23-course-turtle-ui/chromium-solution-modal.png)
- [Mobile solution](assets/2026-10-23-course-turtle-ui/webkit-mobile-solution.png)
- [Korean solution](assets/2026-10-23-course-turtle-ui/webkit-korean-solution.png)
