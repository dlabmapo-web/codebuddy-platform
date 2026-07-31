import type { LearnCourseOutline } from '@cove/shared';
import { notFound } from 'next/navigation';

import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { createServerORPCClient } from '@/lib/orpc-server';

import { StudioShell } from '../../../_components/studio-shell';
import { CourseOutline } from './_components/course-outline';

export default async function LearnCoursePage({
  params,
}: {
  params: Promise<{ academyId: string; courseId: string }>;
}) {
  const { academyId, courseId } = await params;
  const { t } = await getServerTranslation(['learn']);

  let outline: LearnCourseOutline | null = null;
  try {
    outline = await createServerORPCClient().learn.getCourseOutline({
      academyId,
      courseId,
    });
  } catch {
    // An unpublished, missing, or out-of-academy course is indistinguishable to
    // a student, and should be: all three are simply "not here".
    notFound();
  }
  if (!outline) notFound();

  return (
    <StudioShell
      academyId={academyId}
      bleed
      description={outline.course.description || undefined}
      title={outline.course.title}
    >
      <CourseOutline
        academyId={academyId}
        courseId={courseId}
        initialOutline={outline}
        versionLabel={t('outline.version', {
          number: outline.version.versionNumber,
        })}
      />
    </StudioShell>
  );
}
