import { requireAcademyRoute } from '@/lib/academy-route';
import type { LearnClassDetail } from '@cove/shared';
import { notFound } from 'next/navigation';

import { toApiError } from '@/lib/api-errors';
import { createServerORPCClient } from '@/lib/orpc-server';

import { BackLink } from '@/components/studio/back-link';
import { StudioPage } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/studio-page';
import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { routes } from '@/lib/routes';

import { ClassDetail } from './_components/class-detail';
import { splitSchedule } from '../_lib/class-schedule';

export default async function LearnClassPage({
  params,
}: {
  params: Promise<{ academySlug: string; classId: string }>;
}) {
  const { academySlug, classId } = await params;
  const { academyId } = await requireAcademyRoute(academySlug);
  const { t } = await getServerTranslation(['learn']);
  let detail: LearnClassDetail | null = null;
  try {
    detail = await createServerORPCClient().learn.getClass({
      academyId,
      classId,
    });
  } catch (error) {
    // An archived class, one in another academy, one this student was removed
    // from, and one that never existed are indistinguishable here — and should
    // be, or a direct URL becomes a way to find out which classes exist.
    if (toApiError(error).code === 'CLASS_NOT_FOUND') notFound();

    // Connection loss, schema drift, and other server faults are not missing
    // classes. Let them reach the nearest error boundary instead of turning a
    // temporary failure into a false 404.
    throw error;
  }
  if (!detail) notFound();

  // The heading shows the description without its schedule prefix, which the
  // strip below renders as a chip. Printing both would say the time twice.
  const { description } = splitSchedule(detail.description);

  return (
    <StudioPage
      back={
        <BackLink
          href={`${routes.academy(academySlug)}/learn/classes`}
          label={t('classes.back')}
        />
      }
      bleed
      description={description || undefined}
      title={detail.name}
    >
      <ClassDetail academyId={academyId} detail={detail} />
    </StudioPage>
  );
}
