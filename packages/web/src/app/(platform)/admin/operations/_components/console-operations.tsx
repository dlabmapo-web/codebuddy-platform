'use client';

import type { OperationRun } from '@cove/shared';
import * as React from 'react';

import { OperationsWorkspace } from '@/components/studio/operations/operations-workspace';

import type { ConsoleAcademyOption } from '../../_components/academy-field';
import { AcademyField } from '../../_components/academy-field';

/**
 * The console's half of the maintenance page: choosing whose academy this is.
 *
 * Everything else is `OperationsWorkspace`, shared with the studio. The only
 * thing an operator has that a Manager does not is the question "which
 * academy", and `AcademyField` is the console's own answer to it — drawn as a
 * form control rather than a filter chip, because it decides where an action
 * lands rather than narrowing a list.
 */
export function ConsoleOperations({
  academies,
  initialRuns,
}: {
  academies: ConsoleAcademyOption[];
  initialRuns: OperationRun[] | null;
}) {
  const [academyId, setAcademyId] = React.useState<string | null>(
    academies.length === 1 ? academies[0].id : null,
  );
  const academy = academies.find((option) => option.id === academyId) ?? null;

  return (
    <OperationsWorkspace
      academyId={academyId}
      // Remounts when the operator picks a different academy: see the note on
      // `OperationsWorkspace`.
      key={academyId ?? 'none'}
      initialRuns={initialRuns}
      // The platform's whole history, whichever academy is selected above: the
      // board is scoped, the record of what operators did is not.
      scopeRunsToAcademy={false}
      selector={
        <AcademyField
          academies={academies}
          onChange={setAcademyId}
          selected={academy}
        />
      }
    />
  );
}
