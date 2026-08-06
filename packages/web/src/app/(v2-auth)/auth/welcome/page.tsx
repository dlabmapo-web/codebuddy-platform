import { redirect } from 'next/navigation';

import { AuthCard } from '../_components/auth-card';
import { SignOutControl } from '../_components/sign-out-control';
import { UsernameClaim } from '../_components/username-claim';
import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { ServerTrans } from '@/i18n/server/server-trans';
import { authDestination } from '@/lib/academy-access-state';
import { createServerORPCClient } from '@/lib/orpc-server';

export default async function WelcomePage() {
  const { t } = await getServerTranslation(['auth', 'common']);
  let account;
  try {
    account = await createServerORPCClient().auth.bootstrap({});
  } catch {
    return (
      <AuthCard
        description={t('welcome.unavailable_description')}
        title={t('welcome.unavailable_title')}
      >
        <p className="text-sm text-danger">{t('welcome.unavailable_hint')}</p>
        <div className="mt-5">
          <SignOutControl />
        </div>
      </AuthCard>
    );
  }

  const destination = authDestination(account);
  if (destination !== '/auth/welcome') {
    redirect(destination);
  }

  return (
    <AuthCard
      description={t('welcome.description')}
      title={t('welcome.title')}
    >
      <div className="space-y-5">
        <p className="text-sm text-sub">
          <ServerTrans
            components={[<strong className="text-ink" key="identity" />]}
            i18nKey="auth:welcome.signed_in_as"
            t={t}
            values={{
              identity:
                account.user.username ??
                account.user.email ??
                account.user.displayName ??
                t('common:fallback.user'),
            }}
          />
        </p>
        {account.user.username ? null : <UsernameClaim />}
        <p className="rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          {t('welcome.no_academy')}
        </p>
        <SignOutControl />
      </div>
    </AuthCard>
  );
}
