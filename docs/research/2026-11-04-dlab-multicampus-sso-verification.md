# DLAB multi-campus SSO implementation verification — November 4, 2026

## Outcome

Implemented on isolated branch `feat/dlab-multicampus-sso`, based on local v2 commit `7f50870d` (remote v2 `0ae56bc6` plus a documentation commit). The approved [design](../superpowers/specs/2026-11-04-dlab-multicampus-sso-design.md) is committed as `c016992d`; the provisioning implementation is committed as `92fef08b`.

Authenticated active-campus updates can create one academy, non-rollout feature defaults and an enabled campus mapping when `DLAB_AUTO_PROVISION_CAMPUSES=true`. The default is false. Current-payload replay supports already staged campuses; stale/conflicting events cannot incorrectly activate them. Existing mappings, academy data, branding, local disables and suspensions remain intact. Login cannot invent a missing campus.

The dry-run-first `dlab:provision-campuses` command handles already synced records using the same provisioning logic. Apply requires an active platform operator and Redis, runs a transaction per eligible campus, reconciles identities, emits integration/audit events and safely repeats. Its compiled production entry point was verified present in the API build.

## Isolation

- Worktree: `/Users/jurabeksamiev/Developer/codebuddy-platform-dlab-multicampus`.
- The original monitoring checkout was not switched, stashed, edited or merged. It remained on `fix/all-material-live-monitoring-spec` when checked.
- PostgreSQL and Redis were new disposable Docker containers on loopback-only, dynamically assigned ports. The runner exports only their database target for migrations, generation, builds and tests. No developer dotenv or production database was selected.
- The final browser run used Studio 3409, API 4419 and provider double 4420. The standard ports were occupied by the other worktree's student-history tests; those processes were left running. The DLAB harness now accepts explicit port overrides while retaining its usual defaults.
- No production data, credentials, configuration or deployment was changed by this implementation task.

## Validation results

| Check | Result |
| --- | --- |
| API typecheck and build; shared/i18n builds | Passed |
| E2E TypeScript typecheck | Passed |
| New campus provisioning database/Redis integration suite | 17 passed |
| Existing DLAB/auth/authorization/membership API suite | 161 passed; 11 optional authorization DB tests skipped because `COVE_INTEGRATION_DATABASE_URL` was not supplied |
| Shared DLAB and member bulk policy tests | 69 passed |
| Web SSO unit tests | 16 passed |
| Deployment configuration/rollout tests | 15 passed |
| Browser SSO checks | 11 passed, final run 5.7 minutes |
| Whitespace/diff checks | Passed |

The database tests cover default-off behavior, authenticated replay, feature defaults, concurrent first sync, stable mapping, inactive/stale/conflicting updates, existing academy/course/member preservation, suspended/archived academies, operator disables, current/retired slug conflict rollback, source-role login and tenant isolation, pending-identity recovery, source revocation and independent local suspension. Catch-up tests verify zero-write preview, required flag/Redis/operator authority, audit creation and repeated apply without duplicate academies.

Browser coverage uses four roles (`lab_head`, `edu_manager`, `tutor`, `student`) in Chromium and WebKit. Each case performs authenticated campus sync through the real Nest controller, first login, role-specific dashboard rendering, own-campus course RPC HTTP 200, foreign-campus RPC HTTP 403, repeat login, page refresh, and stable user/membership IDs. Three additional cases deny an unapproved campus for staff/HQ Admin and reject a forged callback.

## Commands

```sh
pnpm install --frozen-lockfile
pnpm --filter @cove/shared --filter @cove/i18n build
DIRECT_URL=postgresql://test:test@127.0.0.1:1/cove_dlab_test pnpm --filter @cove/api typecheck
pnpm typecheck:e2e
python3 deploy/scripts/learning-rollout.test.py
COVE_DLAB_TEST_WEB_PORT=3409 COVE_DLAB_TEST_API_PORT=4419 COVE_DLAB_TEST_PROVIDER_PORT=4420 bash packages/api/scripts/test-dlab-isolated.sh --grep 'new HQ campus|unapproved campus|forged callback'
git diff --check
```

The dummy DIRECT_URL above is only for client generation/typechecking and is never used for a migration or data test. The isolated runner allocates its own databases and applies the existing migrations. It builds API/shared/i18n, runs the listed unit/integration checks, then launches the actual Studio/API with OS and Supabase provider doubles.

Initial test fixtures exceeded the existing username length constraint and were corrected. During later verification, the existing four-process operator test hit its 20-second limit on this machine while another worktree's E2E task was running. The runner now sequences API test files, and that test permits 60 seconds for process startup; all assertions remain unchanged. The final complete run passed. One browser attempt also correctly refused occupied standard ports, which prompted the explicit port overrides above.

## Screenshots

The images contain disposable fixture accounts and academies, not real campus/member data. Both were visually inspected after successful login and refresh.

Chromium:

![New HQ campus Manager dashboard in Chromium](assets/dlab-multicampus-sso/chromium-manager.png)

WebKit:

![New HQ campus Manager dashboard in WebKit](assets/dlab-multicampus-sso/webkit-manager.png)

## Review and production boundary

The security/correctness review checked the existing Bearer/request-ID boundary, creation from stored HQ campus state only, no name-based ownership inference, current/retired slug conflict handling, local restriction preservation, transaction rollback, generation invalidation, scoped membership grants and absence of network calls inside provisioning transactions. No unresolved critical issue was identified in that review; these checks do not replace real provider acceptance.

This is local verification with real disposable databases and provider doubles. It does not certify actual HQ account/session reuse or native Safari. WebKit is the automated Safari-engine check. No release, live Mapo mapping, campus catch-up or production flag activation was performed.

Before live activation, follow the [rollout guide](../operations/dlab-multicampus-sso.md): review exact existing-academy links, map/enable Mapo without replacing Dlab-Mapo, deploy through the approved v2 workflow, enable the private provisioning flag, inspect catch-up dry-run before apply, and perform real OS → Cove checks for Mapo and a newly provisioned branch. New academy creation does not create courses, class assignments or student enrollments.
