import type { AcademyRole } from '@cove/shared';

import { routes } from '@/lib/routes';

/** Use the primary membership role, or the route guard's assumed support role. */
export function academyEntryPath(academySlug: string, role: AcademyRole): string {
  const destinations = {
    MANAGER: routes.academyClasses,
    TEAM_LEAD: routes.academyClasses,
    TEACHER: routes.academyTeachClasses,
    STUDENT: routes.academyLearnCourses,
  } satisfies Record<AcademyRole, (slug: string) => string>;

  return destinations[role](academySlug);
}
