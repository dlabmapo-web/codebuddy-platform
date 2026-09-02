import { oc } from "@orpc/contract";
import { z } from "zod";

import {
  listPlatformApplicationsInputSchema,
  listPlatformApplicationsResultSchema,
} from "../../platform/applications.js";

/**
 * Everyone waiting to be let into an academy, across every academy.
 *
 * Reads only, and there is no `review` here on purpose. Approving or rejecting
 * calls `academyJoinRequests.review` — the same procedure a manager's own
 * Applications page calls — which already permits an operator through the
 * platform branch of `AcademyAccessService`. A second review procedure would
 * mean a second role ceiling and a second audit shape for one act.
 */
export const platformApplicationsContract = {
  list: oc
    .input(listPlatformApplicationsInputSchema)
    .output(listPlatformApplicationsResultSchema),
  /**
   * How many applications only an operator can clear, and nothing else.
   *
   * Its own procedure rather than `list().summary.leaderless`, for the reason
   * `academyJoinRequests.pendingCount` gives: the sidebar asks this on every
   * console page entry, and `list` signs a profile-image URL per applicant to
   * draw a table this caller never renders.
   *
   * It counts the leaderless ones alone. A badge showing every pending
   * application would sit permanently at some number that is a manager's work,
   * and a badge that is always lit is a badge nobody reads.
   */
  pendingCount: oc
    .input(z.object({}).strict())
    .output(z.object({ count: z.number().int().nonnegative() })),
};
