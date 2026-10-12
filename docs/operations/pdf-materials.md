# PDF materials operations

PDF originals live in the **private** Supabase `course-documents` bucket. PostgreSQL stores metadata and references; neither Git nor the application image contains uploaded documents. Library copies reference immutable assets. Replacing a document changes only the material edited.

## Prepare a deployment

1. Apply both additive Prisma migrations through the existing deployment migration job. The second migration enables row-level security and removes browser-role grants on PDF metadata; access goes through the application API.
2. Set the Supabase project's global Storage upload limit to at least **95,000,000 bytes**. A bucket cannot exceed its project's global limit. The current development project permits only 50 MB.
3. From the API directory, with that environment's server-side configuration, run `pnpm exec tsx scripts/setup-pdf-storage.mts --production`. This creates or updates the bucket with `public: false`, PDF MIME restriction and a 95 MB ceiling. Do not add public or anonymous object-read policies. The API uses its existing server-side Supabase secret.
4. Deploy the API, web, Compose, and included Caddy change together. The API's temporary filesystem is 256 MB to accommodate two concurrent uploads. Only `/api/documents/upload` receives a 95 MB request ceiling; other endpoints retain 20 MB. The API additionally counts actual streamed bytes. PDF uploads use `application/octet-stream` and `X-File-Name`; browser CORS must allow them.
5. Verify the web's bundled PDF worker is served from the same origin. Read a published PDF, navigate pages, and download it from the student role. Check Storage's signed URLs support CORS and byte ranges. No CDN worker or public PDF URL is used.

For local development only, run `pnpm --filter @cove/api exec tsx scripts/setup-pdf-storage.mts --development-50mb` from the repository root. The explicit fallback is pinned to the development project. Files over its 50 MB project ceiling cannot be stored there even though Cove's feature ceiling is 95 MB.

The migration image also includes the setup script and `tsx`. With the same Compose files and deployment environment used by the deployment guide, run the `migrate` service with `--entrypoint node` and command `node_modules/tsx/dist/cli.mjs scripts/setup-pdf-storage.mts --production`. This uses the server-side configuration mounted for that service. Ensure Storage has no generic browser object-read policy that includes `course-documents`; this bucket needs no browser policies.

## Limits and access

The API allows two upload/validation jobs per process and ten uploads per user per minute. It streams uploads to restricted temporary files, validates them in a child process (30 seconds, 192 MB V8 heap, 256 MB measured RSS), then streams the original to Storage. The parser and browser disable PDF JavaScript evaluation; the reader does not render interactive annotations.

Author preview needs `curriculum.review`; author mutations need `curriculum.manage`. Student reads and downloads require an active session, active membership and class assignment, and visible material/lecture/module/course ancestors. Inline and original-filename download links expire after five minutes. Previously issued links remain usable until expiry, even after hiding content or removing enrollment. Reader renewal rechecks access once and preserves page and zoom.

Uploads must be attached by their uploader to the original destination within one hour. Each hourly cleanup sweep claims up to 100 unreferenced assets older than 24 hours under a database row lock. `DELETING` records survive Storage failures and are retried; attached assets, including library copies, are preserved. Monitor `pdf_assets` for accumulating `PENDING`/`DELETING` rows. PostgreSQL backups contain metadata **only**; back up/restore bucket objects separately, preserving object keys and checksums before restoring material references.

Workbook exports remain exercise-only. Imports into courses containing PDFs are refused explicitly because the workbook cannot safely express PDF placement. Use the builder for such courses.

## Local tests

```sh
pnpm --filter @cove/api exec vitest run src/documents
E2E_SKIP_SEED=1 E2E_BASE_URL=http://localhost:3000 pnpm e2e pdf-materials --project=chromium
```

The browser tests use seeded development staff/student accounts and a dedicated PDF E2E course. Run the normal `db:seed` and `db:seed:e2e` once when preparing a fresh development database. Set `NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA` on the localhost web process for the real UI sign-in flow. Test PDF bytes are a generated, non-confidential two-page fixture.
