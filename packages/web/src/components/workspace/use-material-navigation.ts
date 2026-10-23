'use client';

import { useQuery } from '@tanstack/react-query';
import { toNavigatorContext, workspaceMaterialSequence } from '@cove/shared';
import { useRouter } from 'next/navigation';
import { orpc } from '@/lib/orpc';
import { routes } from '@/lib/routes';
import { useAcademySlug } from '@/components/studio/academy-route-provider';

export function useMaterialNavigation({ academyId, courseId, materialId, classId, preview, materials = [] }: {
  academyId: string; courseId?: string; materialId: string; classId?: string; preview?: boolean;
  materials?: ReadonlyArray<{ materialId: string; title: string; type: string }>;
}) {
  const slug = useAcademySlug();
  const router = useRouter();
  const query = useQuery({
    queryKey: ['material-navigation', academyId, courseId, classId, Boolean(preview)],
    queryFn: () => orpc.learn.getCourseOutline({ academyId, courseId: courseId!, classId, preview: preview || undefined }),
    enabled: Boolean(courseId), retry: false, staleTime: 30_000,
  });
  const context = query.data ? toNavigatorContext(query.data, materialId) : null;
  const unavailable = Boolean(query.data && !context);
  const sequence = context ? workspaceMaterialSequence(context) : materials;
  const index = sequence.findIndex(item => item.materialId === materialId);
  const href = (item: { materialId: string; type: string }) => routes.academyLearnMaterial(slug, item.materialId, item.type, { classId, preview: preview || undefined });
  return {
    context, failed: query.isError || unavailable, unavailable, retry: () => void query.refetch(),
    courseHref: courseId ? routes.academyLearnCourse(slug, courseId, { classId }) : routes.academyLearnCourses(slug),
    previous: index > 0 ? { href: href(sequence[index - 1]) } : null,
    next: index >= 0 && index + 1 < sequence.length ? { href: href(sequence[index + 1]) } : null,
    index: index + 1, total: sequence.length,
    navigate: (id: string) => { const item = sequence.find(item => item.materialId === id); if (item) router.push(href(item)); },
  };
}
