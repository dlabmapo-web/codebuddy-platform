import { StudioShell } from '../../_components/studio-shell';
import { createServerORPCClient } from '@/lib/orpc-server';
import { CoursesManager } from './_components/courses-manager';

export default async function CoursesPage({
  params,
}: {
  params: Promise<{ academyId: string }>;
}) {
  const { academyId } = await params;
  let courses = null;

  try {
    ({ courses } = await createServerORPCClient().academyCourses.list({
      academyId,
    }));
  } catch {
    // The permission-aware state is rendered below.
  }

  return (
    <StudioShell
      academyId={academyId}
      bleed
      description="A course is curriculum you write once and teach in many classes."
      title="Courses"
    >
      {courses ? (
        <CoursesManager academyId={academyId} initialCourses={courses} />
      ) : (
        <div className="rounded-card border border-danger/25 bg-danger/5 p-5">
          <h2 className="text-[15px] font-bold text-danger">
            Courses are not available to you
          </h2>
          <p className="mt-1.5 text-[14px] leading-6 text-sub">
            Managing academy curriculum needs an active Team Lead or Manager
            membership. Ask an academy manager to change your role.
          </p>
        </div>
      )}
    </StudioShell>
  );
}
