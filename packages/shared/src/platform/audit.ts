import { z } from "zod";

/**
 * The platform's read of the audit trail.
 *
 * `AuditLog` has been written by every feature since the beginning and read by
 * nothing. This is the surface that makes it worth having: it answers "what
 * happened, who did it, and under what authority" — and for support access, it
 * is the only thing standing between a grant and a promise.
 */

export const auditEntrySchema = z.object({
  id: z.uuid(),
  action: z.string().min(1),
  targetType: z.string().min(1),
  targetId: z.string().nullable(),
  actorName: z.string().nullable(),
  actorUserId: z.uuid().nullable(),
  academyId: z.uuid().nullable(),
  academyName: z.string().nullable(),
  academySlug: z.string().nullable(),
  reason: z.string().nullable(),
  createdAt: z.iso.datetime(),
  /**
   * Set when this act was performed under support access.
   *
   * The field that lets one page answer both questions an academy asks: what
   * changed, and was it us or was it Cove.
   */
  supportGrantId: z.uuid().nullable(),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;

export const auditEntryDetailSchema = auditEntrySchema.extend({
  /** The record before and after, as stored. Unshaped on purpose: every
   * feature writes its own, and a schema here would go stale silently. */
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  requestId: z.string().nullable(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
});
export type AuditEntryDetail = z.infer<typeof auditEntryDetailSchema>;

export const AUDIT_PAGE_SIZE = 50;

export const listAuditInputSchema = z.object({
  academyId: z.uuid().optional(),
  actorUserId: z.uuid().optional(),
  supportGrantId: z.uuid().optional(),
  /** Matched against the action name, which is how an operator searches: they
   * remember "suspended", not a target id. */
  action: z.string().trim().max(120).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(AUDIT_PAGE_SIZE),
});
export type ListAuditInput = z.input<typeof listAuditInputSchema>;
export type ResolvedListAuditInput = z.infer<typeof listAuditInputSchema>;

export const listAuditResultSchema = z.object({
  entries: z.array(auditEntrySchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
});
export type ListAuditResult = z.infer<typeof listAuditResultSchema>;
