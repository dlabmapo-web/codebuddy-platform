# Implementation plan — Production Resend integration

**Spec:** `docs/superpowers/specs/2026-08-25-production-resend-integration-design.md`

**Date:** 2026-08-25

## 1. Harden the provider-neutral sender boundary

Files:

- Modify `packages/api/src/manage/email-sender.ts`
- Add `packages/api/src/manage/email-sender.spec.ts`

Work:

- Add a required idempotency key to `EmailMessage`.
- Send it as Resend's `Idempotency-Key` header.
- Parse Resend's typed error response without retaining provider prose.
- Classify transport, rate-limit, server, credential, validation, and
  idempotency failures according to the design.
- Refuse a successful provider response that has no message ID rather than
  inventing an untraceable ID.
- Cover success, headers, safe body, timeout, typed errors, unknown errors, and
  masked logging behavior with tests.

## 2. Pass stable attempt identity into each send

Files:

- Modify `packages/api/src/manage/invitation-delivery.service.ts`
- Add `packages/api/src/manage/invitation-delivery.service.spec.ts`

Work:

- Build `invitation-delivery/<attempt-id>` from the durable attempt row.
- Verify that the sender receives the key and no invitation token is persisted
  or logged.
- Preserve the existing rule that provider acceptance means `SENT`, not
  `DELIVERED`.

## 3. Align webhook handling with Resend

Files:

- Modify `packages/api/src/manage/delivery-webhook.controller.ts`
- Modify `packages/api/src/manage/delivery-webhook.controller.spec.ts`
- Modify `packages/shared/src/memberships/invitation-delivery.ts`
- Modify `packages/shared/src/memberships/invitation-delivery.spec.ts`
- Modify `packages/api/src/manage/invitation-delivery.service.ts`
- Extend `packages/api/src/manage/invitation-delivery.service.spec.ts`

Work:

- Return HTTP 200 for every authenticated, accepted event.
- Normalize current Resend sent, delivered, bounced, failed, suppressed,
  complained, and delayed payloads explicitly.
- Ignore delayed and observational events without losing modeled events in the
  same payload.
- Preserve stable failure codes rather than provider prose.
- Allow adverse terminal evidence to override earlier positive evidence while
  rejecting ordinary out-of-order regressions.
- Keep `svix-id` authentication and database uniqueness as the replay boundary.

## 4. Complete production configuration documentation

Files:

- Modify `packages/api/.env.example`
- Add `docs/operations/production-email.md`

Work:

- Document Redis, monitoring, judge, and Resend variables already accepted by
  the API environment schema.
- Document the Gabia DNS, separate Resend keys, Supabase SMTP, exact-origin,
  webhook-registration, rotation, and launch-smoke-test procedures.
- Use placeholders only; never copy a live key into Git.

## 5. Verify locally

Commands:

```bash
pnpm --filter @cove/shared test
pnpm --filter @cove/api test
pnpm --filter @cove/shared --filter @cove/api typecheck
pnpm --filter @cove/api build
git diff --check
```

No automated verification sends real email or mutates Resend, Supabase, Gabia,
or Contabo.

## 6. Prepare external production configuration

After the code passes and the public API deployment is ready:

1. Create `mail.coveedu.com` in Resend.
2. Add its provider-generated DNS records in Gabia.
3. Wait for verification.
4. Create separate domain-restricted sending keys for Cove and Supabase.
5. Configure Supabase SMTP and exact redirect URLs.
6. Deploy the Cove API with server-only secrets.
7. Register the public HTTPS webhook and deploy its signing secret.
8. Run the production smoke tests from the approved specification.

Secret creation is an interactive handoff: Resend reveals an API key once, so
the operator must place it directly into its destination secret store without
printing it in agent output, tool logs, or committed files.
