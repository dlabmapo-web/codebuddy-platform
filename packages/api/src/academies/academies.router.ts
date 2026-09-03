import { createAccess } from "../orpc/access.js";
import {
  requestAddress,
  type ORPCDeps,
  type ORPCImplementer,
} from "../orpc/context.js";

export function createAcademiesRouters(os: ORPCImplementer, deps: ORPCDeps) {
  const access = createAccess(os, deps);

  return {
    academies: {
      listForSignup: os.academies.listForSignup.handler(({ context }) => {
        deps.rateLimitService.assert(
          `academies:list:${requestAddress(context.req)}`,
          120,
          60_000,
        );
        return deps.academyDiscoveryService.listForSignup();
      }),
    },
    joinRequests: {
      create: os.joinRequests.create
        .use(access.authenticated)
        .handler(({ context, input }) => {
          deps.rateLimitService.assert(
            `join:create:${context.identity.authUserId}`,
            10,
            60 * 60_000,
          );
          return deps.academyOnboardingService.create(context.identity, input);
        }),
      cancel: os.joinRequests.cancel
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.academyOnboardingService.cancel(context.identity, input.requestId)
        ),
    },
    academyJoinRequests: {
      list: os.academyJoinRequests.list
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.academyJoinRequestService.list(
            context.identity,
            input.academyId,
          )
        ),
      pendingCount: os.academyJoinRequests.pendingCount
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.academyJoinRequestService.pendingCount(
            context.identity,
            input.academyId,
          )
        ),
      review: os.academyJoinRequests.review
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.academyJoinRequestService.review(context.identity, input)
        ),
    },
    academyInvitations: {
      create: os.academyInvitations.create
        .use(access.authenticated)
        .handler(async ({ context, input }) => {
          const created = await deps.academyInvitationService.create(
            context.identity,
            input,
          );
          // §13 — the email is queued *after* the invitation has committed,
          // and its failure never fails this call. The invitation is valid
          // either way; the attempt row records what happened to the message,
          // and the manager can resend from the invitations table.
          //
          // Composed here rather than inside the service so the invitation
          // module keeps no dependency on delivery — §7.6 makes an invitation's
          // lifecycle and an email's delivery state two separate things.
          await deps.invitationDeliveryService.queueForInvitation({
            invitationId: created.invitation.id,
            academyId: input.academyId,
            email: created.invitation.email,
            token: created.token,
          });
          return created;
        }),
      list: os.academyInvitations.list
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.academyInvitationService.list(
            context.identity,
            input.academyId,
          )
        ),
      revoke: os.academyInvitations.revoke
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.academyInvitationService.revoke(context.identity, input)
        ),
      // No `access.authenticated`: read before an account exists. Limited by
      // address rather than by identity for the same reason — there is no
      // identity yet — and tightly, since a legitimate recipient reads one
      // invitation a handful of times while a scanner would need billions.
      preview: os.academyInvitations.preview
        .handler(({ context, input }) => {
          deps.rateLimitService.assert(
            `invitation:preview:${requestAddress(context.req)}`,
            30,
            10 * 60_000,
          );
          return deps.academyInvitationService.preview(input.token);
        }),
      accept: os.academyInvitations.accept
        .use(access.authenticated)
        .handler(({ context, input }) => {
          deps.rateLimitService.assert(
            `invitation:accept:${context.identity.authUserId}`,
            20,
            60 * 60_000,
          );
          return deps.academyInvitationService.accept(
            context.identity,
            input.token,
          );
        }),
    },
    academyMembers: {
      list: os.academyMembers.list
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.academyMembershipService.list(
            context.identity,
            input.academyId,
          )
        ),
      changeRole: os.academyMembers.changeRole
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.academyMembershipService.changeRole(context.identity, input)
        ),
      grantRole: os.academyMembers.grantRole
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.academyMembershipService.grantRole(context.identity, input)
        ),
      revokeRole: os.academyMembers.revokeRole
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.academyMembershipService.revokeRole(context.identity, input)
        ),
      suspend: os.academyMembers.suspend
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.academyMembershipService.suspend(context.identity, input)
        ),
      restore: os.academyMembers.restore
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.academyMembershipService.restore(context.identity, input)
        ),
    },
    /**
     * A student's password, for the manager who is their only way back in.
     *
     * Each of these authorizes separately against
     * `academy.members.credentials.manage` before the service runs, and the
     * service refuses any target that is not a student of this academy — so a
     * caller who reaches here still cannot address a colleague's account.
     *
     * `reveal` is limited far more tightly than it is authorized. A manager
     * legitimately reads a handful of passwords in a session; a script walking
     * the roster to harvest them would need hundreds, and the limit is what
     * makes the difference visible.
     */
    academyStudentCredentials: {
      get: os.academyStudentCredentials.get
        .use(access.authenticated)
        .handler(async ({ context, input }) => {
          await deps.academyAccessService.requirePermission(
            context.identity.authUserId,
            input.academyId,
            "academy.members.credentials.manage",
          );
          return deps.studentCredentialService.state(
            input.academyId,
            input.membershipId,
          );
        }),
      issue: os.academyStudentCredentials.issue
        .use(access.authenticated)
        .handler(async ({ context, input }) => {
          const actor = await deps.academyAccessService.requirePermission(
            context.identity.authUserId,
            input.academyId,
            "academy.members.credentials.manage",
          );
          deps.rateLimitService.assert(
            `academy:credentials:issue:${actor.userId}`,
            60,
            60 * 60_000,
          );
          return deps.studentCredentialService.issue(
            actor.userId,
            input.academyId,
            input.membershipId,
          );
        }),
      reveal: os.academyStudentCredentials.reveal
        .use(access.authenticated)
        .handler(async ({ context, input }) => {
          const actor = await deps.academyAccessService.requirePermission(
            context.identity.authUserId,
            input.academyId,
            "academy.members.credentials.manage",
          );
          deps.rateLimitService.assert(
            `academy:credentials:reveal:${actor.userId}`,
            60,
            60 * 60_000,
          );
          return deps.studentCredentialService.reveal(
            actor.userId,
            input.academyId,
            input.membershipId,
          );
        }),
    },
  };
}
