import type { PlatformPointPolicyBoard } from '@cove/shared';

import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { createPlatformServerORPCClient } from '@/lib/orpc-server';

import { PlatformShell } from '../../_components/platform-shell';
import { PointPolicyBoard } from './_components/point-policy-board';

/**
 * What every academy pays, read one against another.
 *
 * A comparison, and read-only on purpose — which is the difference between
 * this board and the feature one next door. A feature is a switch: two states,
 * no relationship to its neighbours, and flipping it in a cell is the whole
 * act. A point policy is nineteen numbers that constrain each other — a hard
 * problem may not pay less than an easy one, the learning-time rungs are a
 * ladder — so an editable cell here could save a policy the schema refuses,
 * one field at a time, with the reason living in a different column.
 *
 * So the board answers "who pays what, and which of them is the odd one out",
 * and hands editing to the academy's own policy page, where the whole form is
 * validated together.
 */
export default async function PlatformPointPoliciesPage() {
  const { t } = await getServerTranslation(['platform-settings']);

  let board: PlatformPointPolicyBoard | null = null;
  try {
    board = await createPlatformServerORPCClient().platformSettings.pointPolicies(
      {},
    );
  } catch {
    // The client owns the retry and can say what happened.
  }

  return (
    <PlatformShell
      bleed
      description={t('board.points_description')}
      title={t('board.points_title')}
    >
      <PointPolicyBoard initialBoard={board} />
    </PlatformShell>
  );
}
