import type { LearnCourseSummary, LearnDraftSummary } from '@cove/shared';

import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { createServerORPCClient } from '@/lib/orpc-server';

import { StudioShell } from '../../_components/studio-shell';
import { CourseCatalog } from './_components/course-catalog';

export default async function LearnCoursesPage({
  params,
}: {
  params: Promise<{ academyId: string }>;
}) {
  const { academyId } = await params;
  const { t } = await getServerTranslation(['learn']);

  let courses: LearnCourseSummary[] | null = null;
  let drafts: LearnDraftSummary[] = [];

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
  } catch {
    // The permission-aware state renders below.
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
