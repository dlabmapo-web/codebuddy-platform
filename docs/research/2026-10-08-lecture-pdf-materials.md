# Lecture PDF materials — reference research

Date: 2026-10-08
Branch: `feat/lecture-pdf-materials`
Status: authoring and an existing PDF viewer inspected; download control observed in the logged-in staff session. This is research, not an approved implementation spec.

Draft design: [PDF learning materials: upload, read, and download](../superpowers/specs/2026-10-08-lecture-pdf-materials-design.md).

## Purpose

Learn the Elice document-material flow before designing PDF upload, reading, and download for Cove Studio v2.

## Observed Elice behavior

Reference: https://dlab.elice.io/courses/765886/lectures/all

Inspected the logged-in browser and the new-material form in lecture `[CH01] 프로그래밍과 파이썬` (lecture id `6637911`). No file was uploaded and no material was saved.

1. Open a lecture → **New Material** → **Create new**.
2. Choose **Document File(PDF/PPT)** from the material-type dialog, then **Next**.
3. The document form has a required title with a displayed 128-character allowance.
4. Choose **Use as main Material**, **Use as main & supplementary Material**, or **Use as supplementary Material**. Main is selected initially.
5. The form explains that supplementary materials do not appear in the course curriculum or affect student scores.
6. A required attachment supports a drop zone and **Select file**. The displayed upload maximum is **95 MB**.
7. **Save** is disabled while the required fields are empty. **Cancel** closes the form.

The heading advertises PDF/PPT, but its helper text specifically lists `ppt`, `pptx`, `pps`, and `ppsx`. Actual accepted formats were not tested; the spec must not infer upload validation from this inconsistent copy.

The introductory material `수업 진행 방식` (material id `54487939`) was also opened. It rendered text and an image, with a material-list drawer, previous/next navigation, and fullscreen. It was not a PDF and does not verify PDF viewer controls or download behavior.

The CMS link redirected to the course information page in this session.

### Existing PDF reader verified

Found **[CH10] 다음 수업(AI Project) 준비 → AI 수업 사전준비** through the course-wide material drawer:

https://dlab.elice.io/courses/765886/lectures/6637931/lecturepages/54488257

- The document loaded successfully and displayed **1 / 3** PDF pages.
- It uses an **integrated web PDF viewer**, rather than Chrome's built-in PDF viewer. Read-only inspection of the rendered DOM found `react-pdf__Document`, `react-pdf__Page`, `react-pdf__Page__canvas`, and `react-pdf__Page__textContent` inside Elice's `em-pdf-renderer` container. No `embed` or `object` element was present.
- Elice provides a zoom percentage input, page-number input, previous/next PDF-page controls, a fit-document control, and a download icon (`eilDownload`). Its outer lesson controls separately offer previous/next lesson and fullscreen.
- The document's drawer icon was `file-lines`, not an icon containing the word PDF. This explains why searching only PDF-labelled icons missed it initially.
- The download control is present in the current staff session. Its resulting file and availability to a student-role account were not tested; do not present those as verified.
- No document content was copied into these research notes.

The user's team demonstration image additionally shows 150% zoom, PDF page `1 / 18`, and separate lesson position `1 / 8`. Those two independent navigation levels are explicit requirements in the draft design. The screenshot's play symbol belongs to the recording preview.

## Cove integration findings

- `packages/api/prisma/schema.prisma`: `Lecture` already has ordered `Material[]`; `Material` has a title, position, required flag, and visibility. `MaterialType` currently contains only `PROGRAMMING_EXERCISE`.
- `packages/api/src/learn/curriculum-outline.service.ts`: the outline exposes `exercises` and filters out materials without a programming exercise. PDF-only lectures would need explicit support.
- `packages/api/src/learn/curriculum-visibility.ts`: direct student access combines full ancestor visibility and class assignment, but currently also requires a programming exercise. PDF access should preserve those authorization gates without broadening exercise endpoints.
- `packages/api/src/profile/profile-media.service.ts`: existing private Supabase storage and expiring delivery URLs provide a project precedent. PDF validation and lifecycle need their own service rather than using image normalization.
- The authoring tree, reordering/moves, content-library copying and updates, and progress counts must all account for another material type. PDF reading/download must not accidentally award exercise points or enter the grading queue.
- The deployment guide requires work from Studio v2, a design spec under `docs/superpowers/specs/`, development-database validation, and CI before any release. No deployment is part of this research.

## Choices to resolve during design

1. PDF as an ordered lesson material, as a lecture attachment, or both. Ordered lesson materials are the closest match to the inspected Elice creation flow.
2. Author permissions: follow existing content-management roles or add teacher uploads.
3. PDF-only initial release versus PPT conversion. PDF-only avoids an additional conversion system.
4. Viewer behavior, download availability, upload limit, replacement/deletion behavior, and completion rules.
5. Library copies: ownership and retention of PDF assets when courses are copied or updated.

## Design workflow tasks

- [x] Explore project context, deployment guidance, recent commits, and reference authoring UI.
- [x] Inspect a concrete existing PDF viewer and locate its download control.
- [ ] Verify the downloaded file and student-role availability if needed for exact parity.
- [ ] Offer optional visuals if layout comparisons are needed.
- [ ] Clarify scope one question at a time.
- [x] Compare three approaches in the draft and select the integrated reader requested by the user.
- [x] Write the draft design spec at the user's explicit request; approval of implementation remains pending.
- [x] Self-review the spec for ambiguity, contradictions, and scope.
- [ ] Obtain written-spec review before implementation planning.

The user requested the same PDF experience in Cove and a written spec. The draft distinguishes reference observations from proposed defaults. Implementation has not started.
