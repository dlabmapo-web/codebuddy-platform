import { z } from "zod";

import { academyRoleSchema, platformRoleSchema } from "./roles.js";
import { academyApplicationSummarySchema } from "../memberships/academy.js";

/**
 * What the signup form is being filled in for.
 *
 * Not a role, and never stored as one. It decides one thing — whether Cove
 * asks for an email address — because an elementary student does not have one.
 * The academy role still comes only from a manager approving the join request,
 * so a `STAFF` signup that a manager approves as a `STUDENT` is legal, if odd.
 */
export const signupKinds = ["STUDENT", "STAFF"] as const;
export const signupKindSchema = z.enum(signupKinds);
export type SignupKind = z.infer<typeof signupKindSchema>;

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
  /**
   * The member's highest role in this academy. Kept as the primary role rather
   * than folded into `roles`, because it is what every existing query, index,
   * and analytic reads and what the API stores on the membership row.
   */
  role: academyRoleSchema,
  /**
   * Every role this member holds here, `role` included.
   *
   * A small academy staffs one person as several things — the director who
   * also teaches a class and also writes the curriculum. Permissions are the
   * union of these; which one the reader is *looking* as is a separate
   * presentation choice the shell makes.
   */
  roles: z.array(academyRoleSchema).min(1),
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
  /**
   * The address a person can actually read, or null when they have none.
   *
   * A generated `no-email.cove.invalid` placeholder is never put here — the
   * API replaces it with null before the session leaves it — so no client has
   * to know that such addresses exist in order to avoid displaying one.
   */
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
  /**
   * Whether this account authenticates against a generated address because it
   * has no email of its own — a student.
   *
   * Carried on the session so My Page can offer 이메일 추가 instead of showing
   * an empty field, and so the account surfaces can explain that password
   * recovery runs through the academy rather than through an inbox.
   */
  emailIsPlaceholder: z.boolean(),
  memberships: z.array(academyMembershipSummarySchema),
  applications: z.array(academyApplicationSummarySchema),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const authMeResponseSchema = z.object({ user: authUserSchema });
export type AuthMeResponse = z.infer<typeof authMeResponseSchema>;
