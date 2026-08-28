import { requireAcademyRoute } from '@/lib/academy-route';
import type { TeacherSubmissionReview } from '@cove/shared';
import { notFound } from 'next/navigation';

import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { createServerORPCClient } from '@/lib/orpc-server';

import { BackLink } from '@/components/studio/back-link';
import { StudioPage } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/studio-page';
import { safeReturnTo } from '../../../../progress/_lib/progress-url';
import { SubmissionReview } from './_components/submission-review';

/**
 * One attempt, reviewed.
 *
 * A dedicated route rather than a modal: reading somebody's code beside its
 * result is the task, not a glance, and a full page is what makes the code
 * legible, deep-linkable, and printable by the browser without the feature
 * adding anything.
 *
 * The whole read is server-side and authorized before anything renders. A
 * forbidden, deleted, or out-of-class attempt is a not-found — the same answer
 * for all three, so the route cannot be used to discover what exists.
 */
export default async function SubmissionReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{
    academySlug: string;
    classId: string;
    membershipId: string;
    submissionId: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { academySlug, classId, membershipId, submissionId } = await params;
  const { academyId } = await requireAcademyRoute(academySlug);
  const raw = (await searchParams).returnTo;
  const { t } = await getServerTranslation(['teach']);

  let review: TeacherSubmissionReview | null = null;
  try {
    review = await createServerORPCClient().teacherProgress.getSubmissionReview({
      academyId,
      classId,
      membershipId,
      submissionId,
    });
  } catch {
    notFound();
  }
  if (!review) notFound();

  // Only this class's own Solution status path survives; anything else falls
  // back to the class's student-detail state.
  const backHref = safeReturnTo(
    academySlug,
    classId,
    typeof raw === 'string' ? raw : undefined,
  );
  const returnHref = backHref.includes('?')
    ? backHref
    : `${backHref}?student=${membershipId}`;

  return (
    <StudioPage
      // The same slot every other detail page uses. It was a link inside the
      // review, which put it below the heading and gave this one page a
      // different shape from the rest. `safeReturnTo` still decides where it
      // goes: a reviewer who arrived from a filtered table returns to that
      // table, filter intact, rather than to a bare default.
      back={<BackLink href={returnHref} label={t('progress.review.back')} />}
      bleed
      showPageHeading={false}
      title={t('progress.review.title')}
    >
      <SubmissionReview review={review} />
    </StudioPage>
  );
}
