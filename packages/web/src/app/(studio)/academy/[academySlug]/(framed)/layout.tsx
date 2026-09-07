import { requireAcademyOrLobbyRoute } from '@/lib/academy-route';

import { LobbyChrome } from './_components/lobby/lobby-chrome';
import { StudioChrome } from './_components/studio-chrome';

/**
 * The framed half of the academy: every page read inside the studio's sidebar
 * and header, which is all of them but the two full-viewport workspaces.
 *
 * A route group rather than a plain layout because the split is real. The
 * exercise workspace and live monitoring take the whole screen, and they used
 * to opt out of the frame simply by not rendering it — which worked only while
 * the frame was something each page composed for itself. Now that it is a
 * layout, "does this page have chrome" has to be answered by where the file
 * sits, and `(framed)` is that answer. Groups do not appear in the URL, so
 * every route keeps the path it already had.
 *
 * The chrome lives here and not one level up so that it survives navigation
 * between these pages: Next does not re-render a shared layout beneath itself,
 * so the sidebar stays on screen and interactive while the next page loads,
 * and a page-level `loading.tsx` replaces only the content column.
 *
 * See docs/superpowers/specs/2026-08-28-loading-states-and-navigation-feedback-design.md §6.1.
 */
export default async function FramedAcademyLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ academySlug: string }>;
}) {
  const { academySlug } = await params;
  // Memoised per request, and the parent layout has already resolved it, so
  // this costs a map lookup rather than a second round trip.
  const { academyId, role, via } = await requireAcademyOrLobbyRoute(academySlug);

  /*
   * Somebody waiting on an application reads the academy's frame with every
   * page empty, rather than a card outside it.
   *
   * `children` is deliberately not rendered, so an applicant is never shown a
   * member page's contents. That alone is not enough to keep a member page
   * from *deciding the response* — each one calls `requireAcademyRoute` and
   * `notFound()` ends the whole segment — which is why the lobby keeps itself
   * to this one route and drives its sections from a `section` query instead
   * of linking at the member addresses.
   *
   * The failure mode of that arrangement is a 404 on a deep member URL, which
   * is safe: it refuses, it does not leak.
   */
  if (via === 'application') {
    return <LobbyChrome academySlug={academySlug} />;
  }

  return (
    <StudioChrome academyId={academyId} academySlug={academySlug} routeRole={role}>
      {children}
    </StudioChrome>
  );
}
