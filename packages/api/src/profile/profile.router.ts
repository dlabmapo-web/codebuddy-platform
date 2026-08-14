import { createAccess } from "../orpc/access.js";
import type { ORPCDeps, ORPCImplementer } from "../orpc/context.js";

/**
 * Two namespaces because they have two owners. `profile` is the person's own
 * account and no academy reaches it; `academyProfile` is one membership, and
 * every one of its procedures resolves that membership inside one academy
 * before it touches a field.
 */
export function createProfileRouters(os: ORPCImplementer, deps: ORPCDeps) {
  const access = createAccess(os, deps);

  return {
    profile: {
      getMe: os.profile.getMe
        .use(access.authenticated)
        .handler(({ context }) => deps.profileService.getMe(context.identity)),
      updateGlobalProfile: os.profile.updateGlobalProfile
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.profileService.updateGlobalProfile(context.identity, input)
        ),
      updatePreferences: os.profile.updatePreferences
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.profileService.updatePreferences(context.identity, input)
        ),
      removeImage: os.profile.removeImage
        .use(access.authenticated)
        .handler(({ context }) =>
          deps.profileService.removeImage(context.identity)
        ),
    },
    academyProfile: {
      getMine: os.academyProfile.getMine
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.academyProfileService.getMine(context.identity, input.academyId)
        ),
      updateMine: os.academyProfile.updateMine
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.academyProfileService.updateMine(context.identity, input)
        ),
      updateStudentDetails: os.academyProfile.updateStudentDetails
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.academyProfileService.updateStudentDetails(
            context.identity,
            input,
          )
        ),
      updateStudentSelfExpression: os.academyProfile.updateStudentSelfExpression
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.academyProfileService.updateStudentSelfExpression(
            context.identity,
            input,
          )
        ),
      updateStaffProfile: os.academyProfile.updateStaffProfile
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.academyProfileService.updateStaffProfile(context.identity, input)
        ),
      removeImage: os.academyProfile.removeImage
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.academyProfileService.removeImage(context.identity, input)
        ),
      getForManager: os.academyProfile.getForManager
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.academyProfileService.getForManager(context.identity, input)
        ),
      updateForManager: os.academyProfile.updateForManager
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.academyProfileService.updateForManager(context.identity, input)
        ),
    },
  };
}
