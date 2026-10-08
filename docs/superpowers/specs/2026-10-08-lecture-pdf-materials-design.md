# PDF learning materials: upload, read, and download

Date: 2026-10-08
Status: draft for user review; implementation is not authorized by this document
Branch: `feat/lecture-pdf-materials`, based on `feat/cove-studio-v2`
Reference research: [Elice inspection](../../research/2026-10-08-lecture-pdf-materials.md)

## 1. Purpose

Authors can upload a teaching PDF into a lecture. Students open it inside Cove, turn its pages, zoom or fit it to the screen, and download the original file. The experience follows the Elice document reader and the team demonstration supplied by the user, using Cove's own layout, theme, and language support.

PDF-page navigation and learning-material navigation are separate. An 18-page PDF can be material 1 of 8 in a lecture: the PDF toolbar shows `1 / 18`, and the lesson navigation shows `1 / 8`. Changing PDF pages stays in the same material; Next material opens the next PDF or exercise.

## 2. Evidence and proposed defaults

The live Elice example is [AI 수업 사전준비](https://dlab.elice.io/courses/765886/lectures/6637931/lecturepages/54488257). Its rendered DOM contains React-PDF document, page, canvas, and text-layer elements. It has an integrated toolbar rather than a browser-native PDF embed. A three-page document loaded successfully; zoom, page entry, fit, download, and outer lesson/fullscreen controls were observed.

The supplied demonstration image shows 150% zoom, PDF page `1 / 18`, and learning-material position `1 / 8`. The large play symbol is the recording preview, not part of the PDF reader.

The Elice upload form offers a title, a file drop zone, a displayed 95 MB limit, and main/supplementary/both placement. Actual upload validation and downloading as a student were not tested. These limits and controls are reference observations, not evidence of Elice's backend implementation.

The following Cove choices are proposed defaults for this draft: PDF-only files, 95 MB maximum, private Supabase Storage, uploads by existing curriculum authors, download enabled for every accessible PDF, and no PDF grading or completion points. They require review along with the rest of this spec.

## 3. Scope

### Included

- Add PDF learning materials to existing lectures alongside exercises.
- Upload one PDF per material using file selection or drag-and-drop.
- Main, supplementary, and main-and-supplementary placements.
- Edit a title, replace a PDF, change placement, show/hide, reorder, move within a course, and remove a PDF material.
- Preview the same reader while authoring.
- Integrated student reader with zoom, fit, page navigation, fullscreen, and downloading.
- Include PDFs in content-library adoption and preserve them during supported course updates.
- Preserve current course/class access controls, ancestor visibility, exercise grading, and exercise progress semantics.

### Excluded

PPT/PPTX conversion, video uploading, annotations, document editing, OCR, full-document search, printing controls, PDF quizzes, reading-progress tracking, PDF completion points, bulk uploads, and importing PDF bytes through Excel. A browser's ordinary capabilities may still allow printing or saving downloaded files.

## 4. Approach

| Approach | Trade-off |
|---|---|
| Integrated reader and ordered PDF materials — selected | Matches the observed Elice interaction; requires mixed-material navigation and a PDF rendering dependency. |
| Browser-native PDF embed | Smaller viewer implementation, but controls vary across browsers and devices and cannot reproduce the selected interface consistently. |
| Downloadable lecture attachments only | Simple supplementary distribution, but does not provide the ordered PDF lesson experience shown in the demonstration. |

Use React-PDF for rendering with Cove-owned controls. Its official documentation covers client-side Next.js integration and worker setup; version-specific details must be checked during implementation. Bundle the matching worker with the app, rather than depending on a runtime third-party CDN. [React-PDF documentation](https://github.com/wojtekmaj/react-pdf)

## 5. Authoring experience

### 5.1 Add a document

The lecture builder offers **Add PDF** alongside the existing add-exercise action. The form contains:

- Required title, trimmed, between 1 and 128 characters; selecting a file initially suggests its basename, and the author can change it.
- Placement: **Main material** (default), **Supplementary material**, or **Main and supplementary**.
- Required file drop zone and **Choose PDF** button, with `PDF only · Maximum 95 MB` displayed before selection.
- Selected filename and size, a remove-selection control, upload progress, Save, and Cancel.

Exactly one file is accepted. The maximum is 95,000,000 bytes, inclusive, consistently enforced by the browser, API, and bucket configuration. Empty files and unsupported formats receive a specific message. Filename and MIME declarations alone do not establish that a file is a valid PDF.

Save stays disabled until the title and file are present and valid. Uploading and validation are explicit pending states; the author cannot submit twice. Cancel before saving creates no visible material. If an in-flight request completes after cancellation, its unattached asset is cleaned up.

A newly saved material is hidden by default, following existing content visibility behavior. The author can preview it before making it visible. The builder warns when a visible material is still hidden by its course, chapter, or lecture.

### 5.2 Edit and replace

The row shows a document icon, title, placement, visibility, original filename, and size. Its menu supports Preview, Edit, Replace PDF, Show/Hide, Move to, and Remove.

Replacement validates and stores a new immutable file before switching the material to it. Failure preserves the previous file. A replacement preserves the material id, title unless explicitly changed, placement, position, and visibility. Authors are told that students will see the replacement on their next load; an already loaded reader may continue displaying the old version.

Concurrent edits use the existing content revision/concurrency conventions and refuse stale writes rather than silently overwriting another author's replacement. Successful content edits bump the course revision and write an audit entry containing actor and material identifiers, without file bytes or signed links.

## 6. Placement and curriculum behavior

All PDF materials belong to a lecture and share its existing ordered material positions. Placement controls presentation:

| Placement | Ordered student outline and Previous/Next | Lecture resources list |
|---|---|---|
| Main | Included | Omitted |
| Supplementary | Omitted | Included |
| Main and supplementary | Included | Included, pointing to the same material |

The lecture page and its material drawer expose **Resources** for supplementary PDFs. The list displays title, PDF badge, filename, and size, with Open and Download actions. Viewing a supplementary PDF keeps a clear return-to-lecture action; it does not become an extra step in main-material navigation.

Reordering and moving work for exercises and PDFs together, with exact sibling-id validation, existing course locking, and position compaction. Visible student numbering is contiguous after filtering supplementary-only or hidden materials. A move under a hidden parent follows the existing effective-visibility rule.

PDF-only lectures and their chapters appear in the student outline when they contain an accessible main PDF. Lectures containing only accessible supplementary PDFs remain reachable as resource-bearing lectures, with a Resources entry and no fictional exercise count. Course readiness must recognize accessible PDFs/resources as teachable content.

Exercise counts, scores, progress percentages, leaderboards, and completion-point calculations continue to count eligible exercises only. Opening, paging through, or downloading a PDF creates no submission, solve session, or exercise-completion award. PDF-only content shows available materials/resources without `0 / 0 exercises` or an automatically earned completion badge.

Previous/Next uses the existing course learning order and dispatches by material type. Exercise-to-PDF and PDF-to-exercise transitions work. Supplementary-only PDFs are skipped. The PDF reader's lesson count is the number of accessible main materials in its current lecture; chapter/lecture transitions are labelled clearly.

## 7. Reader experience

The reader opens on a stable Cove material URL using a canonical route helper. Existing exercise URLs remain valid. The page includes course/lecture breadcrumbs, document title, the material drawer, and separate reader and lesson controls.

### 7.1 PDF toolbar

- Previous/Next page, disabled at the first/last page.
- Editable page number and total, such as `1 / 18`. Invalid input reverts to the current valid page with an accessible error; navigation never requests page zero or a page beyond the document.
- Zoom out/in and an editable percentage, from 25% through 300%, using 25-percentage-point button steps clamped at the limits. A student can select 150% as in the demonstration.
- **Fit width** and **Fit page**. Fit width is the initial mode; fit modes recalculate on container resize. Manual zoom leaves fit mode.
- **Download PDF**, available to every reader authorized to access this material.
- Fullscreen expands the reader; if the browser does not support fullscreen, expanded in-page mode is available.

Render the current page and its text layer for text selection. Release the previous canvas and cancel stale rendering work on page changes; do not render hundreds of full-resolution pages at once. Loading must not display `1 / 0` as if it were a valid document.

### 7.2 Lesson navigation

Place Previous material, `1 / 8`, and Next material outside the PDF toolbar. Names and accessible labels distinguish “Next PDF page” from “Next material.” These controls never share one counter or one ambiguous arrow pair.

On leaving a document, destroy its rendering work and release memory. A fresh visit starts at page 1 in fit-width mode; persistent reading history is outside this release.

### 7.3 Accessibility and mobile

Buttons have translated labels/tooltips, visible focus, and keyboard access. Page and zoom inputs have explicit labels. The selectable text layer respects the document's content; scanned pages remain images without invented text.

At narrow widths the toolbars wrap or collapse labelled secondary controls without hiding download or page navigation. Manual zoom allows horizontal panning within the reader. Fit width avoids page-wide overflow. Use Cove theme tokens; the PDF page keeps its original document colors.

## 8. Data, storage, and access

Extend `MaterialType` with `PDF_DOCUMENT`. Keep the base Material identity, title, position, and visibility. Add a one-to-one document record carrying placement and the current asset reference. PDF documents are not required exercises; they have no programming-exercise row or grading profile.

A document asset records a generated id, private bucket/object key, original filename, byte size, SHA-256 checksum, validated PDF page count, uploader, created time, and lifecycle state. Signed URLs are generated per request and never persisted as file identity. Store the binary in the dedicated private Supabase bucket `course-documents`, not Git, a database byte column, or the app container filesystem.

Supabase supports time-limited signed delivery for private buckets. Cove checks its own material permissions before issuing a link; possession of a still-valid link permits access until it expires. [Supabase private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals)

### 8.1 Upload and lifecycle

An authenticated, dedicated API upload endpoint verifies the author and lecture first. It accepts binary/multipart data with a bounded 95 MB file limit, independent of JSON content mutations. Stream to a temporary file rather than retaining multiple copies in memory. Allow at most two concurrent PDF validations per API instance and rate-limit upload attempts to ten per author per minute.

Validate PDF structure and page count in an isolated parser with a 30-second timeout and 256 MB memory ceiling; reject malformed, password-protected, empty-page documents and files that exceed those resource limits. Do not execute document JavaScript or embedded actions. No PDF bytes are sent to the code-grading sandbox.

Store under a generated immutable object key with `application/pdf`. Mark the asset ready only after validation/storage succeeds; return an asset id bound to its uploader and authorized destination. Creating the material rechecks authorization and atomically attaches the ready asset. A failed DB attachment leaves a recoverable orphan, not a broken visible row.

Expired pending assets and unreferenced replaced/deleted assets are cleaned up after 24 hours. Cleanup rechecks references immediately before deleting storage objects, uses an atomic deletion claim that prevents new references, and retries failures. Uncommitted uploads expire after one hour and cannot be attached after that point.

### 8.2 Authorization and delivery

PDF authoring uses the existing `curriculum.manage` permission, scoped to the owning course/academy. This does not grant teacher-only accounts new authoring rights. Staff previews follow their existing content-read authorization.

Student view and download requests require active academy membership, existing class/course assignment reachability, and visibility of the material and every ancestor. Apply the same checks to supplementary PDFs, direct URLs, and requests for fresh links. Keep exercise run/submission endpoints restricted to exercise materials.

The API returns a five-minute inline URL to the current asset for reading. Download requests recheck access and return a five-minute attachment URL with a sanitized original filename. The browser receives no service-role key. Responses containing signed links are private and non-cacheable.

When a URL expires during loading, reauthorize and renew once, preserving page and zoom. If access was revoked, show an unavailable state and stop requesting document data. Revocation prevents new URLs immediately; already issued URLs can remain usable for their five-minute lifetime, and bytes already loaded or downloaded cannot be recalled.

## 9. Content library and existing integrations

Adoption copies document metadata, placement, and material identity into the academy's course tree. A copied document references the same immutable asset; access is authorized through the destination material, not through the original uploader or a client-supplied object key.

Replacing or removing a library source document does not mutate the asset held by an existing adopted copy. Copies can replace their own PDFs independently. Asset cleanup retains an object while any source or copied document references it. Supported library refresh/replacement paths carry document records rather than silently dropping them, and preserve the current customization/conflict behavior.

Excel import/export remains exercise-focused. Existing document records must survive an exercise import; an import that would implicitly discard or misplace them is refused with an explanatory preview. Validate course revision at commit as today. PDF binary transfer and PDF rows are not added to the workbook format in this release.

Audit and content-summary serializers support both material types without asserting that every material has a programming exercise. Monitoring and help/grading flows remain exercise-only; merely opening a PDF does not start code monitoring.

## 10. Errors and operational rollout

Provide translated, actionable states for unsupported format, too-large file, invalid/password-protected PDF, validation timeout, upload/storage failure, stale edit, unavailable material, failed page rendering, expired access, and failed download. Retrying a transient read error preserves page/zoom; upload retries do not duplicate visible materials.

Use an additive schema migration. Existing exercises keep their values and behavior. Create/configure the private bucket separately in development and production; check its 95 MB allowance against the project-wide storage limit. The deployment setup must accommodate the dedicated upload endpoint's request size and timeout, without globally removing request limits.

Verify that the deployed app serves its matching PDF worker, supports storage CORS and range requests where used, and does not require a third-party runtime worker host. Document PDF object backup and restoration separately: a database backup alone is not evidence that uploaded binary objects are recoverable. Storage objects remain outside application-container rollback.

Use the development Supabase project for validation. Run the deployment guide's CI checks, including production builds after stopping dev servers. No release tag, merge, push, production write, or deployment is authorized by drafting this spec.

## 11. Verification

1. Upload a valid multi-page PDF through picker and drag-and-drop; save, preview, publish, and verify it from a student account.
2. Reject invalid/empty/password-protected PDFs, spoofed file declarations, oversize files, and resource-limit failures. Verify rejection at the API when browser validation is bypassed.
3. Show the example behavior: PDF page `1 / 18`, 150% zoom, and material `1 / 8` independently. Exercise-to-PDF and PDF-to-exercise transitions work without losing existing saved exercise drafts.
4. Verify manual page entry, boundaries, fit modes, resizing, fullscreen fallback, mobile panning, keyboard controls, text selection, translations, and light/dark themes.
5. Download from a student account; compare checksum to the uploaded file and verify the sanitized original filename.
6. Verify all three placements, PDF-only lectures, supplementary-only lectures, hidden ancestors, course readiness, ordering/moves, and unchanged exercise progress/point calculations.
7. Deny cross-academy, unassigned, suspended/inactive, hidden, and direct-URL access consistently for view and download. Renew an expired link without resetting the page; refuse renewal after access revocation.
8. Verify failed/cancelled uploads, failed replacement, concurrent edits, orphan cleanup, storage deletion retries, and removal of a material referenced by multiple library copies.
9. Adopt a mixed PDF/exercise course and verify its assets remain accessible after source replacement/removal. Exercise import preserves PDFs or refuses the conflicting operation explicitly.
10. Run meaningful API authorization/lifecycle and mixed-outline tests, a browser flow for upload → publish → student read/download, and the repository's full required CI checks.

## 12. Completion criteria

- Authors can manage PDF materials through the existing content builder without database/storage-console intervention.
- Students can read and download accessible PDFs inside Cove using the selected integrated interface.
- PDF-page and lesson navigation remain visibly and functionally separate.
- Files survive application deployments, course adoption, and source-file replacement according to this spec.
- Access controls, asset lifecycle, translations, accessibility, and relevant integration behavior pass the verification above.
- Existing exercise authoring, imports, submissions, grading, monitoring, progress, and points retain their documented behavior.

Before implementation, the user reviews this concrete draft, especially the proposed defaults in §2. No implementation plan or application changes are included in this request.
