# Multiple reference solutions: implementation and local verification

Date: 2026-10-19
Branch: `feat/ignore-python-input-prompts` (unchanged)
Design: [approved specification](../superpowers/specs/2026-10-19-multiple-reference-solutions-design.md)

## Delivered behavior

- Authorized content authors can add, name, reorder and remove independently editable reference solutions. Each programming exercise accepts up to 10 solutions; optional names are limited to 80 characters, each code entry to 100,000 characters, and the collection to 500,000 code characters. Blank code is rejected.
- Teachers use the existing lazy Show Answer modal to view and copy each complete solution independently. Student access remains denied. Live context reads only availability, and stale visits cannot retrieve answers.
- Existing grading and submission behavior is preserved. Reference solution edits do not change grading comparisons.
- Ordered child rows are written transactionally. The legacy scalar is retained as the first-entry compatibility projection. Library adoption copies all solutions into destination-owned rows.
- Workbook v3 uses a required Solutions sheet and preserves complete ordered collections. Preview shows metadata-only change counts and redacted validation diagnostics. Incompatible v2 workbooks and staged plans are rejected.
- English and Korean labels are included. All three author edit entry points use the collection and fail closed if the privileged solution read fails.

## Migration and environment

Migration `20261019073000_multiple_reference_solutions` was applied to the verified development Supabase project only. It backfills nonblank legacy code exactly as a single solution; comments such as `# Method 1` are not split automatically. Parent timestamps and grading revisions remain unchanged.

Browser tests used production-built Next.js and NestJS servers on localhost, development Supabase, and local Redis. They did not use production services. This is a coordinated schema/API/web/workbook change; an older scalar-only writer must not be rolled back over edited collections without a compatible rollback plan.

## Verification

| Check | Result |
| --- | --- |
| Shared unit suite | 862 passed |
| API unit suite | 1,447 passed; 79 skipped |
| Web unit suite | 1,223 passed |
| i18n suite | 130 passed |
| Database integration | 5 passed |
| Local browser E2E | 8 passed across Chromium and WebKit |
| Workspace and E2E TypeScript checks | Passed |
| Next.js production build and API build | Passed |
| Web lint | 0 errors; 85 existing warnings |
| Route checks and `git diff --check` | Passed |

The API suite was rerun with two workers after an initial concurrent run timed out in an existing Pyodide filesystem test. Its isolated file passed all 68 tests, and the final full API run passed.

Database integration covers legacy backfill preservation, collection/scalar synchronization, atomic rollback, ordering/removal, and cascading deletion. Unit coverage includes collection limits, rejected scalar contracts, grading-preserving workbook changes, adoption, and late Monaco callbacks after rename/reorder/removal.

Each browser runs these four flows:

1. Add two named solutions, reorder, save and reopen; remove an unused blank editor.
2. Verify no answer prefetch, copy both exact strings, handle clipboard failure and fetch retry, inspect mobile layout, restore keyboard focus on close, deny student access and stale visits, and check student traffic for private solution markers.
3. Remove a saved solution, persist the remaining one, and prevent removing the last editor.
4. Export workbook v3, import a second solution through preview and commit, reopen it in the author UI, and obtain reviewable diagnostics for invalid code.

Clipboard writes are intercepted in the browser harness to verify exact strings consistently across engines; this does not test the operating system clipboard. Grading was covered by existing unit suites and unchanged-comparison assertions; these E2E flows do not run a judge worker. Skipped database-dependent tests in the default API suite are reported separately from the explicitly executed five-test integration suite.

Visual review covers the desktop author form and the mobile teacher modal. It caught a stale “Copied” label after a later failed copy; the implementation now clears it and E2E asserts that state. The browser harness waits for the client editor to mount before filling server-rendered inputs, avoiding an intermittent WebKit hydration race. The authoring tests also caught and fixed a Monaco callback race that could lose a method name or target the wrong entry after reordering.

## Reproduction and evidence

Use the development-only `packages/api/scripts/seed-multiple-solutions-e2e.mts` fixture and running local API/web services, then run:

```bash
E2E_BASE_URL=http://localhost:3000 E2E_MULTIPLE_SOLUTIONS=1 E2E_SKIP_SEED=1 pnpm e2e --project=chromium --project=webkit-solutions e2e/specs/multiple-solutions.spec.ts
```

The fixture verifies the development Supabase and database project before writing. It resets its dedicated exercise; do not run it against production.

Playwright screenshots are emitted under `test-results/multiple-solutions-*/solutions-author.png` and `solutions-teacher-mobile.png`. Local command logs are under `/tmp/cove-solutions-*.log`; these and Playwright output are ephemeral and are not source-controlled.

No production deployment or push was performed. Unrelated local research/integration documents were left untouched.
