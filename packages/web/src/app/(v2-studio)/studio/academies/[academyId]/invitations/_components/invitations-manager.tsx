'use client';

import { Plus } from 'lucide-react';

import { Button } from '@/components/studio/button';
import { useLayoutTranslation } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';

import { useInvitationsManager } from '../_hooks/use-invitations-manager';
import { InvitationModal } from './invitation-modal';
import { InvitationsTable } from './invitations-table';

export function InvitationsManager({ academyId }: { academyId: string }) {
  const { t } = useLayoutTranslation('invitations');
  const errorText = useErrorText();
  const manager = useInvitationsManager(academyId);

  if (manager.loading) {
    return <p className="text-[14px] text-sub">{t('loading')}</p>;
  }

  return (
    <div className="space-y-4">
      {manager.loadError ? (
        <p className="text-[14px] font-semibold text-danger">
          {errorText(manager.loadError, t('load_failed'))}
        </p>
      ) : null}

      <InvitationModal manager={manager} />

      <InvitationsTable
        manager={manager}
        toolbarActions={
          <Button onClick={manager.openForm}>
            <Plus />
            {t('create')}
          </Button>
        }
      />

      {manager.revokeError ? (
        <p className="text-[14px] font-semibold text-danger">
          {errorText(manager.revokeError, t('revoke_failed'))}
        </p>
      ) : null}
    </div>
  );
}
