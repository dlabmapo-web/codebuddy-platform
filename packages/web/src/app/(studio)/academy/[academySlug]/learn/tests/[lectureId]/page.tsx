import { notFound } from 'next/navigation';

import { requireAcademyRoute } from '@/lib/academy-route';
import { createServerORPCClient } from '@/lib/orpc-server';
import { routes } from '@/lib/routes';

import { ExamFailure } from './_components/exam-failure';
import { ExamTranslations, examErrorCode, isUuid } from './_components/exam-page';
import { TestCard } from './_components/test-card';

/** The test card (Elice provided/07): before, during and after an attempt. */
export default async function TestCardPage({
  params, searchParams,
}: {
  params: Promise<{ academySlug: string; lectureId: string }>;
  searchParams: Promise<{ classId?: string }>;
}) {
  const { academySlug, lectureId } = await params;
  const { classId } = await searchParams;
  if (!isUuid(lectureId) || !isUuid(classId)) notFound();
  const { academyId } = await requireAcademyRoute(academySlug);
  let test;
  try {
    test = await createServerORPCClient().exam.studentTest({ academyId, classId, lectureId });
  } catch (error) {
    const code = examErrorCode(error);
    if (!code) throw error;
    return <ExamTranslations><ExamFailure code={code} backHref={routes.academyLearnClass(academySlug, classId)} /></ExamTranslations>;
  }
  return (
    <ExamTranslations>
      <TestCard academyId={academyId} initial={test} />
    </ExamTranslations>
  );
}
