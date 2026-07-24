'use client';

import type { AuthMeResponse } from '@cove/shared';

import { useLayoutTranslation } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';

import { SignOutControl } from '../../_components/sign-out-control';
import { usePendingApproval } from '../_hooks/use-pending-approval';
import { PendingActions } from './pending-actions';
import { PendingStatusCard } from './pending-status-card';

export function PendingApproval({
  initialAccount,
}: {
  initialAccount: AuthMeResponse;
}) {
  const { t } = useLayoutTranslation('auth');
  const errorText = useErrorText();
  const manager = usePendingApproval(initialAccount);

  if (manager.loading) {
    return <p className="text-sm text-sub">{t('pending.checking')}</p>;
  }
  if (manager.loadError) {
    return (
      <div className="space-y-5">
        <p className="text-sm text-danger">
          {errorText(manager.loadError, t('pending.load_failed'))}
        </p>
        <SignOutControl />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PendingStatusCard manager={manager} />
      <PendingActions manager={manager} />
    </div>
  );
}
