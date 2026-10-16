import { z } from 'zod';

export const dlabExternalId = z.string().min(1).max(64);
const status = z.enum(['active', 'inactive']);
const timestamp = z.iso.datetime({ offset: true }).optional();
export const dlabCampusSchema = z.object({
  name: z.string().min(1).max(200),
  campus_type: z.enum(['direct', 'franchise']).optional(),
  status,
  updated_at: timestamp,
});
export const dlabUserSchema = z.object({
  external_campus_id: dlabExternalId,
  external_campus_ids: z.array(dlabExternalId).max(100).optional(),
  name: z.string().min(1).max(200),
  grade: z.string().max(100).optional(),
  user_role: z.string().min(1).max(64),
  account_status: status,
  updated_at: timestamp,
});
export const dlabSsoUserSchema = dlabUserSchema.omit({ updated_at: true }).extend({
  external_user_id: dlabExternalId,
  issued_at: timestamp,
});
export type DlabUser = z.infer<typeof dlabUserSchema>;
export type DlabSsoUser = z.infer<typeof dlabSsoUserSchema>;

/** Restrict post-login destinations before and after checking academy ownership. */
export function safeDlabReturnTo(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 1024 || !value.startsWith('/academy/')) return null;
  if (/[\\\x00-\x20\x7f%?#]/.test(value) || value.includes('//') || value.split('/').some(p => p === '.' || p === '..')) return null;
  return /^\/academy\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-zA-Z0-9_/-]*)?$/.test(value) ? value : null;
}
