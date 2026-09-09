import { requirePlatformAcademyRoute } from '@/lib/academy-route';
import { notFound } from 'next/navigation';

import { getServerTranslation } from '@/i18n/server/get-server-translation';
import {
  createPlatformServerORPCClient,
  createServerORPCClient,
} from '@/lib/orpc-server';

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
  const [courses, classes, pointsEnabled] = await Promise.all([
    client.platformContent
      .courses({ academyIds: [academyId], pageSize: 6 })
      .catch(() => null),
    client.platformContent
      .classes({ academyIds: [academyId], pageSize: 6 })
      .catch(() => null),
    academyPointsEnabled(academyId),
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
        pointsEnabled={pointsEnabled}
      />
    </PlatformShell>
  );
}

/**
 * Whether this academy runs the point economy — true, false, or null when it
 * could not be asked.
 *
 * Three answers rather than two, because the console has three things to say.
 * An academy with points off is a fact an operator came here to learn, and
 * collapsing it into the failure case would have the page assert a
 * configuration it never read.
 *
 * Read through the console's own client, which ignores the role cookie: the
 * answer must not change because the operator took a diagnostic trip as a
 * Teacher earlier in the day.
 */
async function academyPointsEnabled(
  academyId: string,
): Promise<boolean | null> {
  try {
    const { features } = await createPlatformServerORPCClient()
      .academyFeatures.list({ academyId });
    return features.some(
      (feature) => feature.feature === 'STUDENT_POINTS' && feature.isEnabled,
    );
  } catch {
    return null;
  }
}
