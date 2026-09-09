import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { createPlatformServerORPCClient } from '@/lib/orpc-server';

import { PlatformShell } from '../_components/platform-shell';
import { ConsoleOperations } from './_components/console-operations';

/**
 * Maintenance work an operator dispatches, and the record of what it did.
 *
 * The console's other platform pages answer a question. This one acts, on
 * machinery that already runs in production and until now had no interface but
 * a terminal on the server.
 *
 * The academy list and the run history are read here so the page arrives with
 * something on it; the stale board waits for an academy to be chosen, because
 * "which problems are broken" is not a question that has an answer until it is
 * asked about somebody. Every read is wrapped, per this console's house rule —
 * the client owns the retry and can say what happened.
 */
export default async function PlatformOperationsPage() {
  const { t } = await getServerTranslation(['platform-operations']);
  const client = createPlatformServerORPCClient();

  const [academies, runs] = await Promise.all([
    client.platformAcademies
      .list({ limit: 100, offset: 0 })
      .then((page) =>
        page.academies.map((academy) => ({
          id: academy.id,
          name: academy.name,
          slug: academy.slug,
        })),
      )
      .catch(() => []),
    client.platformOperations.runs({ limit: 20 }).catch(() => null),
  ]);

  return (
    <PlatformShell
      bleed
      description={t('platform-operations:page.description')}
      namespaces={['platform-operations']}
      title={t('platform-operations:page.title')}
    >
      <ConsoleOperations
        academies={academies}
        initialRuns={runs?.runs ?? null}
      />
    </PlatformShell>
  );
}
