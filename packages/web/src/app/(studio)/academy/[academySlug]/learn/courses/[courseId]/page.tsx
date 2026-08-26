import { routes } from '@/lib/routes';
import { requireAcademyRoute } from '@/lib/academy-route';
import type { LearnCourseOutlineResult } from '@cove/shared';
import { notFound, redirect, RedirectType } from 'next/navigation';

import { createServerORPCClient } from '@/lib/orpc-server';

import { StudioShell } from '../../../_components/studio-shell';
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
  const { academyId, role } = await requireAcademyRoute(academySlug);

  // The outline below is the student delivery view: it is driven by a class,
  // and reports progress and live presence for that class. Staff hold
  // `curriculum.read` and legitimately reach this URL from the course list,
  // but they have no student enrollment to deliver against. Send them to the
  // management view of the same course rather than rendering a class-shaped
  // page with no class.
  if (role !== 'STUDENT') {
    redirect(
      `${routes.academy(academySlug)}/content/courses/${courseId}`,
      RedirectType.replace,
    );
  }
  const requestedClassId = single((await searchParams).classId);
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
    <StudioShell
      academyId={academyId}
      bleed
      description={outline.course.description || undefined}
      title={outline.course.title}
    >
      {outline.classContext.classId ? (
        <CourseOutline
          academyId={academyId}
          classContext={outline.classContext}
          courseId={courseId}
          initialOutline={outline}
        />
      ) : (
        <LearningClassChoice
          context={outline.classContext}
          path={`${routes.academy(academySlug)}/learn/courses/${courseId}`}
        />
      )}
    </StudioShell>
  );
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isUuid(value: string | undefined): value is string {
  return Boolean(value?.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i));
}
