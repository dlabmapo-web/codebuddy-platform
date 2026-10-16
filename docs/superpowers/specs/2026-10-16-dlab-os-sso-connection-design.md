# Cove v2 — DLAB OS SSO connection

Date: 2026-10-16 (Asia/Tashkent)  
Status: Draft for user review; no application implementation or production verification  
Reviewed branch: `feat/cove-studio-v2` at `89327b88`  
Contract: DLAB OS integration v1.2.1

## 1. Outcome

A DLAB student opens Cove from the OS hub or Cove's login page, authenticates at DLAB OS, and lands in the correct Cove academy with a normal Supabase session. Repeated logins reuse the same Cove account. Missing campus mapping, invalid state, inactive identity, or failed provisioning must not grant access.

The immediate milestone is one controlled test student completing this flow with us. A successful redirect alone does not count: authenticated API calls, refresh, student inactivity policy, logout, and academy isolation must work.

This spec implements the login connection first. It does not claim that campus, course, enrollment, staff, and reporting integration are all complete when the first login works.

## 2. Evidence and source precedence

The supplied messages establish that Finn has issued `client_id=cove` and a client secret, and identified `dlab-os.onrender.com` as the OS host. The v1.2.1 contract supplies the HTTPS scheme and `/v1` prefix. Credential issuance is not evidence that the callback is registered or a test student exists.

No secret values belong in this file, fixtures, commits, screenshots, request examples, or test evidence. Existing handoff wording that says credentials have not yet been issued is historical as of October 15.

Reference ZIP: `TalkFile_dlab-integration-spec-v1.2.1-20261014.zip`  
SHA-256: `f8f8d6dc3bc1d82996e92cc5b4a83a26b91f781c04758afed0a1e2769e89d2ae`

Read `api.yaml` and `contract.dbml` as the integration contract. The reference JS files are incomplete examples, not production code: account/session issuance is intentionally omitted, and the example's unrestricted `return_to` must not be copied.

### Relevant v2 implementation

| Area | Files inspected | Design implication |
| --- | --- | --- |
| Identity validation | `packages/api/src/auth/supabase-auth.service.ts`, `auth.types.ts` | HTTP and sockets expect Supabase JWTs and a Supabase session ID. |
| Account bootstrap | `packages/api/src/auth/auth.service.ts` | Existing bootstrap trusts some client-writable profile metadata; DLAB-owned data needs a separate authoritative path. |
| Browser and SSR auth | `packages/web/src/lib/supabase/{client,server,proxy}.ts`, `src/proxy.ts`, `src/lib/orpc{,-server}.ts` | Retain compatible sessions and refresh; do not introduce a second JWT system. |
| Existing callback | `packages/web/src/app/(auth)/auth/callback/route.ts` | Do not pass DLAB codes to `exchangeCodeForSession`; preserve existing social login. |
| Landing | `packages/web/src/lib/academy-access-state.ts`, `routes.ts` | A missing username currently sends users to welcome; managed users need a valid internal username before landing. |
| Student sessions | `packages/api/src/auth/student-session{.service,.router}.ts` | A new Supabase session must receive the existing Redis inactivity lease. |
| Authorization | `packages/api/src/authorization/{academy-access,platform-access}.service.ts` | User, membership, academy, and platform authorization must remain authoritative. |
| Learning access | `packages/api/src/classes/assigned-course-access.ts`, `learn/learning-class-context.service.ts` | A campus membership alone grants no student course access. Class enrollment and course assignment are required. |
| Identity mutation | `packages/api/src/profile/{profile,academy-profile}.service.ts`, `academies/student-credential.service.ts`, `auth/password-recovery.service.ts` | Guard OS-owned fields and all local password issuance/recovery paths. |
| Sockets | `packages/api/src/{monitoring/monitoring.gateway,notifications/notifications.gateway}.ts`, `monitoring/monitoring-revocation.service.ts` | Handshake-only validation is insufficient after an OS deactivation. |
| Persistence | `packages/api/prisma/schema.prisma` | DLAB external IDs must remain text; local IDs are UUIDs. Academy roles and platform admin are separate axes. |
| Deployment | `deploy/caddy/Caddyfile`, `compose.production.yml`, `secrets/{api,studio}.env.example`, `scripts/preflight.sh` | Student origin and API origin differ; Nest currently has `/api` as its global prefix. |

No `docs/adr/` directory exists in the reviewed checkout. The local branch differs from its saved remote reference (one local-only and seven remote-only commits); this was not reconciled. Before implementation, fetch and review the remote delta, preserve the user's untracked files, and branch from the agreed v2 baseline. Do not reset or silently discard either history.

Installed Next.js route-handler and cookie guides were read under `packages/web/node_modules/next/dist/docs/`. Handlers use `app/**/route.ts`, async `cookies()`, and explicit non-cacheable auth responses.

## 3. Scope and approaches

### Recommended: DLAB verification followed by a Supabase session bridge

Keep existing Cove session consumers. The API verifies DLAB's code and provisions the mapped account. A trusted Studio callback completes a server-only Supabase token-hash exchange and writes normal SSR cookies. This concentrates changes around identity provisioning and managed-account policy.

Alternatives considered:

1. Separate Cove JWT/cookie sessions: avoids Supabase bridging, but requires changing SSR, client API calls, sockets, refresh, inactivity, and logout. Rejected for this release.
2. Native Supabase enterprise SSO/federation: potentially useful later, but the supplied DLAB contract is a custom authorization-code/user-info exchange, not a supplied SAML/OIDC provider configuration. Not assumed available.

### Phase A — controlled student SSO and identity updates

- GET start, GET callback, login button, server-only token exchange.
- Verified external campus mapping to an existing active academy.
- Idempotent student identity provisioning and standard Supabase sessions.
- Bearer-protected campus and user PUT endpoints, including inactive updates.
- Managed identity restrictions, session checks/revocation, safe errors, deployment configuration.
- Automated coverage and one jointly observed test-student session.

### Phase B — enrollment and course contract

Implement course listing, template/course mapping, and enrollment reconciliation after agreeing on library versus academy IDs and delivery-class semantics. This is required before declaring the full v1.2.1 integration complete.

### Outside Phase A

Automatic creation of production academies; automatic linking/conversion of existing password accounts; automatic staff or platform-admin grants; enrollment import; synthetic classes; reporting/progress exports; replacing ordinary external-user login; OS-wide logout not described by the contract.

The OS must be told that Phase A does not yet accept enrollment/course calls. Unimplemented methods return explicit not-found/unavailable responses; they must not acknowledge data they did not persist.

## 4. Origins, endpoints, and ownership

| Endpoint | Owner | Purpose |
| --- | --- | --- |
| `GET https://cs.coveedu.com/sso/start` | Studio | Start from a normal browser link. |
| `GET https://cs.coveedu.com/sso/callback` | Studio | Validate transaction, obtain DLAB identity through API, establish session. |
| `GET https://dlab-os.onrender.com/v1/sso/authorize` | DLAB OS | Browser authentication. |
| `POST https://dlab-os.onrender.com/v1/sso/token` | DLAB OS | Server-only code exchange, Basic authentication, JSON body. |
| `POST /api/internal/dlab-sso/transactions` | Cove API | Trusted Studio creates a short-lived login transaction. |
| `POST /api/internal/dlab-sso/complete` | Cove API | Trusted Studio consumes state, exchanges code, provisions identity, returns server-only bridge material. |
| `POST /api/internal/dlab-sso/activate` | Cove API | Trusted Studio binds the newly verified Supabase session to the completed DLAB transaction and eligibility generation. |
| `PUT https://api.coveedu.com/v1/campuses/{external_campus_id}` | Cove API | Bearer-authenticated campus source upsert. |
| `PUT https://api.coveedu.com/v1/users/{external_user_id}` | Cove API | Bearer-authenticated identity source upsert. |

Internal endpoints require the existing trusted-BFF boundary and are never authorized by `DLAB_INBOUND_SERVER_KEY`. The inbound OS key grants only the explicit integration API surface; it cannot mint sessions, access regular RPCs, or perform platform administration.

To preserve `/api` while exposing `/v1`, add a scoped integration controller under `/api/integrations/dlab/v1` internally. Caddy rewrites only the supported public `/v1/campuses/*` and `/v1/users/*` routes to it. Keep `/v1/courses` and `/v1/enrollments/*` unavailable until Phase B. Validate method/path matching and do not rewrite unrelated API paths. Existing oRPC stays at `/api/rpc`.

## 5. Configuration

| Variable | Location | Rule |
| --- | --- | --- |
| `DLAB_SSO_ENABLED` | API and Studio server env | Default false; feature disabled until prerequisites pass. |
| `DLAB_OS_BASE_URL` | API server | `https://dlab-os.onrender.com/v1`; no browser-supplied overrides. |
| `DLAB_CLIENT_ID` | API server | `cove`. |
| `DLAB_CLIENT_SECRET` | API secret store | Issued privately; never public/build-time config. |
| `DLAB_REDIRECT_URI` | API and Studio | Exactly `https://cs.coveedu.com/sso/callback` in production. |
| `DLAB_INBOUND_SERVER_KEY` | API secret store | Independent random secret; exact Bearer verification. |
| `BFF_SHARED_SECRET` | Existing API and Studio env | Existing trusted server boundary, unchanged in purpose. |

Use runtime server config for button availability so enabling SSO does not depend on a secret-bearing client build. Keep secrets out of `NEXT_PUBLIC_*` variables. Local tests use fake OS endpoints via dependency injection; production config must not permit arbitrary hosts or insecure URLs. For a real local browser flow, register its callback first; no assumption that localhost is already allowed.

Redis is required when SSO is enabled: it stores transactions and enforces the existing student inactivity policy. Missing dependencies fail SSO closed without taking down ordinary external-user login. Disabled start/callback return a clear unavailable response and the button is hidden.

## 6. Persistence and source ownership

Add dedicated integration tables rather than overloading legacy fields. Names below are the intended Prisma model boundaries; migration naming follows existing conventions.

### `DlabCampus`

- `externalCampusId`: unique text, max 64.
- Source fields: name, campus type, status, source updated timestamp, received timestamp.
- Nullable unique `academyId`: a verified mapping to a local academy of kind `ACADEMY`; never a library.
- Mapping actor/time audit metadata.

A campus PUT may persist an unmapped campus. It does not automatically select an academy by name or create one. An operator command links the verified external ID to a chosen academy after dry-run confirmation. Callback provisioning refuses an unmapped/inactive campus. A source `active` update cannot undo a local academy suspension.

### `DlabIdentity`

- `externalUserId`: unique text, max 64.
- Nullable unique `userId`: links to a local Cove user once provisioned.
- Source name, grade, raw role text, account status, primary campus ID, campus-ID array.
- Source updated timestamp, received timestamp, source revision and eligibility generation.
- Provisioning status (`PENDING`, `READY`, `FAILED`) and non-sensitive failure code.

Unknown roles remain raw text and are stored successfully. They do not become an administrator role or silently turn an existing staff account into a student. For Phase A, only `student` can receive an automatic new academy membership. Other roles authenticate only to a restricted setup-required result until an explicit permission mapping is approved; they cannot enter academy data. Unknown roles receive no more than student-level authority and no automatic course entitlement.

### Managed membership ownership

Add `DlabMembershipBinding` linking an external identity and mapped campus to the one local academy membership, recording whether it was created by integration and the last applied source revision. Unique identity/campus and unique membership constraints prevent duplicate grants. Treat a pre-existing unbound membership or incompatible role as an explicit conflict requiring operator review.

Primary campus is identity affiliation; the campus array is access scope. If the array is absent, use `[external_campus_id]`; do not turn an explicitly empty array into broad access. A student scope must contain exactly the primary campus. Invalid student scope blocks provisioning. Campus removal or inactive status removes effective integration access while preserving progress/history.

Do not store passwords, OS authorization codes, client secrets, refresh tokens, or raw DLAB responses in these tables. State data lives in Redis, not identity rows.

## 7. Login transaction and state

1. `/sso/start` accepts only a bounded relative `return_to` path, or no destination. Accept only paths under an authorized academy after login. Reject absolute URLs, protocol-relative URLs, backslashes, control characters, double-encoded escape attempts, auth loops, and overlong values; fall back to canonical academy landing.
2. Studio generates independent 32-byte random state and browser-binding values. The API stores a hash-addressed transaction containing the binding hash, validated return path, configured redirect URI, and creation time, with a five-minute TTL. State is not reused across logins.
3. Set a production `__Host-cove-dlab-sso` cookie containing only the binding value: Secure, HttpOnly, SameSite=Lax, Path=/, no Domain, five-minute max age. Development uses a distinct non-`__Host-` cookie when HTTP is unavoidable. A new start invalidates the previous bound attempt; concurrent-tab behavior is documented as latest attempt wins.
4. Respond with a 302 to the fixed OS authorize endpoint, with `client_id`, `redirect_uri`, `state`, and `response_type=code`. The start link is GET; no POST-only requirement or Next Link prefetch side effect.
5. Callback rejects repeated query keys, missing/overlong code or state, missing binding, expired/consumed state, or mismatch. Atomically compare binding and consume the transaction in Redis before external exchange. A mismatched binding must not consume another browser's valid transaction.
6. Handle OS error callbacks by validating/clearing the local attempt and showing a retryable, localized result. No code exchange is attempted without valid state.
7. Use `Cache-Control: no-store` and `Referrer-Policy: no-referrer` on both auth responses. Delete the state cookie on terminal callback responses. Redirect to a clean URL with no code, state, or bridge material.

The state TTL permits time on the login screen; it does not extend the OS authorization code's 60-second lifetime.

## 8. OS code exchange and validation

The API calls the fixed `/sso/token` once with a 10-second timeout, redirect following disabled, no cache, and a fresh `X-Request-Id` UUID.

Headers: Basic authentication of client ID/client secret, `Content-Type: application/json`, and request ID. JSON body contains only `grant_type: authorization_code`, code, and the transaction's exact registered redirect URI.

Validate the direct `SsoUser` response using bounded schemas: required external IDs, name, primary campus, raw role, and account status; optional grade, campus array, and issued timestamp. Unknown optional fields may be ignored. Unknown status values fail closed. Do not require UUID-shaped external IDs.

Persist an inactive source identity/status so subsequent attempts and existing sessions are blocked, then reject session issuance. Ignore OS fields that could change platform role, local IDs, or stored credentials. Do not use a browser-submitted user ID, email, or destination as identity proof.

Treat timeout, invalid JSON, wrong credentials, expired/reused code, or OS errors as terminal for that attempt. Never automatically retry the same code. Logs contain stage, sanitized error code, duration, and request ID, not OS response bodies or authorization material.

`SsoUser.issued_at` is not a source-record version. Keep PUT `updated_at` separate. A callback must not overwrite a concurrent inactive PUT: lock the identity during final reconciliation and compare the source revision captured before exchange. If it changed during login, reject and restart. A stored inactive status requires a newer authoritative active PUT or an explicitly audited reconciliation before reactivation.

## 9. Provisioning and session bridge

### 9.1 Idempotent account provisioning

Reserve/find the DLAB identity by external ID and serialize provisioning with a database reservation plus a Redis lease. A lease uses a random owner token, bounded lifetime, and compare-owner release; a uniqueness constraint remains the final authority. Never hold a database transaction open during a network call.

For a new controlled test identity:

- Create a Supabase user with no password and a server-assigned placeholder address derived from the local reserved user UUID using Cove's existing placeholder helper.
- Mark provider ownership using server-controlled app metadata for diagnostics, but use the database binding for authorization.
- Create the Cove user with the same auth user ID, `emailIsPlaceholder=true`, a valid reserved internal username (`dlab_` plus sufficient random lowercase hex, within existing 30-character rules), source display name, and `platformRole=USER`.
- Do not derive uniqueness or matching from name, grade, phone, or email.
- Persist the managed membership in the verified active academy as `STUDENT`, with no join-request approval workflow.
- Preserve local work, preferences, points, and all unrelated account fields.

Recovery after partial failure must resume the reserved identity, reconcile a known created auth user, and avoid minting a second one. Cleanup deletes only an auth identity created by the failed attempt that is not linked or adopted elsewhere. An outage returns provisioning-unavailable, not a usable orphan session.

Phase A uses an operator-approved new test student. Existing users are not auto-merged. A later audited linking command must prove the external ID and local user match, check unique ownership, and explicitly address old credentials before conversion; preserving an old password silently is not compliant with DLAB-only login.

### 9.2 Preferred bridge, subject to the validation gate below

After successful authoritative provisioning, the API uses Supabase admin `generateLink({type:'magiclink', email: boundAddress})` and verifies that its returned user ID equals the already-bound auth user ID. It does not use the call as an unchecked account-creation shortcut.

Return only the token hash, expected auth user ID, and an opaque one-time activation ticket to the trusted Studio callback with `no-store`; do not return an action link or session material to browser JSON, URL parameters, or logs. Store only the activation-ticket hash in Redis with a 60-second TTL, bound to the external identity, expected auth user ID, completed transaction, and current eligibility generation. Studio calls its per-request SSR client's `verifyOtp({token_hash, type:'email'})`. Verify the resulting session user matches the expected binding before allowing navigation. A mismatch signs out the newly established session and records a security failure.

This uses documented Supabase primitives, but their composition as Cove's DLAB bridge is a design proposal. Before implementing the rest, prove it against the configured project with a passwordless test identity: no email dispatch, valid access/refresh tokens, SSR cookies, usable `session_id`, refresh, and normal browser client operation. Failure blocks this approach; do not fall back to shared passwords, custom signed Supabase JWTs, or browser-exposed admin credentials.

After verification, Studio calls the trusted activation endpoint with the new access token and activation ticket. This endpoint independently verifies the JWT signature and session ID, checks expected user ownership and unchanged/current eligibility, atomically consumes the ticket, and registers the session-to-generation binding. It is the only narrowly scoped path that can validate a not-yet-activated managed session; it must not bypass identity/status checks or grant access based on BFF authentication alone. Ordinary HTTP/socket verification requires an already activated session. This ordering prevents a circular dependency between session activation and the central eligibility gate.

Then call the trusted `studentSession.begin` path with the activated token, load the mapped account and canonical destination. For this student SSO slice, a failed activation or Redis begin rejects login and clears the new session instead of landing in a learning UI that immediately refuses every request. Consumed activation tickets cannot be replayed; lost responses restart the SSO flow.

Keep the existing ordinary Supabase session cookie handling until the cookie-contract decision in §12 is resolved. Only the transaction cookie is unconditionally HttpOnly in this design.

### 9.3 Existing browser sessions

Do not treat an already logged-in browser as proof of the DLAB identity. A valid DLAB callback selects the externally bound identity, rotates to its new session, and never links it to whichever Cove user happens to be signed in.

Clear role-view, invitation, and OAuth-onboarding cookies on successful DLAB login so stale staff/invitation state cannot change the student's landing. Before success, validation failures must not mutate an unrelated existing user's database records. If new session issuance has begun and later fails, sign out that new session and show the DLAB-specific failure.

`AuthService.bootstrap` must recognize managed identities and avoid overwriting OS-owned data from editable token metadata or creating normal academy join requests. Supply the existing valid username so canonical `authDestination` does not route a managed student into username signup. Prefer the verified primary academy destination instead of the first unrelated membership.

## 10. Incoming campus/user synchronization

Use a dedicated guard and contract serializer. Compare a single well-formed Bearer credential in constant time; reject absent, duplicate/ambiguous, wrong, or unsupported authorization with `401` and `{code:'unauthorized', message, request_id}`. Authenticate before returning payload validation details.

Require UUID `X-Request-Id`; validate external ID lengths and body schemas; cap body size; follow contract error fields (`code`, `message`, optional `field`, `request_id`). Return `{ok:true,id?:localId}` only after durable acceptance. Unknown roles are stored, not rejected. Unknown campuses may be staged, but no membership is provisioned until mapping is verified.

Use row locks and unique external IDs for idempotency. If `updated_at` is provided, reject/ignore older events without overwriting newer state; identical timestamp and identical canonical payload is a no-op, conflicting equal-version payload returns `409 conflict`. Missing timestamps are processed in serialized receipt order and explicitly cannot guarantee protection from out-of-order upstream events. Ask OS to include timestamps in production updates.

PUT may store an unprovisioned user without creating a Supabase identity. First SSO login reconciles it. Source fields are updated without altering local learning history or independent security suspensions.

Status is conjunctive: OS active AND local user permitted AND mapped academy active AND effective managed membership permitted. Never restore a local suspension merely because OS reports active. OS suspension and local suspension reasons must be distinguishable; a newer OS reactivation clears only the OS restriction.

## 11. Revocation and managed-account restrictions

Add an integration eligibility check to central token verification for bound managed users. Validate active source status and source eligibility generation as well as the JWT. Keep non-managed accounts unchanged. A Supabase JWT that still verifies cryptographically must not bypass an inactive DLAB binding.

On inactive user/campus or removed scope, commit source changes first, then publish revocation. Extend user-wide disconnection across API instances for notification sockets as well as monitoring; membership monitoring revocation alone does not close every socket. Add periodic eligibility revalidation with a maximum 30-second exposure if an immediate event is missed. Subsequent HTTP calls fail immediately after the committed update. Recheck authorization before completion of state-changing operations; no stale callback may reactivate an inactive account.

Reactivation must not revive old refresh tokens. Track a session-to-eligibility-generation binding keyed by Supabase session ID; new login registers the current generation and centralized verification rejects sessions bound to earlier generations. Repeated login creates a new session lease. Logout clears local Supabase session/cookies; OS global logout is outside the supplied contract.

For managed accounts, enforce OS ownership in backend mutations, not only disabled UI:

- Reject name/grade/campus/role/status edits from profile, academy people, bulk import, and admin mutation paths unless explicitly performing an audited integration reconciliation.
- Reject local password issuance/reveal, recovery dispatch, email change, and identity unlink/link actions that introduce an alternate credential.
- Profile preferences and permitted avatar/work settings remain local.
- Do not infer “has a password” from Supabase's `email` provider label: passwordless bridge identities may also use that provider. Managed-account policy overrides the existing `describeIdentities` assumption.

The browser holds a normal Supabase session. UI/API restrictions alone do not prove a user cannot call Supabase directly to add a password or change auth metadata. The bridge validation spike must identify and test a provider-level enforcement mechanism for managed identities (for example, a supported project-side guard, with its migration and rollback explicitly reviewed). Do not claim strict SSO-only production compliance until this is demonstrated. Controlled test exposure is not production authorization.

## 12. Explicit contract and policy decisions

| Decision | Proposed direction | Required before |
| --- | --- | --- |
| Test campus | Verified external campus ID linked to the user's selected academy. Default to isolated test academy until answered; never guess DLAB Mapo by name. | First real provisioning. |
| Test student | New controlled identity, supplied/coordinated with Finn. Existing account conversion is excluded. | Joint real-OS test. |
| Callback | Exact production redirect URI above; verify Finn registered it. | Browser integration test. |
| HttpOnly session requirement | `session.md` requests HttpOnly session cookies, but current browser Supabase SSR sessions are JS-readable. Preserve compatibility for the proposed bridge and request explicit DLAB acceptance; otherwise select a separate server-session/BFF redesign before production. | Production release. |
| Strict SSO-only credentials | Validate a provider-level guard preventing direct password/email mutation; local forms alone are insufficient. | Production release. |
| Staff mappings | No automatic privileged grants; approve a separate explicit role/campus matrix. | Staff enablement. |
| Course IDs and delivery | Agree library master versus academy course list, template mapping, and class context. | Phase B. |
| Supplied credentials | Store privately and replace conversation-shared secrets before production. No values in this spec. | Production configuration. |

These are explicit release conditions, not hidden implementation defaults. A student-login test can be recorded separately from full contract acceptance. Do not promise production readiness while a production gate remains open.

## 13. Phase B boundaries

Cove's student course access composes `ClassEnrollment` → active `Class` → `ClassCourse` and is reused by catalogs, workspaces, submissions, points, and monitoring. Do not bypass that predicate with “all academy courses” or add a detached enrollment table that grants nothing.

Phase B gets a focused design covering:

- `GET /v1/courses`: authorized catalog scope, `updated_since`, stable `(updatedAt,id)` cursor, `next_cursor`, `server_time`, library retirement/visibility and copy semantics.
- Stable mapping between OS template IDs and explicit local course IDs.
- Individual OS enrollment storage before a user exists.
- `course_id` priority and `400 invalid_field` for unknown IDs; campus ownership validation even for valid UUIDs.
- End-date interpretation in the academy's timezone and effective access checks, with no scheduled-job-only expiry gap.
- An explicit delivery relationship to existing classes, or a deliberately reviewed change to the central access model. Do not fabricate classroom/teacher assignments from the supplied enrollment payload, which contains no class-section ID.
- Withdrawal, completion, duplicates, stale updates, and preserved learning history.

## 14. Implementation boundaries and sequence

| Unit | Responsibility | Suggested location |
| --- | --- | --- |
| Contract schemas | Bounded OS payload parsing and integration errors | `packages/shared/src/integrations/dlab/` |
| DLAB module | OS client, state store, source upserts, provisioning, eligibility policy | `packages/api/src/integrations/dlab/` |
| Session adapter | Privileged Supabase bridge, isolated from browser code | Extend `auth/supabase-auth.service.ts` or a focused service using its module. |
| Source persistence | Integration tables, unique constraints, indexes | Prisma schema and an additive migration. |
| Trusted completion | Internal BFF controllers, separate from inbound key guard | DLAB module. |
| Browser handlers | Start/callback cookies, response headers, safe landing | `packages/web/src/app/(auth)/sso/{start,callback}/route.ts` |
| Managed policies | Source-owned edit restrictions, credential suppression, eligibility checks | Existing auth/profile/people mutation boundaries. |
| Login UI | Runtime-enabled anchor and localized errors | Existing auth components and `packages/i18n/src/locales/{en,ko}/auth.json`. |
| Deployment | Secret examples, preflight, scoped Caddy rewrite and log sanitization | Existing `deploy/` assets and production runbook. |

Implementation order:

1. Reconcile branch baseline; preserve unrelated changes; pin reference contract files in a dedicated integration reference directory if needed.
2. Validate the Supabase bridge and document cookie/credential enforcement outcomes before broad code changes.
3. Add source persistence, verified mapping command with dry-run, and managed-policy services.
4. Add trusted state/completion and inbound campus/user controllers.
5. Add Studio routes and runtime login button; retain existing social/password login regression coverage.
6. Add token eligibility/session generation and socket revocation integration.
7. Validate negative cases, build, deploy with SSO disabled, configure privately, and enable only for the controlled test.
8. Run §16 together; record evidence and unresolved production gates.

## 15. Verification matrix

Use fake secrets and a local fake OS adapter in automated tests. Tests must exercise public trust boundaries, not merely mock every service to reproduce the implementation.

| Area | Required checks |
| --- | --- |
| Start | GET 302; expected fixed host and exact redirect URI; random state; bound cookie; disabled config; unsafe return paths. |
| Callback | Correct login; no state/cookie; mismatch; expired and repeated state; duplicate parameters; latest-tab-wins; concurrent completion only succeeds once. |
| OS exchange | Correct Basic/JSON headers and request ID; direct SsoUser parsing; timeout; 3xx rejection; expired/reused code; malformed JSON; unknown/missing status; no retry. |
| Provisioning | First login; repeated login; concurrent first login; staged PUT user; partial auth creation failure/recovery; valid internal username; identity mismatch stops session creation. |
| Mapping | Unknown campus; library academy refused; inactive/local-suspended academy; invalid student campus array; cross-academy return URL refused. |
| Authorization | No platform elevation; unsupported staff stored with no grant; active session blocked after inactive PUT; reactivation does not revive an old session. |
| Contract PUT | Missing/wrong Bearer 401; body not disclosed pre-auth; request ID errors; idempotent duplicates; stale source update; same-version conflict. |
| Managed identity | OS fields immutable through profile/bulk/admin paths; metadata tampering does not overwrite source; manager cannot issue password; recovery sends nothing to managed user; provider-level credential guard validated. |
| Session | SSR and browser share correct user; refresh works; Redis lease begins; inactivity expires; logout works; one browser switching DLAB identities does not merge accounts. |
| Sockets | Student receives normal authorized realtime; deactivation closes notifications and monitoring across instances, backstop within 30 seconds. |
| Deployment | `/v1` rewrite works only as intended; existing `/api/rpc` unaffected; no credentials in browser bundle or logs; actual cookie behavior recorded. |

Use repository scripts: `pnpm --filter @cove/api test`, `pnpm --filter @cove/web test`, `pnpm typecheck`, targeted lint, relevant Playwright scenarios, `pnpm --filter @cove/web build`, `pnpm --filter @cove/api build`, and deployment validation when routing/config changes. The implementation plan should choose targeted suites first and expand based on changed boundaries. No implementation tests were run for this documentation-only change.

## 16. Joint test session with the user

### Before we start

- Finn confirms exact callback registration and provides a controlled student and its real external campus ID.
- User chooses target academy; operator verifies its ID, slug, kind, and active status and records the campus mapping.
- Credentials are privately configured in the correct environments; no values copied into test evidence.
- A representative academy course is explicitly assigned through an ordinary test class if learning access is to be tested. SSO does not create enrollment by itself.
- The user controls OS login entry; use neither a real student's password nor uncontrolled production data.
- For local real-OS testing, obtain an additional registered callback; otherwise use the deployed production callback and isolated test data.

### Walkthrough

1. User opens a clean browser session and clicks “Log in with DLAB.” We verify the authorize host, callback path, and state presence without saving sensitive query values.
2. User signs in to the controlled OS account. We observe landing in the mapped academy with no Cove signup/password prompt.
3. We verify exactly one linked Cove user and membership, then reload and confirm authenticated API calls and browser session refresh.
4. Log out and repeat from the OS hub's Cove card. Verify the same account/history and a new Supabase session.
5. With the agreed test fixture only, replay the cleaned-up callback attempt and confirm rejection; test missing/wrong inbound key without publishing key values.
6. Finn or the operator sends an inactive user update through the protected integration endpoint. We verify immediate HTTP denial, socket removal, and no bypass by refresh or direct academy URL.
7. Reactivate with a newer source update; require a fresh login and verify the old session stays invalid.
8. Confirm wrong-campus and existing ordinary password/social-login paths remain correctly isolated.
9. If a test class/course was prepared, open it and save a controlled draft to prove the session supports learning. An empty catalog without enrollment is expected, not an SSO identity failure.

Record pass/fail, build SHA, time, request IDs, non-sensitive internal fixture IDs, observed destination and cookie flags, and redacted screenshots in `docs/research/2026-10-16-dlab-sso-connection-test.md`. That report is created during testing; this spec does not fabricate results. Never attach callback URLs with code/state, tokens, credentials, or real student details.

### Acceptance levels

- Controlled SSO test complete: one test student passes identity, session, isolation, logout, and deactivation checks; outstanding production gates are recorded.
- Student SSO production-ready: all Phase A checks pass, cookie-contract and provider credential-policy gates resolved, callback/keys configured, and operational rollback tested.
- Full v1.2.1 integration complete: Phase B's course/enrollment contract and any enabled staff mappings are also implemented and accepted.

## 17. Deployment, observability, and rollback

Use additive database migrations. Update private server env files using the existing deployment workflow; do not commit actual env values. API and Studio must agree on the feature flag and redirect URI. Do not change existing Supabase project, DNS, or ordinary OAuth callback as a shortcut.

Caddy currently records request URIs. Before real testing, configure and verify query-string removal for SSO access logs (or an equivalent scoped log policy), and verify Authorization/Cookie redaction at Caddy, API, error reporting, and traces. Log request ID, stage, duration, and reason code only. Mark all internal bridge responses non-cacheable and disable body capture.

Roll out with SSO disabled, verify ordinary login, migrate, configure mapping and credentials privately, then enable the controlled flow. Do not deploy a second app build merely by placing a new key in a document.

Rollback disables the button, start/callback, and inbound acceptance while retaining centralized restrictions for already-bound inactive managed users. Kill existing managed sessions/advance generations when necessary; disabling SSO must not let old tokens bypass the managed-account check. Restore prior application images only after confirming they cannot accidentally admit managed users; keep bindings and migration data for recovery. Ordinary external accounts continue using existing login. Rollback never deletes learning history or reopens an OS-suspended identity.

## 18. References

- Prior registration handoff: `docs/integration/2026-10-15-dlab-sso-handoff.md` (historical readiness statements).
- Production runbook: `docs/operations/production-deployment.md`.
- Supplied v1.2.1: `api.yaml`, `contract.dbml`, `examples/sso-client/{authorize.js,callback.js,session.md,.env.example}`.
- Supabase admin link generation: https://supabase.com/docs/reference/javascript/auth-admin-generatelink
- Supabase token-hash verification: https://supabase.com/docs/reference/javascript/auth-verifyotp
- Installed SDK evidence: `@supabase/auth-js` 2.110.8 `GoTrueAdminApi.generateLink`, `GoTrueClient.verifyOtp`; installed `@supabase/ssr` cookie defaults declare `httpOnly: false`.

The Supabase documentation establishes the available primitives. It does not certify the complete DLAB-to-Cove bridge, cookie-contract compatibility, or provider-level SSO-only enforcement; those require the explicit validation gates above.
