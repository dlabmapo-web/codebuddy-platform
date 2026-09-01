import { oc } from "@orpc/contract";
import { z } from "zod";

import {
  activeSupportGrantSchema,
  listSupportGrantsInputSchema,
  listSupportGrantsResultSchema,
  openSupportGrantInputSchema,
  revokeSupportGrantInputSchema,
  supportGrantSchema,
} from "../../platform/support.js";

/**
 * Support access — the exception to `platformAcademiesContract`'s rule, in its
 * own file so that it reads as an exception.
 *
 * That contract says everything on the platform axis is *about* an academy and
 * never inside one. This is the one thing that is not, which is exactly why it
 * does not live beside it: an endpoint that reaches into customer data should
 * be somewhere a reviewer notices, not appended to a list of lifecycle calls.
 *
 * Nothing here returns academy data itself. Opening a grant returns the grant;
 * the operator then walks the academy's own routes, which authorize themselves
 * as they always did.
 */
export const platformSupportContract = {
  list: oc
    .input(listSupportGrantsInputSchema)
    .output(listSupportGrantsResultSchema),
  get: oc.input(z.object({ grantId: z.uuid() })).output(supportGrantSchema),
  open: oc.input(openSupportGrantInputSchema).output(supportGrantSchema),
  revoke: oc.input(revokeSupportGrantInputSchema).output(supportGrantSchema),
  /**
   * The caller's own live grant for one academy, or null.
   *
   * Keyed on the slug rather than the id, because both callers have a slug and
   * one of them — the academy route guard — has no id until this answers: an
   * operator holding a grant belongs to no membership, so nothing else in the
   * request can tell it which academy it is looking at.
   *
   * Read by the studio shell on every academy page, so it answers for the
   * caller only and carries no academy data beyond the name it puts in the
   * banner. Any authenticated caller may ask: a member with no grant gets
   * null, which is the same answer an operator without one gets.
   */
  active: oc
    .input(z.object({ academySlug: z.string().min(1) }))
    .output(activeSupportGrantSchema),
};
