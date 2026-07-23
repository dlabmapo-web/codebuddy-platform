import { StudioShell } from '../_components/studio-shell';
import { InvitationsManager } from './_components/invitations-manager';

export default async function InvitationsPage({
  params,
}: {
  params: Promise<{ academyId: string }>;
}) {
  const { academyId } = await params;
  return (
    <StudioShell academyId={academyId} title="Academy invitations">
      <InvitationsManager academyId={academyId} />
    </StudioShell>
  );
}
