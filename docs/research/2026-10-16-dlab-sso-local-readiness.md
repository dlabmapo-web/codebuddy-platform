# DLAB SSO local setup readiness

Date: 2026-10-16 (Asia/Tashkent)
Branch: `feat/dlab-os-sso`

The user confirmed that the hosted Supabase project configured by the local API is a development/test project. The following setup was performed against that development environment, not a production deployment.

## Completed

- Configured private `packages/api/.env.local` and `packages/web/.env.local` with matching local origins, BFF authentication, the supplied DLAB credentials, and SSO enabled.
- Kept the existing database and Supabase project settings. Private files are ignored by Git and have mode 0600. Existing local configuration was backed up under the ignored `.env-backups/` directory.
- Preserved the authenticated Redis connection on localhost port 6380 and derived the monitoring database URL without dropping its credentials. Both Redis checks returned PONG.
- Applied only the pending `20261016090000_dlab_sso_identity` migration to the confirmed development database.
- Installed the provider credential guards in the development Supabase project.
- Started the local API and Studio; API readiness and the login page both returned HTTP 200.
- Verified that the login page contains the DLAB login link.
- Verified that local `/sso/start` returns 302 to the expected OS authorize endpoint with the localhost callback, a random state, and an HttpOnly transaction cookie. No OS login was submitted.

## Live provider check and correction

The first provider check exposed a real GoTrue behavior not covered by the isolated fixtures: admin creation without a supplied password can still store a provider-generated internal random password hash. The original SQL guard rejected this initial hash and caused a 500 during managed identity creation.

The guard was corrected to allow initial provisioning by the trusted API, which never accepts a password, while prohibiting later password-hash changes on managed identities. It continues to block email/phone changes and alternate providers. This is not permission for users to choose a Cove password.

After installing the corrected guard in development, a temporary managed auth identity successfully completed:

1. Passwordless admin creation with the requested UUID.
2. Admin token-hash generation and server-side OTP verification.
3. Supabase session ID verification.
4. Session refresh.
5. Password and email change attempts returning errors.
6. Cleanup through the admin API.

All temporary probe accounts were removed. No tokens, secrets, or real student details are included in this report.

## Required before a real student login can complete

This initial blocker was resolved in the completed demo test below.

- The localhost callback was accepted in the real test described below; separate written registration confirmation has not been received.
- The supplied test student's verified external user ID has been added to the allowlist; arbitrary OS users remain blocked.
- The external campus ID is now known. The target local Cove academy still needs to be chosen, then campus source data and the verified mapping configured.

The production cookie-policy decision remains open. This development provider check does not establish DLAB contract acceptance or prove the complete OS-to-Cove browser login.

## Real DLAB student test follow-up

The user subsequently supplied a controlled Daechi test student and external identity/campus IDs. The student's ID was added to the ignored API allowlist and the API restarted. Login credentials are not recorded here.

Verified against the actual DLAB OS and configured Cove development database:

- Cove start redirected to DLAB's authorization page using the localhost callback.
- The supplied student successfully authenticated at DLAB. A subsequent attempt displayed the saved account selector.
- DLAB returned to the local Cove callback, and Cove successfully exchanged the code for the direct user response.
- Cove stored the source identity with the supplied campus ID, role `student`, status `active`, and provisioning status `PENDING`.
- Cove refused account/session provisioning with `campus_mapping_required`, because no DLAB campus mapping exists in this database. This is the expected isolation gate, not a rejected DLAB credential.
- Missing and incorrect inbound Bearer credentials both returned HTTP 401.

The API exception filter now logs only status, a bounded reason code, and a validated request ID. It does not log URLs, headers, bodies, exception text, codes, or tokens. Its focused controller suite passed all nine tests, including diagnostic redaction.

The user was asked which local academy should receive the test campus, with the isolated `development-academy` offered as an option. No mapping was guessed or applied. Successful Cove session creation, academy landing, repeat-login idempotency, browser refresh/logout, and live deactivation remain unverified until that choice is provided. No production changes were made.

## Completed isolated demo test

The user subsequently authorized the isolated Daechi demo setup. A new **Daechi SSO Demo Academy**, slug `daechi-sso-demo`, was created in the confirmed development database through `PlatformAcademyService.create`, using the existing active platform operator. No manager invitation or email was requested. The service recorded the normal creation audit and default academy feature flags.

- Demo academy ID: `b11a7322-b5d4-4134-a836-e4ad5490579a` (development only).
- External campus ID: `a8637c48-c053-4d11-89ae-b2a0bc1edd99`.
- External test student ID: `a4290597-2aaa-4b78-8562-d7f1c5737f76`.
- A local active campus fixture was registered through the authenticated campus PUT. This simulates source delivery; it does not prove HQ can reach localhost.
- The existing mapping CLI passed dry run and applied the mapping with the platform operator ID and timestamp. Mapo mappings and memberships were not changed.

Actual browser results using DLAB OS and the hosted development Supabase project:

| Check | Result |
| --- | --- |
| DLAB login and automatic Cove account creation | Passed; student dashboard rendered at `/academy/daechi-sso-demo` |
| Account and academy identity | Correct test student and demo academy visible |
| Refresh | Passed; stayed signed in |
| Student courses navigation | Passed; expected empty catalog, no courses assigned |
| Mapo isolation | `/academy/dlab-mapo/learn/courses` denied with the inaccessible/not-found page |
| Logout | Returned to login; protected demo page denied afterward |
| Existing login options | ID/password, Google, recovery, and signup still visible |
| Repeated DLAB login | Same Cove user ID and one bound membership; provisioning `READY` |
| Development inactive update | Authenticated local user PUT returned 200; existing browser access denied |
| Development reactivation | Active update returned 200; old session remained denied, requiring fresh login |
| Fresh login after reactivation | Passed; student dashboard rendered again |

The deactivation test changed only Cove's development copy of the source identity; the DLAB OS account was not modified. The source identity was restored to active. No course enrollment, live socket disconnect assertion, or natural access-token-expiry refresh test was performed. Ordinary password/Google browser sign-in was not submitted; the relevant existing API auth regression tests passed.

Focused verification: 49 API tests passed across ordinary auth, Supabase auth, DLAB controller, managed auth, and source behavior; eight web SSO helper tests passed. A read-only SSH inspection confirmed production API/Studio had no DLAB flag configured and production API had no DLAB credentials, callback, or allowlist configured. No production deployment or database mutation was performed.

## Start commands

From the repository root, in separate terminals:

```bash
pnpm dev:api
```

```bash
pnpm dev:web
```

Open `http://localhost:3000/login`, then use the DLAB login button. The mapped test student should land at `http://localhost:3000/academy/daechi-sso-demo`.
