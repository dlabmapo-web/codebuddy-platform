# Restore Google login

Branch: `fix/restore-google-login`, based on `fix/login-auth-qa`.
The user approved the recommended implementation on October 6, 2026.

## Design

Restore Google as an available provider by default in the shared public config,
Docker build, release workflow, and environment examples. An unset or empty flag
enables it; the exact value `false` deliberately disables both the button and
server action. Naver and Kakao retain their existing opt-in behavior.

The deployment-flag-only alternative would leave fresh builds disabled by
default. Removing the flag entirely would remove the ability to disable Google
in a deployment. Default-on with an explicit opt-out restores existing users'
access while retaining that operational control.

Reuse the existing Supabase OAuth action and callback. Returning users are looked
up by their existing Supabase auth user ID and keep their Cove user ID,
memberships, and roles. No account migration or recreation is required for
accounts whose identities remain stored. New users continue through staff signup
and academy selection. Invitations and provider errors retain existing handling.
Suspended and deleted accounts remain blocked.

## Verification

Test the actual config and provider registry for unset, empty, enabled, and
explicitly disabled Google flags. Exercise provider actions and OAuth callbacks,
including returning Google users reaching their normal landing without signup.
Test the API's existing-account path for stable user IDs, preserved academy roles,
no user creation, and rejection of suspended/deleted accounts. Run web/API type
checks and targeted lint.

Local results: 53 web tests and 20 API tests passed. Web and API TypeScript
checks, targeted web lint, `git diff --check`, and the optimized Next.js
production build passed.

## Production rollout

`NEXT_PUBLIC_GOOGLE_AUTH_ENABLED` is compiled into the web image by Next.js.
Before building the release, remove any old `false` repository/environment
variable for this flag or set it to `true`. Build and deploy a fresh web image;
changing only the running container's environment cannot update its client bundle.

Keep the existing Supabase project and Google OAuth credentials. Confirm Google
is enabled in that project's Auth provider settings, its authorized OAuth redirect
URI is the project's Supabase callback, and the Supabase redirect allowlist
permits `https://cs.coveedu.com/auth/callback`.

After deployment, sign in with a previously registered Google account and confirm
the existing academy membership and role are present. Also verify new-user signup
and cancelled consent. Real Google consent and production data have not been
verified by local mocked tests; these require the configured deployed environment.
