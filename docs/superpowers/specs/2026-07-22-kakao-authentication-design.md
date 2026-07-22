# Cove Studio Kakao Authentication Design

## Objective

Add Kakao signup and sign-in to Cove Studio through Supabase Auth. Kakao must
produce the same Cove identity and onboarding behavior as email/password,
Google, and Naver authentication.

## Chosen Approach

Use Supabase's built-in `kakao` provider. Cove will not implement the Kakao
authorization-code exchange, token storage, or profile API in NestJS or Next.js.
This keeps provider credentials server-side in Supabase and reuses Cove's
existing OAuth callback and profile synchronization flow.

The alternatives are rejected for this phase:

- A custom Kakao OIDC provider duplicates supported Supabase behavior.
- A custom NestJS OAuth implementation adds token and security maintenance
  without providing a product requirement that the built-in provider lacks.

## Provider Configuration

Create one Kakao Developers application named `Cove Studio` and configure it as
follows:

- Use the application's REST API key as the Supabase Kakao Client ID.
- Enable the REST API key's client secret and store it only in Kakao Developers
  and Supabase Auth.
- Activate Kakao Login.
- Keep Kakao's default automatic app linking enabled.
- Register this redirect URI exactly:

  `https://sfesugoedobirmeqjcvp.supabase.co/auth/v1/callback`

- Require consent for Kakao Account email.
- Request nickname and profile image as optional profile information.
- Do not request phone number, birthday, gender, age range, or other unrelated
  personal information.
- OpenID Connect activation is not required for the Supabase built-in provider.

In Supabase Authentication, enable the built-in Kakao provider with the REST API
key and client secret. No Kakao credential belongs in a browser environment
variable, committed file, application log, screenshot, or chat message.

## Application Flow

The existing frontend button calls:

```ts
supabase.auth.signInWithOAuth({
  provider: "kakao",
  options: { redirectTo: `${siteUrl}/auth/callback` },
});
```

The complete flow is:

1. The user clicks **Continue with Kakao** on signup or login.
2. Supabase redirects the browser to Kakao.
3. Kakao authenticates the user and asks for the configured consent items.
4. Kakao redirects to the Supabase callback.
5. Supabase exchanges the authorization code, creates or links the Kakao
   identity, and redirects to Cove's `/auth/callback` route.
6. Cove exchanges the Supabase code for a session and redirects to
   `/auth/welcome`.
7. The existing API identity synchronization creates or updates exactly one
   `public.users` profile for the authenticated Supabase user.

## Identity and Account-Linking Rules

- Kakao Account email is required. Authentication must not create a Cove
  account when Kakao does not provide an email.
- A new verified Kakao email creates one Supabase user, one `kakao` identity,
  and one Cove profile.
- A verified Kakao email matching an existing Supabase user should link the
  `kakao` identity to that user instead of creating a second Cove profile.
- Repeat Kakao sign-in must reuse the same Supabase user and Cove profile.
- Provider authentication never assigns an academy role or membership.
- A new profile starts with platform role `USER`. Membership and academy role
  assignment remain manager-controlled.

Account linking must be verified during testing rather than assumed solely from
email equality.

## User Data

Persist only the data already supported by the Cove profile model:

- Kakao service user ID in the Supabase identity
- email
- display name from the Kakao nickname when available
- avatar URL from the Kakao profile image when available

Supabase owns provider tokens and identity metadata. Cove does not copy Kakao
access or refresh tokens into the application database.

## Error Handling

- If Kakao is not enabled, the frontend retains its existing provider setup
  error.
- If the user cancels or refuses required consent, the callback returns the user
  to login without creating a partial Cove profile.
- If email is missing, signup fails and instructs the user that Kakao Account
  email permission is required.
- Callback and token-exchange failures use a generic user-facing message and do
  not expose provider responses, authorization codes, tokens, or secrets.
- A failed attempt can be retried safely without creating duplicate profiles.

## Verification

Test against the Cove Studio Supabase project in this order:

1. Confirm the Kakao provider redirects to Kakao and uses the exact Supabase
   callback URL.
2. Complete signup with a new Kakao email and reach `/auth/welcome`.
3. Confirm one `auth.users` row, one `auth.identities` row with provider
   `kakao`, and one matching `public.users` row.
4. Sign out and sign in with Kakao again; confirm all three record counts remain
   unchanged and `last_sign_in_at` advances.
5. Use an existing Cove email in Kakao and verify whether Supabase links the
   identity to the existing user without creating a duplicate profile.
6. Cancel the Kakao consent screen and verify that no user or profile is
   created.
7. Refuse email consent and verify that Cove does not create an account.
8. Confirm the new user has platform role `USER`, no academy membership, and no
   academy role.

## Out of Scope

- Kakao messaging, friends, channels, payments, or Kakao Sync
- Kakao access-token use outside authentication
- Kakao account logout or unlink APIs
- Production-domain changes and Kakao business verification
- Academy invitation, join-request, and role-assignment UI
