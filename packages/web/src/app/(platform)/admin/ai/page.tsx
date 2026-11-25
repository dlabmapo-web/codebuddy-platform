import type { PlatformAiUsage } from '@cove/shared';

import { platformAiNamespaces } from '@/i18n/namespaces';
import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { isAccessDeniedError } from '@/lib/api-errors';
import { createPlatformServerORPCClient } from '@/lib/orpc-server';

import { PlatformShell } from '../_components/platform-shell';
import { AiUsage } from './_components/ai-usage';

/** What the AI assistant costs and how it behaves. Counts, never a student's words. */
export default async function PlatformAiPage() {
  const { t } = await getServerTranslation(['platform', 'platform-ai']);
  let usage: PlatformAiUsage | null = null;
  let denied = false;
  try {
    usage = await createPlatformServerORPCClient().aiAssistant.platformUsage();
  } catch (error) {
    denied = isAccessDeniedError(error);
  }

  return (
    <PlatformShell
      description={t('platform-ai:subtitle')}
      namespaces={platformAiNamespaces}
      title={t('platform-ai:title')}
    >
      {usage ? (
        <AiUsage usage={usage} />
      ) : (
        <div className="rounded-card border border-danger/25 bg-danger/5 p-5">
          <h2 className="text-[15px] font-bold text-danger">
            {denied ? t('unavailable.forbidden_title') : t('platform-ai:unavailable.title')}
          </h2>
          <p className="mt-1.5 text-[14px] leading-6 text-sub">
            {denied ? t('unavailable.forbidden_body') : t('platform-ai:unavailable.body')}
          </p>
        </div>
      )}
    </PlatformShell>
  );
}
