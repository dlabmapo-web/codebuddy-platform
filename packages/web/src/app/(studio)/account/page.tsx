import { redirect } from 'next/navigation';

import { PageTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { profileNamespaces } from '@/i18n/namespaces';
import { getLocale } from '@/i18n/server/get-locale';
import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { getAccount } from '@/lib/orpc-server';
import { routes } from '@/lib/routes';

import { redirectSlugFor } from '@/components/studio/profile/my-page/academy-selection';
import { MyPageWorkspace } from '@/components/studio/profile/my-page/my-page-workspace';

import { MyPageShell } from './_components/my-page-shell';

/**
 * My Page for a reader who is not standing in an academy.
 *
 * An applicant waiting on a decision, a platform operator with no membership,
 * an account between academies — and every old `?academy=` link, which is
 * resolved to the academy-scoped address below rather than served here.
 *
 * It shows the account: the identity card, the global sections, and the strip
 * of academies at the foot of the card as the way *into* each one's profile.
 * Editing how you appear inside an academy happens inside that academy, at
 * `/academy/{slug}/me`, where the rail is.
 *
 * The role-specific parts are chosen from the API's answer rather than from
 * anything decided here: the server already knows which sections this
 * membership may write, and a route that guessed would eventually guess
 * differently from the endpoint that enforces it.
 */
export default async function MyPage({
  searchParams,
}: {
  searchParams: Promise<{ academy?: string }>;
}) {
  const { t } = await getServerTranslation(['profile']);
  const { academy: requested } = await searchParams;

  let firstAcademySlug: string | null = null;
  let isPlatformAdmin = false;
  let scopedSlug: string | null = null;
  try {
    const account = await getAccount();
    firstAcademySlug = account.user.memberships.find(
      (membership) => membership.status === 'ACTIVE',
    )?.academy.slug ?? null;
    isPlatformAdmin = account.user.platformRole === 'ADMIN';
    scopedSlug = redirectSlugFor(
      account.user.memberships.map((membership) => ({
        academyId: membership.academy.id,
        academySlug: membership.academy.slug,
        status: membership.status,
      })),
      requested ?? null,
    );
  } catch {
    redirect('/login');
  }

  /*
   * `?academy=` named a membership, so this reader wants that academy's
   * profile — which now has an address of its own, inside that academy's
   * frame. A value naming an academy they may not read resolves to null and
   * simply falls through to the global page, the same forgiveness the old
   * in-page selector applied to a stale bookmark.
   */
  if (scopedSlug) redirect(routes.academyMe(scopedSlug));

  // Where "back" goes for someone with no academy. A platform operator has one
  // by design, and pointing them at the sign-in page — the previous answer for
  // anyone membership-less — would read as though their session had lapsed.
  const backHref = firstAcademySlug
    ? routes.academy(firstAcademySlug)
    : isPlatformAdmin
      ? routes.admin
      : routes.login;

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
        <MyPageWorkspace academy={null} />
      </MyPageShell>
    </PageTranslationsProvider>
  );
}
