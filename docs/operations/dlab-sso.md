# DLAB OS student SSO

Implementation branch: `feat/dlab-os-sso`. Design: [SSO connection spec](../superpowers/specs/2026-10-16-dlab-os-sso-connection-design.md).

## Release scope

Phase A implements controlled student login, campus/user PUT updates, managed identity provisioning, Supabase session activation, and account eligibility checks. It does not implement `GET /v1/courses`, enrollment import, automatic staff privileges, or existing-account conversion. Do not tell OS that the full v1.2.1 contract is ready.

The feature defaults to disabled. An empty `DLAB_SSO_ALLOWED_EXTERNAL_USER_IDS` permits no login. Use one new controlled OS student for our first joint test; never guess an external campus ID, merge by name, or silently convert an existing password account.

## Before enabling

1. Confirm Finn registered `https://cs.coveedu.com/sso/callback` and request a controlled test student plus its external user and campus IDs. The OS base is `https://dlab-os.onrender.com/v1`; the host-only message does not remove `/v1`.
2. Reissue the credentials shared in conversation and store replacements privately. Never put them in this runbook, tickets, screenshots, commands pasted into shared threads, or Git.
3. Apply the additive migration with the existing release workflow, not against a database selected implicitly from a local shell.
4. Review and install `deploy/sql/dlab-auth-guard.sql` in the Supabase project as the project owner. This is a separate provider-side guard, deliberately not part of the normal application migration. It prevents local password/email/alternate-provider changes for managed auth identities. Supabase may generate an unknown internal password hash during passwordless admin creation; the guard permits that initial value and blocks subsequent changes. Cove never supplies a password when provisioning a DLAB user. Validate its behavior against the actual project before real students use SSO. Do not remove it while managed sessions are active.
5. Resolve the cookie-contract decision with Finn: the reference requests HttpOnly session cookies, while Cove's existing Supabase browser integration requires JS-readable session cookies. The transaction cookie is HttpOnly, Secure in production, SameSite=Lax. This implementation preserves normal Supabase session cookies. A stricter session-only HttpOnly requirement needs a separate BFF redesign; do not claim compatibility without agreement.
6. Validate the actual Supabase bridge with the controlled student: passwordless admin creation, admin magic-link generation without email dispatch, server-side OTP token-hash verification, session ID, refresh, and browser session compatibility. Local OS/Supabase mocks do not prove this live behavior.

## Server configuration

API private env file:

```dotenv
DLAB_SSO_ENABLED=true
DLAB_OS_BASE_URL=https://dlab-os.onrender.com/v1
DLAB_CLIENT_ID=cove
DLAB_REDIRECT_URI=https://cs.coveedu.com/sso/callback
DLAB_SSO_ALLOWED_EXTERNAL_USER_IDS=<verified-test-external-user-id>
DLAB_CLIENT_SECRET=<private-issued-secret>
DLAB_INBOUND_SERVER_KEY=<private-independent-inbound-key>
```

Studio private env file:

```dotenv
DLAB_SSO_ENABLED=true
```

Keep the existing matching `BFF_SHARED_SECRET` and Redis configuration. DLAB secrets live on the API server only. No new `NEXT_PUBLIC_*` setting is required. This is a runtime server flag; ordinary social/password login remains available for external users.

`deploy/scripts/check-dlab-config.py` validates flag agreement and required values without printing credentials; production preflight calls it. The allowlist is a controlled rollout boundary, not proof that the remaining production gates have passed.

## Campus registration and verified mapping

DLAB OS sends a Bearer-authenticated campus PUT to `https://api.coveedu.com/v1/campuses/{external_campus_id}` with the v1.2.1 body and UUID `X-Request-Id`. Campus upsert stores source information without creating a Cove academy. It is safe for a user PUT to arrive before mapping; login is refused until mapping exists.

Select a verified existing active academy of kind `ACADEMY` (an isolated test academy is preferred until the user chooses otherwise), then run the mapping command with IDs, using an appropriately configured operator shell:

```bash
pnpm --filter @cove/api dlab:map-campus <external-campus-id> <academy-uuid> <platform-operator-user-uuid>
pnpm --filter @cove/api dlab:map-campus <external-campus-id> <academy-uuid> <platform-operator-user-uuid> --apply
```

The first command is a dry run. The second records the actor and mapping time. Reassigning an already-mapped campus to a different academy is refused.

## Browser flow

- Start: `GET https://cs.coveedu.com/sso/start`.
- Callback: `GET https://cs.coveedu.com/sso/callback`.
- Login page: runtime-enabled “Log in with DLAB” anchor.
- Invalid/expired/cancelled attempts: clean `/sso/error` destination, with no code or token in the URL.
- Latest login tab wins for a shared browser cookie. Start again after a failed attempt; do not reuse an OS code.

Studio calls trusted API endpoints for transaction creation, code exchange, and session activation. These require the existing BFF secret; the inbound OS key cannot invoke them. The Supabase token hash and activation ticket never appear in browser JSON, redirect URLs, or logs.

A new DLAB student receives an internal username, a placeholder email, and an academy membership. No password, signup form, or ordinary join request is required. Login alone does not enroll the student in a class or expose courses.

## Identity updates and access

`PUT /v1/users/{external_user_id}` and the campus endpoint require exact Bearer authentication and a UUID request ID. Missing or wrong credentials return 401. These public paths are narrowly rewritten by Caddy to internal integration controllers; normal `/api/rpc` is unchanged.

Only explicitly allowlisted students receive login sessions. Other roles can be stored by synchronization but do not automatically acquire staff or platform access. Changes to active status or scope invalidate older session generations. An OS reactivation requires a fresh login; old tokens are not resurrected.

HTTP token verification consults current source eligibility. Source updates publish a Redis notification for sockets to recheck across API instances, with a ten-second periodic backstop. Redis or source database failure fails managed access closed. Repeated status updates are idempotent; timestamped stale events cannot overwrite newer source data.

OS-owned name, grade, role, and identity fields are protected through policy checks and database triggers, including bulk/admin paths. Local security suspension still works. Managed accounts cannot receive a manager-issued password, recovery delivery, or a local email/provider change. User preferences and existing learning history remain local.

## Joint test checklist

- [ ] OS callback registration confirmed; test IDs and academy mapping verified.
- [ ] Provider bridge and credential guard verified against the configured Supabase project.
- [ ] Cookie policy resolved before production use.
- [ ] Login starts through Cove's button and the OS hub's Cove card.
- [ ] Correct academy landing with no password/signup prompt.
- [ ] Exactly one Cove user and membership after repeated logins.
- [ ] Refresh, authenticated API calls, inactivity lease, and logout work.
- [ ] Replay/mismatched state fails; no token/code values recorded.
- [ ] Wrong/missing Bearer key returns 401.
- [ ] Inactive PUT immediately blocks subsequent HTTP calls and disconnects sockets; reactivation requires a new login.
- [ ] Other academies remain inaccessible.
- [ ] If learning is tested, explicitly prepare a normal test class/course assignment first.
- [ ] Ordinary external-user and Google login regression checks pass.

Record actual results separately. The code being built and local tests passing do not mark these live checks as complete.

## Logs and rollback

Caddy access logs omit request URIs and redact Authorization, Cookie, and the BFF header to prevent auth material from being persisted. Do not enable request/response body capture on SSO endpoints. Existing logs from before this change are outside its scope.

Disable the flag on API and Studio to stop new login and inbound acceptance. Existing managed identity eligibility and session-generation checks remain active even when the feature is disabled. To invalidate every session for an affected managed identity, advance its generation through an audited operator action; never delete learning records or remove the binding to bypass restrictions.

A return to a pre-SSO application build requires explicitly invalidating managed Supabase sessions first: that old build has no managed-session gate. Do not roll back to it while leaving usable managed sessions behind. Keep the additive schema and provider guard until reviewed cleanup is safe.
