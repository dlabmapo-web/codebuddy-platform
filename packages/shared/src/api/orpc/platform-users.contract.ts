import { oc } from "@orpc/contract";
import { z } from "zod";

import {
  listPlatformUsersInputSchema,
  listPlatformUsersResultSchema,
  platformUserDetailSchema,
  setPlatformUserStatusInputSchema,
} from "../../platform/users.js";

/**
 * The platform operator's people surface.
 *
 * The sibling of `platformAcademiesContract`, and bound by the same rule read
 * the other way round: that contract is about academies and never inside one,
 * this one is about *accounts* and never inside their learning. No method here
 * returns a submission, a grade, a progress figure, a point balance, or a
 * student's academy profile. An operator who needs those opens a support grant,
 * which states a reason and expires — and the account page offers exactly that
 * rather than quietly showing them.
 */
export const platformUsersContract = {
  list: oc
    .input(listPlatformUsersInputSchema)
    .output(listPlatformUsersResultSchema),
  get: oc
    .input(z.object({ userId: z.uuid() }))
    .output(platformUserDetailSchema),
  /**
   * Suspend or restore an account, platform-wide.
   *
   * Genuinely global with nothing to enforce per surface: both access services
   * refuse `SUSPENDED` and `DELETED` before they read any role, so the status
   * takes effect on the caller's next request everywhere at once.
   */
  setStatus: oc
    .input(setPlatformUserStatusInputSchema)
    .output(platformUserDetailSchema),
};
