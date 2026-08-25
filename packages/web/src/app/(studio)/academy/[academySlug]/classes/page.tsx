import { requireAcademyRoute } from '@/lib/academy-route';
import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { isAccessDeniedError } from '@/lib/api-errors';
import { createServerORPCClient } from '@/lib/orpc-server';

import { StudioShell } from '../_components/studio-shell';
import { ClassesManager } from './_components/classes-manager';

/**
 * Reaching this list at all means `classes.manage`, so the page has no further
 * role branching. The failure branch does have to tell two cases apart: a
 * genuine permission answer, and the server not answering — reporting a schema
 * or connection fault as "you do not have permission" sends a Manager to ask
 * for a role they already hold.
 */
export default async function ClassesPage({
  params,
}: {
  params: Promise<{ academySlug: string }>;
}) {
  const { academySlug } = await params;
  const { academyId } = await requireAcademyRoute(academySlug);
  const { t } = await getServerTranslation(['classes']);
  let classes = null;
  let denied = false;

  try {
    const result = await createServerORPCClient().academyClasses.list({
      academyId,
    });
    classes = result.classes;
  } catch (error) {
    denied = isAccessDeniedError(error);
  }

  return (
    <StudioShell
      academyId={academyId}
      bleed
      description={t('description')}
      title={t('title')}
    >
      {classes ? (
        <ClassesManager academyId={academyId} initialClasses={classes} />
      ) : (
        <div className="rounded-card border border-danger/25 bg-danger/5 p-5">
          <h2 className="text-[15px] font-bold text-danger">
            {denied ? t('forbidden_title') : t('unavailable_title')}
          </h2>
          <p className="mt-1.5 text-[14px] leading-6 text-sub">
            {denied ? t('forbidden_body') : t('unavailable_body')}
          </p>
        </div>
      )}
    </StudioShell>
  );
}
