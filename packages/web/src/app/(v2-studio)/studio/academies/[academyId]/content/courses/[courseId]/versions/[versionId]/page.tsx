import { redirect } from 'next/navigation';

export default async function LegacyCourseVersionPage({
  params,
}: {
  params: Promise<{ academyId: string; courseId: string; versionId: string }>;
}) {
  const { academyId, courseId } = await params;
  redirect(`/studio/academies/${academyId}/content/courses/${courseId}`);
}
