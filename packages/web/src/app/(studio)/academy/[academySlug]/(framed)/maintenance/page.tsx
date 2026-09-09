import { StudioPage } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/studio-page';
import { PageTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { operationsNamespaces } from '@/i18n/namespaces';
import { getLocale } from '@/i18n/server/get-locale';
import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { canRegrade } from '@/lib/academy-access-state';
import { requireAcademyRoute } from '@/lib/academy-route';
import { createServerORPCClient } from '@/lib/orpc-server';

import { AcademyMaintenance } from './_components/academy-maintenance';

/**
 * One academy repairing its own records.
 *
 * The studio twin of the console's maintenance page, and the same component
 * underneath. What differs is the scope and who holds it: a Manager or Team
 * Lead acts here, in their own academy and nowhere else, and never chooses
 * which academy — so the console's academy selector is simply absent.
 *
 * It belongs to the academy rather than to Cove because the person who causes
 * the damage works here. A Team Lead correcting a wrong test case is the one
 * who knows which problem it was and which class is waiting on it, and having
 * to ask Cove to repair their own students' records is how a button becomes a
 * support ticket.
 */
export default async function AcademyMaintenancePage({
  params,
}: {
  params: Promise<{ academySlug: string }>;
}) {
  const { academySlug } = await params;
  // The role comes from the guard, which resolves it from a membership or from
  // a platform operator's chosen view — not from `auth.me`, which would hide
  // the page from an operator the API would have allowed.
  const { academyId, roles } = await requireAcademyRoute(academySlug);
  const { t } = await getServerTranslation(['platform-operations']);
  const allowed = canRegrade(roles);

  const runs = allowed
    ? await createServerORPCClient()
        .platformOperations.runs({ academyId, limit: 20 })
        .catch(() => null)
    : null;

  const locale = await getLocale();
  const { resources } = await initTranslations(locale, operationsNamespaces);

  return (
    <PageTranslationsProvider
      locale={locale}
      namespaces={operationsNamespaces}
      resources={resources}
    >
      <StudioPage
        bleed
        description={t('platform-operations:page.description_academy')}
        title={t('platform-operations:page.title')}
      >
        {allowed ? (
          <AcademyMaintenance
            academyId={academyId}
            initialRuns={runs?.runs ?? null}
          />
        ) : (
          <div className="rounded-card border border-danger/25 bg-danger/5 p-5">
            <h2 className="text-[15px] font-bold text-danger">
              {t('platform-operations:forbidden.title')}
            </h2>
            <p className="mt-1.5 text-[14px] leading-6 text-sub">
              {t('platform-operations:forbidden.body')}
            </p>
          </div>
        )}
      </StudioPage>
    </PageTranslationsProvider>
  );
}
