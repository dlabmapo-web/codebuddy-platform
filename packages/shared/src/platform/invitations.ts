import { z } from "zod";

import { academyRoleSchema } from "../auth/roles.js";
import {
  invitationDeliverySchema,
  invitationDeliveryStateSchema,
} from "../memberships/invitation-delivery.js";
import { invitationStatusSchema } from "../memberships/status.js";

/**
 * Every invitation on the platform, and whether it arrived.
 *
 * A read, and only a read. Sending one calls `academyInvitations.create`,
 * revoking calls `academyInvitations.revoke`, and resending calls
 * `academyInvitationDelivery.resend` — the same three procedures a manager's
 * own Invitations page calls, because a second implementation would run under a
 * second role ceiling with a second audit shape and a second delivery ladder
 * for one act.
 *
 * ## Why the console needs this at all
 *
 * An invitation is sent behind `academy.members.manage`, which `MANAGER` holds
 * and nobody else does. An academy with no active manager cannot invite
 * anybody — including the person who would become its manager. `academyHasManager`
 * is the field that says which rows are in that state, and it is the reason
 * this surface exists rather than a convenience on top of one that does.
 */

export const platformInvitationSchema = z.object({
  id: z.uuid(),
  academyId: z.uuid(),
  academyName: z.string().min(1),
  academySlug: z.string().min(1),
  email: z.email(),
  role: academyRoleSchema,
  status: invitationStatusSchema,
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  /**
   * The latest delivery attempt, exactly as the manager's page reads it.
   *
   * Null when nothing was ever queued — an invitation created before delivery
   * attempts existed, or one whose queue call failed after the invitation
   * itself committed. Null is "we do not know", never "it did not arrive".
   */
  delivery: invitationDeliverySchema.nullable(),
  /**
   * False when this academy has no active manager: the rows nobody but an
   * operator can resend or revoke.
   *
   * Computed on the server from the same predicate every other console surface
   * calls an academy leaderless with, and carried on the row rather than
   * derived in the browser — it decides how the row is ordered and how it is
   * annotated, and a client that recomputed it would be a second definition of
   * the word.
   */
  academyHasManager: z.boolean(),
  /**
   * Who sent it, and whether they were one of us.
   *
   * On a cross-academy list this is the difference between "we did this" and
   * "they did", which changes whose problem a bounced invitation is. Without
   * it the audit trail is the only place the answer exists. Null for an
   * invitation whose sender's account has since been deleted.
   */
  invitedBy: z
    .object({
      displayName: z.string().nullable(),
      isOperator: z.boolean(),
    })
    .nullable(),
});
export type PlatformInvitation = z.infer<typeof platformInvitationSchema>;

/* ---------------------------------------------------------------- reading */

export const PLATFORM_INVITATIONS_PAGE_SIZE = 25;

/**
 * What the queue can be ordered by.
 *
 * `sent` is when the invitation was created, and leads because the question an
 * operator arrives with — "is anything stuck" — is answered by age. `academy`
 * groups a support call about one customer together. `expires` is the one that
 * finds invitations about to lapse, which is a different urgency from age:
 * a resend before Friday saves a seat, a resend after it starts again.
 */
export const platformInvitationSortKeys = ["sent", "academy", "expires"] as const;
export const platformInvitationSortKeySchema = z.enum(
  platformInvitationSortKeys,
);
export type PlatformInvitationSortKey =
  (typeof platformInvitationSortKeys)[number];

export const listPlatformInvitationsInputSchema = z.object({
  /** Matches the invited address. */
  query: z.string().trim().max(120).optional(),
  academyIds: z.array(z.uuid()).max(50).optional(),
  /**
   * Defaulted to pending rather than left empty.
   *
   * The queue's job is what is still open. Everything else stays one facet chip
   * away, because an operator asked "what happened to my invitation" has to be
   * able to find a revoked one.
   */
  statuses: z.array(invitationStatusSchema).max(4).optional(),
  /**
   * The delivery ladder, filtered separately from the status above it — §2.3.
   * An invitation can be PENDING while its email bounced, and one column could
   * not say both.
   */
  deliveryStates: z.array(invitationDeliveryStateSchema).max(5).optional(),
  /** Only academies with no active manager — the rows nobody else can act on. */
  leaderlessOnly: z.boolean().optional(),
  sort: platformInvitationSortKeySchema.default("sent"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  page: z.number().int().min(1).default(1),
  pageSize: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(PLATFORM_INVITATIONS_PAGE_SIZE),
});
export type ListPlatformInvitationsInput = z.input<
  typeof listPlatformInvitationsInputSchema
>;
export type ResolvedListPlatformInvitationsInput = z.infer<
  typeof listPlatformInvitationsInputSchema
>;

/**
 * What the queue is, before a single row is read.
 *
 * `accepted` qualifies the total: it is the only number that says the whole
 * mechanism worked. Without it the total tile could only be qualified by the
 * academy count, which the header already states — the same fact twice.
 *
 * `pending` is how much is open, `bounced` is how much of it went nowhere, and
 * `bouncedLeaderless` is the part that will still be there tomorrow if the
 * operator closes the tab — the failures with no manager to resend them. The
 * last number is the reason this page exists, and when it reaches zero the page
 * is saying something true and pleasant.
 *
 * `expiringSoon` counts pending invitations lapsing within seven days, which is
 * a different urgency from a bounce: nothing failed, but a seat is about to be
 * given back.
 *
 * All of them ignore paging and the search box, and follow the academy facet —
 * an operator narrowed to one academy is being shown that academy's queue.
 */
export const platformInvitationsSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  accepted: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  expiringSoon: z.number().int().nonnegative(),
  bounced: z.number().int().nonnegative(),
  bouncedLeaderless: z.number().int().nonnegative(),
  /** Academies with at least one invitation. The denominator. */
  academies: z.number().int().nonnegative(),
});
export type PlatformInvitationsSummary = z.infer<
  typeof platformInvitationsSummarySchema
>;

export const listPlatformInvitationsResultSchema = z.object({
  rows: z.array(platformInvitationSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  summary: platformInvitationsSummarySchema,
  /**
   * Every academy, for the facet *and* for the composer's academy field.
   *
   * Not only the academies with an invitation already, as the applications
   * queue lists: this response feeds the form that sends the first one, and a
   * list that omitted the academies with none would hide exactly the academy an
   * operator is being asked to help.
   */
  academyOptions: z.array(
    z.object({
      id: z.uuid(),
      name: z.string().min(1),
      slug: z.string().min(1),
    }),
  ),
});
export type ListPlatformInvitationsResult = z.infer<
  typeof listPlatformInvitationsResultSchema
>;

/** Pending invitations lapse within this window to count as expiring soon. */
export const INVITATION_EXPIRING_SOON_MS = 7 * 24 * 60 * 60 * 1_000;
