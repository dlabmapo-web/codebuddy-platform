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
      review: os.academyJoinRequests.review
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.academyJoinRequestService.review(context.identity, input)
        ),
    },
    academyInvitations: {
      create: os.academyInvitations.create
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.academyInvitationService.create(context.identity, input)
        ),
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
  };
}
