'use client';

import type { OperationRun } from '@cove/shared';

import { OperationsWorkspace } from '@/components/studio/operations/operations-workspace';

/**
 * The academy's half of the maintenance page: there is no half.
 *
 * No selector, because the academy is already decided by the route, and the
 * run history is scoped to it — "every run on Cove" is an operator's question
 * and the server refuses it from an academy role.
 */
export function AcademyMaintenance({
  academyId,
  initialRuns,
}: {
  academyId: string;
  initialRuns: OperationRun[] | null;
}) {
  return (
    <OperationsWorkspace
      academyId={academyId}
      initialRuns={initialRuns}
      scopeRunsToAcademy
    />
  );
}
