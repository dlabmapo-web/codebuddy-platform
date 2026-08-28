import { requireAcademyRoute } from '@/lib/academy-route';

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
  const { academyId } = await requireAcademyRoute(academySlug);

  return <StudioChrome academyId={academyId}>{children}</StudioChrome>;
}
