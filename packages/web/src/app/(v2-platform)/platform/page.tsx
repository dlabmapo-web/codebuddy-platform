import type { PlatformAcademySummary } from '@cove/shared';

import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { isAccessDeniedError } from '@/lib/api-errors';
import { createServerORPCClient } from '@/lib/orpc-server';

import { AcademyRollCall } from './_components/academy-roll-call';
import { AcademyTable } from './_components/academy-table';
import { NewAcademyLink } from './_components/new-academy-link';
import { PlatformShell } from './_components/platform-shell';
import { inRollCall } from './_lib/platform-view';

/**
 * The roll call.
 *
 * One read, split two ways on the server: the academies that want a decision go
 * into the attention panel, and every academy — those included — goes into the
 * table. An operator who sees an empty panel is finished and never has to read
 * the table.
 *
 * The failure branch tells two cases apart, as the classes page does: a genuine
 * permission answer and the server not answering. Reporting a connection fault
 * as "you do not have permission" sends an operator looking for a role they
 * already hold.
 */
export default async function PlatformPage() {
  const { t } = await getServerTranslation(['platform']);

  let academies: PlatformAcademySummary[] | null = null;
  let denied = false;
  try {
    const result = await createServerORPCClient().platformAcademies.list({});
    academies = result.academies;
  } catch (error) {
    denied = isAccessDeniedError(error);
  }

  return (
    <PlatformShell
      actions={<NewAcademyLink label={t('create.cta')} />}
      bleed
      description={t('shell.subtitle')}
      title={t('shell.title')}
    >
      {academies ? (
        <div className="grid gap-6">
          <AcademyRollCall academies={academies.filter(inRollCall)} />
          <AcademyTable academies={academies} />
        </div>
      ) : (
        <div className="rounded-card border border-danger/25 bg-danger/5 p-5">
          <h2 className="text-[15px] font-bold text-danger">
            {denied ? t('unavailable.forbidden_title') : t('unavailable.title')}
          </h2>
          <p className="mt-1.5 text-[14px] leading-6 text-sub">
            {denied ? t('unavailable.forbidden_body') : t('unavailable.body')}
          </p>
        </div>
      )}
    </PlatformShell>
  );
}
