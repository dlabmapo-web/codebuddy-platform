import type { ContentLens } from '@cove/shared';

/**
 * Where a console detail page's Back link goes.
 *
 * The console mounts one editor under several routes, and a course is reachable
 * from the academy's own index, from the cross-academy Courses page, and from a
 * shared link. A page that hardcodes its way out sends two of those three
 * readers somewhere they have never been — which is what makes Back feel broken
 * rather than merely wrong.
 *
 * So the link that opened the page carries `from`, and this resolves it — to
 * the page's own name, not to a generic one. A class opened from Classes goes
 * back to *Classes*; while both pages were called "Content" the link could only
 * offer the name of the tool, and the rail lit the wrong row to match.
 *
 * ## What is accepted
 *
 * Only the two curriculum pages. A `from` is attacker-controllable text
 * arriving in a URL, and the general form of "send the user wherever this says"
 * is an open redirect. An allowlist of the surfaces that need it costs nothing
 * today and cannot be turned into a redirect to another origin: `//evil.example`
 * and `https://evil.example` both fail the prefix test, and so does
 * `/admin/../..`.
 *
 * Extending it means adding a case here, which is the point — the next person
 * widens the list deliberately rather than by passing a different string.
 *
 * `/admin/content/problems` is deliberately *not* on the list any more. That
 * page is gone and its address only redirects, so a Back link pointing at it
 * would bounce the reader to Courses under a label promising problems.
 */
const CURRICULUM_PAGE = /^\/admin\/content\/(courses|classes)(\?[^#]*)?$/;

export type BackTarget = { href: string; label: string };

export function consoleBackTarget(
  from: string | string[] | undefined,
  /** What to call each page, so Back names the one it returns to. */
  labels: Record<ContentLens, string>,
  fallback: BackTarget,
): BackTarget {
  const value = Array.isArray(from) ? from[0] : from;
  const match = value?.match(CURRICULUM_PAGE);
  if (value && match) {
    return { href: value, label: labels[match[1] as ContentLens] };
  }
  return fallback;
}
