import { PageTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { profileNamespaces } from '@/i18n/namespaces';
import { getLocale } from '@/i18n/server/get-locale';
import { getServerTranslation } from '@/i18n/server/get-server-translation';

import { StudioShell } from '../../../_components/studio-shell';
import { MemberProfileEditor } from './_components/member-profile-editor';

/**
 * A manager's route into one member's academy profile.
 *
 * Academy-scoped in the path as well as in the API, so a membership ID from
 * another academy has nowhere to be typed. Whether the caller may actually
 * open it is decided by `academyProfile.getForManager` and nowhere else — this
 * page renders a denial as readily as it renders a form.
 */
export default async function MemberProfilePage({
  params,
}: {
  params: Promise<{ academyId: string; membershipId: string }>;
}) {
  const { academyId, membershipId } = await params;
  const { t } = await getServerTranslation(['profile']);
  const locale = await getLocale();
  const { resources } = await initTranslations(locale, profileNamespaces);

  return (
    <StudioShell
      academyId={academyId}
      showPageHeading={false}
      bleed
      title={t('manager.title')}
    >
      <PageTranslationsProvider
        locale={locale}
        namespaces={profileNamespaces}
        resources={resources}
      >
        <div className="mx-auto w-full max-w-3xl">
          <MemberProfileEditor
            academyId={academyId}
            membershipId={membershipId}
          />
        </div>
      </PageTranslationsProvider>
    </StudioShell>
  );
}
