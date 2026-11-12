# Imported C library grading repair — 2026-11-12

Status at release preparation: **root cause reproduced and fixed locally; data-repair migration tested locally. Only the library's first problem has been repaired and verified in production.**

## Why the courses differ

The [ten-problem QA course](https://cs.coveedu.com/academy/dlab-mapo/learn/courses/40720ada-4cac-42f2-8968-5f0a8f81b47e) had its grading definitions repaired individually during yesterday's verification. That did not repair the importer or the separate [C library course](https://cs.coveedu.com/academy/dlab-mapo/learn/courses/031bdd19-ea7b-47df-91cf-ba53604d5e8f).

The compiled-language workbook import writes the weighted `ELICE_STDIO` profile with `INCLUDE` prompts but omitted `gradingSemanticVersion`. The database supplies `legacy-v1`; the profile requires `elice-v1`. Admission rejects this inconsistent configuration before compilation, producing the unavailable-grading banner, disabled Submit, and failed sample check. Working QA submissions demonstrate that this is separate from general GCC runtime availability.

The library outline contains 118 coding exercises and counts 108 problems toward completion. Its second exercise explicitly displays **Ungraded practice**, with Run and no Submit. That exercise must retain its practice-only policy. A subsequent read-only production database check confirmed exactly one already-correct automatic exercise, 107 automatic exercises with the known version mismatch, and ten practice-only exercises with that mismatch. These 117 records are the complete production match set for the migration at preparation time. The other exercises have not all been inspected individually in the browser.

## Local changes

- `content-import.service.ts` now writes the semantic version derived from the compiled exercise's selected mode and prompt policy. Python import behavior is unchanged.
- Regression tests reproduce the missing-field database default for both C and C++, then check acceptance by the actual grading-profile resolver. Both tests failed before the fix and pass after it.
- Migration `20261112090000_repair_compiled_import_grading_versions` repairs only C/C++ rows matching `ELICE_STDIO` + `INCLUDE` + `legacy-v1`, including library templates and existing academy copies. It changes the semantic version and update timestamp only. Test cases, points, limits, submission policy, grading revision, and historical submission snapshots are preserved. It does not enable submission on practice-only exercises.
- No application read path was added or changed. The data repair is one set-based UPDATE; page statement counts are unchanged.

## Production action and verification

Using the normal problem editor as the manager, the first library exercise, **[실습] Hello World를 출력해 봅시다.** (`116be93b-607d-4064-a896-3b2bd90d3e59`), had its whole-run budget changed from 60 seconds to **60.001 seconds** and saved. This intentionally changed its grading definition so the normal service recomputed the semantic version. The one-millisecond budget adjustment remains in place.

After saving:

- The workspace showed **Automatically graded · Up to 100 points** and enabled Submit.
- The public Hello World sample passed.
- A correct staff-practice submission received **100/100**, passing its one grading case.
- Revisiting the exercise still showed an enabled Submit and the saved 100/100 result.

These were staff-practice attempts, which do not affect student grades or points. A student session was not verified on this library course during this repair. Only this first exercise was edited; the remaining library problems were not bulk repaired through the UI.

## Local validation

Passed:

```text
COVE_INTEGRATION_DATABASE_URL=<disposable-local-postgres> pnpm --filter @cove/api exec vitest run \
  src/content/import/compiled-import-grading-version.integration.spec.ts \
  src/content/import/content-import.service.spec.ts \
  src/judge/grading-profile.spec.ts
```

Result: **3 files, 11 tests passed**. The migration test runs the actual SQL against a temporary PostgreSQL table in a disposable Docker database. Ten fixtures cover both compiled languages, practice policy, Python, other modes/policies, and unknown/already-correct versions. Exactly the three matching rows change, unrelated fields are preserved, and a second application updates zero rows. Separately, the complete chain of **73 Prisma migrations**, including this repair, applied successfully to a fresh disposable PostgreSQL database with the usual local Supabase storage/auth stubs.

The release checks also passed: shared/runtime builds, Prisma generation and schema validation, all workspace typechecks, the end-to-end TypeScript check, lint (with existing web warnings), route lint, translation validation, all workspace tests, all workspace production builds, and immutable browser-runtime packaging. Unit results include API **1,739 passed / 264 opt-in tests skipped**, web **1,587 passed**, shared **935 passed**, translations **142 passed**, and grading runtime **69 passed**. The new SQL integration test was run explicitly against the disposable database rather than skipped with the normal unit run. `git diff --check` passed. No classroom load test or new sandbox qualification was run for this configuration fix.

## Remaining production step

Include the importer fix and migration in the normal release. The documented deployment runs `prisma migrate deploy` using its migration image; it must include this new migration. Afterwards, refresh the library workspace and verify a graded exercise beyond Hello World in a student session. Keep practice-only exercises ungraded.

The migration has **not** been run against production or the shared development database at preparation time. Initial SSH attempts failed; access was subsequently restored by loading the existing SSH key from macOS Keychain, following the local AWS deployment guide. Only read-only diagnostics were run through SSH: the server disk/runtime-retention checks passed, and aggregate grading-profile counts confirmed the affected records. Browser navigation also intermittently stalled between exercises. Chrome was left on the repaired Hello World workspace in the manager's staff-practice session.

The release fix is isolated on `fix/c-cpp-import-grading`, based on the latest fetched `feat/cove-studio-v2` at `6a8bfcbe` (`v2.0.60`), in a separate worktree. Existing uncommitted work in the original worktree was preserved. The normal release must pass CI and End-to-end on its exact commit and then stop at the existing Production environment gate for **jurabek10** to approve. No feature flags or grader policies are changed by this fix.
