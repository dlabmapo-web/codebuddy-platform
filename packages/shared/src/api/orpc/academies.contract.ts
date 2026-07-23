import { oc } from "@orpc/contract";
import { z } from "zod";

import { academyRoleSchema } from "../../auth/roles.js";
import {
  academyInvitationDetailSchema,
  academyJoinRequestDetailSchema,
  academyMemberSchema,
  signupAcademySchema,
} from "../../memberships/academy.js";
import {
  acceptAcademyInvitationSchema,
  createAcademyInvitationSchema,
  revokeAcademyInvitationSchema,
} from "../../memberships/invitation.js";
import {
  cancelAcademyJoinRequestSchema,
  createAcademyJoinRequestSchema,
  reviewAcademyJoinRequestSchema,
} from "../../memberships/join-request.js";
import { successResponseSchema } from "./common.contract.js";

const academyInputSchema = z.object({ academyId: z.uuid() });
const membershipInputSchema = academyInputSchema.extend({
  membershipId: z.uuid(),
});

export const academiesContract = {
  listForSignup: oc
    .input(z.object({}))
    .output(z.object({ academies: z.array(signupAcademySchema) })),
};

export const joinRequestsContract = {
  create: oc
    .input(createAcademyJoinRequestSchema)
    .output(academyJoinRequestDetailSchema),
  cancel: oc
    .input(cancelAcademyJoinRequestSchema)
    .output(academyJoinRequestDetailSchema),
};

export const academyJoinRequestsContract = {
  list: oc
    .input(academyInputSchema)
    .output(z.object({ requests: z.array(academyJoinRequestDetailSchema) })),
  review: oc
    .input(reviewAcademyJoinRequestSchema)
    .output(academyJoinRequestDetailSchema),
};

export const academyInvitationsContract = {
  create: oc
    .input(createAcademyInvitationSchema)
    .output(z.object({
      invitation: academyInvitationDetailSchema,
      token: z.string().min(32),
    })),
  list: oc
    .input(academyInputSchema)
    .output(z.object({ invitations: z.array(academyInvitationDetailSchema) })),
  revoke: oc
    .input(revokeAcademyInvitationSchema)
    .output(academyInvitationDetailSchema),
  accept: oc
    .input(acceptAcademyInvitationSchema)
    .output(academyMemberSchema),
};

export const academyMembersContract = {
  list: oc
    .input(academyInputSchema)
    .output(z.object({ members: z.array(academyMemberSchema) })),
  changeRole: oc
    .input(membershipInputSchema.extend({ role: academyRoleSchema }))
    .output(academyMemberSchema),
  suspend: oc
    .input(membershipInputSchema)
    .output(academyMemberSchema),
  restore: oc
    .input(membershipInputSchema)
    .output(academyMemberSchema),
};
