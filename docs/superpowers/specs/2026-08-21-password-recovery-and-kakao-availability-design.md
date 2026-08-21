# V2 Password Recovery and Kakao Availability

**Date:** 2026-08-21

**Status:** Approved design

**Scope:** The Supabase-backed v2 authentication surface under
`packages/web/src/app/(v2-auth)/auth`, its narrow BFF/API support, English and
Korean authentication copy, and Kakao provider availability. The legacy
Next.js-only authentication routes are unchanged.

## 1. Objective

Complete the dead **Forgot password?** path at `/auth/forgot` with a
production-grade, username-first password recovery flow. Supabase Auth remains
the only password, recovery-token, and session authority.

Keep the existing Kakao OAuth implementation dormant until Cove receives and
configures Kakao credentials. While dormant, Kakao must not appear on login or
signup: no button, logo, label, disabled slot, or unexplained gap.

## 2. Existing Context

The implementation must extend the code that exists rather than introduce a
second authentication system:

- [`auth/actions.ts`](../../../packages/web/src/app/(v2-auth)/auth/actions.ts)
  already resolves usernames to Supabase email credentials and owns the v2
  login, signup, and social-auth Server Actions.
- [`login-form.tsx`](../../../packages/web/src/app/(v2-auth)/auth/login/_components/login-form.tsx)
  already links to `/auth/forgot`, but that route does not exist.
- [`callback/route.ts`](../../../packages/web/src/app/(v2-auth)/auth/callback/route.ts)
  is an OAuth/onboarding callback. Password recovery must not pass through it,
  because recovery must not complete OAuth onboarding or begin a student
  session.
- [`SupabaseAuthService`](../../../packages/api/src/auth/supabase-auth.service.ts)
  already owns the secret-key Supabase client and can distinguish an email
  password identity from an OAuth-only identity.
- [`change-password.ts`](../../../packages/web/src/app/(v2-studio)/studio/my-page/_lib/change-password.ts)
  establishes the current minimum length, Supabase error mapping, and session
  revocation behavior for an authenticated password change.
- `socialAuthProviderSchema` already includes `kakao`, and the common OAuth
  action and callback already support it.

## 3. Chosen Approach

Use a username-only recovery request, a trusted BFF-to-API lookup boundary, a
Supabase recovery email, and a dedicated token-hash confirmation route.

The recovery email will contain a Supabase `TokenHash`, not a Cove-generated
token and not access or refresh tokens. A confirmation interstitial exchanges
that hash through `verifyOtp({ type: "recovery" })` only after an intentional
user POST, stores the resulting Supabase session in the existing SSR cookies,
and grants a second, short-lived Cove recovery capability. The password update
requires both.

This is preferred to the alternatives:

- A standard PKCE-only reset link depends on the verifier cookie created in the
  browser that requested recovery. It can fail when the email is opened in
  another browser or device.
- A custom NestJS recovery-token table, password endpoint, or email-token
  exchange duplicates identity behavior already owned and secured by Supabase.
- Sending or returning an email address to the browser would expose Cove's
  username-to-email mapping and widen the account-enumeration surface.

## 4. User Journeys

### 4.1 Request recovery

1. A signed-out user follows **Forgot password?** to `/auth/forgot`.
2. The page uses the existing `AuthCard` layout and asks for **Username** only.
   The field uses `autoComplete="username"` and the shared `usernameSchema`.
3. Invalid format is rejected inline. Format validation is safe because it says
   nothing about whether the username exists.
4. A valid submission calls `requestPasswordRecoveryAction`.
5. The action delegates to a BFF-only API procedure. Neither the browser nor
   the action state receives an account email, identity list, user ID, or
   existence flag.
6. The browser always receives the same accepted state and renders:

   > If an account exists for this username, we sent password reset
   > instructions.

7. The accepted state provides **Back to sign in** and **Send again**. The
   resend control has a 60-second client cooldown for clarity; server and
   Supabase limits remain authoritative across reloads and clients.

Unknown usernames, OAuth-only accounts, accounts without usable email, and
accounts that must not recover through this public flow receive the same page,
status, and copy as a password account.

### 4.2 Open the email

The Supabase recovery template links to:

```text
{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery
```

`requestPasswordRecoveryAction` supplies the exact allowlisted redirect:

```text
${NEXT_PUBLIC_SITE_URL}/auth/recovery/confirm
```

`GET /auth/recovery/confirm` performs these steps:

1. Require a non-empty `token_hash` and the exact `type=recovery`. Do not accept
   an arbitrary `next` destination.
2. Render a minimal, localized **Continue password reset** interstitial. The
   response is not cached, has `Referrer-Policy: no-referrer`, loads no
   third-party resources, and does not verify or consume the hash on GET.
3. Submit the hash in the interstitial's POST body to
   `confirmPasswordRecoveryAction`. Automated email scanners that only follow
   links therefore do not consume the one-time recovery token.
4. The action calls
   `supabase.auth.verifyOtp({ token_hash, type: "recovery" })` using the
   request-scoped SSR server client. On success, the client writes the Supabase
   session cookies.
5. Create a signed `cove_password_recovery` HttpOnly cookie bound to the
   recovered Supabase user ID. It expires after 15 minutes and contains only a
   version, subject, issued-at time, expiry, and random token ID.
6. Redirect to `/auth/reset-password` without copying the hash or type into the
   destination URL.
7. On a missing, malformed, expired, or reused token, redirect to
   `/auth/forgot?error=invalid-link`.

The confirmation response and reset page are dynamic and send
`Cache-Control: no-store`. Ingress and application logging must redact the
confirmation route's query string, and request bodies on this route must never
be logged. Token hashes, session values, and recovery-cookie values must not
enter logs, analytics, error messages, or referrers.

### 4.3 Choose a new password

`/auth/reset-password` uses `AuthCard` and contains:

- **New password**, `autoComplete="new-password"`;
- **Confirm new password**, `autoComplete="new-password"`;
- the existing show/hide control and eight-character minimum;
- a submit button whose pending state prevents duplicate submissions; and
- a link to request a new recovery email when recovery authorization is absent
  or expired.

The page is usable only when both conditions hold:

1. `supabase.auth.getClaims()` validates a current Supabase session; and
2. the signed recovery capability is valid, unexpired, and has the same subject
   as the Supabase claims.

A regular signed-in session is therefore insufficient to reset a password
without the current password. A capability for one user cannot authorize a
different session.

`resetPasswordAction` validates the two password fields, then calls
`supabase.auth.updateUser({ password })`. Password values remain between the
browser's HTTPS form post, the Next.js Server Action, and Supabase; they never
cross the Cove API or enter application logs.

On success the action:

1. clears the recovery capability;
2. calls `supabase.auth.signOut({ scope: "global" })` to revoke refresh-token
   sessions, including the temporary recovery session;
3. clears the local Supabase cookies; and
4. redirects to `/auth/login?reset=success`.

The login page shows a localized confirmation that the password changed and
the user must sign in again. If password update succeeds but global revocation
reports an error, the reset is still complete: clear the local session, show
the same success state, and record a secret-free operational error. Do not ask
the user to resubmit a password change that already succeeded.

Recoverable Supabase errors such as `weak_password`, `same_password`, and
`over_request_rate_limit` map to localized field or form guidance. The recovery
capability remains available after a correctable validation/provider error and
is cleared after success, expiry, subject mismatch, or invalid signature.

## 5. Trusted Recovery Request Boundary

Add a shared contract and BFF-only API procedure:

```ts
auth.requestPasswordRecovery({ username, captchaToken }) -> { accepted: true }
```

The API router must apply `isTrustedBffRequest` before doing lookup or delivery
work. Direct browser calls are forbidden. The normalized username must satisfy
the shared username schema before lookup.

The service performs the following without exposing intermediate results:

1. Look up `User` by normalized username and select only `authUserId`, `email`,
   and `status`. `SUSPENDED` and `DELETED` records are not usable recovery
   targets; `ACTIVE` and `PENDING_PROFILE` password identities are eligible.
2. For a matching usable user, call
   `SupabaseAuthService.describeIdentities(authUserId)` and use the stored email
   only when an `email` password identity exists.
3. For every other case, produce a deterministic, syntactically valid address
   under `unresolved.invalid`, derived from a one-way digest of the normalized
   username. Do not store the raw username in a limiter key.
4. Call Supabase `resetPasswordForEmail` for both real and synthetic addresses,
   with `${WEB_ORIGIN}/auth/recovery/confirm` as `redirectTo` and the validated
   CAPTCHA token forwarded in the request.
5. Return `{ accepted: true }` for known, unknown, social-only, suspended,
   deleted, and non-deliverable accounts, and for provider responses that would
   reveal those distinctions.

The Supabase call uses a non-persisting, server-only client. It must not mutate
an end-user session or create PKCE state in the requester's browser.

The router collapses an application rate-limit exception into the same
`{ accepted: true }` contract after skipping delivery. An invalid input shape
may return validation failure. A total dependency outage may return the same
generic accepted UI while recording an operational failure; availability
errors must never become an account-existence oracle.

### 5.1 Abuse controls

Apply all of the following:

- at most 5 accepted attempts per client address per 15 minutes;
- at most 3 attempts per normalized-username digest per hour;
- the Supabase project's recovery-email cooldown and hourly email limits;
- a 60-second client resend cooldown; and
- Supabase-supported CAPTCHA enabled and tested before public production
  rollout, with its token forwarded only to Supabase.

The current in-process `RateLimitService` may enforce the application limits in
a single API instance. A multi-instance production deployment must place an
equivalent shared limiter at the API gateway or move the counters to shared
storage; per-instance maps are not a sufficient global abuse boundary.

Do not log raw usernames or email addresses for recovery. Operational events
may contain request ID, broad outcome category, latency, and whether a request
was limited. Provider error bodies must be sanitized.

### 5.2 Authentication-wide CAPTCHA integration

Supabase's CAPTCHA protection toggle applies to password sign-in and sign-up as
well as password-recovery requests. Cove therefore treats Turnstile as one
shared authentication control rather than a forgot-password-only widget.

When `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is configured:

- login, signup, and forgot-password forms render the same explicitly managed
  Turnstile challenge;
- the primary submit button remains disabled until the challenge yields a
  token;
- each Server Action trims the token, bounds it to 4096 characters, and passes
  it only to the corresponding Supabase Auth call as `captchaToken`;
- every submission, whether accepted or rejected, invalidates the client copy
  and remounts the challenge so a single-use token is never submitted twice;
- expiry, timeout, script failure, and Turnstile error callbacks clear the
  token and show localized security-check guidance; and
- Supabase CAPTCHA failures are not translated as invalid credentials. Login
  and signup return a localized security-check error without exposing provider
  details.

When the site key is absent, no CAPTCHA markup, hidden input, or disabled slot
is rendered. This absence is allowed only for local development or a controlled
rollback where Supabase CAPTCHA protection is also disabled. A deployment must
never enable Supabase CAPTCHA while omitting the matching frontend site key.

The widget remains presentation-only. Cove does not store the Turnstile secret
or call Siteverify directly; Supabase owns server-side token validation using
the secret configured in Authentication > Bot and Abuse Protection. The
Turnstile secret must not appear in Cove environment files, logs, or client
bundles.

## 6. Recovery Capability

The Cove capability prevents an ordinary authenticated user from visiting the
reset page and using `updateUser({ password })` without their current password.

- Cookie name: `cove_password_recovery`.
- Attributes: `HttpOnly`, `SameSite=Lax`, `Path=/auth`, `Max-Age=900`, and
  `Secure` in production.
- Signature: `HS256` through the existing `jose` dependency, using the SHA-256
  digest of `"cove:password-recovery:v1\0" + BFF_SHARED_SECRET` as
  domain-separated key material.
- Claims: fixed issuer and audience, version `1`, Supabase user ID as `sub`,
  `iat`, `exp`, and random `jti`.
- Verification: fixed algorithm, issuer, audience, expiry, valid UUID subject,
  and timing-safe subject comparison with the verified Supabase claims.

`BFF_SHARED_SECRET` is already required in production and remains server-only.
Development uses the configured local value; no hard-coded fallback secret is
allowed. Password recovery refuses to issue capabilities when the secret is
missing.

The capability is not a replacement for the Supabase recovery session. Both
are mandatory. Deleting the cookie consumes it from the browser; global
sign-out makes a captured capability useless after a successful reset because
the matching Supabase session is no longer valid.

## 7. Kakao Availability

Add `NEXT_PUBLIC_KAKAO_AUTH_ENABLED` to the web environment schema and example.
Parse it strictly: only the string `"true"` enables Kakao; missing, empty, or
any other value is false.

Move provider presentation into one typed registry consumed by
`SocialLoginButtons`. The Kakao registry item continues to reference:

- provider ID `kakao`;
- label `Kakao`;
- `KakaoIcon`; and
- the common `startSocialAuthAction` flow.

When the flag is false:

- filter Kakao out before rendering, so the grid has no Kakao logo, button,
  label, disabled placeholder, or empty reserved column;
- make the remaining provider grid adapt to the rendered provider count; and
- have `startSocialAuthAction` return the localized `social_unavailable` result
  for a crafted `kakao` request before creating an onboarding intent or calling
  Supabase.

Kakao remains accepted by `socialAuthProviderSchema`. Disabling availability is
a deployment state, not removal of the implementation or provider type.

Enabling the flag is permitted only after all release-gate items pass:

1. the Kakao Developers application and client secret are controlled by the
   deployment owner;
2. Supabase's built-in Kakao provider is enabled;
3. provider and Supabase callback URLs and Cove redirect allowlists are exact;
4. Kakao Account email consent is configured and tested;
5. new signup, repeat sign-in, cancellation, missing-email, and identity-link
   cases pass in staging; and
6. no Kakao secret exists in a `NEXT_PUBLIC_*` value or tracked source file.

The existing
[`Kakao Authentication Design`](./2026-07-22-kakao-authentication-design.md)
continues to define provider setup, data ownership, and identity behavior. This
specification adds only the dormant availability gate.

## 8. Localization and Accessibility

Add matching English and Korean keys under `auth` for:

- forgot-password title, description, username label, submit, pending,
  accepted, resend, resend cooldown, and back-to-login copy;
- invalid/expired recovery link guidance;
- reset-password title, description, new password, confirmation, submit,
  pending, success, mismatch, weak/same password, rate limit, and generic
  failure; and
- the login-page password-reset success message; and
- shared CAPTCHA labels plus login/signup security-check failures.

Requirements:

- status and error messages use an appropriate live region and do not rely on
  color alone;
- validation moves focus to the first invalid field or the form summary;
- pending buttons expose `aria-busy` and remain disabled against duplicates;
- every password visibility control has localized accessible text;
- keyboard order follows the visual order; and
- the generic accepted response is semantically identical in both locales.

Kakao has no "coming soon" copy while hidden. Absence is intentional and does
not need explanation to the user.

## 9. Error and Edge-Case Matrix

| Case | User-visible result | Internal behavior |
| --- | --- | --- |
| Malformed username | Localized validation error | No lookup or email call |
| Unknown username | Generic accepted state | Synthetic `.invalid` email passed to Supabase |
| OAuth-only username/account | Generic accepted state | No password recovery delivered |
| Suspended or deleted user | Generic accepted state | No account-state disclosure |
| Valid password account | Generic accepted state | Supabase sends recovery email subject to limits |
| Request rate limited | Generic accepted state | No delivery; secret-free limited event recorded |
| Missing/malformed link | Invalid-link state | No session or capability issued |
| Expired/reused hash | Invalid-link state | `verifyOtp` rejected; no capability issued |
| Valid link opened on another device | Reset form | Token-hash verification creates SSR session there |
| Normal signed-in session visits reset page | Invalid-link state | Missing recovery capability blocks update |
| Capability/session subject mismatch | Invalid-link state | Capability cleared; no password update |
| Passwords do not match | Inline correction | No Supabase update call |
| Supabase rejects password policy | Localized correction | Capability retained until expiry |
| Password update succeeds | Login success state | Capability cleared; global sign-out attempted |
| Revocation fails after update | Login success state | Local session cleared; operational error recorded |
| CAPTCHA missing, expired, or rejected during login | Security-check error | No session started; credentials are not blamed |
| CAPTCHA missing, expired, or rejected during signup | Security-check error | No account or onboarding state created |
| CAPTCHA script/network failure | Retry security check guidance | Submit remains disabled; no auth request sent |
| Kakao flag false | No Kakao UI | Crafted Kakao start rejected before side effects |
| Kakao flag true but provider fails | Existing safe social error | No raw provider error shown |

## 10. Test Strategy

### 10.1 Shared and API unit tests

- The recovery input contract accepts normalized valid usernames and rejects
  malformed values.
- The recovery procedure rejects non-BFF callers before lookup.
- A password account dispatches to its stored email; unknown, social-only,
  suspended, deleted, and missing-email cases use a synthetic address.
- Every valid request returns exactly `{ accepted: true }` with no account
  metadata.
- IP and username-digest limits are independent and raw identifiers do not
  appear in limiter keys.
- Provider failures do not alter the public response or log secrets.

### 10.2 Web unit/component tests

- Forgot-password validation and accepted states are deterministic.
- Login, signup, and forgot-password forms require a Turnstile token whenever
  the public site key is configured and contain no CAPTCHA markup when it is
  absent.
- Login and signup actions trim and forward a CAPTCHA token to Supabase, reject
  oversized tokens before the provider call, and distinguish CAPTCHA failure
  from invalid credentials or generic signup failure.
- A submission, expiry, timeout, or widget error clears the token and produces
  a fresh challenge before another attempt.
- Recovery-capability signing and verification cover expiry, signature
  tampering, issuer/audience mismatch, malformed subject, and subject mismatch.
- The confirmation GET accepts only `type=recovery`, never consumes the token,
  sends no-store/no-referrer headers, and does not accept open redirect
  parameters.
- The confirmation POST verifies the hash once and strips secrets from its
  redirect.
- The reset action rejects missing session/capability, mismatched passwords,
  weak passwords, and stale capability.
- Successful update clears recovery state and attempts global sign-out.
- A post-update sign-out failure still produces the completed-reset journey.
- With Kakao false, login and signup render Google and Naver with no Kakao text,
  icon, button, empty grid cell, onboarding intent, or Supabase call.
- With Kakao true, the existing Kakao action path remains reachable.
- English/Korean namespace parity and the existing i18n checks pass.

### 10.3 End-to-end and staging tests

1. Request recovery for a fixture password account by username and inspect the
   local/staging email sink.
2. Open the link in a separate clean browser context and reach the reset form.
3. Set a valid new password, confirm return to login, reject the old password,
   and accept the new password.
4. Confirm the recovery link cannot be reused.
5. Confirm an unknown username and a social-only account display the same
   accepted state and disclose no account data in the response.
6. Confirm a normal authenticated session cannot submit the recovery reset
   form.
7. Confirm an expired and a tampered link return safe invalid-link guidance.
8. Confirm fetching the email link without submitting the interstitial does
   not consume it, then submit it once and confirm a second submission fails.
9. Confirm login and signup have no visual or accessible Kakao content when the
   flag is false.
10. Run browser automation with Cloudflare's documented always-pass test site
    key and a dedicated Supabase test project configured with its matching test
    secret. Confirm login, signup, and recovery cannot submit before a token,
    submit once after verification, and require a new token for retry.
11. Confirm CAPTCHA rejection produces security-check guidance rather than an
    invalid-password message.
12. In staging only, enable Kakao after credentials are configured and run the
   provider release-gate cases from Section 7.

Required verification commands include web/API/shared unit tests, web and API
type checks, the v2 auth i18n lint/check, and the focused Playwright recovery
spec.

## 11. Operational Configuration

Before releasing password recovery:

- add `/auth/recovery/confirm` to Supabase's exact redirect allowlist for each
  environment;
- customize and test the Supabase recovery email template with `TokenHash`,
  `RedirectTo`, and `type=recovery`;
- set a suitable recovery-token expiry and email cooldown in Supabase;
- configure the production SMTP sender and verify SPF, DKIM, and DMARC for its
  domain;
- disable click-tracking or link rewriting for authentication email;
- configure edge and application logging to redact query strings for
  `/auth/recovery/confirm` and never record request bodies there;
- configure the public Turnstile site key in the web deployment and the
  matching secret only in Supabase, then enable CAPTCHA and test login, signup,
  and recovery together;
- use a separate Turnstile widget and Supabase project for automated E2E, with
  Cloudflare's matching test site-key/secret pair rather than production keys;
- verify HTTPS, secure cookies, and `Cache-Control: no-store` at the deployed
  edge; and
- alert on sustained recovery-provider failures and abnormal rate-limit volume
  without collecting usernames, emails, or tokens.

Keep `NEXT_PUBLIC_KAKAO_AUTH_ENABLED=false` in every environment until the
Kakao release gate passes. Provider secrets belong only in Kakao Developers and
Supabase, never in Cove web environment variables.

## 12. Rollout and Rollback

Roll out password recovery to local email capture, then staging SMTP, then
production. Verify both same-device and cross-device links before promotion.
The recovery pages may be deployed before the email template, but the login
link must not be considered released until the template and redirect allowlist
are correct.

Rollback disables the `/auth/forgot` entry link and recovery dispatch while
leaving login, signup, OAuth, and current-password changes untouched. Existing
Supabase recovery links will expire naturally; the confirmation route should
remain deployed through the configured token-expiry window so already-sent
valid links do not break during a UI rollback.

Kakao rollback is setting its availability flag to false. The implementation
and provider configuration remain intact for diagnosis, while the UI and start
action close immediately.

## 13. Out of Scope

- Email-first or dual username/email recovery input
- Username reminders or recovery without access to the account email
- Manager-initiated password resets or temporary passwords
- SMS, phone, passkey, or MFA recovery
- A custom password store, recovery-token table, or Cove email-token exchange
- Changing the authenticated My Page password-change design
- Social identity unlinking or account merging
- Kakao messaging, friends, channels, payments, or provider API use beyond
  authentication

## 14. Acceptance Criteria

The feature is complete when:

1. `/auth/forgot` and `/auth/reset-password` provide the approved English and
   Korean journeys with keyboard and screen-reader support.
2. A username/password user can reset a password through an email opened in a
   different browser and then sign in only with the new password.
3. An automated GET of a recovery link does not consume its token; only the
   user's confirmation POST performs verification.
4. Public responses cannot distinguish known, unknown, social-only, suspended,
   deleted, or non-deliverable accounts.
5. Only a valid Supabase recovery session plus a matching, unexpired Cove
   recovery capability can update the password.
6. Tokens, passwords, usernames, emails, and sessions do not appear in URLs
   after confirmation, application logs, analytics, or error copy.
7. Recovery requests have IP, username-digest, Supabase, resend, and CAPTCHA
   abuse controls suitable for the deployment topology.
8. A successful password update consumes recovery state, clears the local
   session, attempts global revocation, and requires a fresh login.
9. Kakao is absent from login and signup and cannot be started while its flag is
   false, while its typed implementation and tests remain intact.
10. With Supabase CAPTCHA enabled, login, signup, and password recovery all
    require fresh Turnstile tokens and report CAPTCHA failure accurately.
11. Kakao becomes available by configuration only after its documented provider
    release gate passes.
12. Focused unit, integration, i18n, type-check, and Playwright verification is
    green.

## 15. Primary References

- [Supabase password-based authentication and password reset](https://supabase.com/docs/guides/auth/passwords)
- [Supabase `resetPasswordForEmail`](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail)
- [Supabase email templates and server-side token-hash verification](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Supabase SSR advanced guide](https://supabase.com/docs/guides/auth/server-side/advanced-guide)
