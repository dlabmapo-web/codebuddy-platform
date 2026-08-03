import { redirect } from 'next/navigation';

export default async function LegacyExercisePage({
  params,
}: {
  params: Promise<{
    academyId: string;
    courseId: string;
    versionId: string;
    lectureId: string;
    materialId: string;
  }>;
}) {
  const { academyId, courseId, lectureId, materialId } = await params;
  redirect(
    `/studio/academies/${academyId}/content/courses/${courseId}/lectures/${lectureId}/exercises/${materialId}`,
  );
}
