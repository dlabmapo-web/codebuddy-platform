import { requireAcademyRoute } from '@/lib/academy-route';
import type { LearnClassDetail } from '@cove/shared';
import { notFound } from 'next/navigation';

import { toApiError } from '@/lib/api-errors';
import { createServerORPCClient } from '@/lib/orpc-server';

import { StudioPage } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/studio-page';
import { ClassDetail } from './_components/class-detail';

export default async function LearnClassPage({
  params,
}: {
  params: Promise<{ academySlug: string; classId: string }>;
}) {
  const { academySlug, classId } = await params;
  const { academyId } = await requireAcademyRoute(academySlug);
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

  return (
    <StudioPage
      bleed
      description={detail.description || undefined}
      title={detail.name}
    >
      <ClassDetail academyId={academyId} detail={detail} />
    </StudioPage>
  );
}
