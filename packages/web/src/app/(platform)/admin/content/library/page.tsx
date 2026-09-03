import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { isAccessDeniedError } from '@/lib/api-errors';
import { createPlatformServerORPCClient } from '@/lib/orpc-server';

import { PlatformShell } from '../../_components/platform-shell';
import { LibraryTable, type LibraryPage } from './_components/library-table';

/**
 * The master curriculum every academy teaches from.
 *
 * The console's other content pages answer *"what is this academy running"* —
 * a support question, asked about somebody else's academy. This one answers
 * what head office publishes, which is the platform's own work and the reason
 * an operator opens the console on an ordinary morning.
 *
 * It is its own page rather than a third lens on the cross-academy browser.
 * That machinery describes two lists sharing one input schema and one table; a
 * master course has no academy column and different row actions, so it shares
 * neither, and the abstraction would be a coincidence.
 */
export default async function PlatformLibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { t } = await getServerTranslation(['platform', 'platform-library']);
  const params = await searchParams;
  const search = typeof params.search === 'string' ? params.search : undefined;

  let initialData: LibraryPage | null = null;
  let academyId: string | null = null;
  let denied = false;
  try {
    const client = createPlatformServerORPCClient();
    // Publishing a master is `academyCourses.setVisibility`, which is scoped
    // to an academy — so the table needs the library's id. Null only while no
    // library exists, which is also when the list is empty and there is
    // nothing to publish.
    [initialData, { academyId }] = await Promise.all([
      client.platformLibrary.courses({ page: 1, ...(search ? { search } : {}) }),
      client.platformLibrary.academy({}),
    ]);
  } catch (error) {
    // The two stay apart on every console list: reporting a connection fault
    // as "you do not have permission" sends an operator hunting for a role
    // they already hold.
    denied = isAccessDeniedError(error);
  }

  return (
    <PlatformShell
      bleed
      description={t('platform-library:subtitle')}
      // `courses` for the authoring-path preview the create dialog shares with
      // a Team Lead's own; `destructive` because deleting a master asks the
      // same confirmation, in the namespace that copy already lives in.
      namespaces={['courses', 'destructive']}
      title={t('platform-library:title')}
    >
      {initialData ? (
        <LibraryTable
          academyId={academyId}
          initialData={initialData}
          initialSearch={search ?? ''}
        />
      ) : (
        <div className="rounded-card border border-danger/25 bg-danger/5 p-5">
          <h2 className="text-[15px] font-bold text-danger">
            {denied
              ? t('unavailable.forbidden_title')
              : t('platform-library:unavailable.title')}
          </h2>
          <p className="mt-1.5 text-[14px] leading-6 text-sub">
            {denied
              ? t('unavailable.forbidden_body')
              : t('platform-library:unavailable.body')}
          </p>
        </div>
      )}
    </PlatformShell>
  );
}
