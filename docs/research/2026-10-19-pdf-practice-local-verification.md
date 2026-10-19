# PDF theory and coding practice: local verification

Date: 2026-10-19 (Asia/Seoul)
Branch: `feat/ignore-python-input-prompts` (unchanged)
Design: [approved specification](../superpowers/specs/2026-10-19-pdf-theory-and-coding-practice-design.md)

## Delivered behavior

- Standalone PDFs retain the full-width document lesson.
- The curriculum offers an explicit PDF + coding practice entry. Existing
  Python exercises can attach, change or remove a supplementary PDF reference.
- The same PDF can serve as a theory step and as the reference for multiple
  exercises in its lecture. The picker exposes placement, page count, size,
  filename and hidden state, and can create or edit PDFs.
- Student and teacher workspaces reuse the existing PDF reader beside the code
  editor. PDF/statement tabs preserve reader state; mobile materials/code tabs
  preserve code, runtime and reader state. Teacher page selection stays local.
- PDF operations preserve the editor, waiting stdin, terminal and submission
  behavior. Text-statement pointer coordinates are not drawn over a PDF.
- Validation, publication, moves, deletion and copying preserve reference
  integrity. Referenced PDFs list their dependent exercises in authoring and
  cannot be deleted or changed to main-only placement until detached.
- A PDF uploaded from an exercise form remains in the builder if the author
  cancels the exercise. The picker shares the builder's course-tree cache.
- Reference-only edits preserve grading revision and input-prompt policy.

## Environment and migration

Browser tests used localhost services and the existing development Supabase
project, `lnrmxjxsjxymgphgatwn`. The database hostname was checked before
migration and before starting the compiled API/worker. Production was not used.

`pnpm --filter @cove/api db:migrate:deploy` applied the pending input-prompt
policy migration and the new `20261019060000_exercise_pdf_reference` migration
to development. The new nullable UUID relation has an index and an ON DELETE
RESTRICT foreign key. Existing exercises remain unlinked by default.

Local Redis was supplied by the existing development Docker service on port
6380. Temporary Redis tooling installed while checking availability was removed.
The final browser pass used the generated standalone Next.js server, with
static/public assets assembled as in `deploy/docker/web.Dockerfile`, plus the
compiled API and judge worker. Cloudflare's documented test site key was used
for this local web build; no source environment files were changed.

## Passing checks

| Check | Result |
| --- | --- |
| Prisma schema validation and client generation | Passed |
| `pnpm -r typecheck` and `pnpm typecheck:e2e` | Passed |
| `pnpm -r lint` | Passed; existing warnings remain, no lint errors |
| Canonical route and translation checks | Passed, including namespace size budgets |
| Shared unit suite | 854 passed |
| API suite, `vitest run --maxWorkers=4` | 1,446 passed; 74 opt-in integration tests skipped |
| Web unit suite | 1,222 passed |
| Translation suite | 128 passed |
| New development-database integration suite | 4 passed |
| Workspace production builds, plus final web rebuild | Passed |
| Final local standalone E2E run | 7 passed in 1.6 minutes |

The database integration tests explicitly verify same-lecture authorization
inputs, refusal of cross-lecture/cross-academy references, database deletion
restriction, preservation during unrelated updates and explicit detachment.
API tests cover safe metadata, hidden/invalid references, publication readiness,
exact exercise/PDF authorization and remapping when a copied exercise precedes
its PDF. UI tests cover retained reader state, statement pointer isolation,
unavailable-reference fallback and optional URL parameter serialization.

An initial broad run encountered a transient OS process-memory telemetry test
failure under concurrent builds. That test passed in isolation and the complete
API suite passed on the subsequent four-worker run. No unrelated judge code was
changed.

## Final browser coverage

Both Chromium and WebKit passed these three flows:

1. Upload and link a PDF through the authoring UI; reopen the exercise and verify
   persistence. Read the standalone PDF with no editor, then open the practice.
   Run Python awaiting stdin, change PDF page and statement/reference tabs, verify
   the same editor DOM node and live input survive, finish the run, submit the
   original solution successfully, and verify the PDF at 375px. Refuse an
   unrelated exercise context and deletion of the linked document.
2. Open the student and assigned teacher in separate contexts. Verify teacher
   PDF, code workspace and independent page selection, with no statement-pointer
   surface over the PDF.
3. Enter the explicit PDF-practice creation flow, require a reference, upload a
   supplementary PDF, cancel the exercise, and find the retained PDF in the
   course builder.

Chromium also passed the pre-existing PDF materials E2E flow covering upload,
private delivery, reader navigation/zoom/fullscreen, original-file download,
replacement, stale edits, supplementary resources and access revocation.

The test collector excludes only WebKit's cancelled dashboard notification poll
reported as an access-control error during navigation (trace response status -1).
PDF, editor and Python runtime page errors still fail the test. No general CORS
or exception suppression was added to application code.

Reproduce the final browser run with the compiled services running locally:

```sh
E2E_BASE_URL=http://localhost:3000 E2E_PDF_PRACTICE=1 E2E_SKIP_SEED=1 \
  pnpm e2e --project=chromium --project=webkit-pdf-practice \
  e2e/specs/pdf-practice.spec.ts e2e/specs/pdf-materials.spec.ts
```

The separate pre-existing input-prompt browser fixture deliberately accepts only
a localhost PostgreSQL database and refused the development Supabase connection.
Its guard was left intact. That additional browser suite was not included in the
final seven passing tests. Input-prompt grading remains covered by the shared/API
unit suites; the PDF-practice E2E includes a real accepted submission.

## Evidence and remaining scope

Final screenshots are retained locally:

- `/tmp/cove-pdf-practice-evidence/pdf-theory-desktop.png`
- `/tmp/cove-pdf-practice-evidence/pdf-coding-desktop.png`
- `/tmp/cove-pdf-practice-evidence/pdf-coding-mobile.png`
- `/tmp/cove-pdf-practice-evidence/pdf-coding-teacher.png`

The implementation adds no new Run-only mode, PDF grading, annotations,
cross-lecture reference sharing, or synchronized PDF pointers/pages. The newer
academy-to-library shared copier is absent from this branch; its integration
obligation remains documented in the design. Nothing was merged, pushed or
deployed to production. Temporary API, worker and web test servers were stopped.
