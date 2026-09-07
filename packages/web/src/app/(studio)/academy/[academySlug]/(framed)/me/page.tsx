import { PageTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { profileNamespaces } from '@/i18n/namespaces';
import { getLocale } from '@/i18n/server/get-locale';
import { MyPageWorkspace } from '@/components/studio/profile/my-page/my-page-workspace';
import { requireAcademyRoute } from '@/lib/academy-route';

/**
 * My Page, read inside the academy the reader is standing in.
 *
 * Under `(framed)`, so the rail, the sticky bar and the collapse state come
 * from the layout above rather than from a shell of its own — which is the
 * point. Next does not re-render a shared layout on navigations beneath it, so
 * arriving here from Courses leaves the sidebar mounted, scrolled where it
 * was, with its groups still open. My Page used to be a global route with its
 * own chrome, and stepping into it tore the studio down and put a back link in
 * its place.
 *
 * The academy comes from the URL segment, not from a query value or something
 * the browser remembered. `/account` remains the global address for a reader
 * who is not in an academy at all — an applicant, an operator, an account
 * between memberships.
 *
 * Its own translation provider rather than an addition to `layoutNamespaces`:
 * that list is mounted for every student on every studio page and is capped,
 * and the profile vocabulary is read on exactly one of them.
 */
export default async function AcademyMyPage({
  params,
}: {
  params: Promise<{ academySlug: string }>;
}) {
  const { academySlug } = await params;
  // Memoised per request, and the framed layout has already resolved it, so
  // this costs a map lookup rather than a second round trip. It is still asked
  // here: a page that trusted the layout to have refused would be a page that
  // renders for anyone the layout is ever changed to let through.
  const { academyId } = await requireAcademyRoute(academySlug);

  const locale = await getLocale();
  const { resources } = await initTranslations(locale, profileNamespaces);

  return (
    <PageTranslationsProvider
      locale={locale}
      namespaces={profileNamespaces}
      resources={resources}
    >
      {/* The same narrow reading column the global page uses. Sections stack
          in one order at every width; nothing reflows into a dashboard. */}
      <main className="mx-auto w-full max-w-3xl px-5 pb-16 pt-7">
        <MyPageWorkspace academy={{ id: academyId, slug: academySlug }} />
      </main>
    </PageTranslationsProvider>
  );
}
