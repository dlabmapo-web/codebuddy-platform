import { notFound } from 'next/navigation';
import { rolesHavePermission } from '@cove/shared';
import { requireAcademyRoute } from '@/lib/academy-route';
import { createContentPaths } from '@/components/studio/content-paths';
import { ExplanationAuthorPageContent } from '@/components/explanation/explanation-author-page';
export default async function ExplanationEditorPage({
  params,
}: {
  params: Promise<{
    academySlug: string;
    courseId: string;
    lectureId: string;
    materialId: string;
  }>;
}) {
  const { academySlug, courseId, lectureId, materialId } = await params;
  const identity = await requireAcademyRoute(academySlug);
  const editable = rolesHavePermission(identity.roles, 'curriculum.manage');
  if (
    !rolesHavePermission(identity.roles, 'curriculum.review') ||
    (materialId === 'new' && !editable)
  )
    notFound();
  return (
    <ExplanationAuthorPageContent
      academyId={identity.academyId}
      courseId={courseId}
      lectureId={lectureId}
      materialId={materialId}
      paths={createContentPaths(academySlug, 'academy')}
      editable={editable}
    />
  );
}
