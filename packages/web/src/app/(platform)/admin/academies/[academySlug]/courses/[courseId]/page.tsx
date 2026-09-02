import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CourseBuilder } from '@/app/(studio)/academy/[academySlug]/(framed)/content/courses/[courseId]/_components/course-builder';
import { BackLink } from '@/components/studio/back-link';
import { createContentPaths } from '@/components/studio/content-paths';
import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { requirePlatformAcademyRoute } from '@/lib/academy-route';
import { isAccessDeniedError } from '@/lib/api-errors';
import { createPlatformServerORPCClient } from '@/lib/orpc-server';

import { PlatformShell } from '../../../../_components/platform-shell';
import { consoleBackTarget } from '../../../../_lib/back-target';

export default async function PlatformCourseBuilderPage({
  params,
  searchParams,
}: {
  params: Promise<{ academySlug: string; courseId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { academySlug, courseId } = await params;
  const { from } = await searchParams;
  const { academyId } = await requirePlatformAcademyRoute(academySlug);
  const client = createPlatformServerORPCClient();
  const academy = await client.platformAcademies
    .get({ academyId })
    .catch(() => null);
  if (!academy) notFound();

  const { t } = await getServerTranslation(['content', 'platform-content']);
  const contentPaths = createContentPaths(academySlug, 'console');
  let initialTree = null;
  let loadFailed = false;
  try {
    initialTree = await client.academyCourses.getTree({ academyId, courseId });
  } catch (error) {
    loadFailed = !isAccessDeniedError(error);
  }

  const back = consoleBackTarget(from, t('platform-content:title'), {
    href: contentPaths.courses(),
    label: academy.name,
  });

  return (
    <PlatformShell
      back={<BackLink href={back.href} label={back.label} />}
      bleed
      description={initialTree ? t('builder.description') : undefined}
      title={initialTree?.course.title ?? t('builder.fallback_title')}
    >
      {initialTree ? (
        <CourseBuilder
          academyId={academyId}
          canEditCurriculum
          canEditExercises
          canImport={false}
          courseId={courseId}
          initialTree={initialTree}
        />
      ) : (
        <div className="rounded-card border border-danger/25 bg-danger/5 p-5">
          <h2 className="text-[15px] font-bold text-danger">
            {loadFailed
              ? t('builder.load_failed_title')
              : t('builder.unavailable_title')}
          </h2>
          <p className="mt-1.5 text-[14px] leading-6 text-sub">
            {loadFailed
              ? t('builder.load_failed_body')
              : t('builder.unavailable_body')}
          </p>
          <Link
            className="mt-4 inline-block text-[14px] font-bold text-brand underline underline-offset-4"
            href={contentPaths.courses()}
          >
            {t('builder.back_to_courses')}
          </Link>
        </div>
      )}
    </PlatformShell>
  );
}
