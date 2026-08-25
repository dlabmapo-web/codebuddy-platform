import { routes } from '@/lib/routes';
import { requireAcademyRoute } from '@/lib/academy-route';
import { redirect } from 'next/navigation';

export default async function LegacyCourseVersionPage({
  params,
}: {
  params: Promise<{ academySlug: string; courseId: string; versionId: string }>;
}) {
  const { academySlug, courseId } = await params;
  const { academyId } = await requireAcademyRoute(academySlug);
  redirect(`${routes.academy(academySlug)}/content/courses/${courseId}`);
}
