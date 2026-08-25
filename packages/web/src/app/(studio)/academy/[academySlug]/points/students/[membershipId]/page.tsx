import { requireAcademyRoute } from '@/lib/academy-route';
import type { PointsPage } from '@cove/shared';
import { notFound } from 'next/navigation';

import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { createServerORPCClient } from '@/lib/orpc-server';

import { StudioShell } from '../../../_components/studio-shell';
import { StudentPointsLedger } from '../../_components/student-points-ledger';

/**
 * One student's points, read by their teacher, team lead, or manager.
 *
 * §5.1 — "why does 지호 have 40 points" is a question a parent asks a teacher,
 * and the teacher has to be able to answer it. Every line of the ledger names
 * a fact the server observed, so the answer is always on this page.
 *
 * There is no board here and nothing to change. The class ranking is on the
 * class page, where a teacher opens it about a class rather than about a
 * child, and no page anywhere can award, adjust, or top up a point. §5.2.
 *
 * Denial and absence are the same answer: a teacher who is not assigned to
 * this student must not be able to tell them apart from a student who does not
 * exist, so both land on the not-found page.
 */
export default async function StudentPointsPage({
  params,
}: {
  params: Promise<{ academySlug: string; membershipId: string }>;
}) {
  const { academySlug, membershipId } = await params;
  const { academyId } = await requireAcademyRoute(academySlug);
  const { t } = await getServerTranslation(['points']);

  let page: PointsPage | null = null;
  try {
    page = await createServerORPCClient().points.getPage({
      academyId,
      membershipId,
    });
  } catch {
    notFound();
  }
  if (!page) notFound();

  return (
    <StudioShell
      academyId={academyId}
      description={t('student.description')}
      title={page.subjectName}
    >
      <StudentPointsLedger
        academyId={academyId}
        membershipId={membershipId}
        page={page}
      />
    </StudioShell>
  );
}
