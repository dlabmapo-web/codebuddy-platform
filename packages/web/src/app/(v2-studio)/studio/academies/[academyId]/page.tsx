import { AcademyOverview } from './_components/academy-overview';
import { StudioShell } from './_components/studio-shell';

export default async function AcademyPage({
  params,
}: {
  params: Promise<{ academyId: string }>;
}) {
  const { academyId } = await params;
  return (
    <StudioShell academyId={academyId} title="Academy">
      <AcademyOverview academyId={academyId} />
    </StudioShell>
  );
}
