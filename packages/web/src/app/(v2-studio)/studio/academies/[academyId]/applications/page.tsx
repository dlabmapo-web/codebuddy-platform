import { StudioShell } from '../_components/studio-shell';
import { ApplicationsManager } from './_components/applications-manager';

export default async function ApplicationsPage({
  params,
}: {
  params: Promise<{ academyId: string }>;
}) {
  const { academyId } = await params;
  return (
    <StudioShell academyId={academyId} title="Membership applications">
      <ApplicationsManager academyId={academyId} />
    </StudioShell>
  );
}
