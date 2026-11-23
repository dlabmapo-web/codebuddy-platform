# S-08 — Remove "보충 자료" under the PDF reader

> **Implemented on `qa-feedback` (2026-11-20)**, steps 1 and 2 (`resources` removed from the API). Checked on localhost with a BOTH-placement PDF.

Registered 2026-11-05 · Sunny · P1

## Request

When a student reads a PDF, a collapsible "▾ 보충 자료" (supplementary materials) strip sits under the document with Open and Download links. QA finds it unnecessary: remove it. In the screenshot it lists the same PDF the student is already reading ("PDF · [이론] 우선순위큐").

## What is there now

- The strip: [pdf-lesson.tsx:54-56](../../../packages/web/src/components/pdf/pdf-lesson.tsx#L54-L56), rendering `data.resources` with `PdfResourceLink`.
- `resources` is built in [pdf-document.service.ts:392-403](../../../packages/api/src/documents/pdf-document.service.ts#L392-L403): READY PDFs in the same lecture whose placement is `SUPPLEMENTARY` or `BOTH`. A `BOTH` PDF is a main lesson **and** a resource, which is why the PDF being read lists itself.
- Supplementary PDFs stay reachable elsewhere:
  - the course page lists them per lecture under "보충 자료" ([module-section.tsx:227-246](../../../packages/web/src/app/(studio)/academy/[academySlug]/(framed)/learn/courses/[courseId]/_components/module-section.tsx#L227-L246)), not part of this request;
  - "PDF + coding" problems show their reference PDF in the left pane.

## Plan

1. Delete the strip from `pdf-lesson.tsx` and the `PdfResourceLink` import there.
2. Remove `resources` from `PdfReadResult` ([pdf.ts:54](../../../packages/shared/src/content/pdf.ts#L54)) and from the service, if no other reader uses it. It is built in memory from the outline already read, so this saves no statement, only payload.
3. Remove the `pdf.resources` key in `learn.json` only if the course page no longer uses it (it does today, so keep it).

## Tests

- localhost as a student: a `BOTH` PDF and a `MAIN` PDF in a lecture that also has a `SUPPLEMENTARY` PDF. No strip under the reader. The supplementary PDF still opens from the course page.
- API spec for the PDF read, if `resources` is removed.

## Scope

Web; shared type and API if step 2 is taken. No statement-count change.
