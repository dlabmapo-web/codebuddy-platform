import type { PointPolicyState } from '@cove/shared';
import { notFound } from 'next/navigation';

import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { canManageAcademySettings } from '@/lib/academy-access-state';
import { requireAcademyRoute } from '@/lib/academy-route';
import { createServerORPCClient } from '@/lib/orpc-server';

import { StudioPage } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/studio-page';
import { PointPolicyForm } from './_components/point-policy-form';

/**
 * What each kind of work pays in this academy.
 *
 * A manager's page and nobody else's, and only where points are on: an academy
 * that does not run points is not offered a page configuring them, which is
 * why the feature is checked here as well as in the sidebar.
 *
 * Rendered on the server so the form opens on its real values rather than on
 * an empty grid that fills in. A failed read renders the form on the platform
 * defaults with its error visible — never as an academy that chose them.
 */
export default async function PointPolicyPage({
  params,
}: {
  params: Promise<{ academySlug: string }>;
}) {
  const { academySlug } = await params;
  const { academyId, roles } = await requireAcademyRoute(academySlug);
  if (!canManageAcademySettings(roles)) notFound();
  // Explicitly off is a 404; unknown is not. A page that hid itself whenever
  // the features read had a bad moment would be a settings page that
  // disappears during an outage, which reads as a permission problem.
  if ((await pointsEnabled(academyId)) === false) notFound();

  const { t } = await getServerTranslation(['points']);

  let state: PointPolicyState | null = null;
  try {
    state = await createServerORPCClient().points.policy.get({ academyId });
  } catch {
    // The client owns the retry and can say what happened.
  }

  return (
    <StudioPage
      description={t('points:policy.description')}
      title={t('points:policy.title')}
    >
      <PointPolicyForm academyId={academyId} initialState={state} />
    </StudioPage>
  );
}

/** True, false, or null when the academy could not be asked. */
async function pointsEnabled(academyId: string): Promise<boolean | null> {
  try {
    const { features } = await createServerORPCClient().academyFeatures.list({
      academyId,
    });
    return features.some(
      (feature) => feature.feature === 'STUDENT_POINTS' && feature.isEnabled,
    );
  } catch {
    return null;
  }
}
