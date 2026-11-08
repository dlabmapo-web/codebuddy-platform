# Private images in programming problems and lesson statements

Date: 2026-11-06. Status: approved by the owner with broader image types
(this revision); phase 1 in implementation on `fix/grading-and-turtle`,
released together with the grading time limits and the Turtle runtime fix
(v2.0.53).

## User direction

A manager inserting an image into a programming problem's description gets
`Unexpected token 'I', "Invalid Se"... is not valid JSON` and no image. The
owner asked for the recommended fix: images stored **privately**, like quiz and
video images, visible only to people who may see the material, working on
every page that shows the statement, and later also covering imported problems
whose images come from another site.

## Current behaviour and evidence

1. **Programming problem descriptions cannot take images.** The exercise
   editor (`exercises/_components/basic-information.tsx`) renders `RichEditor`
   without `onImageUpload`, so the editor falls back to
   `fetch('/api/uploads')`. That route was a v1 leftover (public
   `problem-assets` bucket, v1 session) and was deleted in `a7c97161`
   ("adopt canonical v2 routing"). A multipart POST to a path the studio does
   not serve is treated by Next.js as a server action and answered with plain
   text `Invalid Server Actions request.` (seen in production studio logs on
   6 Nov); the editor parses it as JSON. It has never worked in v2.
2. **The short-answer explanation editor** (`manual/short-answer-fields.tsx`)
   has the same broken fallback.
3. **Private images do not display in plain statements.** Quizzes resolve
   `cove-asset:` images through `ChoiceRich` and `GET /api/manual/choice-image`.
   Every other statement uses `RichTextFrame`, which has no resolver, so a
   `cove-asset:` image in written-answer or Turtle instructions, or in a
   short-answer explanation, renders as a broken image for students.
4. **Imported images from other sites are blocked.** Studio pages send
   `Cross-Origin-Embedder-Policy: require-corp` (needed for in-browser
   Python). `RichTextFrame` marks images `crossorigin="anonymous"`, and hosts
   such as `public-static.biko.kr` send no `Access-Control-Allow-Origin`, so
   imported Elice/biko problem pictures fail to load (console: "blocked by
   CORS policy").

What already exists and is reused:

- `manual_assets` ("immutable private lesson assets", keyed by academy and
  course, not by material type) with `ManualAssetsService`: private
  Supabase bucket, 5 MiB cap, content sniffing (GIF/PNG and `.jpg` only;
  data files for Turtle), ASCII-only file names, sha256 verified on read.
  `.jpeg`, WebP and Korean file names are refused today.
- `POST /api/manual/assets?academyId&courseId` upload, gated by
  `curriculum.manage` and the course belonging to the academy.
- The capability rule of `choice-image`: an image is readable only by a
  caller who may read a material whose current HTML references it. Course
  copies keep the same references, so copies work without duplicating files.
- The save rule of manual materials: a newly referenced asset must belong to
  the saving academy and course; references already present in the stored
  version (copies) stay allowed.

## Approach

One mechanism for every statement: authors upload into the existing private
lesson-asset store, HTML stores `cove-asset:<uuid>`, and `RichTextFrame`
resolves those references through a scoped, authorized read endpoint before
rendering.

Rejected alternatives:

- **Public bucket with unguessable URLs** (the v1 behaviour): anyone holding a
  URL sees the image, library content leaks through copied links, and it
  differs from every other v2 material.
- **A new exercise-only asset table:** duplicates `manual_assets` and its
  service for no gain; the existing table is not manual-specific.
- **Resolving images per page:** six surfaces render exercise statements;
  fixing each separately is how this gap appeared.

## Design

### 1. Upload (authors)

- The exercise editor passes `onImageUpload` to `RichEditor`, uploading
  through the existing `POST /api/manual/assets` with the exercise's
  `academyId` and `courseId`, and inserting `cove-asset:<assetId>`.
- **Images authors pick from their own computer.** The lesson-asset store
  accepts, by content (magic bytes / document root) and not by extension
  alone: **PNG, JPEG (`.jpg`, `.jpeg`), GIF, WebP, AVIF, BMP and SVG**. Data
  files for Turtle (TXT, CSV, JSON) are unchanged.
- **Size:** the stored limit stays **5 MiB** per file, because the Turtle
  runtime and the manual schema enforce it (and 20 MiB per material). Larger
  laptop photos are **shrunk in the browser before upload**: still images
  (PNG, JPEG, WebP, AVIF, BMP) over 5 MiB are redrawn at most 2560 px on the
  longest side as WebP (quality 0.85, keeps transparency), then 1600 px if
  still too large. GIF (animation) and SVG over 5 MiB are refused with a
  message.
- **SVG** is accepted only as a static picture: well-formed UTF-8 XML with an
  `<svg>` root, without `<script>`, `<foreignObject>`, event-handler
  attributes, `javascript:` URLs or external references. It is only ever shown
  through `<img>` (where browsers run no SVG scripts) inside the sandboxed
  statement frame, never served as a document.
- **HEIC/HEIF** (iPhone photos) is refused with a clear message to export as
  JPG or PNG: most browsers cannot display it.
- **File names:** stored names stay within the existing safe set
  (`[a-zA-Z0-9_. -]`, as the manual schema and the Turtle runtime require,
  because Turtle programs open assets by name). The editor keeps a valid name
  unchanged and converts any other (e.g. a Korean screenshot
  `스크린샷 2026-11-06.png`) to a safe, unique one such as
  `image-2026-11-06-a1b2c3.png` before uploading; the original name remains
  the image's alt text.
- The file picker offers the same types (`accept`), and the editor shows the
  server's reason when an image is refused.
- The short-answer explanation editor gets the manual dialog's existing
  `uploadImage`.
- `RichEditor` loses the dead `/api/uploads` fallback. An editor without an
  uploader hides its image and file buttons instead of failing.
- The author's own preview shows a just-uploaded image from a local object
  URL until the exercise is saved, as the manual dialog does.

### 2. Save validation (exercises)

When a programming exercise is created or updated, the API collects every
`cove-asset:` reference in `description` and checks them **in one query**
(`manual_assets` `id in (...)`). Each must belong to the exercise's academy
and course, or already appear in the stored description (copies, imports).
Otherwise the save fails with the existing `CONTENT_VALIDATION_FAILED`
message (the shared error namespace is at its layout payload budget, so no new
code is added). This prevents referencing another academy's private image by
its ID.

### 3. Reading (everyone who may see the material)

New `GET /api/learn/exercise-image?academyId&materialId&assetId[&classId]`,
`Cache-Control: private, no-store`, rate-limited like `choice-image`:

1. Authorize the caller exactly as the exercise workspace does for that
   caller: an enrolled student who can open the material, staff with the
   academy permission that lets them view or author it, or an authorized
   library preview.
2. Require `assetId` to appear in the exercise's current `description`.
3. Return `{ url: "data:<mime>;base64,..." }` from `ManualAssetsService.bytes`
   (sha256-verified). Data URLs are same-origin, so they display under
   `require-corp` and inside the sandboxed statement frame.

`GET /api/manual/choice-image` is extended the same way for non-choice
manual descriptions and short-answer explanations (explanations stay
readable only when the existing explanation rules allow).

Per image: one authorization read, one asset row, one storage download. An
exercise without images costs nothing extra.

### 4. Rendering (one place)

`RichTextFrame` finds `<img src="cove-asset:<uuid>">` in its content,
resolves each through `PrivateImageContext` before building the frame
document, and caches results for the page. Without a resolver, or when a read
fails, the image shows its alt text in a neutral box, never a broken icon or
a request to an unknown scheme. Each surface wraps its statements in a
provider bound to its scope:

| Surface | Scope |
| --- | --- |
| Student exercise workspace (`workspace/problem-statement.tsx`) | exercise, class |
| Staff workspace and its dialogs | exercise |
| Editor preview and preview modal | exercise (author) |
| Student history and material preview | exercise, class, student |
| Monitoring observed material | exercise, class |
| Manual workspace, review workspace, short-answer explanation | manual material (existing scope) |

Quizzes keep `ChoiceRich` unchanged.

### 5. Imported images from other sites (phase 2, separate approval)

Server-side import into the same private store:

- On exercise save, `<img>` sources on an allowlist (initially
  `public-static.biko.kr`) are fetched over HTTPS only, without following
  redirects to other hosts, limited to 5 MiB and image types that pass the
  existing sniffing, stored as lesson assets of the exercise's course, and
  rewritten to `cove-asset:` with the original URL kept in
  `data-source-url`.
- A one-time operator backfill does the same for existing exercises: dry run
  with counts first, batches, idempotent (skips rewritten images), logged,
  reversible from `data-source-url`. Running it on production needs its own
  go-ahead.
- Other hosts are left as they are; the editor warns that external images
  may not display.

## Non-goals

- Public image URLs, image editing, galleries or an asset library.
- **Known limits of phase 1:** a workbook import does not yet check
  `cove-asset:` references (no workbook carries them before this release);
  a library course previewed from another academy, before it is copied,
  shows the images' alt text; after copying they display.
- File attachments in exercise descriptions (the button is hidden).
- Changing quiz image handling or the manual asset limits.

## Risks

- **Data URLs in pages:** a 5 MiB image becomes ~6.7 MB of page memory.
  Descriptions rarely hold more than a few images; the cap bounds the worst
  case, and resolved images are cached per page rather than refetched.
- **Browser shrinking** changes very large photos' format and resolution;
  2560 px keeps them sharp on any lesson screen. Images under 5 MiB are
  uploaded byte for byte.
- **SVG content:** mitigated by the static-picture checks and by `<img>`
  display only; a later image proxy must not serve SVG as a document.
- **Authorization drift:** the read endpoint must reuse the workspace's access
  decision, not reimplement it; tests cover each role and a cross-academy
  copy.
- **Phase 2 fetches remote content:** SSRF and oversized files are bounded by
  the allowlist, HTTPS, no cross-host redirects, the size cap and sniffing.

## Acceptance criteria

1. A manager inserts a PNG into a programming problem description, saves, and
   the image shows in the editor preview, preview modal, staff workspace,
   student workspace, student history and monitoring.
1a. JPEG (`.jpg` and `.jpeg`), GIF, WebP, AVIF, BMP and SVG images upload and
   display the same way, including Korean file names; a 12 MB photo is
   shrunk in the browser and uploads; an SVG with a script or event handler,
   a HEIC photo, a file whose content does not match an image type, and a GIF
   or SVG over 5 MiB are refused with a readable reason.
2. A student of another academy, or a user who cannot open the exercise, gets
   404 from `exercise-image` for that asset; an asset not referenced by the
   description gets 404 even for its author.
3. Saving a description that references another academy's asset ID fails;
   re-saving a copied course's exercise that kept its original references
   succeeds, and its students see the images.
4. A course copied to another academy shows the images to that academy's
   students.
5. Images in written-answer and Turtle instructions and in short-answer
   explanations display for students; explanation images only when the
   explanation itself is visible.
6. No editor shows an image or file button that cannot upload; no request to
   `/api/uploads` remains.
7. Pages for exercises without images make no additional requests.
8. Phase 2: after the backfill, imported 대피소 problem images display; the dry
   run reports counts before any write; rerunning changes nothing.

## Implementation surfaces and validation

| Surface | Change |
| --- | --- |
| `components/editor/RichEditor.tsx` | remove `/api/uploads` fallback; hide buttons without uploader |
| `exercises/_components/basic-information.tsx` (+ save path) | uploader, object-URL preview |
| `api/src/content` exercise save | one-query reference validation |
| `api/src/learn` | `exercise-image` endpoint reusing workspace authorization |
| `api/src/manual` | extend image read to descriptions and short-answer explanations |
| `components/studio/rich-text-frame.tsx` | resolve `cove-asset:` through `PrivateImageContext` |
| exercise, history, monitoring, manual surfaces | scoped resolver providers |
| `manual/short-answer-fields.tsx` | pass `uploadImage` |
| phase 2: importer + `scripts/` backfill | allowlisted import, dry run |

Validation: API integration tests on a disposable PostgreSQL
(`COVE_INTEGRATION_DATABASE_URL`) for upload, save validation, read
authorization per role, cross-academy copy and statement counts; web tests
for `RichTextFrame` resolution, fallback and editor buttons; the full release
checks; manual verification of criteria 1–5 on production after release with
a test course, removed afterwards.

## Open questions

1. Phase 2 allowlist: only `public-static.biko.kr`, or other hosts seen in
   imported content? (A read-only count of image hosts in exercise
   descriptions answers this before phase 2.)
2. Resolved by the owner (6 Nov): the store accepts PNG, JPEG, GIF, WebP,
   AVIF, BMP and SVG, so imported WebP needs no conversion.
