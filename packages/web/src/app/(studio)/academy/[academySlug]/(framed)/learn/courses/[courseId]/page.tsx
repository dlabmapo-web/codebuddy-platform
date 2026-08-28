import { routes } from '@/lib/routes';
import { requireAcademyRoute } from '@/lib/academy-route';
import type { LearnCourseOutlineResult } from '@cove/shared';
import { notFound } from 'next/navigation';

import { createServerORPCClient } from '@/lib/orpc-server';

import { BackLink } from '@/components/studio/back-link';
import { StudioPage } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/studio-page';
import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { CourseOutline } from './_components/course-outline';
import { LearningClassChoice } from '../../_components/learning-class-choice';

export default async function LearnCoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ academySlug: string; courseId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { academySlug, courseId } = await params;
  const { academyId } = await requireAcademyRoute(academySlug);
  const requestedClassId = single((await searchParams).classId);
  const { t } = await getServerTranslation(['learn']);
  let outline: LearnCourseOutlineResult | null = null;
  try {
    outline = await createServerORPCClient().learn.getCourseOutline({
      academyId,
      courseId,
      ...(isUuid(requestedClassId) ? { classId: requestedClassId } : {}),
    });
  } catch {
    // A hidden, missing, or out-of-academy course is indistinguishable to
    // a student, and should be: all three are simply "not here".
    notFound();
  }
  if (!outline) notFound();

  return (
    <StudioPage
      back={
        <BackLink
          href={`${routes.academy(academySlug)}/learn/courses`}
          label={t('outline.back')}
        />
      }
      bleed
      description={outline.course.description || undefined}
      title={outline.course.title}
    >
      {outline.classContext.classes.length > 0 &&
      !outline.classContext.classId ? (
        // A student in more than one class delivering this course picks which
        // one the work counts for before any of it is shown.
        <LearningClassChoice
          context={outline.classContext}
          path={`${routes.academy(academySlug)}/learn/courses/${courseId}`}
        />
      ) : (
        // One class, or none at all: staff preview arrives here with an empty
        // context and the outline renders without progress or presence.
        <CourseOutline
          academyId={academyId}
          classContext={outline.classContext}
          courseId={courseId}
          initialOutline={outline}
        />
      )}
    </StudioPage>
  );
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isUuid(value: string | undefined): value is string {
  return Boolean(value?.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i));
}
