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
import {
  issueStudentPasswordInputSchema,
  revealStudentPasswordInputSchema,
  studentCredentialStateSchema,
  studentPasswordRevealSchema,
} from "../../memberships/student-credentials.js";
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
  /**
   * Replaces the member's primary role. Any additional roles they hold are
   * untouched — this is the existing single-role action, kept for the surfaces
   * that change one person's standing outright.
   */
  changeRole: oc
    .input(membershipInputSchema.extend({ role: academyRoleSchema }))
    .output(academyMemberSchema),
  /**
   * Adds a role beside the ones this member already holds.
   *
   * Refused when it would put `STUDENT` alongside a staff role in either
   * direction: a membership id names one subject, and every points,
   * monitoring, and analytics query depends on that staying true.
   */
  grantRole: oc
    .input(membershipInputSchema.extend({ role: academyRoleSchema }))
    .output(academyMemberSchema),
  /**
   * Takes a role away. Removing the last one is refused — a member with no
   * role is not a member, and the action for that is removing the membership.
   * Removing the primary role promotes the highest of the rest.
   */
  revokeRole: oc
    .input(membershipInputSchema.extend({ role: academyRoleSchema }))
    .output(academyMemberSchema),
  suspend: oc
    .input(membershipInputSchema)
    .output(academyMemberSchema),
  restore: oc
    .input(membershipInputSchema)
    .output(academyMemberSchema),
};

/**
 * A student's password, for the manager who is their only way back in.
 *
 * A student has no email and therefore no self-service recovery. These three
 * procedures are that recovery, and each one is separately authorized by
 * `academy.members.credentials.manage` and separately audited — deliberately
 * apart from `academyMembers`, whose actions change what a person may do
 * rather than reading a secret.
 *
 * Every one of them refuses a target that is not a student, including the
 * caller's own membership: a manager must not be able to mint themselves a
 * password for a colleague's account.
 */
export const academyStudentCredentialsContract = {
  /** The panel's state. Never the password — see `reveal`. */
  get: oc
    .input(revealStudentPasswordInputSchema)
    .output(studentCredentialStateSchema),
  /**
   * Generates a new password, sets it in Supabase, and shows it once.
   *
   * Does not revoke the student's existing sessions: a child mid-lesson should
   * not be thrown out of their work because an office computer clicked a
   * button.
   */
  issue: oc
    .input(issueStudentPasswordInputSchema)
    .output(studentPasswordRevealSchema),
  /**
   * Reads back the password this academy issued, if it is still the student's.
   *
   * Fetched on demand and never in a list response, so a plaintext password is
   * never in a page's initial payload or a query cache that outlives the click.
   */
  reveal: oc
    .input(revealStudentPasswordInputSchema)
    .output(studentPasswordRevealSchema),
};
