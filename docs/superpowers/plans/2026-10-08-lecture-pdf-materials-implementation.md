# PDF materials implementation

Approved by user on 2026-10-08. References: PDF design spec and Elice research notes.

1. Add document contracts, database records/migration, and private-storage lifecycle.
2. Implement bounded PDF validation/upload, authoring mutations, preview/read/download authorization, and cleanup.
3. Extend mixed curriculum outlines, library copies, ordering/moves, imports, and readiness without changing exercise grading/progress.
4. Add translated authoring controls and integrated React-PDF reader with bundled worker and independent page/material navigation.
5. Apply the additive migration only to the development database; configure the development private bucket.
6. Add meaningful lifecycle/access tests and localhost E2E covering author upload/publication and student rendering/download.
7. Run required repository checks, inspect browser rendering, and record outcomes and operational setup.

Visual direction: retain Cove's theme, typography, and authoring controls. Use a quiet document stage and two clearly labelled navigation bars. No new branding or unrelated judge changes.

## Completed implementation

All seven steps above are complete. PDF assets are immutable private Storage objects, with uploader/destination binding, isolated validation, optimistic edits, audit actions, and reference-aware cleanup. The builder supports upload/edit/preview/replacement/visibility/removal and existing mixed ordering/moves. Library adoption copies document references; conflicting workbook imports are refused explicitly. Student outlines and navigation include main PDFs, expose supplementary resources, and preserve exercise-only progress and monitoring.

The integrated reader bundles its matching PDF worker and renders one canvas plus selectable text. PDF-page controls, lesson navigation, zoom/fit, fullscreen, original-file download, mobile wrapping, and translated error/retry states are implemented. Signed-link responses use `private, no-store`; failed reauthorization removes the document renderer.

Both migrations were applied to the **development** database. The second migration enables RLS and revokes `anon`/`authenticated` table grants on the new PDF tables. Verified both roles cannot read/write those tables, and Storage has no browser object policies. The private development bucket is configured for its project's existing 50 MB ceiling; production must allow 95 MB. See [operations](../../operations/pdf-materials.md).

## Verification on 2026-10-08

- `pnpm -r build`: passed for all packages; final API/web rebuild passed after the last changes. Next development servers were stopped before building.
- `pnpm typecheck` and final `pnpm typecheck:e2e`: passed.
- `pnpm -r lint`: passed, with 73 existing warnings and no errors.
- Prisma schema validation and both development migration deployments: passed.
- Canonical route validation and `i18n:check`: passed.
- Shared tests: **853 passed**; i18n tests: **122 passed**; final web tests: **1,198 passed**.
- Full API suite, `pnpm --filter @cove/api exec vitest run --no-file-parallelism`: **1,370 passed, 66 existing skipped**. The initial parallel run hit judge timing failures; its affected tests passed serially, and the final full serial suite passed.
- `pnpm deploy:validate`: passed, including Compose resource budget, Caddy configuration, and Alertmanager configuration.
- `E2E_SKIP_SEED=1 E2E_BASE_URL=http://localhost:3000 pnpm e2e pdf-materials.spec.ts --project=chromium`: **1 passed** against the final optimized production build on localhost (about two minutes).

The browser flow covers staff picker upload, hidden-by-default behavior, preview metadata/private bucket access, publication, student canvas/text rendering, page changes, 150% zoom and fit, fullscreen, desktop/mobile layout, downloaded original filename and SHA-256 checksum, PDF/exercise transitions, invalid replacement rejection, valid replacement with stable material id, stale-edit refusal, supplementary-only lecture resources/download, student upload denial, and hidden direct-link refusal. It also checks non-cacheable signed-link responses and painted canvas pixels. Generated two-page fixture bytes are non-confidential. Final desktop/mobile screenshots were visually inspected at `/tmp/cove-pdf-reader-desktop.png` and `/tmp/cove-pdf-reader-mobile.png`.

API tests exercise structural PDF validation, spoofed/empty/oversized upload refusal, scoped authorization before signing, asset deletion claims, adopted-reference preservation, and failed Storage deletion retries.

Local API and optimized web servers remain available on ports 4000 and 3000. The local build uses Cloudflare's always-pass CAPTCHA test key for the real sign-in flow; production must use its normal deployment configuration. No production database/storage write, deployment, push, merge, or release was performed.
