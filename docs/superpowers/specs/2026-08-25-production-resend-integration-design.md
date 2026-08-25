# Production Resend Integration Design

**Status:** Approved for specification  
**Date:** 2026-08-25  
**Scope:** Cove Studio v2 transactional email only

## 1. Purpose

Cove Studio v2 needs production email delivery before it can launch on the
Contabo deployment. Resend will deliver both categories of transactional mail:

- academy invitation mail created by the Cove NestJS API; and
- authentication mail created by Supabase Auth, including signup confirmation
  and password recovery.

The integration must remain safe across process restarts, provider retries,
duplicate webhooks, and uncertain network outcomes. It must report delivery
state no more strongly than the available evidence and must not expose email
credentials, invitation links, or recipient addresses in public configuration
or logs.

## 2. Existing state

The codebase already contains most of the application-owned delivery boundary:

- `HttpEmailSender` sends plain-text mail through `POST /emails` on the Resend
  HTTP API.
- `LoggingEmailSender` is the local-development sink.
- `InvitationDeliveryService` persists one durable delivery-attempt row per
  send or resend.
- `DeliveryWebhookController` receives provider events at
  `/api/webhooks/email`, retains the raw request body, verifies the Svix
  signature, and deduplicates events by provider event ID.
- production environment validation requires the email API key, sender, and
  webhook secret.

The production gaps are:

- the committed API environment template does not document the required email
  or Redis variables;
- send requests do not carry an idempotency key;
- HTTP error classification is based only on status class and does not account
  for Resend's typed errors;
- webhook normalization does not completely or accurately cover Resend's
  current event shapes;
- the production Resend domain, keys, webhook, Supabase SMTP settings, DNS, and
  end-to-end verification have not been configured;
- there is no production operations checklist tying Resend to the Contabo
  deployment.

The Resend account was inspected on 2026-08-25. It contained no verified
domains, API keys, or sent mail, so this design introduces the first production
configuration and does not need a legacy migration.

## 3. Goals

- Send Cove invitation mail from a verified Cove-controlled address.
- Send Supabase confirmation and password-recovery mail through Resend.
- Keep application and Supabase credentials separate and least-privileged.
- Prevent duplicate invitation mail for one delivery attempt.
- Authenticate and deduplicate provider callbacks.
- Model delayed, delivered, bounced, suppressed, complained, and failed events
  honestly.
- Make missing production configuration fail at startup rather than during the
  first real invitation.
- Deploy without operating an SMTP server on Contabo.
- Provide a repeatable staging and production verification procedure.

## 4. Non-goals

- Marketing broadcasts, newsletters, contact lists, or unsubscribe management.
- Replacing Supabase Auth or implementing custom authentication tokens.
- Replacing Supabase Auth Hooks with a Cove-owned auth-email service.
- HTML invitation redesign or React Email templates.
- Moving DNS hosting away from Gabia.
- Moving the existing MVP or changing the root-domain cutover plan.
- Persisting open or click tracking for transactional mail.
- Running Postfix, Mailcow, or any other mail transfer agent on Contabo.

## 5. Production origins and identity

The integration assumes these production origins:

| Purpose | Origin or domain |
|---|---|
| Marketing/home application | `https://coveedu.com` |
| Cove Studio v2 | `https://cs.coveedu.com` |
| NestJS API | `https://api.coveedu.com` |
| Resend sending domain | `mail.coveedu.com` |
| Transactional sender | `Cove Studio <no-reply@mail.coveedu.com>` |
| Resend webhook | `https://api.coveedu.com/api/webhooks/email` |

`mail.coveedu.com` is a sending-only subdomain. It isolates transactional-mail
reputation from the root domain and does not serve the web application. Links
inside messages use `https://cs.coveedu.com`, never the sending subdomain.

## 6. Architecture

### 6.1 Cove invitation mail

```text
Manager creates or resends invitation
  -> NestJS commits invitation and delivery attempt
  -> InvitationDeliveryService builds a plain-text message
  -> HttpEmailSender calls the Resend HTTPS API
  -> Resend returns a provider message ID
  -> Cove records SENT
  -> Resend posts signed delivery events
  -> Cove records DELIVERED, BOUNCED, or FAILED
```

The provider accepting a request means `SENT`, not `DELIVERED`. Only an
authenticated `email.delivered` webhook may produce `DELIVERED`.

### 6.2 Supabase authentication mail

```text
User signs up or requests password recovery
  -> Supabase Auth creates the single-use auth link
  -> Supabase connects to Resend SMTP
  -> Resend sends from no-reply@mail.coveedu.com
  -> User follows a link back to cs.coveedu.com
```

Supabase remains the sole authority for confirmation and recovery tokens. The
Cove API never receives or reconstructs those tokens.

### 6.3 Contabo boundary

Contabo runs the Cove applications but no SMTP server. The NestJS process needs
outbound HTTPS access to Resend. Supabase connects to Resend SMTP independently
of Contabo. The reverse proxy exposes the signed webhook over HTTPS and proxies
it to NestJS on its private application port.

Only public ports 80 and 443 are required for the applications. SSH is
restricted separately. Redis, Next.js ports, and the NestJS port are not
internet-accessible.

## 7. Resend domain and Gabia DNS

The operator adds `mail.coveedu.com` in the Resend Domains dashboard. Resend
then generates the authoritative SPF, DKIM, and MX values. Those exact values
are copied into Gabia DNS; the specification deliberately does not hard-code
provider-generated record values.

The DNS operation must:

- add only the records generated for `mail.coveedu.com` and its return path;
- preserve every existing `coveedu.com` record used by the MVP;
- avoid creating a second conflicting SPF record at the same hostname;
- use a trailing dot for an MX target if Gabia would otherwise append
  `coveedu.com` to the provider hostname;
- wait until Resend reports both SPF and DKIM verified; and
- add a DMARC policy for the sending subdomain after basic verification, first
  in monitoring mode and only later with enforcement after delivery evidence is
  reviewed.

No production key is created or deployed until the sending domain is verified.

## 8. Credentials and configuration

### 8.1 Cove API credential

Create a Resend key named `Cove Studio Production API` with **Sending access**
restricted to `mail.coveedu.com`. Store it only in the production secret source
used by the Contabo deployment.

The NestJS production environment contains:

```dotenv
EMAIL_API_KEY=re_replace_with_production_sending_key
EMAIL_FROM="Cove Studio <no-reply@mail.coveedu.com>"
EMAIL_WEBHOOK_SECRET=whsec_replace_with_production_webhook_secret
WEB_ORIGIN=https://cs.coveedu.com
```

The values remain server-only and must never use a `NEXT_PUBLIC_` prefix.

### 8.2 Supabase SMTP credential

Create a second sending-only Resend key named `Cove Studio Supabase SMTP`, also
restricted to `mail.coveedu.com`. Configure it only in the Supabase dashboard:

```text
Host: smtp.resend.com
Port: 465
Username: resend
Password: <Cove Studio Supabase SMTP key>
Sender name: Cove Studio
Sender email: no-reply@mail.coveedu.com
```

The Supabase SMTP key is not copied to the repository or Contabo. Separate keys
provide separate audit trails and allow either integration to be rotated or
revoked without interrupting the other.

### 8.3 Supabase URL configuration

Production Supabase Auth uses:

```text
Site URL: https://cs.coveedu.com
```

Its redirect allowlist contains the exact callback and recovery URLs exercised
by the current v2 flows. The implementation plan must derive these routes from
the current application rather than inventing wildcard redirects. Wildcard
production redirects are forbidden.

### 8.4 Template and example files

`packages/api/.env.example` documents every API, Redis, monitoring, judge, and
email variable required by the current environment schema, using placeholders
only. No real token or secret enters Git.

Production deployment documentation identifies which values belong in the
Contabo secret environment and which belong exclusively in Supabase or Resend.

## 9. Application changes

### 9.1 Provider-neutral message contract

The `EmailSender` boundary remains provider-neutral. `EmailMessage` gains a
required idempotency key for real sends. The invitation delivery attempt ID is
stable and unique, so the delivery service uses:

```text
invitation-delivery/<attempt-id>
```

The value is bounded below Resend's 256-character limit. The local logging
sender accepts the same field but does not log it.

### 9.2 Resend request

`HttpEmailSender` continues to call `POST https://api.resend.com/emails` with a
10-second timeout and adds the `Idempotency-Key` header. A repeated request for
the same delivery attempt therefore cannot create a second message within
Resend's 24-hour idempotency window.

The application performs no unbounded retry loop. It may repeat one uncertain
request immediately with the same idempotency key when a transport failure or
retryable provider response occurs while the working invitation token is still
available. After that bounded attempt, the durable delivery row remains honest
and the existing manager resend flow creates a fresh attempt and token. The raw
invitation token is never persisted to make background retries possible.

### 9.3 Typed error classification

The sender parses only Resend's documented error `name` or `type` field and
maps it to a stable internal failure code. Provider prose is neither persisted
nor displayed.

Retryable outcomes include:

- network failure or timeout;
- HTTP `429`;
- HTTP `5xx`; and
- `concurrent_idempotent_requests`.

Permanent outcomes include:

- invalid or unverified sender domain;
- invalid recipient or request validation;
- missing, invalid, or restricted API key; and
- `invalid_idempotent_request`, because the same key with a different payload
  is a programming/configuration error.

Unknown `4xx` responses are permanent. Unknown `5xx` responses are retryable.
Logs contain the stable code and a masked recipient, not the response body.

## 10. Webhook processing

### 10.1 Registration

After the production API is reachable over HTTPS, register
`https://api.coveedu.com/api/webhooks/email` in Resend for:

- `email.sent`;
- `email.delivered`;
- `email.bounced`;
- `email.failed`;
- `email.suppressed`; and
- `email.complained`.

`email.delivery_delayed` may also be subscribed for diagnostics, but it must
not move an attempt to a terminal failed state because it represents a
temporary condition.

### 10.2 Authentication and acknowledgement

The controller verifies the signature against the exact raw body using the
`svix-id`, `svix-timestamp`, and `svix-signature` headers. Missing configuration
returns service unavailable; missing headers or a bad signature returns a bad
request. A valid event returns `200`, as required by Resend's webhook contract,
including an unknown event or a message ID not owned by Cove, so provider
retries do not become an information oracle.

### 10.3 Normalization

The Resend adapter explicitly normalizes current Resend event envelopes:

| Resend event | Cove result |
|---|---|
| `email.sent` | `SENT` |
| `email.delivered` | `DELIVERED` |
| `email.bounced` | `BOUNCED` with a stable bounce code |
| `email.failed` | `FAILED` with a stable failure code |
| `email.suppressed` | terminal `FAILED` with `suppressed` |
| `email.complained` | terminal `FAILED` with `complained` |
| `email.delivery_delayed` | acknowledged with no terminal transition |
| open, click, domain, contact, or unknown event | ignored |

Adverse terminal evidence (`bounced`, `suppressed`, or `complained`) must not be
discarded merely because a delivered event arrived first. The transition rule
will explicitly allow later adverse evidence to replace a positive state while
continuing to reject ordinary out-of-order regressions.

Provider-specific nested fields are normalized at the controller boundary.
Shared contracts and services receive only the small Cove event vocabulary.

### 10.4 Deduplication and ordering

Resend webhooks are at-least-once and are not guaranteed to arrive in order.
The existing unique `lastEventKey` mechanism continues to use `svix-id` for
deduplication. State transitions only strengthen evidence, except for the
explicit adverse-evidence rule above.

Events for Supabase-auth messages share the same Resend account but have no Cove
invitation delivery attempt. They are authenticated, acknowledged, and ignored
by invitation tracking.

## 11. Security and privacy

- API and SMTP keys use sending-only, domain-restricted permission.
- The Cove API and Supabase use separate keys.
- Keys and webhook secrets are stored only in their runtime secret stores.
- Keys are rotated by creating and deploying a replacement before revoking the
  old key.
- Webhook verification always uses the raw body.
- Invitation tokens never appear in logs and remain stored only as hashes.
- Recipient logging continues to use `maskEmail`.
- Provider response prose is not persisted because it can contain recipient or
  diagnostic data unsuitable for user-visible records.
- The public webhook has no session authentication because Resend is the
  caller; its Svix signature is the authentication boundary.
- Rate limits on manager resend operations remain in force.
- SPF, DKIM, and DMARC are verified before production mail is enabled.

## 12. Failure and recovery behavior

| Failure | Behavior |
|---|---|
| Resend unavailable or times out | Bounded same-key retry; then remain honest and visible rather than claiming sent |
| API key invalid | Permanent failure with stable configuration code |
| Domain unverified | Permanent failure; deployment smoke test fails |
| Provider accepts mail but response is lost | Same idempotency key prevents a duplicate during bounded retry |
| Webhook signature invalid | Reject without changing delivery state |
| Duplicate webhook | Unique event key makes the duplicate a no-op |
| Webhooks arrive out of order | Evidence transition rules prevent regression |
| Delayed event | No terminal failure |
| Bounce, complaint, or suppression | Terminal adverse state; no automatic blind retry |
| Contabo process restarts | Persisted attempt and provider IDs survive in PostgreSQL |
| Supabase SMTP fails | Supabase reports auth-mail failure; Cove does not mint substitute auth tokens |

An invitation whose delivery outcome is uncertain never causes the invitation
transaction itself to disappear. The manager sees its delivery state and may
use the existing resend action, which rotates the token and creates a new
attempt.

## 13. Testing

### 13.1 Unit and contract tests

- The HTTP sender includes authorization, content type, sender, recipient,
  subject, text body, timeout, and idempotency headers.
- Logging sender and HTTP sender satisfy the same contract.
- Resend success returns the provider message ID.
- `429`, representative `4xx`, representative `5xx`, timeout, and typed
  idempotency errors map to the intended retry class and stable code.
- Realistic Resend webhook fixtures normalize sent, delivered, bounced, failed,
  suppressed, complained, and delayed events.
- Bad signatures, missing signature headers, and modified raw bodies fail.
- Duplicate delivery and out-of-order delivery remain idempotent.
- Adverse evidence can override an earlier delivered state without allowing an
  ordinary state regression.
- Unknown and Supabase-owned message IDs return success without mutation.
- Production environment validation rejects missing email variables.

No automated test sends a real email.

### 13.2 Staging verification

After DNS verification and before production traffic:

1. Deploy the API and web app to their production-shaped HTTPS origins.
2. Register the staging/production webhook and copy its signing secret into the
   API environment.
3. Send an academy invitation to a controlled address.
4. Confirm Resend accepted it and Cove records `SENT`.
5. Confirm the signed webhook advances it to `DELIVERED`.
6. Exercise a controlled bounce and confirm the manager sees an adverse state.
7. Create a new Supabase password account and complete email confirmation.
8. Request password recovery and complete the existing recovery flow.
9. Resend an invitation, confirm the new link works, and confirm the old link is
   rejected.
10. Replay a webhook and confirm the state does not change twice.

### 13.3 Launch smoke test

Immediately after the Contabo production deployment:

- API health is green through `https://api.coveedu.com`;
- the webhook endpoint rejects an unsigned request;
- one controlled invitation reaches the inbox;
- one controlled signup-confirmation email reaches the inbox;
- one controlled password-recovery email reaches the inbox;
- all links use HTTPS and return to `cs.coveedu.com`;
- no secret or invitation token appears in application logs; and
- Resend and Cove report compatible delivery states.

## 14. Rollout order

1. Implement and test the provider adapter hardening locally.
2. Update the committed environment template and production runbook.
3. Add `mail.coveedu.com` in Resend.
4. Add the generated SPF, DKIM, and MX records in Gabia without changing MVP
   records.
5. Wait for Resend verification.
6. Create the two domain-restricted sending keys.
7. Configure Supabase custom SMTP and exact production redirect URLs.
8. Deploy Cove API and web to Contabo with production secrets.
9. Register the Resend webhook against the live HTTPS API.
10. Deploy the webhook secret and restart the API.
11. Run staging/production smoke tests.
12. Enable real invitation delivery only after all checks pass.

The webhook cannot be registered usefully before the public HTTPS API exists,
and production mail must not be enabled before domain verification and smoke
testing.

## 15. Operational runbook

The deployment documentation must include:

- where each key lives and who consumes it;
- how to rotate the Cove API key without downtime;
- how to rotate the Supabase SMTP key;
- how to rotate the webhook secret and update Contabo;
- how to recognize provider outage, invalid-key, bounce, suppression, and
  signature failures from stable logs;
- how to replay a webhook safely;
- how to verify DNS and sender identity after a DNS change.

Alerts are initially operational checks rather than a new monitoring product:
operators review API errors, queued/failed invitation attempts, and the Resend
dashboard during launch. Automated alerting can be added with the wider Contabo
observability work.

## 16. Acceptance criteria

1. `mail.coveedu.com` is verified by Resend through Gabia-managed DNS without
   breaking the current MVP.
2. Invitation emails send through the Resend API from
   `Cove Studio <no-reply@mail.coveedu.com>`.
3. Supabase confirmation and recovery emails send through Resend SMTP using a
   different key.
4. All user-facing email links resolve to the exact allowlisted v2 HTTPS routes
   on `cs.coveedu.com`.
5. The Contabo deployment runs no SMTP server and requires no public mail port.
6. A single invitation delivery attempt cannot produce duplicate messages
   during a retry within Resend's idempotency window.
7. Signed webhook events update only the matching Cove invitation attempt.
8. Duplicate, unknown, and out-of-order events are safe.
9. Delayed delivery is not falsely reported as permanent failure.
10. Bounces, suppressions, complaints, and provider failures are visible and do
    not trigger blind automatic retries.
11. Missing production email configuration stops the API at startup.
12. Real secrets never enter Git, browser-visible environment variables, or
    application logs.
13. Unit, integration, staging, and production smoke verification pass before
    public launch.
