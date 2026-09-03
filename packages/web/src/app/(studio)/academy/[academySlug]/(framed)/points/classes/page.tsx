import type { AcademyRole } from '@cove/shared';

import { requireAcademyRoute } from '@/lib/academy-route';
import { notFound } from 'next/navigation';

import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { academyRolesFor, canManageClasses } from '@/lib/academy-access-state';
import { getAccount } from '@/lib/orpc-server';

import { StudioPage } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/studio-page';
import { ClassRankingWorkspace } from './_components/class-ranking-workspace';

/**
 * The academy's class rankings, for a manager or a team lead.
 *
 * They hold every class, and reaching a ranking through one class's detail
 * page made them navigate to a class to ask a question that is not about that
 * class. A teacher keeps the in-class board, which is the right shape for two
 * or three classes arrived at one at a time.
 *
 * Gated on `classes.manage` — MANAGER and TEAM_LEAD. A teacher landing here by
 * URL gets the not-found page rather than a narrower version of it, because
 * the board they want already exists on the page they teach from, and two
 * routes to one table is how the two drift apart.
 *
 * The gate here is convenience, not security. `resolveClassBoard` refuses a
 * student outright and scopes a teacher to their assignment, so the server is
 * the thing that decides — this only keeps a reader off a page that would
 * refuse them anyway.
 */
export default async function ClassRankingPage({
  params,
}: {
  params: Promise<{ academySlug: string }>;
}) {
  const { academySlug } = await params;
  const { academyId } = await requireAcademyRoute(academySlug);
  const { t } = await getServerTranslation(['points']);

  let roles: readonly AcademyRole[] = [];
  try {
    roles = academyRolesFor(await getAccount(), academyId);
  } catch {
    notFound();
  }
  if (!canManageClasses(roles)) notFound();

  return (
    <StudioPage
      description={t('points:staff.description')}
      title={t('points:staff.title')}
    >
      <ClassRankingWorkspace academyId={academyId} />
    </StudioPage>
  );
}
