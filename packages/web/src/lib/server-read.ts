/**
 * Whether data a server render read for this page may seed the client cache.
 *
 * Each server read carries a fresh token. The first client render that sees it
 * may use the data instead of repeating the request; a later one (the router
 * replaying an older payload on back/forward navigation) may not, and reads as
 * it always did. On the server every token is new, so nothing is retained.
 */
const claimed = new Set<string>();

export function claimServerRead(token: string | undefined): boolean {
  if (!token) return false;
  if (typeof window === 'undefined') return true;
  if (claimed.has(token)) return false;
  claimed.add(token);
  return true;
}

/** How long a just-read server value counts as current before the client's
 * usual refetch rules apply again. */
export const SERVER_READ_FRESH_MS = 5_000;
