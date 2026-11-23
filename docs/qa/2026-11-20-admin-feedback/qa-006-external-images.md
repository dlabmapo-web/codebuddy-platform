# QA-006 — Imported Elice images break; image upload error

> **Implemented on `qa-feedback` (2026-11-20).** `ManualAssetsService.copyRemoteImages` (allowlist in `lesson-images.ts`), called by programming-problem create/update and explanation save; `pnpm --filter @cove/api images:backfill` (dry run by default; `--apply --confirm-database <project-ref>@<host>` to write; production steps in `docs/operations/remote-images-backfill.md`). Differences from the plan below: a picture that cannot be copied is logged by the API, not shown as an editor warning yet; manual materials (Turtle, quiz, short answer) are not covered. **Dry run on the dev database:** 198 statements, 201 distinct pictures (500 Elice and 40 Jungol uses), none broken today. The production run needs its own go-ahead.

> Upload fixed in v2.0.53; copying outside pictures was built on 2026-11-20 (above).

Registered 2026-11-06 · Sunny · P1

## Request

1. Some imported problems show their pictures (`LV3 [10주차] 브루트포스 - 카드 바꾸기`).
2. Others show broken pictures (`대피소`). Imported problems still point at the original site. A picture shows only while that site keeps the file and lets other sites load it. When the Elice contract ends, every such picture may break.
3. Uploading a replacement picture failed: `Unexpected token 'I', "Invalid Se"... is not valid JSON`. QA asked whether Cove Studio has its own image storage.

## Part 3 — upload error: fixed

- Cause: the rich editor fell back to the deleted `/api/uploads` route and tried to read its text reply as JSON.
- Fixed in v2.0.53 (2026-11-06): `f4d2ed1d` (upload from the author's computer through the lesson-asset endpoint), `5ea87f00` (PNG, JPEG, GIF, WebP, AVIF, BMP and safe SVG accepted by content), `ae24731a` (private images in programming problems). `2d54adcc` (v2.0.69) keeps problem images while students move between problems.
- Answer to QA: yes. Pictures are stored privately in our own storage (Supabase bucket, 5 MiB per picture), per academy and course.

## Parts 1–2 — outside pictures: open

### What the data shows (dev database, 2026-11-20, read only)

`<img>` sources in programming problem statements:

| Host | Pictures | Problems |
| --- | --- | --- |
| `cdn-api.elice.io` | 524 | 175 |
| `u.jungol.co.kr` | 24 | 18 |
| `s.jungol.co.kr` | 16 | 10 |
| our Supabase storage (public URL) | 5 | 3 |
| `blog.kakaocdn.net` | 3 | 3 |
| `cove-asset:` (our private storage) | 1 | 1 |

Most Elice pictures are in dlab-mapo `파이썬 기초` (117 problems) and `기본 과목` (41). Production numbers are larger and were not read.

One picture per host, fetched with an `Origin: http://localhost:3000` header:

| Host | Status | `Access-Control-Allow-Origin` |
| --- | --- | --- |
| `cdn-api.elice.io` | 200 | `*` |
| `u.jungol.co.kr`, `s.jungol.co.kr` | 200 | `*` |
| `blog.kakaocdn.net` | **404** (file gone) | — |

Studio pages send `Cross-Origin-Embedder-Policy: require-corp` and load statement pictures with `crossorigin="anonymous"`, so a picture shows only when its host sends CORS headers. Elice serves its own course pictures from its own storage (`elicebackendstorage.blob.core.windows.net`, `static.elice.io`); ours must do the same.

### Plan

This is phase 2 of [2026-11-06-private-lesson-images-design.md](../../superpowers/specs/2026-11-06-private-lesson-images-design.md) (the "copy on save" and "one-time backfill" sections), which was designed but not built. Widen its allowlist to the hosts above.

1. **Copy on save.** When a problem, explanation or manual material is created, updated, imported or synced, every `<img src="https://…">` whose host is on the allowlist (`cdn-api.elice.io`, `u.jungol.co.kr`, `s.jungol.co.kr`, `public-static.biko.kr`, and any host added later):
   - is fetched over HTTPS with a 10 s timeout, no redirects to other hosts, at most 5 MiB, type checked by content with the existing `lessonAssetMime`;
   - is stored as a lesson asset of that course (deduplicated by content hash within the course);
   - is rewritten to `cove-asset:<id>` with the original URL kept in `data-source-url`.
   A picture that cannot be fetched is left as it is, and the save still succeeds. The editor shows a warning listing pictures that could not be copied.
   Fetch in parallel with a small limit (for example 4 at a time), and write the assets in one statement.
2. **Backfill.** An operator script, `pnpm --filter @cove/api images:backfill`, does the same for existing content:
   - dry run first, printing counts per host, per academy and per course, and the URLs that fail;
   - batches of problems, idempotent (skips `cove-asset:` pictures), logs every rewrite, reversible from `data-source-url`;
   - running it on production needs its own go-ahead and should happen **before** the Elice contract ends.
3. **Broken today.** Pictures that already 404 (like the kakao ones) cannot be copied. The dry run lists them so content staff can re-upload, which now works.
4. **Library and copies.** Library sync and course copy carry `cove-asset:` references to the adopting academy's course, as the phase 1 design already describes for copied courses.

### Tests

- API unit: allowlisted host copied and rewritten; non-allowlisted host left alone; redirect to another host refused; over-size and non-image refused; failure leaves the save successful.
- Integration (disposable Docker PostgreSQL): saving a problem with 10 Elice pictures uses a fixed number of statements, not one per picture.
- Backfill: dry run on a copy of the dev data reports the counts in the table above; a second run changes nothing.
- Browser: the `대피소` problem shows all its pictures after the backfill, with Elice blocked in the browser's network settings.

## Scope

API (content save paths, assets, a script), web (editor warning). Statement counts stated in the commit message.
