# DLAB pre-login directory sync — implementation verification

Branch: `feat/dlab-prelogin-directory-sync`, based on the approved 2026-11-12
spec at `58d781b5` / v2 base `6d74cfd9`.

## Implemented behavior

- User PUT uses a shared SSO/directory provisioner with fixed reserved UUIDs,
  Redis ownership checks, provider calls outside SQL, durable error/projection
  revisions, and same-source retry recovery. Sync creates no login bridge,
  session or sign-in timestamp. Actual SSO activation records the sign-in time.
- All seven OS roles and the conservative unknown-role fallback create real
  directory records. Inactive/local restrictions remain restricted. Deleted
  account credentials are not recreated; ordinary-account collisions fail.
- Campus names and source status project onto existing stable academy IDs and
  slugs. Independent local suspension/archive/SSO intent survives reactivation.
  Local academy restore reconciles membership access without requiring a resend.
  Managed names are guarded in SQL/API and explained in the platform UI.
- New inbound maintenance gate defaults false and returns authenticated 503s.
  Current-version replays repair incomplete work; stale/conflicting or missing
  required timestamps fail explicitly. Response schemas validate 200 semantics.
- Private reviewed-plan CLI performs read-only keyset planning, target/digest
  validation, campus-first apply, paced provider operations and durable resume.
  Per-user completion evidence commits with the account projection. Plan drift
  and conflicts are reported rather than silently accepted.

## Isolated verification

Only disposable loopback Docker PostgreSQL 17 / Redis 7 and synthetic local
OS/auth doubles were used. `pnpm test:dlab` recreates its own containers, applies
all migrations and builds the shared, i18n and API packages. No shared Supabase
fixtures, HQ passwords, production migration, deployment or live backfill were
used.

Passing checkpoints:

- Campus provisioning regression: 17 tests.
- DLAB/auth/authorization/platform regression: 234 tests across 24 files.
- Shared DLAB/membership contracts: 69 tests across 4 files.
- Web SSO helpers: 16 tests.
- Latest focused directory projection suite: includes all role codes, source
  ordering, provider/SQL failure recovery, mapping/ordinary-account conflicts,
  lease contention/loss, concurrent source deactivation, local restrictions,
  campus lifecycle and catch-up resume/drift: 20 directory integration tests.
  The final directory/auth/controller/lifecycle group passed all 45 tests.
- Chromium and WebKit both passed the new manager → pre-login Members and class
  selectors → student enrollment / staff assignment → first student SSO flow.
  Student user/membership IDs remain stable and the assigned class is visible.

Additional final checks:

- API build and API/Web/E2E TypeScript checks passed.
- Platform academy web components: 7 tests across 2 files.
- Deployment gate validator: 3 valid/invalid configuration cases passed.
- Compiled catch-up CLI plan command: verified read-only database behavior,
  private 0600 artifact permissions and matching reported plan digest.
- Changed web files lint with no errors; five pre-existing unused-import
  warnings remain in `academy-detail.tsx`.
- All 39 browser cases passed across runs: the first full run passed 32 and
  stopped at a tutoring test's refresh expectation. The remaining seven passed
  after making that test advance the browser Date past the five-second SSR
  freshness window before dispatching focus. This changes the test only; it
  preserves its assertion that background refetch does not reset editor input.

The scale fixture represents 1,818 distinct synthetic identities: 1,744 students
and 74 mixed staff, including staged, failed, existing and inactive source states.
It checks real user/membership uniqueness, batch reconciliation and pre-login
roster visibility. Provider failures and staged-user completion use doubles;
this is not a claim that 1,818 production provider accounts were created.

## Measured SQL statements

Prisma query-event logging against the disposable database, with fixture setup
excluded. Baseline was reproduced from the approved-base reconciler at
`58d781b5` using the same fresh one/100-campus managed-staff fixture.

| Path | 1 campus / row | 100 campuses / rows |
| --- | ---: | ---: |
| Baseline staff reconciliation, all emitted statements | 20 | 1,109 |
| Baseline staff reconciliation, SELECT statements | 11 | 407 |
| New joined directory snapshot | 1 SELECT | 1 SELECT |
| New staff reconciliation, all emitted statements | 10 | 10 |
| New staff reconciliation, SELECT statements | 2 | 2 |
| Complete new-user sync with provider double, all emitted SQL | 22 | 22 |
| Complete new-user sync, SELECT statements | 6 | 6 |
| Existing Members reader, one-row result / 100-row page | 14 | 14 |

The Members measurement stubs already-resolved authorization and signs no
avatars; it measures the existing data reader, not an entire HTTP page load.
Transaction/guard statements are included in the reconciliation/sync totals.
Redis/provider operations and post-commit live-monitoring side effects are
separate from SQL counts. The 1,818-person batch projection emitted 12 client
statements before individual staged-user completion.

Prisma events do not enumerate SQL inside PostgreSQL triggers. Source writes use
transaction-local `cove.dlab_sync`, so managed membership/role/profile guards
short-circuit; they still execute per affected row. Academy status changes also
run the existing set-based generation update. The reconciler skips identities
already advanced by that trigger. Local lifecycle writes retain their provenance
trigger and advisory-lock ordering. These internal operations are not claimed
as part of the client statement count.

## Release boundary

See [the operational runbook](../operations/dlab-directory-sync.md). The new gate
remains false in examples. Production still needs the separately authorized AWS
release, additive migration, reviewed source/mapping plan, gate enablement and
catch-up, followed by HQ resend / real staff/student acceptance. Reported HQ
counts and example request IDs are not independently verified by local tests.
