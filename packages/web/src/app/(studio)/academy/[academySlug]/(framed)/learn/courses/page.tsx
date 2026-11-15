import { redirect } from 'next/navigation';
import { rolesHavePermission } from '@cove/shared';
import { StaffCoursesPage } from '../../content/courses/_components/staff-courses-page';
import { requireAcademyRoute } from '@/lib/academy-route';
import { routes } from '@/lib/routes';

/** Keep staff courses and redirect the old student catalog before any catalog read. */
export default async function LearnCoursesPage({ params }: { params: Promise<{ academySlug: string }> }) {
  const { academySlug } = await params;
  const { roles } = await requireAcademyRoute(academySlug);
  if (rolesHavePermission(roles, 'practice.own.create')) {
    return <StaffCoursesPage params={Promise.resolve({ academySlug })} />;
  }
  redirect(routes.academyLearnClasses(academySlug));
}
