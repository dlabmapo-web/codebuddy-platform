# Distinguish PDF theory from PDF-assisted coding practice

Date: 2026-10-19 (Asia/Seoul)
Status: Approved by the user on 2026-10-19; implemented and verified locally.
Verification: [local test results](../../research/2026-10-19-pdf-practice-local-verification.md).
Branch: `feat/ignore-python-input-prompts` — keep this name.
Baseline: `f7d9d208`.
Evidence: [research notes and source map](../../research/2026-10-19-pdf-theory-and-coding-practice.md).

## 1. Product decision

**PDF 자료** opens a full-width PDF lesson. **PDF + 코딩 실습** opens a Python
exercise with its linked PDF on the left and Cove's existing editor and output
on the right. These are explicit authoring choices and recognizable student
experiences, implemented using existing material types.

한국어 요약: PDF만 읽는 이론 자료와 PDF를 참고하며 코딩하는 실습 자료를
생성 단계부터 구분한다. 동일한 PDF는 이론 자료와 여러 실습에서 재사용할
수 있다. 실습의 기존 실행·제출·채점 동작은 유지한다. PDF 페이지 이동과
학습 자료 이동은 별도로 제공한다.

Confirmed by the user: preserve existing exercise submission and grading.
Adding a new Run-only mode is excluded. Attaching a PDF must neither change
`inputPromptPolicy` nor rewrite any grading configuration, tests, scores,
submission history or completion rules.

Example matching the supplied screenshots:

1. `출력문` — PDF 자료, `BOTH`, material 1 of 23, document page 1 of 3.
2. `출력문 실습` — existing Python exercise linked to that document, material
   2 of 23, with its own document page 1 of 3 and editor.

Names need not contain `[이론]` or `[실습]`: badges and material configuration
establish behavior. Existing names remain unchanged.

## 2. Options and recommendation

| Approach | Trade-off |
| --- | --- |
| **Link an existing PDF material to a programming exercise — recommended** | Reuses PDF storage, permissions, editor, grading and history. One PDF can support theory plus multiple exercises. Requires relation validation and copy remapping. |
| New composite `PDF_PRACTICE` material type | Obvious single type, but duplicates exercise dispatch and expands grading, draft, monitoring and navigation changes for the same interaction. |
| Open PDFs in a modal or another page | Small change, but fails the simultaneous PDF-and-code experience shown in the feedback. |

Choose the first. Placement and learning experience remain separate concepts:
`MAIN`/`SUPPLEMENTARY`/`BOTH` decide where a PDF appears; the presence of a linked
PDF decides how an ordinary Python exercise initially renders.

## 3. Scope and defaults

- Reuse the existing standalone PDF lesson without changing its reading,
  download, progress or storage policies.
- Add one optional PDF reference per non-quiz `PROGRAMMING_EXERCISE`.
- Allow reuse by multiple exercises in the **same lecture**. This is a Cove
  first-release boundary, not a verified Elice restriction.
- Link only PDF materials with placement `SUPPLEMENTARY` or `BOTH` and a READY
  asset. `MAIN` must first be changed explicitly to `BOTH`; never silently alter
  a document's placement.
- Link hidden documents while drafting, but require an effectively visible PDF
  before publishing or exposing the PDF-practice experience to students.
- Keep ordinary text exercises available. No links are created automatically
  from adjacency, title prefixes or matching filenames.
- Exclude Turtle, video references, quizzes, written responses, multi-PDF
  selection, annotations, persistent reading history, OCR, PDF completion
  awards, and PDF pointer synchronization.

The same-lecture boundary keeps existing lecture resource behavior and access
scope aligned. Broader cross-lecture reuse would need explicit move, resource
discovery and permission rules in a later design.

## 4. Authoring experience

### 4.1 Entry points

The material picker offers three clearly described entries:

| Label | Description | Result |
| --- | --- | --- |
| PDF 자료 | PDF를 읽는 이론 자료 | Existing PDF author dialog and `PDF_DOCUMENT`. |
| 코딩 실습 | 문제 설명을 보며 코딩하는 실습 | Existing Python exercise editor. |
| PDF + 코딩 실습 | PDF를 보며 코딩하는 실습 | Existing exercise editor with a required PDF choice for this entry. |

Retain other existing material entries. Both academy and platform-library
editors use the same controls and current permission boundaries.

The PDF-practice entry adds a **참고 PDF** selector above the ordinary statement
fields. List eligible documents in lecture order with title, filename,
placement, page count and visibility. Show hidden eligible documents with a
warning. Offer **PDF 자료 추가** using the existing upload dialog; default that
new document to `SUPPLEMENTARY`, with an explicit option `BOTH` for a separate
theory step. Completing that dialog creates a hidden PDF material, then selects
it in the exercise form. The exercise is saved separately; cancelling its form
leaves the saved PDF available in the lecture and tells the author that it was
retained. Uploading alone never publishes either material.

A MAIN document can appear in a disabled group explaining **학습 및 보조자료로
변경한 후 연결할 수 있습니다** and linking to its PDF settings. Cancelling those
settings leaves placement and the exercise unchanged.

### 4.2 Editing and publishing

Existing Python exercises gain an optional 참고 PDF section. Adding, changing
or removing a reference preserves the exercise ID, code, tests, drafts and
history. Removal returns to the ordinary statement view. The PDF-practice
creation entry requires a reference; an existing exercise may intentionally
remove it and save as an ordinary coding exercise.

Keep text description/instructions editable. They are available as an adjacent
**문제 설명** tab; linking a PDF never discards them. Existing exercise validation
still applies; this work does not relax description or test requirements.

Curriculum rows and student outlines show distinct labels **PDF 자료**,
**PDF + 코딩 실습**, and **코딩 실습**. Derive the last two from exercise metadata;
do not introduce another persisted material type or infer from titles.

Publishing a linked exercise checks the target's effective visibility, eligible
placement and READY asset. Report the exact document requiring attention.
Publication of ancestor containers must run equivalent readiness checks so
authors cannot bypass them by showing a whole lecture or course. Staff preview
may read hidden content only through existing review authorization.

## 5. Student experience

### 5.1 PDF-only lesson

Use the existing `PdfLesson` route and reader. No editor, execution worker,
exercise draft, solve session or submission is created for a PDF-only visit.
Preserve existing resource access, including Cove's current supplementary PDF
Open behavior; this release does not adopt Elice's stricter standalone rule.

### 5.2 PDF-assisted exercise

On desktop, use the current workspace split: linked PDF left, Monaco editor
and existing output/result area right. Reuse the current adjustable divider
and bounds; initialize PDF-assisted exercises to a 45% reference pane. Keep
header, curriculum drawer, help, feedback, draft status, run controls and
historical-attempt behavior intact.

The reference pane has **참고 PDF** and **문제 설명** tabs, defaults to PDF when
linked, and labels the selected document. Reuse the current reader with page
input, previous/next page, zoom, fit width/page, download and fullscreen.
The PDF canvas owns scrolling and fit measurements; the outer statement
scroller must not squeeze it or introduce another full-page scroll area.

Changing reference tabs, PDF page, zoom, fit or fullscreen must preserve the
mounted code editor, worker, running input, terminal, cursor, undo stack,
selected result, autosave and monitoring connection. There is one exercise
identity throughout. Viewing the theory PDF inside the practice never changes
the route to the theory material or attributes code work to it.

Below the existing `md` breakpoint, show top-level **자료** and **코드** tabs.
The 자료 pane contains the PDF/statement tabs. Switching tabs preserves the
same reader state and all code state; do not remount a worker to save space.
Fit width must work at 375px. Both toolbars stay usable at browser zoom 200%.

### 5.3 Navigation and reader state

PDF page `1 / 3` and curriculum position `2 / 23` remain separate with distinct
accessible labels. PDF arrows never select another learning material.
An embedded PDF adds no extra curriculum step. BOTH PDFs remain their own
theory step; SUPPLEMENTARY PDFs remain outside main Previous/Next order.

Reuse the guarded exercise navigation lifecycle. On a committed exercise
transition, select the destination reference and start page 1 in fit-width
mode, including when adjacent exercises share a PDF. Intra-exercise tab changes
retain reader state. A fresh visit starts page 1; no new persistent history.
Cancel stale document requests/render work on transitions so an old response
cannot replace the destination PDF. A failed destination fetch retains current
code and reference state under existing navigation behavior.

PDF loading or rendering failure is local to the reference pane: show Retry
and a way to view the statement; allow the exercise's ordinary run/submit
behavior to continue. Do not substitute a different lecture PDF automatically.
Retry/URL renewal preserves page and zoom, clamping the page if a replacement
has fewer pages. All copy and controls support Korean/English and Cove themes.

## 6. Data model and contracts

Add a nullable `referencePdfMaterialId` UUID to `ProgrammingExercise`, relating
to `PdfDocument.materialId`. Add the inverse collection on `PdfDocument` and
an index on the foreign key. A PDF has many referring exercises; an exercise
has at most one PDF. Use `ON DELETE RESTRICT` for the reference: PDF removal
must detach references explicitly in a transaction rather than silently
changing many exercises through a cascade. An additive migration leaves all
existing exercises null and needs no inferred backfill.

The foreign key establishes document existence. An application validation
function shared by authoring and curriculum operations enforces same lecture,
same course/academy, allowed type, non-quiz exercise, eligible placement and
READY asset. Never accept an asset key or signed URL as the relationship.

Extend the authoring exercise schema/save mapping, detail DTO and material row
metadata with `referencePdfMaterialId`. An omitted field on an existing update
preserves its link; explicit null detaches it. Creation defaults to null.
Older clients and Excel imports must not erase a link by omission.

Extend student workspace contracts with `referencePdf`, either null or safe
metadata: material ID, title, PDF revision, filename, page count and byte size.
Include a derived boolean for the outline's PDF-practice badge. Do not include
storage keys, authoring answers, solution code or hidden test expectations.
Legacy exercises without a reference continue to use their current workspace.

Reference-only edits bump the course content revision and follow existing
course locking/stale-write conventions. They do not increment grading revision
or trigger regrading. Audit attach/change/detach with exercise/PDF IDs, excluding
signed URLs and bytes.

Validate references inside the write transaction after acquiring the owning
course lock. Link edits, document placement/deletion, moves and publication
must use that same lock before checking dependencies, then re-read the affected
records. A stale authoring snapshot must fail with a reload message. This
prevents a concurrent move or MAIN placement edit from committing an invalid
reference after another request validated it.

## 7. Read and write architecture

Introduce a focused reference service for candidate listing, validation,
authorized metadata resolution and impact checks. Keep PDF binary delivery in
the current document service and execution/grading in the current exercise
services. Batch reference metadata for outlines/copies; no lookup per row.

Expose reference changes through the existing exercise save mutation, with the
same `curriculum.manage` gate. Candidate reads require the existing authoring
read/review permission. All destination ownership is resolved server-side.

For an embedded read/download, extend the existing `/documents` read contract
with optional `exerciseMaterialId`, and pass the current exercise as context.
The server verifies the exact persisted link and authorizes both the exercise
and PDF using their existing learning scope, visibility and academy gates.
The link itself grants no additional PDF access. Staff preview uses review
authorization for both materials. A student cannot enable preview with a query
parameter. Standalone document reads keep their existing contract.

Split out an internal authorized PDF delivery result containing reader metadata
and a short-lived URL, so embedded readers need not fetch the full course
navigation tree. Keep the public standalone response compatible. Include
academy, PDF, preview status and exercise context in embedded query keys so
preview and student caches or two exercise contexts cannot be mixed.

Preserve the current 300-second signing lifetime and private/no-store response.
Renew once on expiry, rechecking both materials and the link. After revocation,
refuse fresh links and stop rendering unavailable content when revalidation
detects it. Already delivered/downloaded bytes cannot be recalled. No PDF
content or URL enters the code sandbox, judge jobs or monitoring messages.

Refactor the existing PDF renderer only as needed to accept authorized delivery
and reference context while retaining the standalone wrapper. Keep it inside
the existing client-only dynamic boundary; read installed Next.js guides again
before implementation. No new route or viewer dependency is required.

## 8. Lifecycle, visibility and copying

| Operation | Required result |
| --- | --- |
| Replace PDF file | Reference stays on the PDF material ID. Existing replacement validation and immutable assets apply. Subsequent reads show the new revision; an already loaded reader may retain the old bytes. |
| Rename PDF | Referring exercises show the new title on next metadata load. No code reset. |
| Hide PDF/ancestor | Invalidate reference reads immediately for new requests. Keep the stored link; author UI shows a readiness warning. If the exercise remains accessible, it falls back to its statement with a local unavailable message. |
| Change linked PDF to MAIN | Reject with a dependency count; author must detach/change references or keep BOTH. No silent placement coercion. |
| Delete linked PDF | Return a dependency conflict listing referring exercises. Author detaches/relinks first. Course-tree deletion detaches internal edges before deleting descendants in one transaction. |
| Move within lecture/reorder | Preserve references and existing mixed-material order. |
| Move PDF or exercise to another lecture | Reject if the move would leave a cross-lecture reference; list dependencies. Author must detach/relink first. |
| Move whole lecture/module within a course | Preserve links when both endpoints move together. Recheck destination and visibility rules through existing move gates. |
| Copy/adopt course | Allocate all destination material IDs first; insert PDF and exercise records, then remap reference edges in a second pass inside the same transaction. Never keep source material IDs in destination exercises. |
| Refresh/replace copied content, where supported | Preserve/remap references under the operation's existing conflict policy, or reject before any mutation. Never silently drop edges. |
| Excel update | Preserve references for existing exercises by omission. Refuse destructive operations that would orphan or invalidate them; PDF links/bytes are not added to the workbook format. |

Copies share immutable PDF assets under existing retention rules but use
destination PDF material IDs. Replacing a source document must not replace a
copied document's asset. When adoption publishes descendants, both endpoints
must satisfy destination readiness. Draft imports may retain hidden linked
documents; publication still requires readiness.

On this branch, adoption lives in `academy-library.service.ts`. The later
Studio implementation at `ecf17c22` centralizes copying in
`content/library/course-tree-copy.ts` and adds academy-to-library imports.
Before integrating this feature with that line, extend the shared copier and
its import validator rather than restoring the older inline copier. Test
library → academy → library → academy remapping there. This specification does
not authorize merging those unrelated commits into the current branch.

## 9. Monitoring and student work

Keep code collaboration, terminal mirroring, feedback, help requests and
exercise progress on the programming exercise ID. PDF reading never creates a
second exercise session, monitoring socket, submission or point award.

The teacher's live workspace must expose the same linked PDF through its
authorized material metadata and the same reusable reference pane, with its
own local page/zoom/tab state. It must retain the existing student code and
terminal view. Student and teacher document pages do not automatically follow
each other in this release; the UI explains that PDF page selection is local.

Existing text-statement pointer geometry cannot identify a point on a PDF.
While PDF is displayed, do not publish a `statement` pointer for that pane,
and suppress incoming statement arrows over it. Statement pointers continue
only when the actual text statement is visible. Editor/terminal pointers and
collaborative editing continue normally. Exact PDF cursor/page-following is
excluded; do not add a misleading approximate overlay.

## 10. Implementation boundaries

| Area | Primary files/modules |
| --- | --- |
| Data and shared DTOs | Prisma migration/schema; shared `content/course.ts`, `learn.ts`, `pdf.ts`; existing authoring/learning contracts. |
| Authoring and validation | `content/course.service.ts`, PDF document service, exercise draft mapping/forms and material picker; shared academy/library editors. |
| Student and staff reference reads | `learn/learn.service.ts`, document controller/service, teacher monitoring material DTOs; one reusable validation/resolution service. |
| Rendering | `components/pdf/`, programming `workspace.tsx`, exercise navigation hook, teacher `live-workspace.tsx`, curriculum navigator and material badges. |
| Lifecycle and copying | Existing moves/deletes/imports, inline adoption on this baseline; shared course-tree copy/import validation when integrated with newer Studio. |
| Copy and language | Existing content/learn/monitoring Korean and English namespaces and actionable dependency/error messages. |

Implement in order: additive contracts/migration and invariants; authoring and
authorized delivery; reusable reference pane and student/teacher integration;
copy/move/delete/import coverage; verification. This is a scope sequence, not
an approved implementation plan.

## 11. Acceptance criteria and verification

1. Create a BOTH PDF theory step and a Python exercise referencing it. Student
   sees a full PDF in the first step and PDF/editor/output in the second.
   The counters independently show document `1 / 3` and material `2 / 23` in
   a fixture matching the reference hierarchy.
2. Create a SUPPLEMENTARY PDF plus linked practice: the PDF does not add a
   main navigation step, but is readable in practice and the existing resources
   flow. No extra upload is needed to reuse it in another exercise.
3. Attach/change/detach on an existing exercise. Verify saved code, historical
   attempts, tests, grading revision, input-prompt policy, scores and completion
   results remain unchanged. Grade the same submission before/after attachment.
4. Run a program awaiting stdin while paging, resizing, using fullscreen and
   switching reference/mobile tabs. Confirm worker and editor stay mounted,
   input continues, undo/cursor/output remain, and autosave still works.
5. Navigate between linked/unlinked exercises, PDFs and back/forward with an
   unsaved draft. Verify the existing guarded transition, destination failure
   recovery and stale-response protection; reset reference state only after a
   successful material transition.
6. Test author previews, student direct URLs, wrong exercise/PDF pairing,
   cross-academy/course/lecture references, hidden ancestors, revoked membership,
   expired URL renewal and unauthorized downloads. Test API calls independently
   of disabled UI controls.
7. Verify blocked MAIN placement changes, dependency-aware deletion/moves,
   simultaneous link-versus-move/delete writes, failed file replacement, PDF
   replacement with fewer pages and no implicit unlink on Excel updates.
8. Adopt a mixed course whose exercise precedes its referenced PDF in order.
   Confirm destination IDs, shared-asset retention and independence after source
   replacement/deletion. Repeat reverse-library import round trips when the
   newer copy implementation is integrated.
9. Watch a student as a teacher: code/terminal/feedback still work, teacher can
   open the reference, page choices stay local, and no text pointer lands on a
   PDF. PDF-only reading creates no exercise tracking or points.
10. Verify 375px/mobile, desktop, keyboard access, labelled page/material
    controls, zoom 200%, failed PDF fetch/render, download retry, Korean/English
    and light/dark themes. Review before/after screenshots for both experiences.

Use targeted schema, API authorization/lifecycle, copy integration and browser
tests for these invariants. Then run repository-required typecheck, lint,
tests and production build according to current CI/deployment guidance, using
development data. Local implementation and test results are recorded in the
verification report above. Production release is separate from this work.

## 12. Review and implementation status

The user confirmed existing grading/submission behavior, then explicitly
approved implementation and local E2E testing. The design is implemented on
`feat/ignore-python-input-prompts` with one same-lecture reference per exercise,
PDF as the initial reference tab and local teacher/student page state.

The [verification report](../../research/2026-10-19-pdf-practice-local-verification.md)
records seven passing browser tests on the local standalone production build,
unit/database checks, screenshots and the separate legacy input-prompt browser
fixture's localhost-database requirement. No production deployment was performed.
