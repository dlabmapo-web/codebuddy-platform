import type { PointPolicyState } from '@cove/shared';

import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { requirePlatformAcademyRoute } from '@/lib/academy-route';
import { backTo } from '@/lib/back-to';
import { createPlatformServerORPCClient } from '@/lib/orpc-server';
import { routes } from '@/lib/routes';

import { BackLink } from '@/components/studio/back-link';
import { PointPolicyForm } from '@/app/(studio)/academy/[academySlug]/(framed)/settings/points/_components/point-policy-form';

import { PlatformShell } from '../../../../_components/platform-shell';
import { PointsOffNotice } from './_components/points-off-notice';

/**
 * What each kind of work pays in one academy, set from the console.
 *
 * The academy's own form, in the operator's frame — see the sibling settings
 * page for why there is one component and one endpoint rather than a console
 * copy of each.
 *
 * ## Where this differs from the academy's page
 *
 * The studio answers `notFound()` when points are explicitly off, and that is
 * right for a manager: they are not offered a page configuring an economy they
 * do not run. An operator arrives with the opposite question — *why* does this
 * academy have no points — and a 404 answers it with "this page does not
 * exist", which is both false and the shape of a permissions problem. So the
 * page opens, says the economy is off, and points at the switch.
 *
 * Editing a policy while points are off is deliberately still allowed: an
 * academy can be configured before it is switched on, and the alternative is
 * an operator turning points on for real students in order to set what they
 * are worth.
 *
 * `points` is mounted here rather than in the console's own namespace list:
 * this is the one console page that reads it, and `platformNamespaces` is
 * carried by every operator's every page.
 */
export default async function PlatformAcademyPointPolicyPage({
  params,
}: {
  params: Promise<{ academySlug: string }>;
}) {
  const { academySlug } = await params;
  const { academyId } = await requirePlatformAcademyRoute(academySlug);
  const { t } = await getServerTranslation(['points', 'platform-settings']);

  const client = createPlatformServerORPCClient();
  const [state, pointsEnabled] = await Promise.all([
    client.points.policy
      .get({ academyId })
      .catch((): PointPolicyState | null => null),
    client.academyFeatures
      .list({ academyId })
      .then(({ features }) =>
        features.some(
          (feature) =>
            feature.feature === 'STUDENT_POINTS' && feature.isEnabled,
        ),
      )
      .catch(() => null),
  ]);

  return (
    <PlatformShell
      back={
        <BackLink
          href={backTo.platformAcademyPointPolicy(academySlug)}
          label={t('platform-settings:settings.back_to_settings')}
        />
      }
      description={t('points:policy.description')}
      namespaces={['points']}
      title={t('points:policy.title')}
    >
      {pointsEnabled === false ? (
        <PointsOffNotice href={routes.adminAcademySettings(academySlug)} />
      ) : null}
      <PointPolicyForm academyId={academyId} initialState={state} />
    </PlatformShell>
  );
}
