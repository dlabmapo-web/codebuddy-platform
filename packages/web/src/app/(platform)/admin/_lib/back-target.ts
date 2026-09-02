/**
 * Where a console detail page's Back link goes.
 *
 * The console mounts one editor under several routes, and a course is reachable
 * from the academy's own index, from the cross-academy content browser, and
 * from a shared link. A page that hardcodes its way out sends two of those
 * three readers somewhere they have never been — which is what makes Back feel
 * broken rather than merely wrong.
 *
 * So the link that opened the page carries `from`, and this resolves it.
 *
 * ## What is accepted
 *
 * Only the content browser. A `from` is attacker-controllable text arriving in
 * a URL, and the general form of "send the user wherever this says" is an open
 * redirect. An allowlist of the one surface that needs it costs nothing today
 * and cannot be turned into a redirect to another origin: `//evil.example` and
 * `https://evil.example` both fail the prefix test, and so does `/admin/../..`.
 *
 * Extending it means adding a case here, which is the point — the next person
 * widens the list deliberately rather than by passing a different string.
 */
const CONTENT_BROWSER = /^\/admin\/content\/(courses|classes|problems)(\?[^#]*)?$/;

export type BackTarget = { href: string; label: string };

export function consoleBackTarget(
  from: string | string[] | undefined,
  contentLabel: string,
  fallback: BackTarget,
): BackTarget {
  const value = Array.isArray(from) ? from[0] : from;
  if (value && CONTENT_BROWSER.test(value)) {
    return { href: value, label: contentLabel };
  }
  return fallback;
}
