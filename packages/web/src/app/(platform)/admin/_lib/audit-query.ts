import type { ResolvedListAuditInput } from '@cove/shared';
import { AUDIT_PAGE_SIZE } from '@cove/shared';

/**
 * The trail's state, read out of the address.
 *
 * Small enough to live here rather than in `@cove/shared`: unlike the people
 * directory, nothing on the server needs to re-serialize it, and the filters
 * are three optional ids.
 *
 * Anything unparseable falls back to a default. A query string is user-editable
 * text arriving from bookmarks and chat messages, so an invalid address is a
 * page rather than an error.
 */
export function parseAuditQuery(
  params: Record<string, string | string[] | undefined>,
): ResolvedListAuditInput {
  const first = (value: string | string[] | undefined): string | undefined =>
    Array.isArray(value) ? value[0] : value;
  const uuid = (value: string | undefined): string | undefined =>
    value && /^[0-9a-f-]{36}$/i.test(value) ? value : undefined;

  const page = Number.parseInt(first(params.page) ?? '', 10);

  return {
    academyId: uuid(first(params.academy)),
    actorUserId: uuid(first(params.actor)),
    supportGrantId: uuid(first(params.grant)),
    action: first(params.action)?.trim().slice(0, 120) || undefined,
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize: AUDIT_PAGE_SIZE,
  };
}

/** The same state as a path, with every default omitted. */
export function auditPath(
  query: Partial<ResolvedListAuditInput> & { page?: number },
): string {
  const params = new URLSearchParams();
  if (query.academyId) params.set('academy', query.academyId);
  if (query.actorUserId) params.set('actor', query.actorUserId);
  if (query.supportGrantId) params.set('grant', query.supportGrantId);
  if (query.action) params.set('action', query.action);
  if (query.page && query.page > 1) params.set('page', String(query.page));
  const search = params.toString();
  return search ? `/admin/audit?${search}` : '/admin/audit';
}
