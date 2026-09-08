import type { AcademyFeatureList } from '@cove/shared';

import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { requirePlatformAcademyRoute } from '@/lib/academy-route';
import { backTo } from '@/lib/back-to';
import { createPlatformServerORPCClient } from '@/lib/orpc-server';
import { routes } from '@/lib/routes';

import { BackLink } from '@/components/studio/back-link';
import { FeatureSettings } from '@/app/(studio)/academy/[academySlug]/(framed)/settings/_components/feature-settings';

import { PlatformShell } from '../../../_components/platform-shell';
import { PointPolicyLink } from './_components/point-policy-link';

/**
 * What one academy has switched on, administered from the console.
 *
 * The operator's own page, not a shortcut into the academy's. An operator
 * answering "they say points are off" had to enter the academy as a Manager,
 * find Settings in a rail built for somebody else, and remember to come back —
 * three navigations and a role cookie to move one switch.
 *
 * ## Why this is not a second editor
 *
 * It renders the academy's own `FeatureSettings`, unchanged. There is exactly
 * one component that draws these switches and exactly one endpoint behind it;
 * this page supplies a different frame and a different way in. A console copy
 * of the control would be two editors of one setting, which is the thing
 * `IdentityPanel` next door is careful not to be.
 *
 * ## Why no new permission
 *
 * `AcademyFeaturesService.setEnabled` asks for `academy.settings.manage`
 * through `ManagerScopeService`, and a platform operator resolves as MANAGER
 * there already — `AcademyAccessService.platformRead` grants the role's own
 * set. Console routes never forward the role-view cookie, from the server
 * client here and from `shouldForwardViewRole` in the browser, so the answer
 * cannot change because of an earlier diagnostic trip as a Teacher.
 */
export default async function PlatformAcademySettingsPage({
  params,
}: {
  params: Promise<{ academySlug: string }>;
}) {
  const { academySlug } = await params;
  const { academyId } = await requirePlatformAcademyRoute(academySlug);
  const { t } = await getServerTranslation(['platform']);

  let features: AcademyFeatureList | null = null;
  try {
    features = await createPlatformServerORPCClient().academyFeatures.list({
      academyId,
    });
  } catch {
    // The client owns the retry and can say what happened.
  }

  const pointsEnabled =
    features?.features.some(
      (feature) => feature.feature === 'STUDENT_POINTS' && feature.isEnabled,
    ) ?? null;

  return (
    <PlatformShell
      back={
        <BackLink
          href={backTo.platformAcademySettings(academySlug)}
          label={t('settings.back')}
        />
      }
      description={t('settings.description')}
      title={t('settings.title')}
    >
      <FeatureSettings academyId={academyId} initialFeatures={features} />
      {/*
        The way to the policy, from the switch that decides whether it applies.
        Only where points are on: a link to a page configuring an economy this
        academy does not run is the studio's own rule, and the operator has
        already been told the state by the switch immediately above.
      */}
      {pointsEnabled ? (
        <PointPolicyLink href={routes.adminAcademyPointPolicy(academySlug)} />
      ) : null}
    </PlatformShell>
  );
}
