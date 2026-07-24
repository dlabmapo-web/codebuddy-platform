import { formatDate } from '@cove/i18n/format';

import { useLayoutTranslation, useLocale } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';

import type { InvitationsManagerState } from '../_hooks/use-invitations-manager';

export function InvitationsList({
  manager,
}: {
  manager: InvitationsManagerState;
}) {
  const { t } = useLayoutTranslation(['invitations', 'common']);
  const errorText = useErrorText();
  const locale = useLocale();

  return (
    <>
      <div className="space-y-3">
        {manager.loading ? (
          <p className="text-sm text-sub">{t('loading')}</p>
        ) : null}
        {manager.loadError ? (
          <p className="text-sm text-danger">
            {errorText(manager.loadError, t('load_failed'))}
          </p>
        ) : null}
        {manager.invitations.map((invitation) => (
          <article
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4"
            key={invitation.id}
          >
            <div>
              <h2 className="font-bold">{invitation.email}</h2>
              <p className="text-sm text-sub">
                {t('meta', {
                  role: t(`common:role.${invitation.role}`),
                  status: t(
                    `common:invitation_status.${invitation.status}`,
                  ),
                  date: formatDate(invitation.expiresAt, locale),
                })}
              </p>
            </div>
            {invitation.status === 'PENDING' ? (
              <button
                className="rounded-lg border border-red-200 px-3 py-2 text-sm font-bold text-red-700"
                disabled={manager.revokePending}
                onClick={() => manager.revoke(invitation.id)}
                type="button"
              >
                {t('revoke')}
              </button>
            ) : null}
          </article>
        ))}
      </div>
      {manager.revokeError ? (
        <p className="text-sm text-danger">
          {errorText(manager.revokeError, t('revoke_failed'))}
        </p>
      ) : null}
    </>
  );
}
