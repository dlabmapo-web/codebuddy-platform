import type { PointsPage } from '@cove/shared';
import { notFound } from 'next/navigation';

import { PlatformShell } from '@/app/(platform)/admin/_components/platform-shell';
import { consoleBackTarget } from '@/app/(platform)/admin/_lib/back-target';
import { StudentPointsLedger } from '@/app/(studio)/academy/[academySlug]/(framed)/points/_components/student-points-ledger';
import { BackLink } from '@/components/studio/back-link';
import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { requirePlatformAcademyRoute } from '@/lib/academy-route';
import { createPlatformServerORPCClient } from '@/lib/orpc-server';

/**
 * One student's points, read by an operator.
 *
 * The manager's own ledger page, mounted under a console route — the same
 * component, the same procedure, the same rules panel. §5.1: "why does 지호
 * have forty points" is a question a parent asks a teacher, the teacher asks
 * the manager, and — when the academy has no active manager, which is the whole
 * reason this console exists — it arrives at an operator. A ranking they can
 * read but cannot explain answers half the support call.
 *
 * It is mounted here rather than linked into the studio because every Open link
 * in the console stays inside it, exactly as the class and course editors do.
 * Leaving would drop the operator into a customer's studio chrome mid-question.
 *
 * Nothing on this page can write. There is no award control, no adjustment and
 * no void: the API has no method for the first two, and the correction path in
 * §7.6 is deliberately unexposed. An operator reads what a manager reads.
 *
 * Denial and absence are the same answer, as they are on the studio's own
 * version: an operator must not be able to tell a student who does not exist
 * from one they may not read, or the 404 becomes an id oracle.
 */
export default async function PlatformStudentPointsPage({
  params,
  searchParams,
}: {
  params: Promise<{ academySlug: string; membershipId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { academySlug, membershipId } = await params;
  const { from } = await searchParams;
  const { academyId } = await requirePlatformAcademyRoute(academySlug);
  const { t } = await getServerTranslation([
    'points',
    'platform-ranking',
    'platform-content',
  ]);

  let page: PointsPage | null = null;
  try {
    page = await createPlatformServerORPCClient().points.getPage({
      academyId,
      membershipId,
    });
  } catch {
    notFound();
  }
  if (!page) notFound();

  const back = consoleBackTarget(
    from,
    {
      courses: t('platform-content:lens.courses'),
      classes: t('platform-content:lens.classes'),
      ranking: t('platform-ranking:title'),
    },
    { href: '/admin/ranking', label: t('platform-ranking:title') },
  );

  return (
    <PlatformShell
      back={<BackLink href={back.href} label={back.label} />}
      bleed
      description={t('points:student.description')}
      namespaces={['points']}
      // The name the academy calls this child. It is why `platformScope` has to
      // resolve a subject at all — without it this heading was empty.
      title={page.subjectName}
    >
      <StudentPointsLedger
        academyId={academyId}
        membershipId={membershipId}
        page={page}
      />
    </PlatformShell>
  );
}
