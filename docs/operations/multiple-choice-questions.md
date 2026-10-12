# Multiple-choice questions

The `MULTIPLE_CHOICE` lecture material supports rich single-answer radios and multiple-answer checkboxes, optional shuffled order, explicit submission, automatic exact-set grading, immutable attempt history, and teacher score/completion overrides. It shares the existing class-scoped manual assessment lifecycle. The older native single-answer quiz on `ProgrammingExercise.quiz` is unchanged; existing quizzes are not converted.

## Enablement

Apply migrations before deploying the API/web change. `20261009001000_multiple_choice` adds the material enum, nullable private definition, private assessment table, immutable result guard, and mutual exclusion with short-answer assessments. Direct anonymous/authenticated Supabase access is revoked and RLS enabled.

API environment:

```dotenv
MULTIPLE_CHOICE_ENABLED=true
```

Studio **build-time** environment and GitHub release repository variable:

```dotenv
NEXT_PUBLIC_MULTIPLE_CHOICE_ENABLED=true
```

Both default to false. The Dockerfile and release workflow pass the studio variable at build time; changing a running container variable alone does not add the authoring button. Deploy a compatible API before enabling studio authoring. GUI and short-answer flags can remain false. No Python sandbox, VNC service, regex worker, or evaluation queue is needed.

Flag-off blocks new definition saves, author grading previews, and student admission. Existing content, history, teacher review, and gated explanation reads remain available. Capability discovery rejects author saves against an older API. Older binaries cannot understand the new material enum; retain the compatible API/read path if disabling admission after rollout.

## Storage and grading

Definitions and accepted attempts remain server-private. Learner DTOs whitelist question/options, selection/order, and results; they omit correct IDs and unreleased explanations. Exact equality of selected and correct ID sets earns the snapshotted maximum; every other valid selection earns zero. Latest accepted attempt controls active score/completion. Teacher reviews override that projection without rewriting automatic results.

Rich images use the existing private `turtle-assets` bucket and `ManualAsset` metadata, with a 5 MiB per-file limit. HTML stores `cove-asset:<uuid>` references. An authenticated, no-store API resolves referenced images to data URLs after material/class/attempt checks. Explanation images have the same completion gate as explanation text. No public storage URLs or signed download URLs are embedded in learner definitions. Authors must use meaningful image alt text; executable HTML and external images are removed by server sanitation. Historical attempts retain definition and asset references.

New questions start hidden. Publication or any attempt locks mode, option identity/count/order, key, and shuffle. Wording/explanation changes create future revisions; historical attempts preserve snapshots. Library adoption remaps option IDs and key references and starts copies hidden without attempts or drafts.

## Local verification

The disposable fixture uses its own `ee040…` development course. The seed and storage checker reject non-development Supabase projects. Run API/web with choice flags enabled and GUI/short-answer flags disabled. The studio API URL must use the same backend as the test API URL.

```bash
E2E_SKIP_SEED=1 E2E_BASE_URL=http://localhost:3000 \
E2E_MULTIPLE_CHOICE_ENABLED=1 \
E2E_MULTIPLE_CHOICE_API=http://localhost:4400/api/manual \
E2E_AUTH_STATE_DIR=/tmp/cove-choice-auth \
pnpm exec playwright test --config e2e/playwright.config.ts \
e2e/specs/multiple-choice-materials.spec.ts \
--project=chromium --project=webkit-multiple-choice --workers=1
```

`E2E_SKIP_SEED=1` requires the fixed development identities to exist; feature setup still seeds its own course. The verification used prepared sessions for those identities rather than browser sign-in. Prepare them with the existing development-only helper (no emails):

```bash
NODE_ENV=development E2E_BASE_URL=http://localhost:3000 \
E2E_SHORT_ANSWER_API=http://localhost:4400/api/manual \
E2E_AUTH_STATE_DIR=/tmp/cove-choice-auth \
pnpm --filter @cove/api exec tsx --env-file=.env \
../web/scripts/prepare-short-answer-auth.mts
```

Session files stay outside the repository with mode 0600. The helper's existing variable name is `E2E_SHORT_ANSWER_API`, including when preparing choice sessions.

```bash
pnpm --filter @cove/api exec tsx scripts/verify-multiple-choice-storage.mts
```

The storage checker tests forbidden mutations in rolled-back transactions and verifies direct-access denial and assessment-kind exclusion.

## Evidence and reference limits

Local Chromium and WebKit checks cover author preview/save, single selection/reclick, multiple exact-set grading, retries/conflicting request keys, structural locks, stale revisions, explanation/teacher overrides, private image upload/rendering and release gates, navigation warnings, no autosave, and narrow viewports. API regression tests also cover legacy judge quizzes, short answers, copying, and result projections.

Verification on 2026-10-08: all three scenarios passed in both browsers across the final targeted runs, including historical explanation access after a newer incorrect attempt. The runs used a localhost API on port 4400 and studio on port 3000 with GUI and short-answer flags disabled. The single-answer radio-group bug found in WebKit was corrected and rerun successfully. The 131 API regression tests, 124 translation tests, API/web production builds, web/E2E typechecks, and canonical-route checks passed. Development migrations were applied; production was untouched. The storage checker is run separately from fixture reseeding, which deletes its disposable attempts.

The Elice inspection did not submit real answers. Its grading, partial credit, explanation timing, result disclosure, and shuffled revisit behavior remain unverified. Cove follows the approved policies in the [design](../superpowers/specs/2026-10-08-multiple-choice-questions-design.md), with the evidence boundary recorded in [research](../research/2026-10-08-multiple-choice-questions.md). No production deployment or flag enablement was performed.
