'use client';

import type { OperationRun, RegradePlan, StaleProblemRow } from '@cove/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { DeleteConfirmDialog } from '@/components/studio/delete-confirm-dialog';
import { useErrorText } from '@/i18n/client/use-error-text';
import { orpc } from '@/lib/orpc';

import { RegradeCard } from './regrade-card';
import { RunTable } from './run-table';
import { StaleBoard } from './stale-board';

const runsKey = (academyId: string | null) =>
  ['platform', 'operations', 'runs', academyId ?? 'all'] as const;
const staleKey = (academyId: string) =>
  ['platform', 'operations', 'stale', academyId] as const;

/**
 * How often a live run is re-read.
 *
 * A repair is one submission per affected student at `REGRADE_CONCURRENCY: 1`,
 * so a run advances every few seconds at most. Polling faster would ask the
 * database more often than the answer can change.
 */
const POLL_MS = 3_000;

/**
 * What is broken, the one thing that fixes it, and what has been run.
 *
 * Callers that can change the academy mount this under `key={academyId}`, so
 * choosing a different one remounts rather than reconciling. A problem picked
 * from the old academy's board, and a plan counted against it, are meaningless
 * in the new one — and resetting them in an effect would set state during
 * render, which is a cascade React rightly complains about. The queries are
 * cached by key in the shared client, so the remount costs nothing.
 *
 * One component for two surfaces, because they ask the same question of
 * different scopes. An operator picks an academy and may pick any; a Manager or
 * Team Lead has exactly one and never chooses. That is the whole difference,
 * and it arrives as `selector` — the console passes its `AcademyField`, the
 * studio passes nothing, and everything below is identical.
 *
 * The three panels stay together because they share the chosen academy and
 * because acting in the middle one has to invalidate the other two. Splitting
 * them would mean lifting that state somewhere and threading four callbacks
 * through it to say the same thing.
 */
export function OperationsWorkspace({
  academyId,
  initialRuns,
  scopeRunsToAcademy,
  selector,
}: {
  academyId: string | null;
  initialRuns: OperationRun[] | null;
  /**
   * Whether the run history is this academy's or the whole platform's.
   *
   * The studio must pass `true`: "every run on Cove" is an operator's question,
   * and the server refuses it from an academy role. The console passes `false`
   * so an operator sees the platform's history whichever academy is selected.
   */
  scopeRunsToAcademy: boolean;
  selector?: React.ReactNode;
}) {
  const { t } = useTranslation('platform-operations');
  const errorText = useErrorText();
  const queryClient = useQueryClient();

  const [plan, setPlan] = React.useState<RegradePlan | null>(null);
  const [selected, setSelected] = React.useState<StaleProblemRow | null>(null);
  const [planError, setPlanError] = React.useState<unknown>(null);

  const runsScope = scopeRunsToAcademy ? academyId : null;

  const staleQuery = useQuery({
    queryKey: staleKey(academyId ?? 'none'),
    queryFn: () =>
      orpc.platformOperations.staleProblems({ academyId: academyId! }),
    enabled: academyId !== null,
  });

  const runsQuery = useQuery({
    queryKey: runsKey(runsScope),
    queryFn: () =>
      orpc.platformOperations.runs({
        limit: 20,
        ...(runsScope ? { academyId: runsScope } : {}),
      }),
    enabled: !scopeRunsToAcademy || academyId !== null,
    ...(initialRuns ? { initialData: { runs: initialRuns } } : {}),
    // A run in flight is the only reason this page changes on its own. Polling
    // stops the moment nothing is running, so an idle console is idle.
    refetchInterval: (query) =>
      (query.state.data?.runs ?? []).some(
        (run) => run.status === 'RUNNING' || run.status === 'PLANNING',
      )
        ? POLL_MS
        : false,
  });

  const planMutation = useMutation({
    mutationFn: (input: { academyId: string; materialId: string }) =>
      orpc.platformOperations.planRegrade(input),
    onSuccess: (result) => {
      setPlanError(null);
      setPlan(result);
    },
    onError: (error) => setPlanError(error),
  });

  const cancelMutation = useMutation({
    mutationFn: (runId: string) =>
      orpc.platformOperations.cancelPlan({ runId }),
    // Whether or not the server released it, the board has to stop showing the
    // problem as claimed — and if the cancel lost a race with a confirm, the
    // refetch is what tells the reader the run is going ahead.
    onSettled: () => {
      if (academyId) {
        void queryClient.invalidateQueries({ queryKey: staleKey(academyId) });
      }
      void queryClient.invalidateQueries({ queryKey: runsKey(runsScope) });
    },
  });

  const startMutation = useMutation({
    mutationFn: (runId: string) =>
      orpc.platformOperations.startRegrade({ runId }),
    onSuccess: () => {
      setPlan(null);
      setSelected(null);
      void queryClient.invalidateQueries({ queryKey: runsKey(runsScope) });
      if (academyId) {
        void queryClient.invalidateQueries({ queryKey: staleKey(academyId) });
      }
    },
  });

  return (
    <div className="grid gap-6">
      {selector ? (
        <section className="rounded-xl border border-border bg-card p-5">
          <p className="mb-1.5 text-[13.5px] font-bold text-ink">
            {t('academy.label')}
          </p>
          <div className="max-w-md">{selector}</div>
        </section>
      ) : null}

      <StaleBoard
        academyChosen={academyId !== null}
        loading={staleQuery.isPending && academyId !== null}
        onSelect={(row) => {
          setSelected(row);
          setPlanError(null);
        }}
        rows={staleQuery.data?.rows ?? []}
        selectedMaterialId={selected?.materialId ?? null}
        truncated={staleQuery.data?.truncated ?? false}
      />

      <RegradeCard
        disabled={academyId === null}
        error={planError ? errorText(planError) : null}
        onPlan={() => {
          if (!academyId || !selected) return;
          planMutation.mutate({ academyId, materialId: selected.materialId });
        }}
        pending={planMutation.isPending}
        selected={selected}
      />

      <RunTable
        runs={runsQuery.data?.runs ?? []}
        showAcademy={!scopeRunsToAcademy}
      />

      <DeleteConfirmDialog
        body={
          plan
            ? t('confirm.body', {
                count: plan.studentCount,
                revision: plan.currentRevision,
              })
            : ''
        }
        cancelLabel={t('confirm.cancel')}
        confirmLabel={t('confirm.submit')}
        confirmValue={plan?.problemTitle ?? ''}
        fieldLabel={t('confirm.type_title')}
        onClose={() => {
          // Hands the problem back rather than leaving it claimed until the
          // abandonment sweep notices. A closed tab still relies on that sweep.
          if (plan) cancelMutation.mutate(plan.runId);
          setPlan(null);
        }}
        onConfirm={async () => {
          if (plan) await startMutation.mutateAsync(plan.runId);
        }}
        open={plan !== null}
        pending={startMutation.isPending}
        title={t('confirm.title', { problem: plan?.problemTitle ?? '' })}
        // Irreversible, and takes nothing away: a re-grade restores marks and
        // can only add to a student's standing. A red button here would ask the
        // reader to brace for damage that is not coming.
        tone="brand"
        workingLabel={t('confirm.starting')}
      />
    </div>
  );
}
