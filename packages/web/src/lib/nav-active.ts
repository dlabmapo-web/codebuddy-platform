/**
 * Picks which nav link is current. A prefix test alone marks every parent
 * active — an index link like `/academy/{id}` prefixes every page
 * under it — so the most specific matching link wins and the rest stay quiet.
 */
export function activeNavHref(
  pathname: string,
  hrefs: readonly string[],
): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    const matches = pathname === href || pathname.startsWith(`${href}/`);
    if (!matches) continue;
    if (best === null || href.length > best.length) best = href;
  }
  return best;
}
