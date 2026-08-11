'use client';

import { Modal, ModalContent } from '@/components/studio/primitives';
import { useLayoutTranslation } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';

import { RoleSelector } from '../../_components/role-selector';
import type { InvitationsManagerState } from '../_hooks/use-invitations-manager';

export function InvitationModal({
  manager,
}: {
  manager: InvitationsManagerState;
}) {
  const { t } = useLayoutTranslation(['invitations', 'common']);
  const errorText = useErrorText();
  const ready = manager.email.trim().length > 0;

  return (
    <Modal
      onOpenChange={(next) => {
        if (!next) manager.closeForm();
      }}
      open={manager.formOpen}
    >
      <ModalContent description={t('create_body')} title={t('create_heading')}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!ready || manager.createPending) return;
            manager.create();
          }}
        >
          <div className="space-y-4 px-6 py-5">
            <label className="grid gap-1.5">
              <span className="text-[14px] font-bold">
                {t('email_label')}
                <span className="ml-1 text-danger">*</span>
              </span>
              <input
                autoFocus
                className="h-11 w-full rounded-lg border border-border bg-card px-3 text-[15px] outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
                onChange={(event) => manager.setEmail(event.target.value)}
                placeholder={t('email_placeholder')}
                required
                type="email"
                value={manager.email}
              />
            </label>

            <div className="grid gap-1.5">
              <span className="text-[14px] font-bold">{t('role_label')}</span>
              <RoleSelector
                onChange={manager.setRole}
                value={manager.role}
                popoverClassName="w-64"
              />
            </div>

            {/* The link is the deliverable: shown here rather than on the page
                behind the modal, where it would be missed. */}
            {manager.invitationLink ? (
              <div className="rounded-lg border border-brand/25 bg-brand-soft/50 p-4">
                <p className="text-[13.5px] font-bold text-brand-deep">
                  {t('link_notice')}
                </p>
                <div className="mt-2 flex gap-2">
                  <input
                    className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2 font-mono text-[12px]"
                    readOnly
                    value={manager.invitationLink}
                  />
                  <button
                    className="shrink-0 rounded-lg bg-brand px-4 text-[13.5px] font-bold text-on-brand transition-colors hover:bg-brand-deep"
                    onClick={() => void manager.copyInvitationLink()}
                    type="button"
                  >
                    {t('common:action.copy')}
                  </button>
                </div>
              </div>
            ) : null}

            {manager.createError ? (
              <p className="rounded-lg bg-danger/5 px-3.5 py-2.5 text-[14px] font-semibold text-danger">
                {errorText(manager.createError, t('create_failed'))}
              </p>
            ) : null}
          </div>

          <div className="flex justify-end gap-2 border-t border-border bg-canvas px-6 py-4">
            <button
              className="h-11 rounded-lg border border-border bg-card px-4 text-[14.5px] font-bold text-ink transition-colors hover:bg-canvas"
              onClick={manager.closeForm}
              type="button"
            >
              {manager.invitationLink
                ? t('common:action.close')
                : t('common:action.cancel')}
            </button>
            <button
              className="h-11 rounded-lg bg-brand px-5 text-[14.5px] font-bold text-on-brand transition-colors hover:bg-brand-deep disabled:opacity-40"
              disabled={!ready || manager.createPending}
              type="submit"
            >
              {manager.createPending ? t('creating') : t('create')}
            </button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
}
