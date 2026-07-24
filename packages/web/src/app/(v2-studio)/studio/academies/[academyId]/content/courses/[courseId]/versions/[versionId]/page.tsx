import Link from 'next/link';

import { StudioShell } from '../../../../../_components/studio-shell';
import { createServerORPCClient } from '@/lib/orpc-server';
import { CourseBuilder } from './_components/course-builder';

export default async function CourseBuilderPage({
  params,
}: {
  params: Promise<{
    academyId: string;
    courseId: string;
    versionId: string;
  }>;
}) {
  const { academyId, courseId, versionId } = await params;
  let initialTree = null;

  try {
    initialTree = await createServerORPCClient().academyCourses
      .getDraftTree({ academyId, courseId, versionId });
  } catch {
    // The scoped not-found/forbidden state is rendered below.
  }

  return (
    <StudioShell
      academyId={academyId}
      bleed
      description={
        initialTree
          ? initialTree.version.status === 'DRAFT'
            ? 'Arrange modules and lectures. Nothing reaches classes until you publish.'
            : 'A published version is a fixed record of what classes are teaching.'
          : undefined
      }
      title={initialTree?.course.title ?? 'Course builder'}
    >
      {initialTree ? (
        <CourseBuilder
          academyId={academyId}
          courseId={courseId}
          initialTree={initialTree}
          versionId={versionId}
        />
      ) : (
        <div className="rounded-card border border-danger/25 bg-danger/5 p-5">
          <h2 className="text-[15px] font-bold text-danger">
            This course version is not available
          </h2>
          <p className="mt-1.5 text-[14px] leading-6 text-sub">
            It belongs to another academy, or your membership cannot open it.
          </p>
          <Link
            className="mt-4 inline-block text-[14px] font-bold text-brand underline underline-offset-4"
            href={`/studio/academies/${academyId}/content/courses`}
          >
            Back to courses
          </Link>
        </div>
      )}
    </StudioShell>
  );
}
