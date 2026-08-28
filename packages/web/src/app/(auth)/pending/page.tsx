import { AuthCard } from '../_components/auth-card';
import { SignOutControl } from '../_components/sign-out-control';
import { PendingApproval } from './_components/pending-approval';
import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { getAccount } from '@/lib/orpc-server';

export default async function PendingApprovalPage() {
  const { t } = await getServerTranslation(['auth']);
  let account;
  try {
    account = await getAccount();
  } catch {
    return (
      <AuthCard
        description={t('pending.unavailable_description')}
        title={t('pending.title')}
      >
        <p className="text-sm text-danger">{t('pending.unavailable_hint')}</p>
        <div className="mt-5">
          <SignOutControl />
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      description={t('pending.description')}
      title={t('pending.title')}
    >
      <PendingApproval initialAccount={account} />
    </AuthCard>
  );
}
