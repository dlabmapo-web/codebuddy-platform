import { requireAcademyRoute } from '@/lib/academy-route';
import type { LearnCourseSummary, LearnDraftSummary } from '@cove/shared';

import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { toApiError } from '@/lib/api-errors';
import { createServerORPCClient } from '@/lib/orpc-server';
import { routes } from '@/lib/routes';

import { StudioShell } from '../../_components/studio-shell';
import { CourseCatalog } from './_components/course-catalog';

export default async function LearnCoursesPage({
  params,
}: {
  params: Promise<{ academySlug: string }>;
}) {
  const { academySlug } = await params;
  const { academyId } = await requireAcademyRoute(academySlug);
  const { t } = await getServerTranslation(['learn', 'errors', 'auth']);

  let courses: LearnCourseSummary[] | null = null;
  let drafts: LearnDraftSummary[] = [];
  // A lapsed learning session is not a membership problem, and telling a
  // student to ask their manager about one sends them to a person who cannot
  // help. The two states are distinguished here rather than collapsed.
  let sessionEnded = false;

  try {
    const client = createServerORPCClient();
    // Drafts are supplementary: a failure there must not cost the student their
    // course list, so the two are settled independently.
    const [courseResult, draftResult] = await Promise.allSettled([
      client.learn.listCourses({ academyId }),
      client.learn.listDrafts({ academyId }),
    ]);
    if (courseResult.status === 'rejected') throw courseResult.reason;
    courses = courseResult.value.courses;
    if (draftResult.status === 'fulfilled') drafts = draftResult.value.drafts;
  } catch (error) {
    const { code } = toApiError(error);
    sessionEnded =
      code === 'STUDENT_SESSION_EXPIRED' ||
      code === 'STUDENT_SESSION_UNAVAILABLE';
  }

  return (
    <StudioShell
      academyId={academyId}
      bleed
      description={t('catalog.description')}
      title={t('catalog.title')}
    >
      {courses ? (
        <CourseCatalog
          academyId={academyId}
          initialCourses={courses}
          initialDrafts={drafts}
        />
      ) : sessionEnded ? (
        <div className="rounded-card border border-border bg-card p-5">
          <p className="text-[14px] leading-6 text-sub">
            {t('errors:STUDENT_SESSION_EXPIRED')}
          </p>
          <a
            className="mt-3 inline-flex items-center rounded-lg bg-brand px-3.5 py-2 text-[13px] font-semibold text-on-brand"
            href={routes.login}
          >
            {t('auth:login.submit')}
          </a>
        </div>
      ) : (
        <div className="rounded-card border border-danger/25 bg-danger/5 p-5">
          <h2 className="text-[15px] font-bold text-danger">
            {t('catalog.forbidden_title')}
          </h2>
          <p className="mt-1.5 text-[14px] leading-6 text-sub">
            {t('catalog.forbidden_body')}
          </p>
        </div>
      )}
    </StudioShell>
  );
}
