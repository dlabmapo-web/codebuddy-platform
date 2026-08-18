import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import { providerEventSchema, type ProviderEvent } from "@cove/shared";
import { Webhook } from "svix";

import type { ApiEnvironment } from "../config/env.schema.js";
import { InvitationDeliveryService } from "./invitation-delivery.service.js";

/**
 * The email provider's delivery callbacks.
 *
 * §17 requires these to be authenticated and deduplicated, and both are doing
 * real work: an unauthenticated endpoint lets anyone mark any invitation
 * `DELIVERED`, which is a way to hide a bounced address from the manager who
 * needs to chase it, and every provider redelivers events on a retry.
 *
 * A plain controller rather than an oRPC procedure because the caller is not
 * Cove. The provider posts whatever shape it posts, with its own headers, and
 * an oRPC route would be an authenticated-by-default surface pretending to be a
 * public one.
 *
 * The response is always 204 once the signature checks out — including for an
 * event about a message this platform has never heard of. A provider that gets
 * a 404 retries it forever, and a differentiated response would let an
 * unauthorized caller probe which message ids exist.
 *
 * With no secret configured the endpoint refuses everything. That is the right
 * default: a deployment that has not set up webhook verification should not be
 * accepting delivery claims from the internet.
 */
@Controller("webhooks/email")
export class DeliveryWebhookController {
  private readonly logger = new Logger(DeliveryWebhookController.name);

  constructor(
    private readonly delivery: InvitationDeliveryService,
    private readonly config: ConfigService<ApiEnvironment, true>,
  ) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  async receive(
    @Req() request: Request,
    @Headers("svix-id") eventId?: string,
    @Headers("svix-signature") signature?: string,
    @Headers("svix-timestamp") timestamp?: string,
  ): Promise<void> {
    const secret = this.config.get("EMAIL_WEBHOOK_SECRET", { infer: true });
    if (!secret) {
      this.logger.warn("delivery webhook received with no secret configured");
      throw new ServiceUnavailableException("email webhook is not configured");
    }

    const raw = rawBody(request);
    if (!raw || !eventId || !signature || !timestamp) {
      throw new BadRequestException("invalid email webhook");
    }

    if (!verifySignature({ raw, secret, eventId, signature, timestamp })) {
      this.logger.warn("delivery webhook rejected: bad signature");
      throw new BadRequestException("invalid email webhook");
    }

    for (const event of parseEvents(raw, eventId)) {
      await this.delivery.applyProviderEvent(event);
    }
  }
}

/**
 * The exact bytes that were signed.
 *
 * `JSON.stringify(request.body)` would re-serialize and change key order and
 * whitespace, and the signature would never match. Nest's JSON body parser is
 * configured to keep the raw buffer for this route in `main.ts`.
 */
function rawBody(request: Request): string | null {
  const raw = (request as Request & { rawBody?: Buffer }).rawBody;
  if (raw) return raw.toString("utf8");
  // Falls back to the parsed body only when no raw buffer was captured, which
  // means verification will fail — deliberately, rather than silently trusting.
  return null;
}

export function verifySignature(input: {
  raw: string;
  secret: string;
  eventId: string;
  signature: string;
  timestamp: string;
}): boolean {
  try {
    new Webhook(input.secret).verify(input.raw, {
      "svix-id": input.eventId,
      "svix-signature": input.signature,
      "svix-timestamp": input.timestamp,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Whatever the provider posted, reduced to events this platform models.
 *
 * Providers batch, so both a single object and an array are accepted. Anything
 * that fails the schema — an `opened` event, a malformed one — is dropped
 * rather than failing the batch: one unrecognised event must not stop the
 * `bounced` event beside it from being applied.
 */
export function parseEvents(raw: string, eventId?: string): ProviderEvent[] {
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return [];
  }
  const items = Array.isArray(payload) ? payload : [payload];
  return items.flatMap((item) => {
    const parsed = providerEventSchema.safeParse(normalizeEvent(item, eventId));
    return parsed.success ? [parsed.data] : [];
  });
}

/**
 * The provider's field names, mapped onto ours.
 *
 * Kept small and explicit. A generic mapper would accept shapes nobody has
 * seen, and the failure mode of guessing wrong here is an invitation reported
 * as delivered when it bounced.
 */
function normalizeEvent(item: unknown, eventId?: string): unknown {
  if (typeof item !== "object" || item === null) return item;
  const record = item as Record<string, unknown>;
  const data = (record.data ?? record) as Record<string, unknown>;
  const type = String(record.type ?? record.event ?? "")
    .replace(/^email\./, "")
    .replace("delivery_delayed", "failed")
    .replace("complained", "bounced");
  return {
    eventId: eventId ?? record.id ?? record.event_id,
    type,
    messageId: data.email_id ?? data.message_id ?? data.id,
    failureCode: data.bounce_type ?? data.reason,
    occurredAt: record.created_at ?? record.occurred_at,
  };
}
