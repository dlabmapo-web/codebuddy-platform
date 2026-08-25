import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { ApiEnvironment } from "../config/env.schema.js";

/**
 * §7.6's delivery seam: the one place that knows how a message physically
 * leaves this process.
 *
 * Two adapters sit behind it, and which one is active is decided by
 * configuration rather than by an environment check. A `NODE_ENV === "production"`
 * branch would mean the code that runs in production is code nobody ever runs
 * locally, and email is precisely the subsystem where that goes unnoticed until
 * a real parent does not receive a real invitation.
 *
 * The sink is not a stub. It records the same fields, returns the same shape,
 * and produces a message id, so every state transition downstream — QUEUED to
 * SENT, the attempt row, the manager's status column — is exercised in
 * development exactly as it will be in production. What it does not do is send.
 *
 * Nothing here decides *whether* to send, retries, or writes to the database.
 * Those are the delivery service's job. This takes a message and reports what
 * happened to it, which is the smallest thing an adapter can be.
 */

export type EmailMessage = {
  to: string;
  subject: string;
  /** Plain text. Cove sends no HTML invitations: see the note in the service. */
  text: string;
  /** Stable for one delivery attempt; Resend retains keys for 24 hours. */
  idempotencyKey: string;
};

export type EmailSendResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; failureCode: string; retryable: boolean };

export const EMAIL_SENDER = Symbol("EMAIL_SENDER");

export interface EmailSender {
  readonly name: string;
  send(message: EmailMessage): Promise<EmailSendResult>;
}

/**
 * The local sink.
 *
 * Logs the recipient and the subject, never the body — the body carries a
 * working invitation link, and §17 forbids putting one in a log where it would
 * outlive the invitation and be readable by anyone with log access.
 */
@Injectable()
export class LoggingEmailSender implements EmailSender {
  readonly name = "log";
  private readonly logger = new Logger("EmailSink");
  private sequence = 0;

  async send(message: EmailMessage): Promise<EmailSendResult> {
    this.sequence += 1;
    const providerMessageId = `local-${Date.now()}-${this.sequence}`;
    this.logger.log(
      `email to=${maskEmail(message.to)} subject=${JSON.stringify(
        message.subject,
      )} id=${providerMessageId}`,
    );
    return { ok: true, providerMessageId };
  }
}

/**
 * The production adapter, speaking the Resend HTTP API.
 *
 * One provider rather than an abstraction over several: a second provider is a
 * second adapter beside this one, which is what the seam is for. Building a
 * general email abstraction before there is a second provider produces a lowest
 * common denominator that fits neither.
 *
 * A 4xx is not retryable and a 5xx is. That distinction is the whole reason the
 * result carries `retryable`: retrying a malformed address forever is how a
 * queue fills up with messages that will never be accepted.
 */
@Injectable()
export class HttpEmailSender implements EmailSender {
  readonly name = "resend";
  private readonly logger = new Logger("EmailSender");

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<EmailSendResult> {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
          "Idempotency-Key": message.idempotencyKey,
        },
        body: JSON.stringify({
          from: this.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
        }),
        // A provider that has stopped answering must not hold a request open
        // while a manager waits for an import to finish.
        signal: AbortSignal.timeout(10_000),
      });

      if (response.ok) {
        const body = await readJson(response);
        const providerMessageId = readNonEmptyString(body, "id");
        if (providerMessageId) return { ok: true, providerMessageId };

        // A made-up id would make every later webhook impossible to match.
        // Treat an unexpected success payload as a permanent integration
        // failure so it is visible rather than recorded as SENT.
        this.logger.warn("email provider returned an invalid success response");
        return {
          ok: false,
          failureCode: "provider_invalid_response",
          retryable: false,
        };
      }

      // Resend's machine-readable `name` is useful for operations, but its
      // prose `message` can contain recipient data and is never logged/stored.
      const body = await readJson(response);
      const providerCode = normalizeProviderCode(
        readNonEmptyString(body, "name") ?? readNonEmptyString(body, "type"),
      );
      const failureCode = providerCode
        ? `provider_${providerCode}`
        : `provider_${response.status}`;
      this.logger.warn(
        `email rejected status=${response.status} code=${failureCode}`,
      );
      return {
        ok: false,
        failureCode,
        retryable: isRetryableProviderFailure(response.status, providerCode),
      };
    } catch (error) {
      this.logger.warn(
        `email transport failed: ${
          error instanceof Error ? error.name : "unknown"
        }`,
      );
      return { ok: false, failureCode: "transport_error", retryable: true };
    }
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readNonEmptyString(value: unknown, key: string): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "string" && candidate.length > 0
    ? candidate
    : undefined;
}

/** Only retain Resend's documented machine code shape, never arbitrary text. */
function normalizeProviderCode(value: string | undefined): string | undefined {
  if (!value || !/^[a-z0-9_]{1,48}$/.test(value)) return undefined;
  return value;
}

function isRetryableProviderFailure(
  status: number,
  providerCode: string | undefined,
): boolean {
  if (status === 429 || status >= 500) return true;
  return providerCode === "concurrent_idempotent_requests";
}

/**
 * Which adapter this deployment gets.
 *
 * Configuration decides, and the absence of a key means the development sink.
 * Production environment validation requires the provider settings, so a
 * deployed instance can never report a locally logged message as provider SENT.
 */
export function createEmailSender(
  config: ConfigService<ApiEnvironment, true>,
): EmailSender {
  const apiKey = config.get("EMAIL_API_KEY", { infer: true });
  const from = config.get("EMAIL_FROM", { infer: true });
  if (!apiKey || !from) return new LoggingEmailSender();
  return new HttpEmailSender(apiKey, from);
}

/** Enough of an address to recognise, not enough to harvest from a log. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const head = local.slice(0, 2);
  return `${head}${"*".repeat(Math.max(1, local.length - 2))}@${domain}`;
}
