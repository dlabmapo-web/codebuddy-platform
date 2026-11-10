# Explanation-only lecture materials

Date: 2026-11-10 (Asia/Seoul)
Status: User approved the feature design; specification complete; implementation not started.
Branch: `feat/explanation-materials`
Base: local `feat/cove-studio-v2` at `689e5617f1244125695f40e00d82e53257013dc2`.
Research: [Elice evidence and Cove source findings](../../research/2026-11-10-explanation-materials.md).

## 1. Approved outcome

Add a separate **Explanation** material to a lecture for teaching a topic with formatted text and images. Authors use the same rich-text editor they know from coding-exercise descriptions. Students open a reading page, with lecture navigation and the authored content filling the main area.

The user approved a separate material type with the existing rich-text and image editor, a reading-only student view, and no coding or grading fields. This specification records that design. The current request is to create the feature branch and specification; implementation and release are separate work.

Example: an instructor adds “How loops work,” writes a heading and explanation, inserts an animated diagram, and includes a formatted code example. A student reads that page and moves to the next material. Opening the explanation does not start a coding runtime or require an answer.

## 2. Evidence and approach

Elice's official [Add Teaching Materials guide](https://elice.io/help/en/docs/elicelxp/for-admin/lecture/material) lists **Markdown text** separately from PDFs, programming exercises, videos, notebooks, and quizzes. It documents choosing a material type before entering its title and content. This supports a separate explanation material in Cove; it does not require Cove to replace its existing visual editor with Markdown source editing.

The signed-in DLAB teaching library and JavaScript course lecture list were inspected. Native browser automation lost its connection before the live authoring form or learner text page could be verified. Elice's exact live label, editor controls, and completion rules are therefore not verified. The requirements below describe Cove's approved behavior, not undocumented claims about Elice.

Three approaches were considered:

| Approach | Assessment |
| --- | --- |
| Separate Explanation material | Selected. Shares the editor and image infrastructure while keeping reading content independent of assessment validation and runtimes. |
| Explanation mode on a coding exercise | Rejected. Would require exceptions for tests, solutions, grading, coding routes, and reports; hiding fields would leave those dependencies. |
| Existing PDF material | Rejected for this need. It cannot provide direct editing of mixed text and images. |

## 3. Scope and boundaries

Include creation, editing, preview, visibility, ordering, moving, deleting, copying, a dedicated student reading page, mixed-material navigation, existing teacher observation integration, English/Korean labels, and private image handling.

The initial material is ungraded and does not award automatic completion credit. A page visit is presence, not proof of learning. Do not add an answer field, Mark complete button, submission, assessment revision, grading job, or score configuration. Explanation materials must not become impossible-to-complete assessment requirements or enter score/completion denominators that require a submission. Store them as non-assessed, non-required reading materials for this initial scope.

Do not add a new editor, arbitrary executable HTML/iframes, arbitrary file attachments, audio/video authoring, a new supplementary-resource system, automatic content generation, or conversion of existing exercises. Authors may add ordinary safe links and static code examples using the existing editor. Existing PDF, video, coding, quiz, Turtle, and written-response behavior remains intact.

## 4. Author workflow

### Choosing and editing

Add an **Explanation** card to the lecture's existing Add Material picker. Its description makes the purpose clear: explain a topic with text, images, and examples. Availability follows existing curriculum-management permissions, without requiring access to a coding runtime, programming-exercise feature, or assessment feature.

Use the established material-authoring shell and save/preview conventions. The form contains:

- Title, using the existing shared material-title validation.
- Explanation content in `RichEditor`, with formatting, headings, lists, tables, links, quotes, static code blocks, image insertion, and image resizing already supported by that editor.
- Preview and visibility controls consistent with other materials.

Do not render or submit programming language, difficulty, input/output format, constraints, starter code, solutions, test cases, grading policy, time/memory limits, AI grading/feedback controls, score settings, or answer fields. The client and server use a focused explanation contract rather than inventing placeholder values for an exercise draft.

New materials begin hidden. A successful save updates the lecture outline and opens or retains the saved material according to the existing authoring convention. Editing loads the complete saved body; never reconstruct it from an outline projection. Reopening must preserve formatting, image order, GIF animation, resizing, and alt text.

### Validation and failures

Require a nonblank title and meaningful sanitized body. Whitespace, nonbreaking spaces, empty paragraphs, and formatting-only markup do not count as content. Text-only and valid image-only explanations are allowed. Use the existing long-description ceiling of 500,000 characters for the HTML body and enforce the request-size limit at the API boundary. Asset bytes remain separate from stored HTML; persist stable `cove-asset:` references.

Validate meaning after sanitization. Reject unsupported coding/assessment fields rather than silently storing them. Retain the local draft on validation, upload, network, or save errors, and identify the affected field. A failed or pending image upload prevents saving a body that pretends that image was stored. Retrying a failed upload must not remove previously inserted images or reset the text.

Use optimistic concurrency through an explanation revision. If another author saved first, return a conflict and retain the current author's draft; do not silently overwrite the newer body. Use the existing unsaved-change warning pattern when leaving or discarding edits. Prevent duplicate submissions while saving.

## 5. Student and preview experience

Canonical learner route: `/academy/[academySlug]/learn/explanations/[materialId]`, with the existing class and authorized-preview context in the URL as needed.

The page shows the material title, course/lecture context, formatted explanation, material list, and Previous/Next controls. Use the established learning shell, theme, accessible controls, and responsive navigation. Content occupies the reading area rather than leaving empty panels where the code editor or terminal would have been. Long text scrolls naturally; images scale within the content width while retaining authored sizing where space permits. Wide tables/code examples may scroll horizontally without widening the entire page.

No code editor, terminal, runtime connection, Run/Test/Submit controls, grading summary, or student answer editor is mounted or loaded for this type. Displaying a static code block does not create a programming exercise. Read-only student content has no formatting toolbar or author-only save controls.

Author preview uses the same content renderer and layout, with existing preview identification and access rules. Preview does not create student work or completion credit. Students cannot use preview parameters to bypass visibility or enrollment checks.

Honor the full visibility chain: course, module, lecture, and material, plus academy/class assignment and active membership requirements. A hidden or unavailable explanation cannot be read through a direct URL or its image route. Revocation and navigation follow existing material access behavior. Loading, missing content, inaccessible material, and retry states must not expose a partially authorized body.

## 6. Images and rich-text rendering

Reuse `RichEditor`, lesson-image preparation, the existing private asset storage, content sanitization, and `RichTextFrame`. Extend shared image helpers where necessary instead of coupling explanations to `ManualSubmission` or `ProgrammingExercise` records.

Supported upload formats are PNG, JPEG/JPG, GIF, WebP, AVIF, BMP, and static SVG, matching the existing validator. Preserve GIF animation and SVG vector rendering; do not redraw those formats into a still image. Keep the existing 5 MiB per-upload cap. Oversized redrawable still images may use the current browser resizing/compression helper. Unsupported HEIC receives the existing instruction to export as JPG or PNG. “Images” means these validated formats, not a promise that every image codec is browser-compatible.

Provide the existing picker, paste, drop, resizing, and alt-text behavior. Inspect actual file content and MIME/extension compatibility on the server; do not rely solely on the browser's accept attribute. Preserve the static-SVG restrictions against scripts, active elements, and external content.

Use stable private asset references in sanitized HTML. Only referenced, authorized image assets may be resolved for a saved explanation. On save, batch-check that new references belong to the authorized course/academy or were legitimately copied into it; knowing an asset UUID is insufficient. Author uploads follow the current course ownership checks even before a new material has an ID. Reading another material's unreferenced image is denied.

Resolve authorized image metadata once for the page in a set-based query, then serve the content using the existing compatible private-image mechanism. File/object reads may use bounded concurrency; do not perform another SQL lookup for every image after the batch. Keep compatibility with the application's COEP/CORS requirements. Never store expiring URLs or base64 image bytes as the explanation body.

Render the existing safe rich-text subset in the script-disabled frame. Preserve headings, tables, lists, code formatting, image sizes, and safe links through the sanitizer and preview. Missing or failed image delivery shows useful alt text or a neutral unavailable state and allows recovery without losing the readable text. Do not broaden iframe script permissions or rich-text execution capabilities.

## 7. Data model and API boundaries

Add `EXPLANATION` to the Prisma and shared material-type enums and `explanation` to the picker-kind union. Add an `ExplanationMaterial` record, mapped to `explanation_materials`, with:

| Field | Purpose |
| --- | --- |
| `materialId` | UUID primary key and one-to-one foreign key to `Material`; cascade with parent deletion. |
| `body` | Sanitized HTML containing stable private image references. |
| `revision` | Positive integer, initially 1, incremented on a saved authoring change. |
| `updatedAt` | Server-managed timestamp for the saved explanation. |

The parent `Material` owns the title, lecture, position, visibility, creation timestamps, and initial non-required state. An explanation has no dummy programming/manual assessment relation. Add a forward migration; existing records need no conversion or content backfill.

Use focused shared explanation schemas and an explanation service/router or controller following current API conventions. Separate public authoring and learner DTOs from full database records. Responsibilities are:

| Operation | Contract and behavior |
| --- | --- |
| Read authoring context | Authorized course/module/lecture identity and saved material/body/revision when editing; no assessment data. |
| Create | Parent IDs, title, body, visibility; allocate position through existing course mutation locking and ordering helpers. |
| Update | Material ID, title, body, visibility, expected revision; validate ownership/type and compare revision atomically. |
| Read learner content | Authorized visible material, body, revision, and batched image delivery metadata; no author-only data. |
| Upload image | Existing private image upload path with curriculum-management and course ownership checks; no coding dependency. |
| Resolve images | Only images referenced by the authorized saved content, using one batched metadata read. |

Use existing error conventions: unavailable/mismatched parent/type is a non-leaking 404; insufficient author permission is 403; stale revision is 409; invalid title/body/asset is a field-specific validation error; storage failure retains a retryable draft. Do not expose private object keys, service credentials, raw SQL, or signed grants outside the established asset delivery contract.

Reuse existing visibility, position, move/delete, audit, and content-revision helpers. Material and explanation writes must commit atomically. A failed body/image validation or revision conflict must leave the previous saved material intact. Mutations invalidate the existing course outline and material caches/events as appropriate.

## 8. Navigation, counts, copying, and monitoring

Treat explanations as first-class main lecture materials in mixed outlines, course entry selection, sidebar links, material numbering, Previous/Next, and author preview. Preserve class and monitoring context when switching between explanation and other types. Audit type switches, enum validators, first-material predicates, and route builders; an explanation cannot be filtered out merely because it lacks a programming/manual/PDF/video relation.

Add `explanations` and `visibleExplanations` to course-content counts with backward-compatible zero defaults. Update the one-statement aggregate to count them separately from exercises and PDFs, and include visible explanations when deciding whether a published course contains accessible learning content. Preserve existing classifications for other types. A course containing only visible explanations must not show an empty-course warning. Explanations never appear in missing-tests, missing-solutions, grading-configuration, score, or assessment completion warnings.

Support reorder and same-course move through the common material behavior. Delete follows the existing material confirmation/recovery convention and parent cascade. Deleting an explanation must not delete image bytes still referenced by another material, copy, or retained record. Reuse the existing asset lifecycle policy; do not introduce a new garbage-collection subsystem for this feature.

Course/material/library copying must copy the body and remap private image references according to destination ownership rules. Batch source image metadata reads and deduplicate repeated references across the copied content. Same-academy copies and authorized cross-academy library imports must remain readable without granting the destination access to unrelated source content. Preserve reference-aware storage lifetimes; sharing immutable bytes is acceptable only through the existing safe copy mechanism. Existing import/export schemas that enumerate material types must carry explanations without stripping their body or images. Importing Elice text content is outside this feature.

Register the reading page with existing material presence and observation infrastructure. Authorized teachers can see the current explanation and read it in the existing monitoring view; preserve sidebar LIVE identity, navigation context, and existing pointer behavior. There is no code or answer state to synchronize, and observing the page must not create an exercise draft or start a grading/runtime connection. Reuse existing sockets/SSE rather than adding polling or a new monitoring protocol.

Localize the picker, type badges, editor validation, reading states, and count labels in English and Korean using existing translation namespaces/conventions. Labels must identify Explanation consistently and avoid calling it a coding problem.

## 9. Read-path performance requirements

Follow the repository's database round-trip rules for every new or changed read path:

1. Keep course outlines and lists free of explanation bodies and image bytes. Reuse `readCurricula`/`withCurriculum` for the hierarchy and the one-statement aggregate for counts. Add only the lightweight explanation metadata those responses use.
2. Resolve account, membership, academy route, and course/material access once per request. Pass the resolved access to dependent operations and reuse the existing academy access readers instead of deep Prisma includes.
3. Read the main explanation during server render using `server-read.ts` and request-scoped cached server readers. Hand the initial content and authorized image metadata to the client; do not wait until hydration to start the main data chain.
4. Start independent reads together with `Promise.all`. Only sequence operations whose inputs or authorization actually depend on a previous result.
5. Fetch referenced image metadata in one statement with a deduplicated ID set and scoped predicates. No SQL statements inside an image/material loop, including through a helper that performs a hidden lookup.
6. Preserve existing socket/SSE refresh behavior. Do not add a periodic explanation refetch interval.

The acceptance condition is a constant statement count for the same endpoint/access scenario as material or image cardinality grows. Measure full representative service read paths, including authorization and image resolution, rather than testing only a low-level helper. Record exact measured counts and any change from the baseline in implementation verification and the relevant commit message. This specification does not assert an unmeasured page count.

## 10. Verification and acceptance criteria

Use focused tests for behavior and integration boundaries, plus a local end-to-end author/student flow. Do not connect integration fixtures or performance counting to shared Supabase databases.

| Area | Required evidence |
| --- | --- |
| Authoring | Explanation appears for a curriculum author; save and reopen formatted text, a table, a link, a code example, and images. Text-only and image-only content work; empty sanitized content fails. No coding/grading fields are visible or required by the API. |
| Editing errors | Failed image upload/save retains text and existing images. Concurrent author saves produce a conflict without overwriting. New material starts hidden; authorized preview shows saved content. |
| Image formats | Valid PNG, JPEG, animated GIF, WebP, AVIF, BMP, and static SVG display through save/reopen/student view. Cover oversized still-image preparation, oversized GIF/SVG failure, unsupported HEIC, and an active SVG rejection. |
| Access | Student enrolled in the assigned visible course can read. Hidden ancestors, hidden material, wrong academy/class, revoked membership, unauthorized preview, foreign image IDs, and unreferenced image IDs are denied. |
| Learner page | Desktop/mobile/light/dark reading layout, long content and wide tables, keyboard navigation, image sizing/alt text, failure/retry states, and mixed-type Previous/Next work. No editor/terminal/runtime/submit controls or graded submission appears. |
| Curriculum | Explanation-only course is accessible and not marked empty; counts distinguish explanations from exercises; reorder/move/visibility/delete work. Existing material-type fixtures remain valid. |
| Copy/library | Course/material copy and authorized library import retain text/images with destination-safe references; deleting one copy does not break another. Batched reads cover repeated assets. |
| Monitoring | Staff open/observe an explanation and navigate in the same monitoring context; current-material LIVE identity and pointer behavior work without code/answer drafts or runtimes. |
| Performance | Prisma query-event counts on disposable Docker PostgreSQL compare 1 versus many explanations, 1 versus many distinct images, repeated image references, learner reads, author reads, outlines, and copy source reads. Counts remain independent of row cardinality. |

Use `COVE_INTEGRATION_DATABASE_URL` and the `Prisma log: [{ emit: "event", level: "query" }]` / `$on("query")` pattern from `packages/api/src/content/navigation-performance.integration.spec.ts`. Seed fixtures outside measured regions. Distinguish actual executed tests from skipped/unavailable checks and record exact SQL counts before implementation is considered verified.

## 11. Implementation boundaries and handoff

Keep the work focused across shared contracts, Prisma migration, explanation API, existing image helpers, authoring UI, reading page, and material integration points. Avoid expanding the programming-exercise draft schema or adding explanation branches to the grader. Extract a small shared image helper only where needed to remove a coding/manual dependency or a per-image SQL lookup; unrelated refactoring is outside scope.

Before writing application code, read the installed relevant Next.js guides in `packages/web/node_modules/next/dist/docs/` as required by `AGENTS.md`. Prepare an implementation plan against this specification, then implement and validate on this feature branch when requested. This documentation commit changes no database read path, performs no migration, and claims no application/test or SQL-count results.
