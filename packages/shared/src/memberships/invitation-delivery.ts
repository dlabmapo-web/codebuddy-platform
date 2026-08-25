import { z } from "zod";

/**
 * Whether an invitation email actually arrived, said only as strongly as the
 * evidence allows.
 *
 * §13's central rule, and the reason this is a separate vocabulary from
 * `InvitationStatus`: an invitation can be PENDING while its email bounced, and
 * ACCEPTED while its last delivery attempt is still only SENT. Collapsing the
 * two would make the interface claim provider evidence it does not have, which
 * on this surface means telling a manager a parent was emailed when nobody was.
 *
 * The states are a ladder of evidence, not a progress bar:
 *
 * - `QUEUED` — we intend to send. Nothing has left the building.
 * - `SENT` — the provider accepted the message. This is *our* last observation.
 * - `DELIVERED` — the provider told us the receiving server accepted it, in an
 *   authenticated, deduplicated event. Only a webhook may produce this.
 * - `BOUNCED` — the receiving server refused it. The address is wrong, and
 *   resending to it will not help.
 * - `FAILED` — we could not hand it over at all.
 *
 * The interface never renders `SENT` as "delivered" and never infers
 * `DELIVERED` from time passing.
 */

export const invitationDeliveryStates = [
  "QUEUED",
  "SENT",
  "DELIVERED",
  "BOUNCED",
  "FAILED",
] as const;
export const invitationDeliveryStateSchema = z.enum(invitationDeliveryStates);
export type InvitationDeliveryState = z.infer<
  typeof invitationDeliveryStateSchema
>;

/** States from which nothing further will happen without a new attempt. */
export const terminalDeliveryStates: readonly InvitationDeliveryState[] = [
  "DELIVERED",
  "BOUNCED",
  "FAILED",
];

/**
 * Which state transitions a provider event may cause.
 *
 * A table rather than a set of `if`s because providers deliver events out of
 * order — a `delivered` webhook routinely arrives before the `sent` one — and
 * the rule that keeps the record honest is that evidence only ever gets
 * stronger. A `sent` event arriving after `delivered` is dropped rather than
 * regressing the row, and a `bounced` event always wins because it is the one
 * observation that says the address does not work.
 */
export function canAdvanceDelivery(
  from: InvitationDeliveryState,
  to: InvitationDeliveryState,
): boolean {
  if (from === to) return false;
  // A bounce is the strongest signal there is: a message can be accepted by the
  // provider, reported delivered, and then bounce on a downstream forward.
  if (to === "BOUNCED") return true;
  const rank: Record<InvitationDeliveryState, number> = {
    QUEUED: 0,
    SENT: 1,
    FAILED: 2,
    DELIVERED: 3,
    BOUNCED: 4,
  };
  return rank[to] > rank[from];
}

export const invitationDeliverySchema = z
  .object({
    state: invitationDeliveryStateSchema,
    attemptNumber: z.number().int().min(1),
    /** A stable provider code, never its prose. */
    failureCode: z.string().max(64).nullable(),
    queuedAt: z.iso.datetime(),
    sentAt: z.iso.datetime().nullable(),
    deliveredAt: z.iso.datetime().nullable(),
    failedAt: z.iso.datetime().nullable(),
  })
  .strict();
export type InvitationDelivery = z.infer<typeof invitationDeliverySchema>;

/* --------------------------------------------------------------- resend */

/**
 * §13 — which invitations may be resent.
 *
 * Only a pending one. Resending an accepted invitation would mint a working
 * link to an academy the recipient is already in; resending a revoked one would
 * undo a decision somebody made deliberately. Both are refused rather than
 * silently ignored, so the manager learns which it was.
 *
 * A resend is never a second invitation. It rotates the token on the existing
 * row, which invalidates the old link — the property that makes "resend"
 * usable when a manager suspects the first link was forwarded to the wrong
 * person.
 */
export const resendInvitationInputSchema = z
  .object({ academyId: z.uuid(), invitationId: z.uuid() })
  .strict();
export type ResendInvitationInput = z.infer<typeof resendInvitationInputSchema>;

/** §13 — a resend extends the deadline by a fresh week, from now. */
export const INVITATION_RESEND_EXTENSION_MS = 7 * 24 * 60 * 60 * 1_000;

/** §17 — how often one manager may resend one invitation. */
export const INVITATION_RESEND_LIMIT = 5;
export const INVITATION_RESEND_WINDOW_MS = 60 * 60 * 1_000;

/* -------------------------------------------------------- provider events */

/**
 * The provider vocabulary this platform understands.
 *
 * Deliberately small. A provider emits three dozen event types — opens, clicks,
 * spam reports, unsubscribes — and an invitation record has no business storing
 * whether a parent opened an email. These four are the ones that change what a
 * manager should do next.
 */
export const providerEventTypes = [
  "sent",
  "delivered",
  "bounced",
  "failed",
] as const;
export const providerEventTypeSchema = z.enum(providerEventTypes);
export type ProviderEventType = z.infer<typeof providerEventTypeSchema>;

export const providerEventSchema = z
  .object({
    /**
     * The provider's own event id. Stored, and unique, so the second delivery
     * of one event advances nothing — every provider redelivers, and a naive
     * handler would move the same row twice.
     */
    eventId: z.string().min(1).max(200),
    type: providerEventTypeSchema,
    messageId: z.string().min(1).max(200),
    failureCode: z.string().max(64).optional(),
    occurredAt: z.iso.datetime().optional(),
  })
  .strict();
export type ProviderEvent = z.infer<typeof providerEventSchema>;

/**
 * Whether one authenticated provider event may replace the stored evidence.
 *
 * Ordinary failures cannot erase a confirmed delivery. Suppression and spam
 * complaint events are different: they are later adverse evidence about the
 * recipient/provider relationship and must remain visible even if delivery
 * was reported first.
 */
export function canApplyProviderEvent(
  from: InvitationDeliveryState,
  event: ProviderEvent,
): boolean {
  const next = providerEventToState(event.type);
  if (canAdvanceDelivery(from, next)) return true;
  return (
    from === "DELIVERED" &&
    next === "FAILED" &&
    (event.failureCode === "suppressed" || event.failureCode === "complained")
  );
}

export function providerEventToState(
  type: ProviderEventType,
): InvitationDeliveryState {
  switch (type) {
    case "sent":
      return "SENT";
    case "delivered":
      return "DELIVERED";
    case "bounced":
      return "BOUNCED";
    case "failed":
      return "FAILED";
  }
}
