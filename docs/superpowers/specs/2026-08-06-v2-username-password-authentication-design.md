# V2 Username and Password Authentication

**Date:** 2026-08-06
**Status:** Implemented — migration `20260806120000_user_username` not yet applied
**Scope:** `(v2-auth)` only — the Supabase + NestJS stack. The legacy Next.js-only
platform (`(auth)`, `(student)`, `(teacher)`, `(admin)`, `/api/auth/*`,
`src/lib/auth/jwt.ts`, the `pc_token` branches of `src/proxy.ts`) is not touched.

## Problem

V2 login asks for an email address
([actions.ts:34-52](packages/web/src/app/(v2-auth)/auth/actions.ts#L34-L52)).
Elementary students mistype long addresses and do not think of an email as
"their ID". The v1 platform they came from logged in with a short username
([login/page.tsx](packages/web/src/app/(auth)/login/page.tsx)), and the v2 schema
already reserves `legacyUsername` for that import
([schema.prisma:151](packages/api/prisma/schema.prisma#L151)).

Signup stays exactly as it is today — name, email, password, academy — with one
added required field: **username**. Login then uses username + password.

## Constraint that shapes the design

Supabase Auth is the only credential store; the approved design forbids a second
password system
([auth design §1](docs/design/2026-07-22-cove-v2-authentication-authorization-design.md)).
Supabase authenticates a password against an email, never a username. So the
username is a Cove-owned lookup key that resolves to the account's email
immediately before `signInWithPassword` is called. Supabase itself never sees
the username as a credential, which is why email verification, password reset,
and OAuth all keep working untouched.

## Design

### Data model

```prisma
model User {
  // ...
  username String? @unique      // lowercase; null for OAuth and pre-existing accounts
}
```

One migration: nullable column, unique index, and a check constraint mirroring
the format rule so the database rejects a bad value even if a future code path
skips validation. Nullable because OAuth accounts never pass through the signup
form and have no username — they sign in with their provider, so they do not
need one. `legacyUsername` is left alone; the eventual v1 import copies it into
`username` when the name is still free.

`authUserSchema` gains `username: z.string().nullable()`
([session.ts:27-37](packages/shared/src/auth/session.ts#L27-L37)) and `toAuthMe`
populates it
([auth.service.ts:274-307](packages/api/src/auth/auth.service.ts#L274-L307)).

### Username rules

```
^[a-z0-9](?:[a-z0-9_.-]{3,28}[a-z0-9])$      // 5–30 characters, lowercase
```

Input is trimmed and lowercased before validation, so a student who types
`Minsu01` gets `minsu01` and can sign in either way later. A reserved-name
blocklist (`admin`, `root`, `support`, `cove`, `system`, `api`, `auth`, `me`,
`null`) is rejected at the same layer. This lives once, as `usernameSchema` in
`packages/shared/src/auth/username.ts`, and is used by the signup form, the
server action, and the API so all three agree.

Uniqueness is global, not per academy: the login form has one field and must not
grow an academy selector.

### How the username reaches the database

The Cove `User` row is not created by the signup form — it is created by
`bootstrap()` from the Supabase token the first time the new session calls the
API ([auth.service.ts:29-88](packages/api/src/auth/auth.service.ts#L29-L88)).
The username therefore rides along the same path every other profile field
already takes:

```
signup form
  → signupAction passes username in signUp({ options: { data: { username } } })
  → Supabase stores it in user_metadata
  → verifyAccessToken reads metadata.username into SupabaseIdentity
  → bootstrap() writes it to User.username when creating the row
```

`SupabaseIdentity` gains `username: string | null`, read in
`verifyAccessToken` alongside `full_name` and `requested_academy_id`
([supabase-auth.service.ts:42-50](packages/api/src/auth/supabase-auth.service.ts#L42-L50))
and revalidated there against `usernameSchema` — user metadata is client-writable,
so it is untrusted input, exactly like `requested_academy_id` already is.

`bootstrap()` sets `username` only when creating a row, and only when it is still
null on an existing row. It must never overwrite an established username from a
token claim, or a user could rename themselves by editing metadata.

### Keeping the name free before the account exists

Because the Supabase account is created before `bootstrap()` runs, a taken
username would otherwise surface only *after* signup succeeded. Two things
prevent that:

1. **`auth.checkUsernameAvailable`** — a new unauthenticated, rate-limited oRPC
   route (`{ username } → { available: boolean }`), called by `signupAction`
   before `supabase.auth.signUp`. A taken name returns the existing
   `USERNAME_TAKEN` style form error and no Supabase account is created.
   Rate limit: 30 per address per 10 minutes, keyed by `requestAddress` like
   `createOAuthOnboardingIntent`
   ([auth.router.ts:19-27](packages/api/src/auth/auth.router.ts#L19-L27)).

2. **A unique index that actually decides it.** The check above is advisory —
   two simultaneous signups can both pass it. `bootstrap()` claims the username
   inside its existing create, catches Prisma `P2002`, and creates the row with
   `username: null` rather than failing. The account still works; the user is
   simply asked to pick a name once.

That second case needs a landing place, which is also what pre-existing accounts
need:

**`auth.setUsername`** — authenticated, `{ username } → AuthMeResponse`. Rejects
with `USERNAME_ALREADY_SET` if the caller already has one, so it cannot be used
as a rename endpoint, and with `USERNAME_TAKEN` on `P2002`. The welcome screen
renders an inline "choose your username" form when `account.user.username` is
null and the account has no OAuth provider. This is a small form reusing
`TextField`, not a new route.

### Login

`loginAction` swaps `email` for `username`
([actions.ts:19-52](packages/web/src/app/(v2-auth)/auth/actions.ts#L19-L52)):

```
loginAction({ username, password })
  → auth.resolveSignInEmail({ identifier: username })  → { email }
  → supabase.auth.signInWithPassword({ email, password })   // unchanged
```

Everything after the resolve is byte-for-byte what happens today, so
`@supabase/ssr` writes the same session cookies and the invitation redirect at
[actions.ts:50](packages/web/src/app/(v2-auth)/auth/actions.ts#L50) still fires.

**`auth.resolveSignInEmail`** — unauthenticated, rate-limited to 20 per address
per 10 minutes, `{ identifier } → { email }`:

- The identifier contains `@` → returned trimmed and lowercased, unchanged. This
  is not advertised in the UI; it exists so accounts that predate this change,
  and any account whose username claim was lost to the race above, can still
  sign in while they adopt a username.
- Otherwise look up `User.username` and return that user's email.
- **Not found, or found with a null email → return `<identifier>@unresolved.invalid`.**

That last branch is the enumeration defense and the reason the route can be
public. `.invalid` is reserved by RFC 2606 and can never belong to a real
account, so `signInWithPassword` fails with precisely the same
`error.credentials_rejected` message whether the username was wrong or the
password was. The route itself returns 200 in every case and leaks nothing.

### Web changes

- `LoginForm`: the email `TextField` becomes a username field — `name="username"`,
  `type="text"`, `autoComplete="username"`, `User` icon
  ([login-form.tsx:27-35](packages/web/src/app/(v2-auth)/auth/login/_components/login-form.tsx#L27-L35)).
- `SignupForm`: one added required `TextField` for username, placed between name
  and email
  ([signup-form.tsx:43-59](packages/web/src/app/(v2-auth)/auth/signup/_components/signup-form.tsx#L43-L59)).
  Nothing else about signup changes.
- `credentialsSchema` and `signupSchema` in `actions.ts` extend with
  `username: usernameSchema`.
- Welcome screen: `signed_in_as` prefers the username over the email when one is
  set, and renders the "choose your username" form when it is null.
- New `en` and `ko` keys ([auth.json](packages/i18n/src/locales/en/auth.json)):
  `field.username`, `field.username_placeholder`, `field.username_hint`,
  `error.username_taken`, `welcome.choose_username*`, and
  `validation.username_invalid`. `divider.or_with_email`,
  `error.credentials_rejected`, and `validation.credentials_invalid` are reworded
  off "email". Gated by `pnpm --filter @cove/web i18n:check`.

### What deliberately does not change

Supabase email verification, password reset, email change, the OAuth callback
([callback/route.ts](packages/web/src/app/(v2-auth)/auth/callback/route.ts)),
the OAuth onboarding intent, invitations, join requests, and every guard in
`(v2-studio)`. The username is a lookup key in front of an unchanged
authentication flow, not a new credential.

## Effort

Small — roughly half a day. One nullable column and index, one shared schema,
three thin oRPC routes, one metadata field threaded through
`verifyAccessToken` and `bootstrap`, two form fields, and translations. The only
parts worth care are that `bootstrap` must never overwrite an existing username
from a token claim, and that the unknown-username branch stays indistinguishable
from a wrong password.

## Verification

- Shared unit tests for `usernameSchema`: casing, length bounds, leading and
  trailing separators, reserved names.
- `verifyAccessToken` tests: a valid `metadata.username` is surfaced; a
  malformed or non-string one yields `null` rather than propagating.
- `bootstrap` tests: the username is stored on first create; a `P2002` collision
  creates the row with `username: null` instead of throwing; a second bootstrap
  never overwrites an existing username from a changed claim.
- `resolveSignInEmail` tests: an email passes through, a known username maps to
  its email, and an unknown username returns an `.invalid` address with the same
  status and shape as a hit.
- `setUsername` tests: succeeds once, then rejects with `USERNAME_ALREADY_SET`.
- Playwright: sign up with a username, sign out, sign back in with username +
  password, and confirm one wrong password and one unknown username produce the
  identical error; a duplicate username is refused at signup before any account
  is created.
- `pnpm typecheck` and `pnpm --filter @cove/web i18n:check`.
