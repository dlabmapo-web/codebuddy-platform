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

- Finn confirms registration of `http://localhost:3000/sso/callback`, or provides an accepted HTTPS test callback arrangement.
- The test student's verified external user ID is provided and added to the allowlist. It remains empty deliberately; arbitrary OS users cannot log in.
- The external campus ID and target local Cove academy are provided, then campus source data and the verified mapping are configured.

The production cookie-policy decision remains open. This development provider check does not establish DLAB contract acceptance or prove the complete OS-to-Cove browser login.

## Start commands

From the repository root, in separate terminals:

```bash
pnpm dev:api
```

```bash
pnpm dev:web
```

Open `http://localhost:3000/login`, then use the DLAB login button. Starting the flow is verified; successful completion still depends on the required registration and mapping details above.
