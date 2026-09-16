/**
 * Picks which nav link is current. A prefix test alone marks every parent
 * active — an index link like `/academy/{id}` prefixes every page
 * under it — so the most specific matching link wins and the rest stay quiet.
 *
 * An entry may own more paths than the one it links to. A member's detail page
 * serves three roles and sits under none of their lists, so the list that
 * sends a reader there claims it by name; without that the academy index wins
 * by prefix and Overview lights up on a page that is not it.
 *
 * A link may also carry a query string. `usePathname` never returns one, so
 * the query is dropped before comparing — matching it literally would mean
 * such a link could never be current.
 *
 * The comparison is on path segments, not on characters. `/academy/a/students`
 * must not be marked current by `/academy/a/students-archive`, which a bare
 * `startsWith` would do.
 */
export type NavTarget = string | { href: string; paths?: readonly string[] };

export function activeNavHref(
  pathname: string,
  targets: readonly NavTarget[],
): string | null {
  let best: string | null = null;
  let bestLength = 0;

  for (const target of targets) {
    const href = typeof target === 'string' ? target : target.href;
    const owned =
      typeof target === 'string' ? [href] : [href, ...(target.paths ?? [])];

    for (const candidate of owned) {
      const path = candidate.split(/[?#]/)[0] ?? candidate;
      const matches = pathname === path || pathname.startsWith(`${path}/`);
      if (!matches) continue;
      if (best === null || path.length > bestLength) {
        best = href;
        bestLength = path.length;
      }
    }
  }
  return best;
}
