import { requirePlatformAcademyRoute } from '@/lib/academy-route';
import { notFound } from 'next/navigation';

import { createServerORPCClient } from '@/lib/orpc-server';

import { PlatformShell } from '../../_components/platform-shell';
import { AcademyDetail } from './_components/academy-detail';

/**
 * One academy, read on the server so the page opens on its facts.
 *
 * A failed read is `notFound()` rather than an error panel: the two ways this
 * read fails are "no such academy" and "you may not see it", and the console
 * should not distinguish them any more than the API does.
 */
export default async function PlatformAcademyPage({
  params,
}: {
  params: Promise<{ academySlug: string }>;
}) {
  const { academySlug } = await params;
  const { academyId } = await requirePlatformAcademyRoute(academySlug);
  const academy = await createServerORPCClient()
    .platformAcademies.get({ academyId })
    .catch(() => null);
  if (!academy) notFound();

  return (
    <PlatformShell bleed description={`/${academy.slug}`} title={academy.name}>
      <AcademyDetail academy={academy} />
    </PlatformShell>
  );
}
