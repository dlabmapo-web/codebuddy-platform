import { StudioShell } from '../_components/studio-shell';
import { MembersManager } from './_components/members-manager';

export default async function MembersPage({
  params,
}: {
  params: Promise<{ academyId: string }>;
}) {
  const { academyId } = await params;
  return (
    <StudioShell academyId={academyId} title="Academy members">
      <MembersManager academyId={academyId} />
    </StudioShell>
  );
}
