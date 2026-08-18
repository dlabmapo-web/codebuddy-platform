import { redirect } from 'next/navigation';

import { PageTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { profileNamespaces } from '@/i18n/namespaces';
import { getLocale } from '@/i18n/server/get-locale';
import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { createServerORPCClient } from '@/lib/orpc-server';

import { MyPageShell } from './_components/my-page-shell';
import { MyPageWorkspace } from './_components/my-page-workspace';

/**
 * One page for every signed-in person, whatever they are.
 *
 * The role-specific parts are chosen from the API's answer rather than from
 * anything decided here: the server already knows which sections this
 * membership may write, and a route that guessed would eventually guess
 * differently from the endpoint that enforces it.
 */
export default async function MyPage() {
  const { t } = await getServerTranslation(['profile']);

  let firstAcademyId: string | null = null;
  let isPlatformAdmin = false;
  try {
    const account = await createServerORPCClient().auth.me({});
    firstAcademyId = account.user.memberships.find(
      (membership) => membership.status === 'ACTIVE',
    )?.academy.id ?? null;
    isPlatformAdmin = account.user.platformRole === 'ADMIN';
  } catch {
    redirect('/auth/login');
  }

  // Where "back" goes for someone with no academy. A platform operator has one
  // by design, and pointing them at the sign-in page — the previous answer for
  // anyone membership-less — would read as though their session had lapsed.
  const backHref = firstAcademyId
    ? `/studio/academies/${firstAcademyId}`
    : isPlatformAdmin
      ? '/platform'
      : '/auth/login';

  const locale = await getLocale();
  const { resources } = await initTranslations(locale, profileNamespaces);

  return (
    <PageTranslationsProvider
      locale={locale}
      namespaces={profileNamespaces}
      resources={resources}
    >
      <MyPageShell
        backHref={backHref}
        backLabel={t('back_to_studio')}
        title={t('title')}
      >
        <MyPageWorkspace />
      </MyPageShell>
    </PageTranslationsProvider>
  );
}
