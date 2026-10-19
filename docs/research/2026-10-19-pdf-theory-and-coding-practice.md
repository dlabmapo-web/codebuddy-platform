# PDF theory and PDF-assisted coding: reference research

Date: 2026-10-19 (Asia/Seoul)
Repository reviewed: `feat/ignore-python-input-prompts` at `f7d9d208`.
Design: [proposed specification](../superpowers/specs/2026-10-19-pdf-theory-and-coding-practice-design.md).

## Request and evidence boundaries

The supplied feedback asks to distinguish PDF-only teaching from coding while
viewing a PDF. The user requested research and a specification, and explicitly
chose to preserve existing exercise submission/grading behavior. A new Run-only
mode is outside this request. The branch name must remain unchanged.

### User-provided screenshots

- `photo_2026-10-19_15-33-39.jpg`: `[이론] 출력문`, full-width document,
  PDF page `1 / 3`, zoom `131%`, and outer material position `1 / 23`.
- `photo_2026-10-19_15-33-38.jpg`: `[실습] 출력문`, document selector labelled
  `[이론] 출력문` on the left, Python `main.py` and output area on the right,
  PDF page `1 / 3`, zoom `73%`, and outer material position `2 / 23`.
- The images establish two separate learning steps sharing reference content.
  Their pixels do not establish database structure, permissions, grade inclusion,
  or the reason the pictured Submit control is disabled.
- Source images remain in the user's Downloads directory; no course document
  bytes or personal account details are copied into this repository.

## Live Elice inspection

Read-only inspection used the signed-in browser on 2026-10-19. No materials were
created, edited, saved, submitted, or uploaded.

1. The [supplied teaching-library address](https://dlab.elice.io/my-courses/library/teach?tab=all)
   exposes the course `[마포] DM-PY-M2(파이썬 트랙)` in the current account.
2. Its [lecture list](https://dlab.elice.io/courses/765886/lectures/all) leads to
   [CH01](https://dlab.elice.io/courses/765886/lectures/6637911#list), containing
   theory, practice, and quiz items. The exact `[1주차]` lecture from the supplied
   images was not present in this inspected course; the images remain the
   evidence for that specific PDF-plus-editor example.
3. The live [print exercise](https://dlab.elice.io/courses/765886/lectures/6637911/lecturepages/54487942)
   displays a statement, `main.py`, Run, Submit, terminal, and independent material
   navigation `3 / 28`. This particular exercise uses a text statement.
4. Its [editor](https://dlab.elice.io/courses/765886/lectures/6637911/lecturepages/54487942/edit)
   displays **Link to supplementary Material** above the statement editor,
   currently **No supplementary Material**. Opening the selector showed no
   visible selectable entries. No selection or save was made. This verifies the
   authoring control, not successful linking or the selector's full scope.
5. The live [standalone document](https://dlab.elice.io/courses/765886/lectures/6637931/lecturepages/54488257)
   displays a full document reader, zoom input, PDF page `1 / 3`, outer material
   position `1 / 1`, and fullscreen. Student-role access and download results
   were not tested.

## Official Elice documentation

- [수업자료 추가](https://help.elice.io/help/docs/elicelxp/for-admin/lecture/material)
  documents distinct PDF and programming material formats, supplementary
  placement, and a separate grade-exclusion setting. It says supplementary-only
  materials are referenced from other learning materials rather than opened as
  independent learning steps.
- [보조자료 연결](https://help.elice.io/help/docs/elicelxp/for-admin/lecture/supplementary)
  documents linking an eligible supplementary material through the editor's
  dropdown so learners can reference PDFs or videos during programming.

The recommendation to reuse a PDF material from an exercise is an inference
from these docs, the observed selector, and the screenshots. Elice's backend
schema, copying semantics, and access rules were not inspected. In particular,
the first release need not reproduce Elice's restrictions on supplementary-only
standalone access: Cove already supports resource reading through document URLs.

## Cove source findings

| Source | Verified behavior and design consequence |
| --- | --- |
| `packages/api/prisma/schema.prisma` | `Material` has distinct `PDF_DOCUMENT` and `PROGRAMMING_EXERCISE` types. `PdfDocument` owns placement and an immutable-asset reference. No exercise-to-PDF relation exists. |
| `packages/shared/src/content/pdf.ts` | `MAIN`, `SUPPLEMENTARY`, `BOTH` already exist; placement controls main navigation versus resource listing. It does not describe a workspace layout. |
| `packages/web/src/components/pdf/pdf-lesson.tsx` | Full PDF lesson, separate material controls, drawer and resources already exist. |
| `packages/web/src/components/pdf/pdf-canvas.tsx` and `pdf-reader.tsx` | Reusable client reader supports pages, zoom, fit, download, URL renewal, resize observation and fullscreen. It currently fetches a full document-lesson response. |
| `packages/web/src/components/pdf/pdf-author-dialog.tsx` | Upload, replacement, placement and staff preview already exist. |
| `packages/web/src/components/pdf/pdf-resource-link.tsx` | Resource Open routes to a document page; it does not embed a PDF alongside the code editor. |
| Exercise `workspace.tsx` and `use-exercise-navigation.ts` | Existing statement/editor split, mobile tabs, draft saving, runner lifetime, guarded in-place exercise transitions, monitoring and historical attempts must survive document-pane changes. |
| `packages/api/src/learn/learn.service.ts` and shared `learn.ts` | Workspace DTO deliberately separates student content from authoring answers and hidden tests. Add reference metadata here rather than returning an authoring object. |
| `packages/api/src/documents/pdf-document.service.ts` | Current student PDF read checks assignment scope and full ancestor visibility; preview has a separate review permission. Signed delivery and cleanup already exist. |
| `packages/api/src/content/library/academy-library.service.ts` | Current adoption generates destination material IDs and copies PDF records; a new relation needs a complete source-to-destination ID map. |
| Shared monitoring contracts and web awareness surfaces | Existing statement pointers refer to text layout; they cannot safely be applied to PDF canvas coordinates. |

Branch caveat: `ecf17c22` contains the newer shared `course-tree-copy.ts` and
academy-to-library import implementation on the Studio line, but is not an
ancestor of this branch. Its relevant source was read with `git show`; the
working branch was not merged or changed. The implementation must account for
that code when integrating with the current Studio release.

Relevant installed Next.js guides were read under
`packages/web/node_modules/next/dist/docs/`: Server and Client Components and
the `use client` directive. This task changes documentation only.

## Design work record

- [x] Inspect request, screenshots, branch, existing PDF design and current code.
- [x] Inspect live Elice PDF reader, exercise and supplementary selector.
- [x] Verify supplementary linking against official Elice documentation.
- [x] Clarify whether a new Run-only mode is required: user chose existing behavior.
- [x] Compare approaches and write the explicitly requested draft specification.
- [x] Review scope, default behavior, copying, visibility and lifecycle consistency.
- [x] User approval of the written design before implementation.

No visual companion is needed for this text specification: the user already
provided the two layout references. No application or production verification
is claimed by these source and reference inspections.

Implementation was subsequently requested and completed. See the [local verification report](2026-10-19-pdf-practice-local-verification.md) for runtime evidence.
