import { z } from "zod";

import { supportAssumedRoleSchema } from "../auth/roles.js";

/**
 * Support access: the one authority on the platform axis that reaches inside
 * an academy.
 *
 * Everything here exists to make deep access something an academy could be
 * shown afterwards. A grant states why it was opened, what it could do, how
 * long it lasted, and — through `AuditLog.supportGrantId` — exactly what was
 * done under it. Remove any one of those and this becomes an admin flag with
 * extra steps.
 *
 * See §3.2–3.5 and §6.4 of the platform admin console design.
 */

/**
 * The longest a grant may run.
 *
 * Long enough to finish a support session, short enough that forgetting is an
 * inconvenience rather than a breach. An operator who needs longer opens a
 * second grant, which costs them one sentence and produces a fresh record —
 * that is the trade, and it is the right way round.
 */
export const SUPPORT_GRANT_MAX_HOURS = 4;
export const SUPPORT_GRANT_DEFAULT_HOURS = 1;

export const supportGrantDurationSchema = z
  .number()
  .int()
  .min(1)
  .max(SUPPORT_GRANT_MAX_HOURS);

/* --------------------------------------------------------------- reading */

/**
 * Why a grant is not usable, or `null` while it is.
 *
 * A closed set rather than a boolean, because the three answers lead somewhere
 * different: an expired grant is reopened, a revoked one was somebody's
 * decision, and a scheduled one only needs waiting for.
 */
export const supportGrantStates = [
  "live",
  "scheduled",
  "expired",
  "revoked",
] as const;
export const supportGrantStateSchema = z.enum(supportGrantStates);
export type SupportGrantState = (typeof supportGrantStates)[number];

export function supportGrantState(
  grant: {
    startsAt: string | Date;
    expiresAt: string | Date;
    revokedAt: string | Date | null;
  },
  now: Date = new Date(),
): SupportGrantState {
  // Revocation wins over every other reading. A grant revoked before it
  // expired is a decision somebody made, and reporting it as merely expired
  // would erase that from the trail.
  if (grant.revokedAt) return "revoked";
  if (new Date(grant.expiresAt) <= now) return "expired";
  if (new Date(grant.startsAt) > now) return "scheduled";
  return "live";
}

export const supportGrantSchema = z.object({
  id: z.uuid(),
  academyId: z.uuid(),
  academyName: z.string().min(1),
  academySlug: z.string().min(1),
  adminUserId: z.uuid(),
  adminName: z.string().min(1),
  assumedRole: supportAssumedRoleSchema,
  readOnly: z.boolean(),
  allowMonitoring: z.boolean(),
  reason: z.string().min(1),
  startsAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  revokedAt: z.iso.datetime().nullable(),
  revokedByName: z.string().nullable(),
  createdAt: z.iso.datetime(),
  state: supportGrantStateSchema,
});
export type SupportGrant = z.infer<typeof supportGrantSchema>;

export const listSupportGrantsInputSchema = z.object({
  /** Narrow to one academy, for the academy detail page's own panel. */
  academyId: z.uuid().optional(),
  /** Live grants only. What the console's landing view asks for. */
  liveOnly: z.boolean().optional(),
  limit: z.number().int().min(1).max(200).default(50),
});
export type ListSupportGrantsInput = z.input<
  typeof listSupportGrantsInputSchema
>;

export const listSupportGrantsResultSchema = z.object({
  grants: z.array(supportGrantSchema),
  /** Live right now, whatever the filter. The number the console badges. */
  liveCount: z.number().int().nonnegative(),
});
export type ListSupportGrantsResult = z.infer<
  typeof listSupportGrantsResultSchema
>;

/* -------------------------------------------------------------- mutation */

export const openSupportGrantInputSchema = z.object({
  academyId: z.uuid(),
  assumedRole: supportAssumedRoleSchema,
  readOnly: z.boolean().default(true),
  allowMonitoring: z.boolean().default(false),
  /**
   * Required, and long enough to be a sentence. "fix" is not a reason
   * somebody can act on six weeks later, and this text is the whole of what an
   * academy gets to read about why Cove was inside their data.
   */
  reason: z.string().trim().min(12).max(500),
  hours: supportGrantDurationSchema.default(SUPPORT_GRANT_DEFAULT_HOURS),
});
export type OpenSupportGrantInput = z.input<
  typeof openSupportGrantInputSchema
>;
export type ResolvedOpenSupportGrantInput = z.infer<
  typeof openSupportGrantInputSchema
>;

export const revokeSupportGrantInputSchema = z.object({
  grantId: z.uuid(),
});
export type RevokeSupportGrantInput = z.infer<
  typeof revokeSupportGrantInputSchema
>;

/**
 * What the studio shell needs to draw the banner.
 *
 * Read on every academy page an operator opens, so it is deliberately tiny:
 * one row, four fields, no academy or member data. A page that showed nothing
 * while this loaded would be a page where the operator has already started
 * working without the reminder that they are inside somebody's academy.
 */
export const activeSupportGrantSchema = z
  .object({
    id: z.uuid(),
    academyId: z.uuid(),
    academySlug: z.string().min(1),
    academyName: z.string().min(1),
    assumedRole: supportAssumedRoleSchema,
    readOnly: z.boolean(),
    allowMonitoring: z.boolean(),
    reason: z.string().min(1),
    expiresAt: z.iso.datetime(),
  })
  .nullable();
export type ActiveSupportGrant = z.infer<typeof activeSupportGrantSchema>;
