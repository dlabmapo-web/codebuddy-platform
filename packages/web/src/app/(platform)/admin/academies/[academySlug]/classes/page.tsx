import { notFound } from 'next/navigation';

import { PlatformShell } from '@/app/(platform)/admin/_components/platform-shell';
import { ClassesManager } from '@/app/(studio)/academy/[academySlug]/(framed)/classes/_components/classes-manager';
import { BackLink } from '@/components/studio/back-link';
import { PageTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { destructiveNamespaces } from '@/i18n/namespaces';
import { getLocale } from '@/i18n/server/get-locale';
import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { requirePlatformAcademyRoute } from '@/lib/academy-route';
import { createPlatformServerORPCClient } from '@/lib/orpc-server';
import { routes } from '@/lib/routes';

export default async function PlatformAcademyClassesPage({
  params,
}: {
  params: Promise<{ academySlug: string }>;
}) {
  const { academySlug } = await params;
  const { academyId } = await requirePlatformAcademyRoute(academySlug);
  const client = createPlatformServerORPCClient();
  const [academy, classesResult] = await Promise.all([
    client.platformAcademies.get({ academyId }).catch(() => null),
    client.academyClasses.list({ academyId }).catch(() => null),
  ]);
  if (!academy) notFound();

  const { t } = await getServerTranslation(['classes']);
  const locale = await getLocale();
  const { resources } = await initTranslations(locale, destructiveNamespaces);

  return (
    <PlatformShell
      back={
        <BackLink
          href={routes.adminAcademy(academySlug)}
          label={academy.name}
        />
      }
      bleed
      description={t('description')}
      title={t('title')}
    >
      <PageTranslationsProvider
        locale={locale}
        namespaces={destructiveNamespaces}
        resources={resources}
      >
        {classesResult ? (
          <ClassesManager
            academyId={academyId}
            initialClasses={classesResult.classes}
          />
        ) : (
          <div className="rounded-card border border-danger/25 bg-danger/5 p-5">
            <h2 className="text-[15px] font-bold text-danger">
              {t('unavailable_title')}
            </h2>
            <p className="mt-1.5 text-[14px] leading-6 text-sub">
              {t('unavailable_body')}
            </p>
          </div>
        )}
      </PageTranslationsProvider>
    </PlatformShell>
  );
}
