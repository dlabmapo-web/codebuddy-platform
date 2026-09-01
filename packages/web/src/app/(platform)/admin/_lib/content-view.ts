import type { ContentLens } from '@cove/shared';

import { routes } from '@/lib/routes';

/** Where each content lens lives, so the tabs and the router agree. */
export const contentLensHrefs: Record<ContentLens, string> = {
  courses: '/admin/content/courses',
  classes: '/admin/content/classes',
  problems: '/admin/content/problems',
};

/**
 * Where an operator goes to change what they are looking at.
 *
 * Never a console editor — always the academy's own screen, reached through a
 * support session. That is the whole content decision in one function: the
 * console finds things, the academy's screens change them, and the session is
 * what makes the second one attributable.
 *
 * The destination rides along as `next` so the session form can land the
 * operator on the exact row they clicked rather than at the academy root.
 */
export function editInAcademyHref(input: {
  academyId: string;
  academySlug: string;
  path: string;
}): string {
  const next = `${routes.academy(input.academySlug)}${input.path}`;
  return `/admin/access/new?academy=${input.academyId}&next=${encodeURIComponent(next)}`;
}

/** The academy-relative path for each kind of row. */
export const contentPaths = {
  course: (courseId: string) => `/content/courses/${encodeURIComponent(courseId)}`,
  class: (classId: string) => `/classes/${encodeURIComponent(classId)}`,
  problem: (courseId: string, lectureId: string, materialId: string) =>
    `/content/courses/${encodeURIComponent(courseId)}/lectures/${encodeURIComponent(lectureId)}/exercises/${encodeURIComponent(materialId)}`,
} as const;
