import { notFound, redirect } from 'next/navigation';

import { requireAcademyRoute } from '@/lib/academy-route';
import { createServerORPCClient, getAccount } from '@/lib/orpc-server';
import { routes } from '@/lib/routes';

import { ExamFailure } from '../_components/exam-failure';
import { ExamTranslations, examErrorCode, isUuid } from '../_components/exam-page';
import { PrepareWizard } from '../_components/prepare-wizard';

/** 테스트 준비하기 (Elice provided/01–03). */
export default async function PreparePage({
  params, searchParams,
}: {
  params: Promise<{ academySlug: string; lectureId: string }>;
  searchParams: Promise<{ classId?: string }>;
}) {
  const { academySlug, lectureId } = await params;
  const { classId } = await searchParams;
  if (!isUuid(lectureId) || !isUuid(classId)) notFound();
  const { academyId } = await requireAcademyRoute(academySlug);
  const [account, result] = await Promise.all([
    getAccount(),
    createServerORPCClient().exam.studentTest({ academyId, classId, lectureId }).then(
      (data) => ({ ok: true as const, data }), (error: unknown) => ({ ok: false as const, error })),
  ]);
  if (!result.ok) {
    const code = examErrorCode(result.error);
    if (!code) throw result.error;
    return <ExamTranslations><ExamFailure code={code} backHref={routes.academyLearnClass(academySlug, classId)} /></ExamTranslations>;
  }
  const test = result.data;
  // An attempt already running goes straight back to it.
  if (test.latestAttempt?.open) redirect(routes.academyLearnTestAttempt(academySlug, lectureId, test.latestAttempt.id));
  if (!test.canStart && !test.canRetake) redirect(routes.academyLearnTest(academySlug, lectureId, { classId }));
  const name = account.user.displayName || account.user.username || '';
  return (
    <ExamTranslations>
      <PrepareWizard academyId={academyId} test={test} name={name} />
    </ExamTranslations>
  );
}
