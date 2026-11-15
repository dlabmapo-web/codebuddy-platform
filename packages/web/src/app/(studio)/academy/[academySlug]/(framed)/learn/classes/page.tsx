import { requireAcademyRoute } from '@/lib/academy-route';
import { toApiError } from '@/lib/api-errors';
import { logoutAction } from '@/app/(auth)/actions';

import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { createServerORPCClient } from '@/lib/orpc-server';

import { StudioPage } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/studio-page';
import { ClassList } from './_components/class-list';
import { ContinueLearning } from './_components/continue-learning';

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
  const { t } = await getServerTranslation(['learn', 'errors', 'auth']);
  const client = createServerORPCClient();
  const [classRead, draftRead] = await Promise.allSettled([
    client.learn.listClasses({ academyId }), client.learn.listDrafts({ academyId }),
  ]);
  const classes = classRead.status === 'fulfilled' ? classRead.value.classes : null;
  const drafts = draftRead.status === 'fulfilled' ? draftRead.value.drafts : null;
  const sessionEnded = [classRead, draftRead].some(read => read.status === 'rejected' &&
    ['STUDENT_SESSION_EXPIRED', 'STUDENT_SESSION_UNAVAILABLE'].includes(toApiError(read.reason).code ?? ''));

  return (
    <StudioPage
      bleed
      description={t('classes.description')}
      title={t('classes.title')}
    >
      {sessionEnded ? <div className="rounded-card border border-border bg-card p-5">
        <p className="text-sm text-sub">{t('errors:STUDENT_SESSION_EXPIRED')}</p>
        <form action={logoutAction}><button type="submit" className="mt-3 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-on-brand">{t('auth:login.submit')}</button></form>
      </div> : <div className="flex flex-col gap-6">
      <ContinueLearning academyId={academyId} initialDrafts={drafts} serverReadToken={crypto.randomUUID()} />
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
      </div>}
    </StudioPage>
  );
}
