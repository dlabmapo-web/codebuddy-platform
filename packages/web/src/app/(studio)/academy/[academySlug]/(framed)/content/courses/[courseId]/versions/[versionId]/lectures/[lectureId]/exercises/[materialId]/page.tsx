import { routes } from '@/lib/routes';
import { requireAcademyRoute } from '@/lib/academy-route';
import { redirect } from 'next/navigation';

export default async function LegacyExercisePage({
  params,
}: {
  params: Promise<{
    academySlug: string;
    courseId: string;
    versionId: string;
    lectureId: string;
    materialId: string;
  }>;
}) {
  const { academySlug, courseId, lectureId, materialId } = await params;
  const { academyId } = await requireAcademyRoute(academySlug);
  redirect(
    `${routes.academy(academySlug)}/content/courses/${courseId}/lectures/${lectureId}/exercises/${materialId}`,
  );
}
