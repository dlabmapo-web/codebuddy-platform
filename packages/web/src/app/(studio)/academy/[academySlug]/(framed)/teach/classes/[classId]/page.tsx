import { requireAcademyRoute } from '@/lib/academy-route';
import type { MonitoringClassRoster } from '@cove/shared';
import { notFound } from 'next/navigation';

import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { createServerORPCClient } from '@/lib/orpc-server';

import { BackLink } from '@/components/studio/back-link';
import { StudioPage } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/studio-page';
import { backTo } from '@/lib/back-to';
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
  // The back link names its destination with the sidebar's own word for it.
  const { t: tNav } = await getServerTranslation(['nav']);
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
    <StudioPage
      back={
        <BackLink
          href={backTo.academyTeachClass(academySlug)}
          label={tNav('link.solution_status')}
        />
      }
      bleed
      description={roster.class.description || undefined}
      title={roster.class.name}
    >
      <LiveRoster academyId={academyId} initialRoster={roster} />
    </StudioPage>
  );
}
