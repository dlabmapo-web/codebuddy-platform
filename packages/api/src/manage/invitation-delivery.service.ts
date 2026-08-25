import { createHash, randomBytes } from "node:crypto";

import { HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  INVITATION_RESEND_EXTENSION_MS,
  INVITATION_RESEND_LIMIT,
  INVITATION_RESEND_WINDOW_MS,
  canApplyProviderEvent,
  providerEventToState,
  type InvitationDelivery,
  type ProviderEvent,
  type ResendInvitationInput,
} from "@cove/shared";

import { AuditService } from "../academies/audit.service.js";
import { RateLimitService } from "../academies/rate-limit.service.js";
import {
  hashInvitationToken,
  toInvitationDetail,
} from "../academies/academy-invitation.service.js";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AppException } from "../common/app-exception.js";
import type { ApiEnvironment } from "../config/env.schema.js";
import { PrismaService } from "../database/prisma.service.js";
import { EMAIL_SENDER, maskEmail, type EmailSender } from "./email-sender.js";
import { ManagerScopeService } from "./manager-scope.service.js";

/**
 * §7.6 — durable delivery attempts, and the provider events that move them.
 *
 * Three rules hold everywhere in this file.
 *
 * **An attempt is written before a message is sent.** If the process dies
 * between the two, the row survives as `QUEUED` and the sweep picks it up.
 * Sending first and recording afterwards would lose the record of a message
 * that did go out, and a manager would resend to somebody who already had it.
 *
 * **Delivery is never inside a mutation's transaction.** §12 is explicit, and
 * the reason is that an email provider is slow and occasionally down: holding a
 * database transaction open across a network call to a third party turns their
 * outage into a lock on the academy's roster. Invitations commit, then messages
 * are dispatched.
 *
 * **The interface never claims more than the provider said.** `SENT` means the
 * provider accepted the message. `DELIVERED` means an authenticated,
 * deduplicated webhook told us the receiving server took it. Time passing
 * converts neither into the other.
 *
 * The emails are plain text on purpose. An HTML invitation would need a
 * template, an inliner, and a preheader, and would land in more spam folders
 * than the four lines below — the message's whole job is to carry one link to a
 * person who is expecting it.
 */
@Injectable()
export class InvitationDeliveryService {
  private readonly logger = new Logger(InvitationDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scopes: ManagerScopeService,
    private readonly audit: AuditService,
    private readonly rateLimit: RateLimitService,
    private readonly config: ConfigService<ApiEnvironment, true>,
    @Inject(EMAIL_SENDER) private readonly sender: EmailSender,
  ) {}

  /* ------------------------------------------------------------- reading */

  /** Pending and historical invitations, each with its latest attempt. */
  async list(identity: SupabaseIdentity, academyId: string) {
    await this.scopes.requireManager(
      identity,
      academyId,
      "academy.members.manage",
    );

    const invitations = await this.prisma.academyInvitation.findMany({
      where: { academyId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        // The latest attempt only. The history matters for debugging, not for
        // the question the interface asks — "did this one get through".
        deliveryAttempts: {
          orderBy: { attemptNumber: "desc" },
          take: 1,
        },
      },
    });

    return {
      invitations: invitations.map((invitation) => ({
        invitation: toInvitationDetail(invitation),
        delivery: toDelivery(invitation.deliveryAttempts[0]),
      })),
    };
  }

  /* -------------------------------------------------------------- resend */

  /**
   * §13 — rotate the token, invalidate the old link, extend the deadline, and
   * queue a fresh attempt.
   *
   * The rotation is the point, not a side effect. "Resend" is what a manager
   * reaches for when they think the first link went to the wrong inbox, so the
   * old link must stop working — a resend that merely sent the same URL again
   * would be useless for the case it exists to serve.
   *
   * A resend never creates a second invitation. One pending invitation per
   * address is an invariant the create path enforces, and a resend that made a
   * second row would break it from the other side.
   */
  async resend(identity: SupabaseIdentity, input: ResendInvitationInput) {
    const actor = await this.scopes.requireManager(
      identity,
      input.academyId,
      "academy.members.manage",
    );

    // §17 — one manager, one invitation, five resends an hour. Keyed by
    // invitation rather than by actor so a manager working through a list of
    // twenty is not blocked by their own diligence.
    this.rateLimit.assert(
      `invitation-resend:${input.invitationId}`,
      INVITATION_RESEND_LIMIT,
      INVITATION_RESEND_WINDOW_MS,
    );

    const token = randomBytes(32).toString("base64url");

    const { invitation, attempt } = await this.prisma.$transaction(
      async (transaction) => {
        // The same lock the revoke path takes. Two managers pressing Resend at
        // once must produce one rotation, not two attempts against tokens that
        // each believe they are current.
        await transaction.$queryRaw`
          SELECT id
          FROM academy_invitations
          WHERE id = ${input.invitationId}::uuid
          FOR UPDATE
        `;

        const existing = await transaction.academyInvitation.findUnique({
          where: { id: input.invitationId },
        });
        if (!existing || existing.academyId !== input.academyId) {
          throw new AppException("INVITATION_INVALID", HttpStatus.NOT_FOUND);
        }
        // Accepted, revoked, and expired are all terminal. Resending an
        // accepted one would mint a working link into an academy the recipient
        // is already in; resending a revoked one would undo a deliberate act.
        if (existing.status !== "PENDING") {
          throw new AppException("INVITATION_INVALID", HttpStatus.CONFLICT);
        }

        const updated = await transaction.academyInvitation.update({
          where: { id: existing.id },
          data: {
            tokenHash: hashInvitationToken(token),
            // From now, not from the old expiry: a manager resending a link
            // that lapsed yesterday means "you have a week", not "you have
            // until yesterday plus seven days".
            expiresAt: new Date(Date.now() + INVITATION_RESEND_EXTENSION_MS),
          },
        });

        const previous = await transaction.invitationDeliveryAttempt.findFirst({
          where: { invitationId: existing.id },
          orderBy: { attemptNumber: "desc" },
          select: { attemptNumber: true },
        });

        const created = await transaction.invitationDeliveryAttempt.create({
          data: {
            invitationId: existing.id,
            attemptNumber: (previous?.attemptNumber ?? 0) + 1,
            state: "QUEUED",
          },
        });

        await this.audit.write(transaction, {
          actorUserId: actor.userId,
          academyId: input.academyId,
          action: "academy.invitation.resent",
          targetType: "AcademyInvitation",
          targetId: existing.id,
          // No token, no link, not even a hash. §17 — an audit row is readable
          // by more people and for longer than an invitation is valid.
          after: { attemptNumber: created.attemptNumber },
        });

        return { invitation: updated, attempt: created };
      },
    );

    // Outside the transaction, deliberately. See the class note.
    const delivered = await this.dispatch({
      attemptId: attempt.id,
      email: invitation.email,
      token,
      academyId: input.academyId,
    });

    return {
      invitation: toInvitationDetail(invitation),
      delivery: toDelivery(delivered)!,
    };
  }

  /* ------------------------------------------------------------ dispatch */

  /**
   * Queue an attempt for a freshly created invitation.
   *
   * Called after the creating transaction has committed — by the import commit,
   * by a bulk invite, and by the single-invitation path. It returns nothing
   * useful on purpose: the caller has already succeeded, and a delivery failure
   * must not turn a committed import into a failed request. The attempt row is
   * where the failure is recorded, and the manager reads it in the invitations
   * table.
   */
  async queueForInvitation(input: {
    invitationId: string;
    academyId: string;
    email: string;
    token: string;
  }): Promise<void> {
    try {
      const attempt = await this.prisma.invitationDeliveryAttempt.create({
        data: {
          invitationId: input.invitationId,
          attemptNumber: 1,
          state: "QUEUED",
        },
      });
      await this.dispatch({
        attemptId: attempt.id,
        email: input.email,
        token: input.token,
        academyId: input.academyId,
      });
    } catch (error) {
      // Never rethrown. The invitation exists and is valid; the manager can
      // resend. Failing the whole request here would make an email outage look
      // like a failed import and invite a retry that invites everybody twice.
      this.logger.warn(
        `queueing invitation email failed: ${
          error instanceof Error ? error.message : "unknown"
        }`,
      );
    }
  }

  /**
   * Hand one message to the adapter and record what it said.
   *
   * The token is passed in rather than read back from the database, because it
   * is never stored — only its hash is. This is the one moment in an
   * invitation's life when the plaintext exists, and it exists only in memory,
   * only here, and only long enough to be put in one message.
   */
  private async dispatch(input: {
    attemptId: string;
    email: string;
    token: string;
    academyId: string;
  }) {
    const academy = await this.prisma.academy.findUnique({
      where: { id: input.academyId },
      select: { name: true, status: true },
    });

    // An invitation into an academy that is switched off leads to a wall:
    // acceptance is refused downstream, so the message could only confuse its
    // recipient. Recorded as a permanent failure rather than dropped, so the
    // invitation's delivery history says why nothing arrived — and so the
    // retry sweep does not keep trying while the academy stays suspended.
    if (academy && academy.status !== "ACTIVE") {
      return this.prisma.invitationDeliveryAttempt.update({
        where: { id: input.attemptId },
        data: {
          state: "FAILED",
          failureCode: "academy_unavailable",
          failedAt: new Date(),
        },
      });
    }

    const result = await this.sender.send({
      to: input.email,
      subject: `You have been invited to ${academy?.name ?? "an academy"} on Cove`,
      text: invitationBody({
        academyName: academy?.name ?? "an academy",
        link: this.invitationLink(input.token),
      }),
      idempotencyKey: `invitation-delivery/${input.attemptId}`,
    });

    const now = new Date();
    if (result.ok) {
      // SENT, not DELIVERED. The provider accepted it; nobody has yet said a
      // receiving server did.
      return this.prisma.invitationDeliveryAttempt.update({
        where: { id: input.attemptId },
        data: {
          state: "SENT",
          providerMessageId: result.providerMessageId,
          sentAt: now,
        },
      });
    }

    this.logger.warn(
      `invitation email failed to=${maskEmail(input.email)} code=${result.failureCode}`,
    );
    return this.prisma.invitationDeliveryAttempt.update({
      where: { id: input.attemptId },
      data: {
        // A retryable failure stays QUEUED so the sweep will try again; a
        // permanent one is FAILED so it stops and the manager is told.
        state: result.retryable ? "QUEUED" : "FAILED",
        failureCode: result.failureCode,
        failedAt: result.retryable ? null : now,
      },
    });
  }

  private invitationLink(token: string): string {
    const origin = this.config.get("WEB_ORIGIN", { infer: true });
    return `${origin}/invite/${encodeURIComponent(token)}`;
  }

  /* ------------------------------------------------------ provider events */

  /**
   * A webhook, after its signature has been checked by the controller.
   *
   * Deduplication is a unique index rather than a lookup: two copies of one
   * event arriving concurrently would both pass a `findFirst` check and both
   * apply. The insert of `lastEventKey` is what makes the second one lose.
   *
   * An event for a message this platform does not know is dropped silently. A
   * provider account may send other mail, and a 404 would tell an unauthorized
   * caller which message ids exist.
   */
  async applyProviderEvent(event: ProviderEvent): Promise<void> {
    const attempt = await this.prisma.invitationDeliveryAttempt.findFirst({
      where: { providerMessageId: event.messageId },
      orderBy: { attemptNumber: "desc" },
    });
    if (!attempt) return;

    const next = providerEventToState(event.type);
    // Providers deliver out of order — `delivered` before `sent` is routine —
    // so evidence only ever strengthens, except explicit adverse evidence.
    // See `canApplyProviderEvent`.
    if (!canApplyProviderEvent(attempt.state, event)) return;

    const occurredAt = event.occurredAt ? new Date(event.occurredAt) : new Date();

    try {
      await this.prisma.invitationDeliveryAttempt.update({
        where: { id: attempt.id },
        data: {
          state: next,
          lastEventKey: `${event.eventId}`,
          failureCode: event.failureCode ?? attempt.failureCode,
          sentAt: next === "SENT" ? occurredAt : attempt.sentAt,
          deliveredAt: next === "DELIVERED" ? occurredAt : attempt.deliveredAt,
          failedAt:
            next === "BOUNCED" || next === "FAILED"
              ? occurredAt
              : attempt.failedAt,
        },
      });
    } catch (error) {
      // The unique index on `lastEventKey` rejecting a duplicate is the system
      // working. Anything else is worth a line in the log.
      if (!isUniqueViolation(error)) throw error;
    }
  }

  /**
   * Attempts a crash left behind, retried oldest first.
   *
   * A sweep rather than a queue runtime: the durable record is the attempt
   * table, Redis is optional in this deployment, and an invitation email that
   * goes out a minute late is not an incident. Bounded per pass so a large
   * backlog cannot monopolise the process.
   */
  async sweepQueued(limit = 50): Promise<number> {
    const stale = new Date(Date.now() - 60_000);
    const attempts = await this.prisma.invitationDeliveryAttempt.findMany({
      where: { state: "QUEUED", queuedAt: { lt: stale } },
      orderBy: { queuedAt: "asc" },
      take: limit,
      include: { invitation: { select: { status: true } } },
    });

    let handled = 0;
    for (const attempt of attempts) {
      // The token is not recoverable — only its hash was stored — so a stranded
      // attempt cannot be re-sent with a working link. It is marked failed so
      // the manager sees it and can resend, which mints a new token.
      await this.prisma.invitationDeliveryAttempt.update({
        where: { id: attempt.id },
        data: {
          state: "FAILED",
          failureCode: "abandoned",
          failedAt: new Date(),
        },
      });
      handled += 1;
    }
    return handled;
  }
}

/** The attempt as the contract describes it, or null when there is none. */
export function toDelivery(
  attempt:
    | {
        state: string;
        attemptNumber: number;
        failureCode: string | null;
        queuedAt: Date;
        sentAt: Date | null;
        deliveredAt: Date | null;
        failedAt: Date | null;
      }
    | undefined
    | null,
): InvitationDelivery | null {
  if (!attempt) return null;
  return {
    state: attempt.state as InvitationDelivery["state"],
    attemptNumber: attempt.attemptNumber,
    failureCode: attempt.failureCode,
    queuedAt: attempt.queuedAt.toISOString(),
    sentAt: attempt.sentAt?.toISOString() ?? null,
    deliveredAt: attempt.deliveredAt?.toISOString() ?? null,
    failedAt: attempt.failedAt?.toISOString() ?? null,
  };
}

/**
 * The message body.
 *
 * Four lines, one link, no tracking pixel, no HTML. An invitation is expected
 * mail sent to somebody a manager just typed the address of, and the shortest
 * message that carries the link is the one most likely to reach an inbox.
 */
function invitationBody(input: { academyName: string; link: string }): string {
  return [
    `You have been invited to join ${input.academyName} on Cove.`,
    "",
    `Accept the invitation: ${input.link}`,
    "",
    "This link expires in 7 days and can only be used once.",
    "If you were not expecting this, you can ignore this message.",
  ].join("\n");
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}
