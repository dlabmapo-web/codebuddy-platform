import { oc } from "@orpc/contract";

import {
  listPlatformInvitationsInputSchema,
  listPlatformInvitationsResultSchema,
} from "../../platform/invitations.js";

/**
 * Every invitation on the platform, and whether it arrived.
 *
 * Reads only, and there is no `create`, `revoke` or `resend` here on purpose.
 * Sending calls `academyInvitations.create`, revoking calls
 * `academyInvitations.revoke`, and resending calls
 * `academyInvitationDelivery.resend` — the same three procedures a manager's
 * own Invitations page calls, each of which already permits an operator through
 * the platform branch of `AcademyAccessService`. A second set would mean a
 * second role ceiling, a second audit shape, and a second delivery ladder for
 * one act.
 *
 * The rows carry an address and a role — identity rather than learning data.
 * Nothing here returns a token: only its hash is stored, and the one moment it
 * can be shown is the response to the create call that minted it.
 */
export const platformInvitationsContract = {
  list: oc
    .input(listPlatformInvitationsInputSchema)
    .output(listPlatformInvitationsResultSchema),
};
