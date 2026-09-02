import type { ExerciseAuthoringContext } from '@cove/shared';
import { notFound } from 'next/navigation';

import { PlatformShell } from '@/app/(platform)/admin/_components/platform-shell';
import { ExerciseWorkspace } from '@/app/(studio)/academy/[academySlug]/(framed)/content/courses/[courseId]/lectures/[lectureId]/exercises/_components/exercise-workspace';
import { consoleBackTarget } from '@/app/(platform)/admin/_lib/back-target';
import { BackLink } from '@/components/studio/back-link';
import { createContentPaths } from '@/components/studio/content-paths';
import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { requirePlatformAcademyRoute } from '@/lib/academy-route';
import { createPlatformServerORPCClient } from '@/lib/orpc-server';

export default async function PlatformExercisePage({
  params,
  searchParams,
}: {
  params: Promise<{
    academySlug: string;
    courseId: string;
    lectureId: string;
    materialId: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { academySlug, courseId, lectureId, materialId } = await params;
  const { from } = await searchParams;
  const { academyId } = await requirePlatformAcademyRoute(academySlug);
  const client = createPlatformServerORPCClient();
  const academy = await client.platformAcademies
    .get({ academyId })
    .catch(() => null);
  if (!academy) notFound();

  let context: ExerciseAuthoringContext;
  let solutionCode = '';
  if (materialId === 'new') {
    const tree = await client.academyCourses
      .getTree({ academyId, courseId })
      .catch(() => null);
    const courseModule = tree?.modules.find((item) =>
      item.lectures.some((lecture) => lecture.id === lectureId),
    );
    const lecture = courseModule?.lectures.find(
      (item) => item.id === lectureId,
    );
    if (!tree || !courseModule || !lecture) notFound();
    context = {
      course: { id: tree.course.id, title: tree.course.title },
      module: { id: courseModule.id, title: courseModule.title },
      lecture: { id: lecture.id, title: lecture.title },
      material: null,
    };
  } else {
    context = await client.academyCourses
      .getExercise({ academyId, courseId, lectureId, materialId })
      .catch(() => notFound());
    solutionCode = await client.academyCourses
      .getExerciseSolution({ academyId, courseId, lectureId, materialId })
      .then((solution) => solution.solutionCode ?? '')
      .catch(() => '');
  }

  const contentPaths = createContentPaths(academySlug, 'console');
  const { t } = await getServerTranslation(['platform-content']);
  const back = consoleBackTarget(from, t('platform-content:title'), {
    href: contentPaths.course(courseId),
    label: academy.name,
  });

  return (
    <PlatformShell
      back={<BackLink href={back.href} label={back.label} />}
      bleed
      title={context.course.title}
    >
      <ExerciseWorkspace
        academyId={academyId}
        canEdit
        courseId={courseId}
        initialContext={context}
        initialSolutionCode={solutionCode}
        lectureId={lectureId}
      />
    </PlatformShell>
  );
}
