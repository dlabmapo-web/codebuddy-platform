import { getServerTranslation } from '@/i18n/server/get-server-translation';

import { AuthCard } from '../_components/auth-card';
import { RecoveryLinkFailure } from '../_components/recovery-link-failure';
import { recoverySubject } from '../_lib/recovery-session';
import { ResetPasswordForm } from './_components/reset-password-form';

/**
 * Choosing the new password.
 *
 * Both authorizations are checked before the form exists, not only when it is
 * submitted. An ordinary signed-in session reaching this URL holds a Supabase
 * session but no recovery capability, and it gets the same page a stale link
 * does — a form here would look like a way to change a password without
 * knowing the current one.
 */
export default async function ResetPasswordPage() {
  const { t } = await getServerTranslation(['auth']);
  const authorized = await recoverySubject();

  if (!authorized) {
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
      description={t('reset.description')}
      title={t('reset.title')}
    >
      <ResetPasswordForm />
    </AuthCard>
  );
}
