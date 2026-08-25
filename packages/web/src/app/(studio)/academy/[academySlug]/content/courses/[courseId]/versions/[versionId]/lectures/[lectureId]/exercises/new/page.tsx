import { routes } from '@/lib/routes';
import { requireAcademyRoute } from '@/lib/academy-route';
import { redirect } from 'next/navigation';

export default async function LegacyNewExercisePage({
  params,
}: {
  params: Promise<{
    academySlug: string;
    courseId: string;
    versionId: string;
    lectureId: string;
  }>;
}) {
  const { academySlug, courseId, lectureId } = await params;
  const { academyId } = await requireAcademyRoute(academySlug);
  redirect(
    `${routes.academy(academySlug)}/content/courses/${courseId}/lectures/${lectureId}/exercises/new`,
  );
}
