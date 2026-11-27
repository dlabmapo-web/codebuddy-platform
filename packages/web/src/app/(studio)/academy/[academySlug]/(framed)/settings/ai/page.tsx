import type { AcademyAiUsage } from '@cove/shared';
import { notFound } from 'next/navigation';

import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { canManageAcademySettings } from '@/lib/academy-access-state';
import { requireAcademyRoute } from '@/lib/academy-route';
import { createServerORPCClient, getAcademyFeatures } from '@/lib/orpc-server';

import { StudioPage } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/studio-page';
import { AiUsage } from './_components/ai-usage';

/**
 * How this campus uses the AI teacher: answers, libraries and cost.
 *
 * A manager's page, and only where the campus has the AI teacher on; it moved
 * here from the operator console on November 27, 2026. Read once on the
 * server; a manager reloads for newer numbers.
 */
export default async function AiTeacherPage({ params }: { params: Promise<{ academySlug: string }> }) {
  const { academySlug } = await params;
  const { academyId, roles } = await requireAcademyRoute(academySlug);
  if (!canManageAcademySettings(roles)) notFound();
  // Asked alongside the feature check; a campus without the AI teacher answers 404.
  const usageRequest = createServerORPCClient().aiAssistant.academyUsage({ academyId })
    .then((value): AcademyAiUsage | null => value, () => null);
  if ((await aiEnabled(academyId)) === false) notFound();
  const [{ t }, usage] = await Promise.all([getServerTranslation(['ai-usage']), usageRequest]);

  return (
    <StudioPage description={t('ai-usage:subtitle')} title={t('ai-usage:title')}>
      {usage ? <AiUsage usage={usage} /> : (
        <div className="rounded-card border border-danger/25 bg-danger/5 p-5">
          <h2 className="text-[15px] font-bold text-danger">{t('ai-usage:unavailable.title')}</h2>
          <p className="mt-1.5 text-[14px] leading-6 text-sub">{t('ai-usage:unavailable.body')}</p>
        </div>
      )}
    </StudioPage>
  );
}

/** True, false, or null when the academy could not be asked. */
async function aiEnabled(academyId: string): Promise<boolean | null> {
  try {
    const { features } = await getAcademyFeatures(academyId);
    return features.some((feature) => feature.feature === 'AI_ASSISTANT' && feature.isEnabled);
  } catch {
    return null;
  }
}
