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
 *
 * `/admin/ranking` joined it deliberately, which is what the paragraph above
 * asks the next surface to do: the class ranking opens a student's ledger, and
 * without an entry here that reader presses Back and lands on the academy index
 * with their period, sort and academy filter gone.
 */
const CONSOLE_PAGE = /^\/admin\/(content\/(?:courses|classes)|ranking)(\?[^#]*)?$/;

/** The console pages a detail view may be returned to. */
export type ConsoleBackPage = ContentLens | 'ranking';

export type BackTarget = { href: string; label: string };

export function consoleBackTarget(
  from: string | string[] | undefined,
  /**
   * What to call each page, so Back names the one it returns to.
   *
   * Partial, because a caller names only the pages it can actually be opened
   * from — the curriculum editors are unreachable from the ranking, and making
   * them carry its label would mean loading a namespace for a string nothing
   * can render. A `from` naming a page this caller did not label falls back,
   * which is the same answer an unrecognised one gets.
   */
  labels: Partial<Record<ConsoleBackPage, string>>,
  fallback: BackTarget,
): BackTarget {
  const value = Array.isArray(from) ? from[0] : from;
  const match = value?.match(CONSOLE_PAGE);
  if (value && match) {
    // The captured group is the path, which is `content/courses` for the two
    // curriculum pages and `ranking` for the third. Keyed by its last segment,
    // so one label map serves all three.
    const label = labels[match[1].split('/').pop() as ConsoleBackPage];
    if (label) return { href: value, label };
  }
  return fallback;
}
