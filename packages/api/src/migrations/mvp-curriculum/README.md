# MVP curriculum migration command

This one-time command implements the approved migration from the MVP Supabase
project into the existing `dlab-mapo` academy. It does not migrate users,
classes, submissions, or activity.

## Safety boundary

- `inspect`, `dry-run`, and `verify` never write either database.
- No mode is selected by default.
- `apply` requires a successful dry-run report, the matching plan fingerprint,
  an operator-confirmed backup, and explicit target project/academy text.
- `rollback` deletes only IDs recorded as inserted by a successful apply and
  first verifies that their content has not changed.
- Snapshot and plan files contain hidden grading cases. They are stored with
  owner-only permissions below `.migration-artifacts/`, which is gitignored.

Do not put the migration variables on the running API server. Configure them
only in the terminal used for this operation, using the names documented in
`packages/api/.env.example`. The source credential must be read-only.

## Sequence

From the repository root:

```bash
pnpm --filter @cove/api migrate:mvp-curriculum -- --mode=inspect
pnpm --filter @cove/api migrate:mvp-curriculum -- --mode=dry-run
```

Review the generated `*-dry-run-report.json`. It contains no raw hidden test
data. Correct every error before proceeding. Keep the generated plan and
source snapshot private.

After confirming a current target backup, apply the exact approved artifacts:

```bash
pnpm --filter @cove/api migrate:mvp-curriculum -- \
  --mode=apply \
  --plan=/absolute/path/to/plan.json \
  --report=/absolute/path/to/dry-run-report.json \
  --fingerprint=DRY_RUN_FINGERPRINT \
  --backup-confirmed-at=2026-08-25T00:00:00Z \
  --backup-reference=SUPABASE_BACKUP_REFERENCE \
  --confirm-project=sfesugoedobirmeqjcvp \
  --confirm-academy=dlab-mapo
```

Then independently verify the target:

```bash
pnpm --filter @cove/api migrate:mvp-curriculum -- \
  --mode=verify \
  --plan=/absolute/path/to/plan.json \
  --fingerprint=DRY_RUN_FINGERPRINT
```

Rollback is an emergency operation. It requires the original plan, the
successful apply report, its fingerprint, both target confirmations, and
`--confirm-rollback`.
