import { useLayoutTranslation } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';
import { RoleSelector } from '../../_components/role-selector';

import type { InvitationsManagerState } from '../_hooks/use-invitations-manager';

export function InvitationForm({
  manager,
}: {
  manager: InvitationsManagerState;
}) {
  const { t } = useLayoutTranslation(['invitations', 'common']);
  const errorText = useErrorText();

  return (
    <>
      <form
        className="grid gap-3 sm:grid-cols-[1fr_180px_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          manager.create();
        }}
      >
        <input
          className="h-11 rounded-lg border border-border px-3 text-sm"
          onChange={(event) => manager.setEmail(event.target.value)}
          placeholder={t('email_placeholder')}
          required
          type="email"
          value={manager.email}
        />
        <RoleSelector onChange={manager.setRole} value={manager.role} />
        <button
          className="h-11 rounded-lg bg-brand px-4 text-sm font-bold text-white disabled:opacity-50"
          disabled={manager.createPending}
          type="submit"
        >
          {t('create')}
        </button>
      </form>
      {manager.invitationLink ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm font-bold text-blue-900">{t('link_notice')}</p>
          <div className="mt-2 flex gap-2">
            <input
              className="min-w-0 flex-1 rounded-lg border border-blue-200 bg-white px-3 text-xs"
              readOnly
              value={manager.invitationLink}
            />
            <button
              className="rounded-lg bg-blue-700 px-4 text-sm font-bold text-white"
              onClick={() => void manager.copyInvitationLink()}
              type="button"
            >
              {t('common:action.copy')}
            </button>
          </div>
        </div>
      ) : null}
      {manager.createError ? (
        <p className="text-sm text-danger">
          {errorText(manager.createError, t('create_failed'))}
        </p>
      ) : null}
    </>
  );
}
