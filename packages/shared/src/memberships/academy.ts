import { z } from "zod";

import { academyRoleSchema } from "../auth/roles.js";
import { memberAvatarUrlsShape } from "../profile/avatar.js";
import { joinRequestKindSchema } from "./join-request.js";
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
  /**
   * What the applicant said they were applying as, at signup.
   *
   * Carried to the reviewer because they are the one person who has to answer
   * it: the queue showed a name, a message and a date, and somebody who chose
   * Staff on the signup form arrived looking exactly like somebody who chose
   * Student. The dialog then opened on `STUDENT`, so the ordinary path — read
   * the row, press Approve — seated a would-be teacher as a student, and the
   * only trace of what they had asked for was a column nothing rendered.
   *
   * It stays what it is elsewhere: a hint. It grants nothing, bounds nothing,
   * and the role still comes from the manager's choice in the dialog.
   */
  requestedKind: joinRequestKindSchema,
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
