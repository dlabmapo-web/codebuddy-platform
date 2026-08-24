import { z } from "zod";

import { academyRoleSchema, platformRoleSchema } from "./roles.js";
import { academyApplicationSummarySchema } from "../memberships/academy.js";

export const userStatuses = [
  "PENDING_PROFILE",
  "ACTIVE",
  "SUSPENDED",
  "DELETED",
] as const;
export const userStatusSchema = z.enum(userStatuses);
export type UserStatus = z.infer<typeof userStatusSchema>;

export const academySummarySchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  slug: z.string().min(1),
});

export const academyMembershipSummarySchema = z.object({
  academy: academySummarySchema,
  role: academyRoleSchema,
  status: z.enum(["INVITED", "ACTIVE", "SUSPENDED", "LEFT"]),
  /** Signed academy-scoped avatar URL for the current viewer. */
  imageUrl: z.string().nullable(),
  /**
   * The features this academy has switched on.
   *
   * Carried on the session so the shell can decide what to put in the nav
   * without a second round trip per page. A feature that is off is absent —
   * the same "a missing row means off" rule `AcademyFeatureFlag` uses, so a
   * client can never read a stale `false` as a deliberate one.
   */
  features: z.array(z.string()).optional(),
});

export const authUserSchema = z.object({
  id: z.uuid(),
  authUserId: z.uuid(),
  email: z.email().nullable(),
  username: z.string().nullable(),
  displayName: z.string().nullable(),
  avatarUrl: z.url().nullable(),
  /**
   * The Cove-owned profile image, as a short-lived signed URL, or null when
   * the account has none. Present here so the header avatar on every studio
   * page shows the picture the person actually uploaded rather than the
   * external one they never chose.
   */
  imageUrl: z.string().nullable(),
  platformRole: platformRoleSchema,
  status: userStatusSchema,
  memberships: z.array(academyMembershipSummarySchema),
  applications: z.array(academyApplicationSummarySchema),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const authMeResponseSchema = z.object({ user: authUserSchema });
export type AuthMeResponse = z.infer<typeof authMeResponseSchema>;
