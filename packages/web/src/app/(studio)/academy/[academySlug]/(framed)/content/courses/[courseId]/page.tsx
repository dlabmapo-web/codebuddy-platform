import { redirect } from 'next/navigation';
import { routes } from '@/lib/routes';

export default async function CoursePage({ params }: { params: Promise<{ academySlug: string; courseId: string }> }) {
  const { academySlug, courseId } = await params;
  redirect(routes.academyLearnCourse(academySlug, courseId));
}
