'use client';

import { useInvitationsManager } from '../_hooks/use-invitations-manager';
import { InvitationForm } from './invitation-form';
import { InvitationsList } from './invitations-list';

export function InvitationsManager({ academyId }: { academyId: string }) {
  const manager = useInvitationsManager(academyId);

  return (
    <div className="space-y-7">
      <InvitationForm manager={manager} />
      <InvitationsList manager={manager} />
    </div>
  );
}
