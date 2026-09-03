import { z } from "zod";

import { academyRoleSchema } from "../auth/roles.js";
import { memberAvatarUrlsShape } from "../profile/avatar.js";
import {
  invitationStatusSchema,
  joinRequestStatusSchema,
  membershipStatusSchema,
} from "./status.js";

export const signupAcademySchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  slug: z.string().min(1),
});

export const academyApplicationSummarySchema = z.object({
  id: z.uuid(),
  academy: signupAcademySchema,
  status: joinRequestStatusSchema,
  approvedRole: academyRoleSchema.nullable(),
  reviewReason: z.string().nullable(),
  createdAt: z.iso.datetime(),
  reviewedAt: z.iso.datetime().nullable(),
});

export const academyJoinRequestDetailSchema = z.object({
  id: z.uuid(),
  academyId: z.uuid(),
  user: z.object({
    id: z.uuid(),
    email: z.email().nullable(),
    displayName: z.string().nullable(),
    ...memberAvatarUrlsShape,
  }),
  message: z.string().nullable(),
  status: joinRequestStatusSchema,
  approvedRole: academyRoleSchema.nullable(),
  reviewReason: z.string().nullable(),
  createdAt: z.iso.datetime(),
  reviewedAt: z.iso.datetime().nullable(),
});

export const academyMemberSchema = z.object({
  id: z.uuid(),
  user: z.object({
    id: z.uuid(),
    /** Null for a student, who has no address of their own. */
    email: z.email().nullable(),
    displayName: z.string().nullable(),
  }),
  /** The member's highest role — what the roster sorts and filters on. */
  role: academyRoleSchema,
  /** Every role they hold here, `role` included. */
  roles: z.array(academyRoleSchema).min(1),
  status: membershipStatusSchema,
  joinedAt: z.iso.datetime().nullable(),
  suspendedAt: z.iso.datetime().nullable(),
});

export const academyInvitationDetailSchema = z.object({
  id: z.uuid(),
  academyId: z.uuid(),
  email: z.email(),
  role: academyRoleSchema,
  status: invitationStatusSchema,
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  acceptedAt: z.iso.datetime().nullable(),
  revokedAt: z.iso.datetime().nullable(),
});
