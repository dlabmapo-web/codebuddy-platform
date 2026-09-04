import { oc } from "@orpc/contract";
import { z } from "zod";

import { joinRequestKindSchema } from "../../memberships/join-request.js";

/**
 * Everything an applicant may read about the academy they are waiting for.
 *
 * The whole surface, deliberately: a name, an image, whether the academy runs
 * points, and the applicant's own application. The lobby's pages are empty by
 * construction rather than by filtering, so there is no roster, catalog,
 * ranking or count to get wrong here — the failure mode of a mistake in the
 * lobby is a broken page, never somebody else's data.
 *
 * Answered only for a caller holding a PENDING application for an ACTIVE
 * academy. Anyone else gets `ACADEMY_NOT_FOUND` rather than a refusal, so this
 * cannot be used to ask which academies exist.
 */
export const lobbyContract = {
  academy: oc
    .input(z.object({ academySlug: z.string().min(1).max(200) }))
    .output(
      z.object({
        id: z.uuid(),
        name: z.string(),
        slug: z.string(),
        imageUrl: z.string().nullable(),
        /**
         * So the lobby offers exactly the rows the member sidebar will. An
         * academy that does not run points must not show a child a link to a
         * page about points they cannot earn, and a row that vanishes on
         * approval is worse than one that was never there.
         */
        hasPoints: z.boolean(),
        application: z.object({
          id: z.uuid(),
          requestedKind: joinRequestKindSchema,
          createdAt: z.iso.datetime(),
        }),
      }),
    ),
};
