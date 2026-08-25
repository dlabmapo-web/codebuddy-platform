import { requireAcademyRoute } from '@/lib/academy-route';
import type { MonitoringClassRoster } from '@cove/shared';
import { notFound } from 'next/navigation';

import { createServerORPCClient } from '@/lib/orpc-server';

import { StudioShell } from '../../../_components/studio-shell';
import { LiveRoster } from './_components/live-roster';

/**
 * One assigned class, live.
 *
 * Denial and absence are the same answer here: a teacher who is not assigned
 * to this class must not be able to tell it apart from a class that does not
 * exist, so both land on the not-found page.
 */
export default async function LiveClassPage({
  params,
}: {
  params: Promise<{ academySlug: string; classId: string }>;
}) {
  const { academySlug, classId } = await params;
  const { academyId } = await requireAcademyRoute(academySlug);
  let roster: MonitoringClassRoster | null = null;
  try {
    roster = await createServerORPCClient().monitoring.getClassRoster({
      academyId,
      classId,
    });
  } catch {
    notFound();
  }
  if (!roster) notFound();

  return (
    <StudioShell
      academyId={academyId}
      bleed
      description={roster.class.description || undefined}
      title={roster.class.name}
    >
      <LiveRoster academyId={academyId} initialRoster={roster} />
    </StudioShell>
  );
}
