import { z } from "zod";

import { academyRoleSchema } from "../auth/roles.js";

/** One bell for application decisions and academy-scoped course reviews. */
export const notificationKinds = [
  "APPLICATION_APPROVED",
  "APPLICATION_REJECTED",
  "COURSE_CONTENT_REVIEW",
] as const;
export const notificationKindSchema = z.enum(notificationKinds);
export type NotificationKind = z.infer<typeof notificationKindSchema>;

const notificationBaseSchema = z.object({
  /** Application id, or the academy copy id for a grouped course review. */
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
export const notificationItemSchema = z.discriminatedUnion("kind", [
  notificationBaseSchema.extend({ kind: z.enum(["APPLICATION_APPROVED", "APPLICATION_REJECTED"]) }),
  notificationBaseSchema.extend({
    kind: z.literal("COURSE_CONTENT_REVIEW"),
    course: z.object({ id: z.uuid(), title: z.string(), reviewVersion: z.number().int().positive(), pendingCount: z.number().int().positive() }),
  }),
]);
export type NotificationItem = z.infer<typeof notificationItemSchema>;

export const notificationListSchema = z.object({
  items: z.array(notificationItemSchema),
  unreadCount: z.number().int().nonnegative(),
});
export type NotificationList = z.infer<typeof notificationListSchema>;

export const acknowledgeNotificationSchema = z.object({ id: z.uuid(), reviewVersion: z.number().int().positive().optional() });
