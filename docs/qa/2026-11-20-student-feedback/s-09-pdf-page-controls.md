# S-09 — PDF page controls at the bottom

> **Implemented on `qa-feedback` (2026-11-20).** Checked on localhost at desktop width, 390px, Korean dark and fullscreen. Elice compared: it keeps every reader control in one bar under the page (see the README); Cove keeps zoom, fit, download and fullscreen on top.

Registered 2026-11-05 · Sunny · P1

## Request

The PDF reader's page controls are in the toolbar above the document. QA wants page turning at the bottom of the screen, where the eye ends up after reading a page (arrow in the screenshot from the top bar to the bottom edge).

## What is there now

One toolbar above the page, [pdf-canvas.tsx:159-212](../../../packages/web/src/components/pdf/pdf-canvas.tsx#L159-L212):

| Group | Controls |
| --- | --- |
| Page | ‹ · page input / total · › |
| Zoom | − · 220 % · + |
| Fit | 너비 맞춤 · 페이지 맞춤 |
| Right | download · fullscreen |

`PdfCanvas` (through `PdfReader`) is used by five screens, so a change applies to all of them:

- student PDF lesson, [pdf-lesson.tsx](../../../packages/web/src/components/pdf/pdf-lesson.tsx)
- reference pane of a "PDF + coding" problem, [exercise-reference-pane.tsx](../../../packages/web/src/components/pdf/exercise-reference-pane.tsx)
- author preview, [pdf-author-dialog.tsx](../../../packages/web/src/components/pdf/pdf-author-dialog.tsx)
- teacher watching a student, [observed-material-view.tsx](../../../packages/web/src/components/monitoring/observed-material-view.tsx)
- submission history preview, [material-preview.tsx](../../../packages/web/src/components/student-history/material-preview.tsx)

Below the PDF lesson there is already the lesson bar "‹ 이전 · 1/38 · 다음 ›" (`LessonFooter`), which moves between **lessons**, not pages.

## Plan

1. Split the toolbar. The top keeps zoom, fit, download and fullscreen. A new bottom bar inside the reader, under the scrolling viewport, holds ‹ · page / total · ›, centred.
2. Keep the two bottom bars distinguishable: the page bar sits inside the reader's frame (reader background, icon arrows, page input), the lesson bar stays below it with its labelled 이전/다음 buttons and brand colour. Check that a student cannot mistake "next page" for "next lesson" at 390px.
3. Keep it in one component, so all five screens change together, and fullscreen (which wraps the reader root) still shows the page bar.
4. Keep the invalid-page message next to the page input (move it to the bottom bar).
5. Before building, open a PDF lesson on Elice (`dlab.elice.io`, read only) and match where it puts page arrows and the page number. Record what was seen here.

## Tests

- `pdf-canvas.spec.tsx`: previous/next and the page input still work from the bottom bar (the spec finds the buttons by label, not position).
- localhost: student PDF lesson, PDF + coding pane, author preview; desktop, 390px and fullscreen; ko and en; light and dark. The page bar must not hide the last lines of a page when the viewport is short.

## Scope

Web only, one component and its spec.
