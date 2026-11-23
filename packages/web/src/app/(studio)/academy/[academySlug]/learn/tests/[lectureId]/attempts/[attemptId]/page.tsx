import { notFound } from 'next/navigation';

import { requireAcademyRoute } from '@/lib/academy-route';
import { createServerORPCClient } from '@/lib/orpc-server';
import { routes } from '@/lib/routes';

import { ExamFailure } from '../../_components/exam-failure';
import { ExamTranslations, examErrorCode, isUuid } from '../../_components/exam-page';
import { TestMode } from '../../_components/test-mode';

/**
 * Full-screen test mode (Elice provided/04–06). Deliberately outside the
 * studio shell: the course navigator is replaced by the problem rail.
 */
export default async function AttemptPage({
  params,
}: {
  params: Promise<{ academySlug: string; lectureId: string; attemptId: string }>;
}) {
  const { academySlug, lectureId, attemptId } = await params;
  if (!isUuid(lectureId) || !isUuid(attemptId)) notFound();
  const { academyId } = await requireAcademyRoute(academySlug);
  let shell;
  try {
    shell = await createServerORPCClient().exam.attempt({ academyId, attemptId });
  } catch (error) {
    const code = examErrorCode(error);
    if (!code) throw error;
    return <ExamTranslations><ExamFailure code={code} backHref={routes.academyLearnClasses(academySlug)} /></ExamTranslations>;
  }
  return (
    <ExamTranslations>
      <TestMode academyId={academyId} initial={shell} />
    </ExamTranslations>
  );
}
