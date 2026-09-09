import type { PlatformFeatureBoard } from '@cove/shared';

import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { createPlatformServerORPCClient } from '@/lib/orpc-server';

import { PlatformShell } from '../_components/platform-shell';
import { FeatureBoard } from './_components/feature-board';

/**
 * Which academies have what switched on — one grid, every academy.
 *
 * The plural of the academy's own settings page, and a different question
 * because of it. A manager asks *what does my academy have on*, and a list of
 * switches answers them. An operator asks *which academies have points on*,
 * and that is a column, not a page they have to open forty times.
 *
 * Switched here as well as read: a cell is the switch. Sending the operator
 * into an academy to move one of these would make the board a report about a
 * job it cannot do, which is the thing it exists to replace.
 */
export default async function PlatformSettingsPage() {
  const { t } = await getServerTranslation(['platform-settings']);

  let board: PlatformFeatureBoard | null = null;
  try {
    board = await createPlatformServerORPCClient().platformSettings.features({});
  } catch {
    // The client owns the retry and can say what happened.
  }

  return (
    <PlatformShell
      bleed
      description={t('board.features_description')}
      title={t('board.features_title')}
    >
      <FeatureBoard initialBoard={board} />
    </PlatformShell>
  );
}
