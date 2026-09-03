import { requireAcademyRoute } from '@/lib/academy-route';
import { StudioPage } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/studio-page';
import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { createServerORPCClient, getAccount } from '@/lib/orpc-server';
import {
  academyRolesFor,
  canManageContent,
} from '@/lib/academy-access-state';
import { CoursesManager } from './_components/courses-manager';

export default async function CoursesPage({
  params,
}: {
  params: Promise<{ academySlug: string }>;
}) {
  const { academySlug } = await params;
  const { academyId } = await requireAcademyRoute(academySlug);
  const { t } = await getServerTranslation(['courses']);
  let courses = null;
  let canEdit = false;

  try {
    const client = createServerORPCClient();
    const [result, account] = await Promise.all([
      client.academyCourses.list({ academyId }),
      getAccount(),
    ]);
    courses = result.courses;
    canEdit = canManageContent(academyRolesFor(account, academyId));
  } catch {
    // The permission-aware state is rendered below.
  }

  return (
    <StudioPage
      bleed
      description={t('description')}
      title={t('title')}
    >
      {courses ? (
        <CoursesManager
          academyId={academyId}
          canEdit={canEdit}
          initialCourses={courses}
        />
      ) : (
        <div className="rounded-card border border-danger/25 bg-danger/5 p-5">
          <h2 className="text-[15px] font-bold text-danger">
            {t('forbidden_title')}
          </h2>
          <p className="mt-1.5 text-[14px] leading-6 text-sub">
            {t('forbidden_body')}
          </p>
        </div>
      )}
    </StudioPage>
  );
}
