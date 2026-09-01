import { oc } from "@orpc/contract";
import { z } from "zod";

import {
  auditEntryDetailSchema,
  listAuditInputSchema,
  listAuditResultSchema,
} from "../../platform/audit.js";

/**
 * Reading what happened.
 *
 * The trail is written by everything and, until now, read by nothing. It sits
 * on the platform axis because an operator's question spans academies — "who
 * suspended this account", "what did that support session do" — and no
 * academy-scoped surface can answer either.
 */
export const platformAuditContract = {
  list: oc.input(listAuditInputSchema).output(listAuditResultSchema),
  get: oc
    .input(z.object({ entryId: z.uuid() }))
    .output(auditEntryDetailSchema),
};
