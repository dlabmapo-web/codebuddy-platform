import { formatTime } from '@cove/i18n/format';
import Link from 'next/link';

import { useLayoutTranslation, useLocale } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';

import { SignOutControl } from '../../_components/sign-out-control';
import type { PendingApprovalState } from '../_hooks/use-pending-approval';

export function PendingActions({
  manager,
}: {
  manager: PendingApprovalState;
}) {
  const { t } = useLayoutTranslation('auth');
  const errorText = useErrorText();
  const locale = useLocale();

  return (
    <>
      {manager.state.kind === 'active' ? (
        <Link
          className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-brand px-5 font-bold text-white hover:bg-brand-deep"
          href={`/studio/academies/${manager.state.membership.academy.id}`}
        >
          {t('pending.enter_academy')}
        </Link>
      ) : null}
      <button
        className="h-12 w-full rounded-xl bg-brand font-bold text-white hover:bg-brand-deep disabled:opacity-60"
        disabled={manager.checking}
        onClick={() => void manager.checkStatus()}
        type="button"
      >
        {manager.checking
          ? t('pending.checking_status')
          : t('pending.check_status')}
      </button>
      {manager.view.canCancel ? (
        <button
          className="h-11 w-full rounded-xl border border-border font-semibold text-sub hover:text-ink disabled:opacity-60"
          disabled={manager.requestPending}
          onClick={manager.cancel}
          type="button"
        >
          {t('pending.cancel_application')}
        </button>
      ) : manager.view.canReapply ? (
        <button
          className="h-11 w-full rounded-xl border border-brand font-semibold text-brand disabled:opacity-60"
          disabled={manager.requestPending}
          onClick={manager.reapply}
          type="button"
        >
          {t('pending.apply_again')}
        </button>
      ) : null}
      {manager.requestError ? (
        <p className="text-sm text-danger">
          {errorText(manager.requestError, t('pending.update_failed'))}
        </p>
      ) : null}
      {manager.lastCheckedAt ? (
        <p className="text-center text-xs text-sub">
          {t('pending.checked_at', {
            time: formatTime(manager.lastCheckedAt, locale),
          })}
        </p>
      ) : (
        <p className="text-center text-xs text-sub">
          {t('pending.no_auto_refresh')}
        </p>
      )}
      <SignOutControl className="w-full text-sm font-semibold text-sub hover:text-ink" />
    </>
  );
}
