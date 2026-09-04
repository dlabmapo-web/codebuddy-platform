import { z } from "zod";

import { academyRoleSchema } from "../auth/roles.js";

/**
 * What the bell can carry.
 *
 * A discriminated union from the first release, holding two members, because
 * the second source of notifications is already known — a manager being told
 * that applicants are waiting — and a shape that has to grow a discriminant
 * later is a shape every consumer has to be revisited for.
 *
 * The items are the applicant's own application row, projected. Nothing is
 * written beside the review that decided it, so the bell cannot disagree with
 * the membership that review created, a retried review cannot produce two of
 * it, and an application that already existed already has a correct one. When
 * a notification arrives that is *not* a fact already on a row — the manager's
 * one is academy-scoped and addressed to many people — that is the change that
 * earns a table, and this contract is what lets it arrive without the client
 * being rewritten.
 */
export const notificationKinds = [
  "APPLICATION_APPROVED",
  "APPLICATION_REJECTED",
] as const;
export const notificationKindSchema = z.enum(notificationKinds);
export type NotificationKind = z.infer<typeof notificationKindSchema>;

export const notificationItemSchema = z.object({
  /** The application this decision belongs to. */
  id: z.uuid(),
  kind: notificationKindSchema,
  academy: z.object({
    name: z.string(),
    slug: z.string(),
  }),
  /** The role approved. Null on a rejection, which grants none. */
  role: academyRoleSchema.nullable(),
  /** The reviewer's note, when they left one. */
  reason: z.string().nullable(),
  /** When the decision was made — not when the application was. */
  createdAt: z.iso.datetime(),
  acknowledgedAt: z.iso.datetime().nullable(),
});
export type NotificationItem = z.infer<typeof notificationItemSchema>;

export const notificationListSchema = z.object({
  items: z.array(notificationItemSchema),
  unreadCount: z.number().int().nonnegative(),
});
export type NotificationList = z.infer<typeof notificationListSchema>;

export const acknowledgeNotificationSchema = z.object({ id: z.uuid() });
