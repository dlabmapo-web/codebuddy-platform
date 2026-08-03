import { redirect } from 'next/navigation';

export default async function LegacyNewExercisePage({
  params,
}: {
  params: Promise<{
    academyId: string;
    courseId: string;
    versionId: string;
    lectureId: string;
  }>;
}) {
  const { academyId, courseId, lectureId } = await params;
  redirect(
    `/studio/academies/${academyId}/content/courses/${courseId}/lectures/${lectureId}/exercises/new`,
  );
}
