# Cove Studio Kakao Authentication Implementation Plan

## Goal

Enable and verify Kakao signup and sign-in through Supabase's built-in `kakao`
provider while preserving Cove's existing identity, profile, and academy-role
rules.

## Preconditions

- Work on `feat/cove-studio-v2`.
- Use Supabase project `sfesugoedobirmeqjcvp` (`Cove studio`).
- Never place the Kakao REST API key or client secret in source control, chat,
  screenshots, frontend environment variables, or logs.
- Keep the existing frontend provider ID `kakao`.

## Phase 1: Kakao Developers Application

1. Sign in to Kakao Developers with a company-controlled Kakao account.
2. Create one application named `Cove Studio` with the Cove icon, company name,
   category, and primary domain requested by the portal.
3. Open the REST API platform key and register this redirect URI exactly:

   `https://sfesugoedobirmeqjcvp.supabase.co/auth/v1/callback`

4. Activate Kakao Login and retain automatic app linking.
5. Configure consent items:
   - Kakao Account email: required
   - nickname: optional
   - profile image: optional
   - all unrelated personal data: disabled
6. Enable the REST API client secret and record it in a password manager.

Exit criteria: Kakao Login is active, the redirect URI is exact, email is
required, and the REST API key and active client secret are available privately.

## Phase 2: Supabase Provider

1. Open Supabase Authentication > Sign In / Providers > Kakao.
2. Enable Kakao.
3. Enter the Kakao REST API key as Client ID.
4. Enter the active Kakao client secret as Client Secret.
5. Confirm the displayed callback URL is the same URL registered in Kakao.
6. Save without placing either credential in local environment files.

Exit criteria: Supabase shows the built-in Kakao provider as enabled.

## Phase 3: Application Error Handling

1. Add tests for OAuth callback cancellation and token-exchange failure.
2. Map Kakao/Supabase callback failure to a small allowlist of safe error codes.
3. Show a clear login-page message for cancelled consent, missing required email,
   and a generic callback failure.
4. Do not render upstream error descriptions, authorization codes, tokens, or
   provider secrets.
5. Run web type checking and the focused authentication tests.

Exit criteria: failed Kakao attempts return to login with safe guidance and do
not create partial profiles.

## Phase 4: End-to-End Verification

1. Verify Supabase's authorize endpoint returns a redirect to
   `https://kauth.kakao.com/oauth/authorize`.
2. In an isolated browser session, complete Kakao signup with a new email.
3. Confirm the browser reaches `/auth/welcome`.
4. Query the database without printing sensitive identity metadata and confirm:
   - one `auth.users` row
   - one `auth.identities` row with provider `kakao`
   - one matching `public.users` row
   - platform role `USER`
   - no academy membership
5. Sign out and repeat Kakao sign-in. Confirm record counts remain unchanged and
   `last_sign_in_at` advances.
6. Test an existing verified Cove email and confirm account linking does not
   create a duplicate profile.
7. Cancel consent and verify that no partial account is created.
8. Attempt the flow without email permission and verify that signup cannot
   complete.

Exit criteria: signup, repeat sign-in, account linking, cancellation, required
email, and duplicate prevention all behave as specified.

## Phase 5: Completion

1. Review the final diff for secrets and unrelated changes.
2. Run authentication tests, web type checking, and `git diff --check`.
3. Document the provider configuration using names and URLs only; do not record
   credential values.
4. Commit code and documentation in logical commits only when requested.
