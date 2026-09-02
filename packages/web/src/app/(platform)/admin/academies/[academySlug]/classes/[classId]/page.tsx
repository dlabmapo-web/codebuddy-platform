import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PlatformShell } from '@/app/(platform)/admin/_components/platform-shell';
import { ClassDetailManager } from '@/app/(studio)/academy/[academySlug]/(framed)/classes/[classId]/_components/class-detail-manager';
import { BackLink } from '@/components/studio/back-link';
import { createContentPaths } from '@/components/studio/content-paths';
import { PageTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { pointsNamespaces } from '@/i18n/namespaces';
import { getLocale } from '@/i18n/server/get-locale';
import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { consoleBackTarget } from '@/app/(platform)/admin/_lib/back-target';
import { requirePlatformAcademyRoute } from '@/lib/academy-route';
import { isAccessDeniedError } from '@/lib/api-errors';
import { createPlatformServerORPCClient } from '@/lib/orpc-server';

export default async function PlatformClassDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ academySlug: string; classId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { academySlug, classId } = await params;
  const { from } = await searchParams;
  const { academyId } = await requirePlatformAcademyRoute(academySlug);
  const client = createPlatformServerORPCClient();
  const academy = await client.platformAcademies
    .get({ academyId })
    .catch(() => null);
  if (!academy) notFound();

  const { t } = await getServerTranslation(['classes', 'platform-content']);
  const contentPaths = createContentPaths(academySlug, 'console');
  let detail = null;
  let denied = false;
  try {
    detail = await client.academyClasses.get({ academyId, classId });
  } catch (error) {
    denied = isAccessDeniedError(error);
  }

  const locale = await getLocale();
  const { resources } = await initTranslations(locale, pointsNamespaces);

  const back = consoleBackTarget(from, t('platform-content:title'), {
    href: contentPaths.classes(),
    label: academy.name,
  });

  return (
    <PlatformShell
      back={<BackLink href={back.href} label={back.label} />}
      bleed
      showPageHeading={!detail}
      title={detail?.name ?? t('title')}
    >
      {detail ? (
        <PageTranslationsProvider
          locale={locale}
          namespaces={pointsNamespaces}
          resources={resources}
        >
          <ClassDetailManager
            academyId={academyId}
            // These flags expose controls; every mutation is still authorized
            // by the API against the platform Manager permission set.
            canAssignCourses
            canAssignTeacher
            canEnroll
            canSetSchedule
            initialDetail={detail}
          />
        </PageTranslationsProvider>
      ) : (
        <div className="rounded-card border border-danger/25 bg-danger/5 p-5">
          <h2 className="text-[15px] font-bold text-danger">
            {denied ? t('detail.not_found_title') : t('unavailable_title')}
          </h2>
          <p className="mt-1.5 text-[14px] leading-6 text-sub">
            {denied ? t('detail.not_found_body') : t('unavailable_body')}
          </p>
          <Link
            className="mt-3 inline-flex text-[14px] font-bold text-brand hover:underline"
            href={contentPaths.classes()}
          >
            {t('detail.back')}
          </Link>
        </div>
      )}
    </PlatformShell>
  );
}
