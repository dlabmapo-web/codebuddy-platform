# Cove Studio Social Authentication Provider Design

## Objective

Add first-time social signup and sign-in for Google, Kakao, and Naver while
keeping Supabase Auth as Cove Studio's single identity and session authority.
Socially authenticated users must enter the same Cove profile bootstrap flow as
email/password users. Social providers do not assign platform or academy roles.

## Provider Strategy

| Provider | Supabase integration | Client provider identifier |
| --- | --- | --- |
| Google | Built-in Google provider | `google` |
| Kakao | Built-in Kakao provider | `kakao` |
| Naver | Custom OAuth2 provider plus profile adapter | `custom:naver` |

We will configure and test providers sequentially: Google, Kakao, then Naver.
This isolates provider-specific configuration failures and gives every provider
the same application-level behavior.

## Naver Profile Adapter

Naver's official profile endpoint returns identity fields under a nested
`response` object. Supabase's custom OAuth2 claim mapper only maps fields that
are already available at the top level, so it cannot map values such as
`response.email` directly. A small Supabase Edge Function named
`naver-userinfo` will provide the required compatibility boundary.

The Naver-specific flow is:

1. Supabase exchanges the Naver authorization code for a Naver access token.
2. Supabase calls the public `naver-userinfo` function with that token in the
   `Authorization: Bearer` header.
3. The function forwards the bearer token only to
   `https://openapi.naver.com/v1/nid/me`.
4. The function requires Naver's `resultcode` to equal `00` and validates that
   `response.id` and `response.email` are non-empty strings.
5. The function returns standard top-level OAuth identity claims:

   ```json
   {
     "sub": "naver-application-user-id",
     "email": "user@example.com",
     "email_verified": true,
     "name": "User Name",
     "picture": "https://example.com/avatar.png"
   }
   ```

The function is deployed without Supabase JWT verification because the bearer
credential is a Naver access token, not a Supabase access token. It accepts only
`GET`, uses a hard-coded Naver destination, never accepts a destination URL from
the caller, never stores or logs the bearer token, and returns a generic error
body when Naver rejects the request. This keeps it a narrow identity adapter,
not an open proxy or a second authentication system.

The custom provider configuration uses:

- Identifier: `custom:naver`
- Authorization URL: `https://nid.naver.com/oauth2.0/authorize`
- Token URL: `https://nid.naver.com/oauth2.0/token`
- UserInfo URL:
  `https://sfesugoedobirmeqjcvp.supabase.co/functions/v1/naver-userinfo`
- Scopes: none; Naver profile permissions are selected in Naver Developers
- PKCE: enabled initially; it may be disabled only if an observed Naver token
  exchange error proves that Naver rejects the PKCE parameters

Naver Developers must request at least the unique user identifier, email, and
name or nickname. Profile image is optional.

## Redirect Flow

1. The browser calls `supabase.auth.signInWithOAuth` with the selected provider.
2. Supabase redirects the user to the provider.
3. The provider returns to the Supabase callback URL:
   `https://sfesugoedobirmeqjcvp.supabase.co/auth/v1/callback`.
4. Supabase returns the browser to the allowed Cove callback URL:
   `http://localhost:3000/auth/callback` during local development.
5. The Next.js callback exchanges the authorization code for a Supabase session.
6. Cove redirects to `/auth/welcome`, where the NestJS authentication procedure
   creates or refreshes the application user profile.

The production Cove callback URL must be added to the Supabase redirect allow
list before deployment. Provider dashboards continue to use the Supabase
callback URL, not the Cove application callback URL.

## Identity and Authorization Rules

- Supabase Auth owns external identities, access tokens, refresh tokens, and
  account linking behavior.
- `public.users.auth_user_id` connects the Supabase identity to the Cove user.
- Social signup never assigns `ADMIN`, `MANAGER`, `TEAM_LEAD`, `TEACHER`, or
  `STUDENT`.
- New users start with the ordinary platform role and no academy membership.
- Platform administration and academy membership assignment remain separate
  workflows.
- Email is requested from all three providers because Cove uses it for account
  identification and academy invitations.

## Secret Handling

- Provider client secrets are entered only in Supabase and their provider
  consoles.
- The Naver Edge Function does not receive or store the Naver Client Secret;
  Supabase uses that secret only for the authorization-code exchange.
- Provider client secrets must not be placed in `NEXT_PUBLIC_*` variables,
  committed `.env.example` values, source files, screenshots, or chat messages.
- Only the existing Supabase project URL and publishable key are used by the
  browser.
- If a credential is exposed, rotate it in the corresponding provider console
  and update Supabase immediately.

## Error Handling

- A provider disabled or incorrectly configured in Supabase produces a specific
  provider-configuration message on the login/signup screen.
- A rejected or invalid callback returns to `/auth/login` with a safe error
  code; raw provider errors and secrets are not shown to users.
- Missing email consent is treated as a failed signup until the provider is
  configured to return email reliably.
- A missing Naver bearer token, failed Naver response, malformed nested profile,
  or absent Naver email produces a generic adapter error and no Cove user.
- Duplicate-email behavior will be tested explicitly before enabling each
  provider for production.

## Test Acceptance Criteria

Each provider is complete only when all of the following pass:

1. A new user can start signup from `/auth/signup`.
2. Provider consent returns successfully through both callback layers.
3. A Supabase Auth user and Cove `public.users` profile exist.
4. The user reaches `/auth/welcome` with a valid session.
5. Signing out and signing back in resolves to the same Cove user.
6. Cancelled consent and provider errors return a safe, understandable message.
7. No provider secret appears in Git-tracked files or browser-delivered code.
8. For Naver, the adapter rejects missing bearer tokens and malformed profile
   responses without logging credentials.

## Out of Scope

- Academy creation and role assignment
- Platform administrator UI
- Importing contacts or provider API access beyond authentication
- Native mobile OAuth flows
- Production-domain rollout, which will be designed when the production Cove
  Studio domain is selected
