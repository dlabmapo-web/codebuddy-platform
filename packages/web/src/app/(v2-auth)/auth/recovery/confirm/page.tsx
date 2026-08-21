import { getServerTranslation } from '@/i18n/server/get-server-translation';

import { AuthCard } from '../../_components/auth-card';
import { RecoveryLinkFailure } from '../../_components/recovery-link-failure';
import { readRecoveryLink } from '../../_lib/recovery-link';
import { ContinueRecovery } from './_components/continue-recovery';

/**
 * Where a Supabase recovery email lands.
 *
 * The GET renders and verifies nothing. It checks only that the link is
 * shaped like a recovery link, then waits for the person to press a button —
 * see `ContinueRecovery` for why. `next` and every other destination
 * parameter is ignored, so this route cannot be dressed up as an open
 * redirect in an email that appears to come from Cove.
 */
export default async function RecoveryConfirmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const { t } = await getServerTranslation(['auth']);
  const link = readRecoveryLink(query);

  if (!link) {
    return (
      <AuthCard
        description={t('recovery.invalid_description')}
        title={t('recovery.invalid_title')}
      >
        <RecoveryLinkFailure />
      </AuthCard>
    );
  }

  return (
    <AuthCard
      description={t('confirm.description')}
      title={t('confirm.title')}
    >
      <ContinueRecovery tokenHash={link.tokenHash} />
    </AuthCard>
  );
}
