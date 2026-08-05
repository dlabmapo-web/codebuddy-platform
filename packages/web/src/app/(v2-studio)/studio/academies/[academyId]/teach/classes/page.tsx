import type { MonitoringClassSummary } from '@cove/shared';

import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { isAccessDeniedError } from '@/lib/api-errors';
import { createServerORPCClient } from '@/lib/orpc-server';

import { StudioShell } from '../../_components/studio-shell';
import { TeachingClasses } from './_components/teaching-classes';

/**
 * The assigned teacher's own classes.
 *
 * Four outcomes are kept apart on purpose: classes to show, an academy outside
 * the monitoring rollout, a caller who is not an assigned teacher, and a
 * server that did not answer. Collapsing the last two into one message sends a
 * teacher to ask for a role they already hold.
 */
export default async function TeachingClassesPage({
  params,
}: {
  params: Promise<{ academyId: string }>;
}) {
  const { academyId } = await params;
  const { t } = await getServerTranslation(['monitoring']);

  let classes: MonitoringClassSummary[] | null = null;
  let featureEnabled = false;
  let denied = false;

  try {
    const result = await createServerORPCClient().monitoring.listAssignedClasses(
      { academyId },
    );
    classes = result.classes;
    featureEnabled = result.featureEnabled;
  } catch (error) {
    denied = isAccessDeniedError(error);
  }

  return (
    <StudioShell
      academyId={academyId}
      bleed
      description={t('classes.description')}
      title={t('classes.title')}
    >
      {classes && featureEnabled ? (
        <TeachingClasses academyId={academyId} initialClasses={classes} />
      ) : (
        <div className="rounded-card border border-border bg-surface p-5">
          <h2 className="text-[15px] font-bold">
            {stateTitle({ classes, featureEnabled, denied, t })}
          </h2>
          <p className="mt-1.5 text-[14px] leading-6 text-sub">
            {stateBody({ classes, featureEnabled, denied, t })}
          </p>
        </div>
      )}
    </StudioShell>
  );
}

type StateInput = {
  classes: MonitoringClassSummary[] | null;
  featureEnabled: boolean;
  denied: boolean;
  t: Awaited<ReturnType<typeof getServerTranslation>>['t'];
};

function stateTitle({ classes, featureEnabled, denied, t }: StateInput): string {
  if (classes && !featureEnabled) return t('monitoring:classes.disabled_title');
  if (denied) return t('monitoring:classes.forbidden_title');
  return t('monitoring:classes.unavailable_title');
}

function stateBody({ classes, featureEnabled, denied, t }: StateInput): string {
  if (classes && !featureEnabled) return t('monitoring:classes.disabled_body');
  if (denied) return t('monitoring:classes.forbidden_body');
  return t('monitoring:classes.unavailable_body');
}
