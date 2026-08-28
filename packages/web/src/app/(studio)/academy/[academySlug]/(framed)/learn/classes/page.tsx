import { requireAcademyRoute } from '@/lib/academy-route';
import type { LearnClassSummary } from '@cove/shared';

import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { createServerORPCClient } from '@/lib/orpc-server';

import { StudioPage } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/studio-page';
import { ClassList } from './_components/class-list';

/**
 * My Classes.
 *
 * Three outcomes, kept apart: classes to show, a student who is in none, and a
 * request that did not answer. `null` is the failure and `[]` is the empty
 * result, so a service outage can never render as "you have no classes".
 */
export default async function LearnClassesPage({
  params,
}: {
  params: Promise<{ academySlug: string }>;
}) {
  const { academySlug } = await params;
  const { academyId } = await requireAcademyRoute(academySlug);
  const { t } = await getServerTranslation(['learn']);

  let classes: LearnClassSummary[] | null = null;
  try {
    const result = await createServerORPCClient().learn.listClasses({
      academyId,
    });
    classes = result.classes;
  } catch {
    // The unavailable state renders below.
  }

  return (
    <StudioPage
      bleed
      description={t('classes.description')}
      title={t('classes.title')}
    >
      {classes ? (
        <ClassList classes={classes} />
      ) : (
        <div className="rounded-card border border-danger/25 bg-danger/5 p-5">
          <h2 className="text-[15px] font-bold text-danger">
            {t('classes.unavailable_title')}
          </h2>
          <p className="mt-1.5 text-[14px] leading-6 text-sub">
            {t('classes.unavailable_body')}
          </p>
        </div>
      )}
    </StudioPage>
  );
}
