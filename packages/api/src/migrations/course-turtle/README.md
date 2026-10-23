# Reviewed course Turtle conversion

This operator tool repairs explicitly mapped programming materials. It does not search learner code for `turtle`, publish hidden content, delete programming records, or run the old curriculum importer again.

Use the manifest/report produced by `scripts/seed-course-turtle-parity.mts` as a development example. Each entry requires academy/course/lecture/material IDs, the exact existing programming `externalKey`, a source-reference URL and reason, reviewed assessment flags, a full `manualConfigSchema` configuration, and `historyPolicy: "retain-programming"`. Every file/asset/entry point must be mapped explicitly. The manifest's runtime version must be an approved version reported by the course GUI broker; do not use the public trial broker.

The audited source preparation activity is Elice `54488204`, currently linked to Cove material `2d83d1db-f1ff-5ac7-b277-45f2f874bdd7`. Its exact production hierarchy/external key and work history must be inventoried before building a production manifest. This local implementation has not converted that production material or the other CH09 activities. Quizzes/written responses are not blanket-converted.

From `packages/api`, with the intended database configured:

```sh
pnpm exec tsx src/migrations/course-turtle/cli.ts --mode=dry-run --manifest=/private/path/manifest.json --report=/private/path/dry-run.json
```

Review the private report: original material and visible ancestors, starter/solutions/test cases, copied draft source, source and asset mapping, history counts, runtime version, assessment flags and blockers. The report includes student work: keep it out of Git/CI logs. Files are created exclusively with mode `0600`. Each new invocation needs a new report path.

After a database backup and review, apply using the exact printed fingerprint and an active academy manager/team-lead user ID:

```sh
pnpm exec tsx src/migrations/course-turtle/cli.ts --mode=apply --manifest=/private/path/manifest.json --report=/private/path/apply.json --fingerprint=REVIEWED_SHA256 --actor=USER_UUID --backup-reference=BACKUP_ID --confirm-academy=ACADEMY_UUID
```

Apply re-reads and locks the materials in a serializable transaction. Changed content/drafts/counts/hierarchy invalidate the fingerprint. Pending programming grading, a quiz, scope mismatch, missing assets, previously converted materials or inconsistent assessment mapping block the whole operation. Review during a quiet maintenance window; serializable conflicts must be re-inspected, not blindly retried.

The conversion preserves material IDs, visibility, ordering, programming configurations, solutions, drafts, submissions, feedback, solve sessions, historical progress and points ledgers. It creates a separate typed manual configuration and copies learner draft code into its entry point while preserving mapped helper files. Existing `/learn/exercises/:id` links redirect through an authorized material-type read. Historical programming attempt links with `submission=` stay on the legacy record viewer. New programming submission/draft writes for a converted material are rejected; new work uses the Turtle/manual workflow. No historical score becomes a manual review.

**Progress consequence:** `includeInScore: false` and `isRequired: false` remove that activity from the current graded denominator. Historical programming grades remain historical; the new Turtle assessment starts without a submission/review. Existing points are not removed or re-awarded. A scored mission requires an explicit manual submission/review under its selected policy. Neither conversion nor Run creates completion or points. Class attendance/participation records are retained.

**Runtime upgrade:** existing dedicated Turtle activities and submitted snapshots may pin an older approved image. Re-save the reviewed live activity through authorized authoring to record the new course runtime and increment its revision. Retain older approved images for immutable submitted snapshots. Do not rewrite historical snapshot runtime versions. Merely deploying a new broker is not a data migration.

Rollback before any new work/author edits/assessment:

```sh
pnpm exec tsx src/migrations/course-turtle/cli.ts --mode=rollback --manifest=/private/path/manifest.json --plan=/private/path/dry-run.json --report=/private/path/rollback.json --fingerprint=REVIEWED_SHA256 --actor=USER_UUID --backup-reference=BACKUP_ID --confirm-academy=ACADEMY_UUID
```

Rollback verifies the original artifact and conversion audit, refuses changed/new drafts, reviews/submissions or author revisions, restores the original material type/required flag and removes only unchanged conversion-created manual data. The retained programming history is never deleted. After new work exists, use an explicit preservation plan instead of this rollback. Apply/rollback both append audit records and bump course content revisions.

The development fixture exercises dry-run → conversion → rollback → conversion against the development database and asserts that the old draft/programming record survives and no grade is created. Browser E2E then enters the converted lesson from its legacy class link and runs actual CPython/Tk.
