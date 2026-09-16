import { notFound } from 'next/navigation';

import { StudioPage } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/studio-page';
import { BackLink } from '@/components/studio/back-link';
import { PageTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { memberDetailNamespaces } from '@/i18n/namespaces';
import { getLocale } from '@/i18n/server/get-locale';
import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { canReadAcademyMembers } from '@/lib/academy-access-state';
import { requireAcademyRoute } from '@/lib/academy-route';
import { createServerORPCClient } from '@/lib/orpc-server';
import { routes } from '@/lib/routes';

import { StudentDetailView } from './_components/student-detail-view';

/**
 * One student, for a Manager, a Team Lead, or the teacher who teaches them.
 *
 * No route gate, unlike the Staff page beside it, and the omission is
 * deliberate: a Teacher belongs here and holds none of the roster permissions,
 * so a gate strict enough to describe the Manager and Team Lead would turn
 * them away from a page that is theirs. `academyPeople.student` decides, and
 * it is the only thing that decides — it admits a teacher by their assignment
 * and answers them about their own classes only.
 *
 * Denial and absence are the same answer, so a teacher cannot learn which
 * membership ids exist by watching which ones refuse differently.
 */
export default async function StudentMemberPage({
  params,
}: {
  params: Promise<{ academySlug: string; membershipId: string }>;
}) {
  const { academySlug, membershipId } = await params;
  const { academyId, roles } = await requireAcademyRoute(academySlug);
  /*
   * Back goes where this reader came from, which is not the same list for all
   * three of them. A Teacher reaches this page from their own roster and may
   * not open the academy's Students page at all, so sending them there would
   * be a back link into a not-found.
   */
  const fromRoster = canReadAcademyMembers(roles);

  const locale = await getLocale();
  const [{ t }, { resources }] = await Promise.all([
    getServerTranslation(['member-detail']),
    initTranslations(locale, memberDetailNamespaces),
  ]);

  const detail = await createServerORPCClient()
    .academyPeople.student({ academyId, membershipId })
    .catch(() => null);
  if (!detail) notFound();

  return (
    <StudioPage
      back={
        <BackLink
          href={
            fromRoster
              ? routes.academyStudents(academySlug)
              : routes.academyTeachStudents(academySlug)
          }
          label={
            fromRoster
              ? t('member-detail:back_to_students')
              : t('member-detail:back_to_my_students')
          }
        />
      }
      bleed
      showPageHeading={false}
      title={detail.identity.displayName}
    >
      <PageTranslationsProvider
        locale={locale}
        namespaces={memberDetailNamespaces}
        resources={resources}
      >
        <StudentDetailView
          academySlug={academySlug}
          /*
           * The same fact the back link turns on, read the other way. A
           * reader who did not come from the academy's roster was admitted by
           * teaching this student, so every class listed is one of theirs and
           * Solution status will open. A Manager or Team Lead is admitted by
           * reading members, which Solution status does not accept.
           */
          canOpenClassProgress={!fromRoster}
          detail={detail}
        />
      </PageTranslationsProvider>
    </StudioPage>
  );
}
