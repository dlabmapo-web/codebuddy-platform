import { requireAcademyRoute } from '@/lib/academy-route';
import type { AcademyFeatureList } from '@cove/shared';
import { notFound } from 'next/navigation';

import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { canManageAcademySettings } from '@/lib/academy-access-state';
import { createServerORPCClient } from '@/lib/orpc-server';

import { StudioPage } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/studio-page';
import { FeatureSettings } from './_components/feature-settings';

/**
 * What this academy has switched on.
 *
 * A manager's page and nobody else's: every other role reads these switches
 * to render itself, and none of them decides. Rendered on the server so the
 * toggles open in their real positions rather than settling into them.
 */
export default async function AcademySettingsPage({
  params,
}: {
  params: Promise<{ academySlug: string }>;
}) {
  const { academySlug } = await params;
  const { academyId, roles } = await requireAcademyRoute(academySlug);
  if (!canManageAcademySettings(roles)) notFound();

  const { t } = await getServerTranslation(['content']);

  let features: AcademyFeatureList | null = null;
  try {
    features = await createServerORPCClient().academyFeatures.list({ academyId });
  } catch {
    // The client owns the retry and can say what happened.
  }

  return (
    <StudioPage
      description={t('settings.description')}
      title={t('settings.title')}
    >
      <FeatureSettings academyId={academyId} initialFeatures={features} />
    </StudioPage>
  );
}
