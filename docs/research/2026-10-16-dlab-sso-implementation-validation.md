# DLAB OS SSO implementation validation

Date: 2026-10-16 (Asia/Tashkent)
Branch: `feat/dlab-os-sso`
Scope: Phase A of [the approved design](../superpowers/specs/2026-10-16-dlab-os-sso-connection-design.md).
Operations and joint test instructions: [DLAB SSO runbook](../operations/dlab-sso.md).

Subsequent development-project setup and live Supabase bridge validation are recorded in [local readiness](2026-10-16-dlab-sso-local-readiness.md). The live check also identified and corrected the initial provider credential-guard behavior described there.

## Implemented

- GET login start and callback with browser-bound, single-use Redis state.
- Server-only DLAB code exchange and Supabase token-hash bridge with one-time session activation.
- Explicit test-student allowlist and verified campus-to-academy mapping command.
- Campus and user source PUT endpoints with independent Bearer authentication, request IDs, idempotency, and source ordering.
- Managed user/membership/profile-field protections, password/recovery restrictions, and session-generation eligibility checks.
- Redis source-change publication and socket revalidation, with a ten-second backstop.
- Runtime login button, managed self-profile restrictions, localized failure page, deployment examples, Caddy routing and log redaction.

## Local evidence

All persistence tests used explicitly selected disposable PostgreSQL 17 and Redis containers. No production migration, secret configuration, account provisioning, or deployment was performed.

| Check | Result |
| --- | --- |
| Focused API SSO/auth/config/profile/authorization run | 124 passed across 16 files. A subsequent config-only run passed all 5 tests after adding independent-key validation. |
| Focused browser callback/auth actions/session/profile tests | 73 passed across 7 files. |
| Shared package tests | 863 passed across 48 files. |
| Localization tests and catalog checks | 126 passed; no stale keys or copy markers; namespace payload budgets pass. |
| API production build | Passed. |
| Studio production build | Passed, including TypeScript and generation of the new SSO routes, using fake public Supabase settings. |
| API TypeScript check | Passed, including the new integration tests. |
| Targeted web ESLint | Passed, explicitly including normally ignored auth routes via `--no-ignore`. |
| Prisma schema validation | Passed. |
| New application migration | Applied successfully to an isolated database built from the pre-change schema. |
| Provider credential guard SQL | Syntax and password/email/provider restrictions passed against isolated auth-table fixtures. This does not validate live Supabase behavior or permissions. |
| Compiled Nest application | Started against isolated persistence; readiness returned 200. |
| Real HTTP unauthorized requests | User PUT and internal transaction creation returned 401 with the contract error shape. |
| Caddy configuration | Validated with the production Caddy image. |
| Caddy log redaction | Real local callback request verified URI/query omission and removal of Authorization, Cookie, and BFF secret headers. |
| Deployment configuration checks | Disabled examples validated; preflight shell syntax passed. |
| Staged content checks | Whitespace passed; no unexpected long hex credential literals found. |

The integration tests cover repeated login/account reuse, duplicate state/ticket rejection, wrong binding, wrong-academy landing prevention, protected name/grade/role edits (including academy display-name overrides), source update publication, local suspension preservation, deactivation, reactivation without old-session revival, no OS-code retry, and unmapped-campus refusal. OS and Supabase external calls are mocked in these tests; PostgreSQL and Redis are real isolated instances.

## Broader API run

The full API suite completed with 1,444 passing tests, 66 skipped tests, and 5 failures in the unchanged `src/judge/pyodide-engine.spec.ts` file. Two failures reported that runner memory could not be measured; three were 5-second timeouts. The run took 137 seconds while build/test processes were active. No judge files are changed by this branch. These results are not represented as an all-green full suite.

The unchanged runner suite was then rerun alone with one worker: all 62 tests passed in 59 seconds. This is consistent with resource contention during the parallel full-suite run, rather than a demonstrated SSO regression; it does not change the recorded initial full-suite result.

## Not yet verified

- Exact callback registration at DLAB OS.
- A real controlled DLAB student's login and verified external campus mapping.
- Actual Supabase project behavior for passwordless creation, generated token hash, session cookies, refresh, and provider guard installation.
- DLAB acceptance of Cove's existing JS-readable Supabase session cookies, or an alternative BFF design if HttpOnly-only sessions are mandatory.
- End-to-end socket disconnection timing against a deployed multi-instance environment.
- Any Phase B course/enrollment integration or automatic staff authorization.

Keep SSO disabled until the deployment prerequisites are ready. The explicit allowlist is for controlled rollout; it does not waive the production gates. The original research document and handoff directory that were already untracked were preserved.
