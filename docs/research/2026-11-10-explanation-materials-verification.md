# Explanation materials: implementation verification

Date: 2026-11-10 (Asia/Seoul)
Branch: `feat/explanation-materials`, based on local `feat/cove-studio-v2` at `689e5617`.
Specification: [approved design](../superpowers/specs/2026-11-10-explanation-materials-design.md).

## Result

The new Explanation material has independent storage and validation, rich text/image authoring, student preview, hidden-by-default creation, optimistic editing, and a dedicated reading page. Students receive the explanation, navigation, and authorized images during server rendering. Opening a reading page creates no code editor, terminal, coding runtime, graded submission, or completion credit.

The UI reuses Cove's colors, typography, material picker, lesson chrome, private rich-text frame, and curriculum navigator. Authoring uses a wide document sheet with Write/Student preview tabs and a persistent save footer. The student page uses a centered reading sheet, with the course drawer available alongside it on desktop and closed initially on mobile. English/Korean material, error, count, audit, and history labels include the new type.

Images reuse the existing validated PNG/JPEG/GIF/WebP/AVIF/BMP/static-SVG pipeline and 5 MiB upload limit. The editor supports selection, paste, drop, resizing, upload errors, and pending-upload save guards. Active markup is sanitized; authored image dimensions, tables, and supported formatting survive save/reopen. Private image metadata is read in one batch, and object downloads run with bounded concurrency.

Mixed navigation, explanation-only courses, counts/readiness, ordering/moves, visibility/deletion, library copying/import validation, and teacher observation recognize the type. Explanations do not enter exercise counts, missing-test checks, grading records, or submission-based progress denominators.

## Data and deployment

Migration: `packages/api/prisma/migrations/20261110150000_explanation_materials/migration.sql` adds `EXPLANATION`, the `explanation_materials` subtype, a positive revision constraint, and API-only table access through RLS/revoked browser roles. Existing material rows are not converted. Application rollout requires this migration before serving the new type.

Copies preserve immutable image references through Cove's existing saved-document grant. This is the established behavior of `assertLessonImages`: an authorized copy may continue displaying the images its saved body contains, while newly added references must belong to the destination course/academy. No storage bytes are exposed by guessing a UUID. Deleting an explanation does not delete shared image bytes. The implementation extends this established policy instead of creating duplicate immutable objects or weakening asset ownership checks.

No shared Supabase database, production content, remote branch, or deployment was modified. All database fixtures and migrations used disposable local Docker PostgreSQL. Authentication/object storage for the browser flow use the existing isolated DLAB provider double; Cove's controllers, schemas, authorization, SQL, rendering, and image validation execute normally.

## Verification

The local author/student browser flow verifies creation through the picker, PNG/SVG upload, student preview, hidden access denial, publication, reopening full saved content, a student reading both images, no code/terminal/submit controls, and no coding-runtime requests. The final Chromium run passed in 18.4 seconds, including teacher observation, Previous navigation into the preceding quiz, no duplicate client content read after SSR, and mobile light/dark images. Author preview and desktop/mobile screenshots were inspected to refine the layout.

Focused author-dialog tests verify that authoring loads the saved body and revision without coding fields, sends no test-case payload, and retains the draft on an optimistic-concurrency conflict. Sanitizer tests cover meaningful/image-only content, empty sanitized bodies, safe formatting/tables, and active markup. The existing asset validator suite covers the supported formats and static SVG restrictions.

The integration flow verifies authorization, hidden ancestors, class scope, foreign asset rejection, optimistic save protection, first-class curriculum presence with zero grading denominator, body-free outlines, copying, and image access after source-material deletion. Additional curriculum parity, course-move, and navigation-performance suites include Explanation.

The full web suite passed **1,557 tests across 204 files**. Shared contracts passed **933 tests** and translation checks passed **142 tests**, including English/Korean key parity and namespace payload budgets. The new builder labels live in the existing material-picker namespace. API/web/E2E TypeScript checks and focused lint checks passed.

A broad API run passed 1,714 tests, with 245 integration tests skipped when no integration URL was supplied. Its new audit/access expectations were corrected and rechecked. Judge comparator/large-input timing checks passed on focused recheck. One unchanged sandbox test still fails locally with `runner memory could not be measured; refusing to grade`; this reading-only feature never invokes that runtime. This is not a fully green full-API claim.

## SQL statement evidence

Prisma query events counted the complete new service read, including academy authorization, material access, curriculum, and image metadata, against an explanation-only course. Object-storage bytes were doubled independently; metadata used real PostgreSQL. Fixture setup was outside the measured regions.

| Read | 1 explanation / 1 image | 20 explanations / 20 images |
| --- | ---: | ---: |
| Learner explanation with assigned class | 6 | 6 |
| Authorized author preview | 6 | 6 |
| Curriculum hierarchy | 1 | 1 |
| Course-content counts | 1 | 1 |
| Full course-copy source graph | 14 | 14 |

Duplicating all 20 image references in the body still used 6 statements and returned 20 distinct image entries. Mixed courses can also incur the existing progress reads for their other material types; the six-statement measurement is not a claim about every possible mixed-course page. The HTTP token/session middleware is outside this service-level count. No per-image SQL query is performed.

The final database/sanitizer/navigation/move/parity selection passed **44 tests across 5 files**. The [query-count artifact](assets/2026-11-10-explanation-materials/sql-statements.json) is generated when `COVE_EXPLANATION_EVIDENCE_PATH` is supplied to the integration suite. Class list/detail count parity, cross-module moves of Explanation with preserved content, and the single-statement curriculum projection are covered.

## Visual evidence

- [Author writing surface](assets/2026-11-10-explanation-materials/author-writing.png)
- [Student preview](assets/2026-11-10-explanation-materials/author-preview.png)
- [Student desktop reading page](assets/2026-11-10-explanation-materials/student-desktop.png)
- [Student mobile reading page](assets/2026-11-10-explanation-materials/student-mobile.png)
- [Student mobile dark theme](assets/2026-11-10-explanation-materials/student-mobile-dark.png)

## Reproduction

With dependencies and Playwright browsers installed, run:

```sh
bash packages/api/scripts/test-explanation-materials.sh
```

The script checks its local ports, creates disposable PostgreSQL/Redis, applies migrations, builds the application, runs integration/query-count checks and the author/student browser flow, then removes its containers and temporary API build. It does not read production database configuration for those checks.
