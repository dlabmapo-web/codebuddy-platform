import { oc } from "@orpc/contract";
import { z } from "zod";

import { getMembershipParticipationInputSchema, membershipParticipationSchema } from "../../platform/participation.js";
import {
  listPlatformUsersInputSchema,
  listPlatformUsersResultSchema,
  platformUserDetailSchema,
  setPlatformMembershipRoleInputSchema,
  setPlatformUserRoleInputSchema,
  setPlatformUserStatusInputSchema,
} from "../../platform/users.js";

/**
 * The platform operator's people surface.
 *
 * The sibling of `platformAcademiesContract`, and bound by the same rule read
 * the other way round: that contract is about academies and never inside one,
 * this one is about *accounts* and never inside their learning. Every method
 * here stops at structure and totals — §3.4 of the console people operations
 * design draws the line, and `participation` is the one method that reads
 * anywhere near it, gated on its own permission and audited when it reads a
 * student. No method returns a submission, a grade, or a field of
 * `StudentAcademyProfile`; those stay behind a support grant.
 */
export const platformUsersContract = {
  list: oc
    .input(listPlatformUsersInputSchema)
    .output(listPlatformUsersResultSchema),
  get: oc
    .input(z.object({ userId: z.uuid() }))
    .output(platformUserDetailSchema),
  /**
   * Suspend, restore, or delete an account, platform-wide.
   *
   * Genuinely global with nothing to enforce per surface: both access services
   * refuse `SUSPENDED` and `DELETED` before they read any role, so the status
   * takes effect on the caller's next request everywhere at once. `DELETED`
   * additionally requires `platform.users.delete` and a typed confirmation —
   * see the service.
   */
  setStatus: oc
    .input(setPlatformUserStatusInputSchema)
    .output(platformUserDetailSchema),
  /**
   * One membership's participation: their classes, the courses in them, and
   * their totals. Fetched lazily, per membership, when its card expands — see
   * §3.4 and §3.5 of the console people operations design.
   */
  participation: oc
    .input(getMembershipParticipationInputSchema)
    .output(membershipParticipationSchema),
  /** Changing one academy membership's role from the console. §3.6, §3.8. */
  setMembershipRole: oc
    .input(setPlatformMembershipRoleInputSchema)
    .output(platformUserDetailSchema),
  /** Granting or revoking platform operator status. §3.3, §3.6. */
  setPlatformRole: oc
    .input(setPlatformUserRoleInputSchema)
    .output(platformUserDetailSchema),
};
