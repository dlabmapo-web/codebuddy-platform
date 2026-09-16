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

import { StaffDetailView } from './_components/staff-detail-view';

/**
 * One staff member, for a Manager or a Team Lead.
 *
 * Rendered on the server, because there is nothing on this page to interact
 * with — it is a record, and a record that arrives complete needs no loading
 * state and no client query.
 *
 * Denial and absence are the same answer. A reader who may not have this page
 * and a membership that does not exist both land on the not-found page, so no
 * id can be probed for the difference.
 */
export default async function StaffMemberPage({
  params,
}: {
  params: Promise<{ academySlug: string; membershipId: string }>;
}) {
  const { academySlug, membershipId } = await params;
  const { academyId, roles } = await requireAcademyRoute(academySlug);
  if (!canReadAcademyMembers(roles)) notFound();

  const locale = await getLocale();
  const [{ t }, { resources }] = await Promise.all([
    getServerTranslation(['member-detail']),
    initTranslations(locale, memberDetailNamespaces),
  ]);

  const detail = await createServerORPCClient()
    .academyPeople.staffMember({ academyId, membershipId })
    .catch(() => null);
  if (!detail) notFound();

  return (
    <StudioPage
      back={
        <BackLink
          href={routes.academyStaff(academySlug)}
          label={t('member-detail:back_to_staff')}
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
        <StaffDetailView academySlug={academySlug} detail={detail} />
      </PageTranslationsProvider>
    </StudioPage>
  );
}
