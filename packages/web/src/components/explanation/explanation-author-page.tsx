import { notFound, redirect } from 'next/navigation';
import type { ContentPaths } from '@/components/studio/content-paths';
import {
  readExplanationAuthorDocument,
  readExplanationAuthorContext,
} from '@/lib/explanation-server';
import { ExplanationAuthorWorkspace } from './explanation-author-workspace';
/** Shared server authoring boundary for academy, console and library routes. */
export async function ExplanationAuthorPageContent({
  academyId,
  courseId,
  lectureId,
  materialId,
  paths,
  editable = true,
  forwardViewRole = true,
}: {
  academyId: string;
  courseId: string;
  lectureId: string;
  materialId: string;
  paths: ContentPaths;
  editable?: boolean;
  forwardViewRole?: boolean;
}) {
  const initial =
    materialId === 'new'
      ? null
      : await readExplanationAuthorDocument(academyId, materialId, forwardViewRole);
  if (materialId !== 'new' && !initial) notFound();
  const context =
    initial ??
    (await readExplanationAuthorContext(
      academyId,
      courseId,
      lectureId,
      forwardViewRole,
    ));
  if (!context || context.course.id !== courseId) notFound();
  if (context.lecture.id !== lectureId)
    redirect(paths.explanation(courseId, context.lecture.id, materialId));
  return (
    <ExplanationAuthorWorkspace
      key={materialId}
      target={{ academyId, courseId, lectureId }}
      context={context}
      initial={initial}
      backHref={paths.course(courseId)}
      authorBaseHref={paths
        .explanation(courseId, lectureId, 'new')
        .replace(/\/new$/, '')}
      editable={editable}
    />
  );
}
