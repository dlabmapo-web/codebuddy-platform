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
  academyInvitationPreviewSchema,
  createAcademyInvitationSchema,
  previewAcademyInvitationSchema,
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
  /**
   * How many applicants are waiting, and nothing else.
   *
   * Its own procedure rather than `list().requests.length`: the nav asks this
   * on every studio page entry for every manager and team lead, and `list`
   * signs a profile-image URL per applicant to draw a table this caller never
   * renders. One indexed count against `(academyId, status, createdAt)` is the
   * whole answer.
   */
  pendingCount: oc
    .input(academyInputSchema)
    .output(z.object({ count: z.number().int().nonnegative() })),
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
  /**
   * Unauthenticated on purpose: it is read before anybody has an account.
   *
   * The recipient of an invitation may already have a Cove account or may not,
   * and until this existed the link guessed — signed out meant "send them to
   * signup" — which stranded everyone in the first group at a form that could
   * only reject them. The answer to the guess is to stop guessing and let the
   * invitation say what it is, so the page can offer both doors.
   */
  preview: oc
    .input(previewAcademyInvitationSchema)
    .output(academyInvitationPreviewSchema),
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
