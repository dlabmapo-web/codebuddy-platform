# QA-002 — PDF upload fails for image-heavy files, and PPT/PPTX upload

> **Implemented on `qa-feedback` (2026-11-20).** Part 1 in `pdf-files.ts` (`maxImageSize: 1`, `pdfValidationLimits`, a one-at-a-time queue). Part 2 in `presentation-converter.ts`, `PdfDocumentService.upload`, the PDF dialog and `deploy/compose.production.yml` (`pdf-converter`, Gotenberg 8.40.0). Differences from the plan below:
> - **No new error codes.** The Korean `errors` namespace was 2 bytes under its size limit, so a deck the converter refuses reports `PDF_INVALID` and an unavailable or slow converter reports `PDF_BUSY`. `PDF_INVALID`/`PDF_TOO_LARGE` now mention PPT; the dialog reads all its messages from the shared `errors` namespace (its duplicate `pdf.errors` block in `content` was removed).
> - **Measured locally at the production caps** (half a CPU, 768 MB): idle 13.5 MB; four real 10–24-slide decks converted in 2–12 s with a peak of 450 MB; Korean text survives (the image ships Noto CJK KR).
> - **Memory budget:** raised to 12 GiB for the 16 GB Lightsail host; the stack with the converter uses 9.72 GiB. See the README.

> Part 1 fixes the failing PDFs. Part 2 adds PPT/PPTX upload, so the document material matches Elice's "Document File (PDF/PPT)".

Registered 2026-11-03 · Jay · P2

## Request

1. A 14 MB PDF fails with `PDF 처리 제한을 초과했습니다` although the dialog says "최대 95 MB". QA found anything over about 4 MB fails.
2. Any PDF up to 95 MB must upload.
3. (Added 2026-11-20) Teachers' lesson files are mostly slide decks with many images. Accept **PPT and PPTX** as well, like Elice.

## How Elice does it

Elice's "New Material" picker has a **Document File (PDF/PPT)** type. An uploaded deck is shown in a page viewer (page 1 / 18, zoom, download), the same way a PDF is. Checked in `[마포] 파이썬 알고리즘 Lv2` › `[1주차]` › `[이론] 시간복잡도와 공간복잡도`.

## Part 1 — image-heavy PDFs

### Root cause

The error is `PDF_VALIDATION_LIMIT`, raised only by `validatePdf` in [pdf-files.ts:77-160](../../../packages/api/src/documents/pdf-files.ts#L77-L160). It is not the 95 MB size limit.

`validatePdf` opens the PDF with pdf.js in a child process and calls `page.getOperatorList()` on every page. That **decodes every embedded image** into memory. The parent kills the child when its RSS goes over **256 MB** (`if (rss > 256 * 1024) kill()`, also a 192 MB heap flag and a 30 s deadline).

### Reproduction (run against `validatePdf` locally)

| File | Size | Result | Peak RSS |
| --- | --- | --- | --- |
| text-heavy QA sheet | 5 MB | passes | — |
| text-heavy article | 6 MB | passes | — |
| image-heavy portfolio (28 pages) | 11 MB | `PDF_VALIDATION_LIMIT` in 1.8 s | 333 MB |
| image-heavy portfolio | 13 MB | `PDF_VALIDATION_LIMIT` in 0.9 s | — |
| image-heavy portfolio (25 pages) | 27 MB | `PDF_VALIDATION_LIMIT` in 0.9 s | 317 MB |

Same two image-heavy files with pdf.js `maxImageSize: 1` (images are not decoded; page structure, fonts and operators still are):

| File | Peak RSS | Time |
| --- | --- | --- |
| 11 MB, 28 pages | 135 MB | 125 ms |
| 27 MB, 25 pages | 184 MB | 148 ms |

### Fix

1. In the `parser` script of `pdf-files.ts`, pass `maxImageSize: 1` to `getDocument`. The check is there to reject broken or hostile PDFs and count pages, not to render, so decoding pictures is wasted work. The reader decodes them later in the student's browser.
2. Scale the RSS ceiling with the file: the file bytes are held twice (Buffer and `Uint8Array`) before parsing. Use `256 MB + 2 × file size`, capped below the API container's limit (`mem_limit: 1536m` in `deploy/compose.production.yml`), and raise `--max-old-space-size` to match. A 95 MB PDF then gets about 446 MB.
3. Keep the 30 s deadline, the 4 KB output cap and the separate process.
4. Run uploads one at a time in the checker (a small in-process queue), so two big uploads cannot together push the API container toward its limit.

### Tests

- `pdf-files.spec.ts`: a generated PDF with several large lossless images passes, and a PDF that is not valid still fails with `PDF_INVALID`.
- Manual: the 11, 13 and 27 MB image-heavy PDFs upload on localhost, and a 90 MB PDF uploads within the deadline.

## Part 2 — PPT and PPTX

### Goal for server cost (decided 2026-11-20)

PPT and PPTX must be accepted for **upload and for reading**, without the server using much CPU or memory and without making the studio slow. So:

- **Convert once, at upload.** A deck is turned into a PDF one time, when the author saves it. Nothing is converted when anyone opens it.
- **Reading costs the server nothing extra.** Students and teachers read the stored PDF exactly as they read PDFs today: the API only signs a storage URL (`PdfStorageService.sign`), and the browser downloads the file straight from Supabase Storage and renders pages with pdf.js on the reader's device. A class of 30 opening the same deck is 30 signed URLs, not 30 conversions.
- **The converter sleeps when idle and never competes with grading.** See the limits below.

Not chosen: rendering PPTX in the browser (layout and Korean fonts break on real decks), or Microsoft's online viewer (needs a public URL to private lesson files).

### Plan

Convert the deck to PDF on upload and store the PDF. Everything after that (page count, reader, reference PDF beside a coding problem, library sync, moves) already works for PDFs and stays unchanged.

1. **Converter.** Run LibreOffice headless in its own container, not inside the API image (it adds about 500 MB to the image, and a conversion spike must not hit the API process). Use the Gotenberg image (`gotenberg/gotenberg:8`, route `/forms/libreoffice/convert`), on the internal Docker network only, with Noto Sans CJK KR installed so Korean slides do not render as boxes. Resource limits:
   - **LibreOffice starts only when needed** (`--libreoffice-auto-start=false`, the default); idle, the container holds only the small Go server.
   - **One conversion at a time** (`--libreoffice-max-queue-size` small, and the API sends one request at a time through an in-process queue). A second upload waits; it does not double the memory.
   - **Hard caps:** `mem_limit` about 768 MB and `cpus: 0.5` in `deploy/compose.production.yml`, so grading and the API keep their share even mid-conversion.
   - **Restart LibreOffice after a few conversions** (`--libreoffice-restart-after`) so leaked memory is returned.
   - **Timeout** about 120 s (`--api-timeout`, and the same on the API's fetch). A deck that takes longer fails with a clear message instead of holding resources.
   - Measure on the Lightsail host before release: idle memory, and peak memory and time for a 40-slide image-heavy Korean deck. Release only if the API and grading stay within their limits during a conversion.
2. **API.** In `receivePdf` / the PDF upload path ([pdf-document.service.ts](../../../packages/api/src/documents/pdf-document.service.ts)):
   - Accept `.ppt` and `.pptx` by content (OLE2 header `D0 CF 11 E0` for `.ppt`, a ZIP with `ppt/presentation.xml` for `.pptx`), not by extension alone.
   - Send the file to the converter, then run the converted PDF through `validatePdf` and the existing storage path.
   - Keep the original filename for display (`deck.pptx`), store the PDF.
   - New error codes: `DOCUMENT_CONVERSION_FAILED` and `DOCUMENT_TYPE_UNSUPPORTED` (KO and EN text).
   - Size limit stays 95 MB for the uploaded file.
3. **Web.** The PDF dialog becomes "Document (PDF/PPT)":
   - `accept=".pdf,.ppt,.pptx,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"`.
   - Labels: `PDF·PPT 가능 · 최대 95 MB` / `PDF or PPT · up to 95 MB`.
   - While converting, show a "Converting slides…" state; conversion can take tens of seconds. The author waits once; readers never do.
4. **Deployment.** Add the converter service to `deploy/compose.production.yml` with the limits above, and to the release checks (health check on its `/health` route).

### Tests

- API: a `.pptx` fixture converts and stores a PDF with the right page count. A renamed `.txt` with a `.pptx` extension is refused. A converter timeout returns `DOCUMENT_CONVERSION_FAILED`.
- Browser: upload a Korean slide deck; text is readable, page count matches the deck.
- Load: while a deck converts, a class submission is graded at its usual speed, and the converter stays under its memory cap.

## Scope

API, web, i18n, deploy. No read-path or statement-count change.
