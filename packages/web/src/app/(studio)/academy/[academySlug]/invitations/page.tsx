import { requireAcademyRoute } from '@/lib/academy-route';
import { PageTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { peopleOpsNamespaces } from '@/i18n/namespaces';
import { getLocale } from '@/i18n/server/get-locale';
import { getServerTranslation } from '@/i18n/server/get-server-translation';

import { StudioShell } from '../_components/studio-shell';
import { InvitationsManager } from './_components/invitations-manager';

/**
 * Invitations, with the delivery evidence beside them.
 *
 * The page mounts the people-operations namespace for the delivery vocabulary —
 * the five states, their explanations, and the resend copy. §13 keeps that copy
 * out of the layout payload: it is read on one route by one role, and every
 * student page would otherwise carry an explanation of what a bounce is.
 */
export default async function InvitationsPage({
  params,
}: {
  params: Promise<{ academySlug: string }>;
}) {
  const { academySlug } = await params;
  const { academyId } = await requireAcademyRoute(academySlug);
  const locale = await getLocale();
  const [{ t }, { resources }] = await Promise.all([
    getServerTranslation(['invitations']),
    initTranslations(locale, peopleOpsNamespaces),
  ]);

  return (
    <StudioShell academyId={academyId} title={t('title')}>
      <PageTranslationsProvider
        locale={locale}
        namespaces={peopleOpsNamespaces}
        resources={resources}
      >
        <InvitationsManager academyId={academyId} />
      </PageTranslationsProvider>
    </StudioShell>
  );
}
