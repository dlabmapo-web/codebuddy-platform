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
});

export const authUserSchema = z.object({
  id: z.uuid(),
  authUserId: z.uuid(),
  email: z.email().nullable(),
  username: z.string().nullable(),
  displayName: z.string().nullable(),
  avatarUrl: z.url().nullable(),
  platformRole: platformRoleSchema,
  status: userStatusSchema,
  memberships: z.array(academyMembershipSummarySchema),
  applications: z.array(academyApplicationSummarySchema),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const authMeResponseSchema = z.object({ user: authUserSchema });
export type AuthMeResponse = z.infer<typeof authMeResponseSchema>;
