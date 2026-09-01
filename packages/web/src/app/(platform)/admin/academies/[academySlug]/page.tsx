import { requirePlatformAcademyRoute } from '@/lib/academy-route';
import { notFound } from 'next/navigation';

import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { createServerORPCClient } from '@/lib/orpc-server';

import { BackLink } from '@/components/studio/back-link';
import { backTo } from '@/lib/back-to';

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
  const { t } = await getServerTranslation(['platform']);
  const { academyId } = await requirePlatformAcademyRoute(academySlug);
  const client = createServerORPCClient();
  const academy = await client.platformAcademies
    .get({ academyId })
    .catch(() => null);
  if (!academy) notFound();

  // The first page of each, for the panels. The full lists live in the
  // console's own directories, which these link to once there are more.
  const [courses, classes] = await Promise.all([
    client.platformContent
      .courses({ academyIds: [academyId], pageSize: 6 })
      .catch(() => null),
    client.platformContent
      .classes({ academyIds: [academyId], pageSize: 6 })
      .catch(() => null),
  ]);

  return (
    <PlatformShell
      back={<BackLink href={backTo.platformAcademy()} label={t('shell.back')} />}
      bleed
      description={`/${academy.slug}`}
      title={academy.name}
    >
      <AcademyDetail
        academy={academy}
        classes={classes?.rows ?? []}
        courses={courses?.rows ?? []}
      />
    </PlatformShell>
  );
}
