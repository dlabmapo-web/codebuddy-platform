/**
 * Where `/account?academy={id}` should send its reader.
 *
 * My Page used to select an academy in the browser — from the query, then from
 * local storage, then from the first active membership — and expand that one
 * inline. It is now academy-scoped by address: the profile for an academy is
 * read at `/academy/{slug}/me`, inside that academy's own frame, and there is
 * nothing left to remember because the URL is the memory.
 *
 * What survives is the redirect. The `?academy=` links already in the wild —
 * bookmarks, the old switcher's replace navigations — name a membership, and
 * this resolves them to the slug that address now lives at.
 *
 * A value naming an academy the caller may not read is not an error page. A
 * stale bookmark is the most likely way to arrive with one, and losing the
 * whole page over it would be absurd; the query is dropped and the global page
 * is served, which is the same forgiveness the old selector applied.
 */
export type SelectableMembership = {
  academyId: string;
  academySlug: string;
  status: string;
};

export function redirectSlugFor(
  memberships: readonly SelectableMembership[],
  requested: string | null,
): string | null {
  if (!requested) return null;
  const named = memberships.find(
    (membership) =>
      membership.academyId === requested && membership.status === 'ACTIVE',
  );
  return named?.academySlug ?? null;
}
