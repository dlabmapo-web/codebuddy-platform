import { oc } from "@orpc/contract";
import { z } from "zod";

import { academyInvitationDetailSchema } from "../../memberships/academy.js";
import {
  createPlatformAcademyInputSchema,
  createPlatformAcademyResultSchema,
  listPlatformAcademiesInputSchema,
  platformAcademyDetailSchema,
  resolveAcademySlugInputSchema,
  resolveAcademySlugResultSchema,
  updatePlatformAcademyInputSchema,
  platformAcademySummarySchema,
  resendFirstManagerInvitationInputSchema,
  setAcademyStatusInputSchema,
} from "../../platform/academy.js";

/**
 * The platform operator's academy surface.
 *
 * Everything here is *about* an academy — never inside one. No method returns
 * a submission, a draft, a grade, or a member's profile, because platform
 * authority is a lifecycle capability and support access to academy data is a
 * separate, audited, time-limited thing that has to be built deliberately
 * rather than acquired as a side effect of being able to create academies.
 */
export const platformAcademiesContract = {
  list: oc.input(listPlatformAcademiesInputSchema).output(
    z.object({
      academies: z.array(platformAcademySummarySchema),
      total: z.number().int().nonnegative(),
      /** Rows wanting an operator, regardless of the current filter. */
      needsAttention: z.number().int().nonnegative(),
    }),
  ),
  get: oc
    .input(z.object({ academyId: z.uuid() }))
    .output(platformAcademyDetailSchema),
  create: oc
    .input(createPlatformAcademyInputSchema)
    .output(createPlatformAcademyResultSchema),
  update: oc
    .input(updatePlatformAcademyInputSchema)
    .output(platformAcademyDetailSchema),
  /**
   * Where a URL's slug points now. Any authenticated caller: it reveals only
   * what a working link already revealed.
   */
  resolveSlug: oc
    .input(resolveAcademySlugInputSchema)
    .output(resolveAcademySlugResultSchema),
  setStatus: oc
    .input(setAcademyStatusInputSchema)
    .output(platformAcademyDetailSchema),
  /**
   * Exists because the ordinary resend is manager-scoped, and an academy still
   * awaiting its first manager has — by definition — no manager to call it.
   */
  resendFirstManagerInvitation: oc
    .input(resendFirstManagerInvitationInputSchema)
    .output(
      z.object({
        invitation: academyInvitationDetailSchema,
        token: z.string().min(32),
      }),
    ),
};
