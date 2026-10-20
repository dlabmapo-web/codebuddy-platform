import { redirect } from 'next/navigation';
import { routes } from '@/lib/routes';

export default async function CoursesPage({ params }: { params: Promise<{ academySlug: string }> }) {
  const { academySlug } = await params;
  redirect(routes.academyLearnCourses(academySlug));
}
