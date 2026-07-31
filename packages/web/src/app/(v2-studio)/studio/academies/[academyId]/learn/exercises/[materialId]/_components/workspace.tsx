'use client';

import type { LearnExerciseWorkspace } from '@cove/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { useLayoutTranslation } from '@/i18n';
import { orpc } from '@/lib/orpc';

import { useDraftAutosave } from '../_hooks/use-draft-autosave';
import { usePythonRunner } from '../_hooks/use-python-runner';
import { useSplitPane } from '../_hooks/use-split-pane';
import { resolveSampleVerdict } from '../_lib/sample-run';
import { CodeEditor } from './code-editor';
import { ProblemStatement } from './problem-statement';
import { RunControls } from './run-controls';
import { TerminalPanel } from './terminal-panel';
import { WorkspaceHeader } from './workspace-header';

function workspaceKey(academyId: string, materialId: string) {
  return ['learn', academyId, 'workspace', materialId];
}

/** Long enough that walking a lecture never refetches a neighbour twice. */
const WORKSPACE_STALE_MS = 60_000;

export function Workspace({
  academyId,
  workspace: initialWorkspace,
}: {
  academyId: string;
  workspace: LearnExerciseWorkspace;
}) {
  const { t } = useLayoutTranslation('learn');
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeSample, setActiveSample] = React.useState<number | null>(null);
  const [navigating, setNavigating] = React.useState(false);
  const [mobileTab, setMobileTab] = React.useState<'problem' | 'code'>('problem');

  /**
   * Previous/Next swaps this in place instead of routing.
   *
   * A `router.push` re-renders the server page and remounts this component,
   * which tears down the Pyodide worker and forces the runtime to reload — the
   * exact cost that made v1 slow in production. Holding the workspace in state
   * keeps the editor and the worker alive across problems.
   */
  const [workspace, setWorkspace] = React.useState(initialWorkspace);
  const [trackedInitial, setTrackedInitial] = React.useState(initialWorkspace);
  if (trackedInitial !== initialWorkspace) {
    // A real navigation happened (deep link, reload, back/forward): adopt the
    // server's payload rather than keeping stale in-memory state.
    setTrackedInitial(initialWorkspace);
    setWorkspace(initialWorkspace);
  }

  const { exercise } = workspace;
  const runner = usePythonRunner();
  const draft = useDraftAutosave({
    academyId,
    materialId: exercise.materialId,
    serverDraft: workspace.draft,
    starterCode: exercise.starterCode,
  });

  // Destructured rather than kept as objects: reading `.containerRef` off a
  // hook result during render is a ref access as far as the React compiler is
  // concerned, and it is right to flag it.
  const {
    size: statementWidth,
    dragging: draggingStatement,
    containerRef: paneContainerRef,
    dividerProps: statementDividerProps,
  } = useSplitPane({ axis: 'horizontal', initial: 46, min: 28, max: 68 });
  const {
    size: terminalHeight,
    dragging: draggingTerminal,
    containerRef: editorPaneRef,
    dividerProps: terminalDividerProps,
  } = useSplitPane({ axis: 'vertical', initial: 220, min: 80, max: 1_200 });

  const handleRun = React.useCallback(() => {
    setActiveSample(null);
    void runner.run(draft.code, {
      banner: [{ text: '$ python solution.py\n', kind: 'meta' }],
    });
  }, [draft.code, runner]);

  const handleRunSample = React.useCallback(
    async (index: number) => {
      const sample = exercise.sampleTestCases[index];
      if (!sample) return;
      setActiveSample(index);

      const outcome = await runner.run(draft.code, {
        stdin: sample.input,
        banner: [
          {
            text: `$ python solution.py · ${t('workspace.sample_n', { number: index + 1 })}\n`,
            kind: 'meta',
          },
        ],
      });
      setActiveSample(null);
      if (!outcome) return;

      const verdict = resolveSampleVerdict({
        stdout: outcome.stdout,
        expectedOutput: sample.expectedOutput,
        stopped: outcome.stopped,
        failed: outcome.failed,
      });

      if (verdict.kind === 'match') {
        runner.appendLine(
          `\n✓ ${t('workspace.sample_match', { number: index + 1 })}\n`,
          'meta',
        );
      } else if (verdict.kind === 'mismatch') {
        runner.appendLine(
          `\n✕ ${t('workspace.sample_mismatch', { number: index + 1 })}\n`,
          'err',
        );
        runner.appendLine(
          `${t('workspace.expected')}\n${verdict.expected || '(empty)'}\n`,
          'info',
        );
      } else if (verdict.reason === 'error') {
        runner.appendLine(`\n${t('workspace.sample_skipped')}\n`, 'info');
      }
    },
    [draft.code, exercise.sampleTestCases, runner, t],
  );

  const handleNavigate = React.useCallback(
    async (materialId: string) => {
      setNavigating(true);
      // The pending draft is flushed before leaving, so the swap cannot race
      // ahead of this problem's last edit.
      draft.flushNow();
      runner.stop();

      try {
        // Resolves from cache when the neighbour was prefetched, so the common
        // case costs no request at all.
        const next = await queryClient.fetchQuery({
          queryKey: workspaceKey(academyId, materialId),
          queryFn: () =>
            orpc.learn.getExerciseWorkspace({ academyId, materialId }),
          staleTime: WORKSPACE_STALE_MS,
        });
        setWorkspace(next);
        runner.clear();
        window.history.pushState(
          null,
          '',
          `/studio/academies/${academyId}/learn/exercises/${materialId}`,
        );
      } catch {
        // A failed swap falls back to a real navigation, which surfaces the
        // error page rather than stranding the student on the old problem.
        router.push(
          `/studio/academies/${academyId}/learn/exercises/${materialId}`,
        );
      } finally {
        setNavigating(false);
        void queryClient.invalidateQueries({
          queryKey: ['learn', academyId, 'drafts'],
        });
      }
    },
    [academyId, draft, queryClient, router, runner],
  );

  React.useEffect(() => {
    // Prefetched into the same cache `handleNavigate` reads, so Next lands with
    // the payload already in hand.
    for (const neighbor of [workspace.neighbors.previous, workspace.neighbors.next]) {
      if (!neighbor) continue;
      void queryClient.prefetchQuery({
        queryKey: workspaceKey(academyId, neighbor.materialId),
        queryFn: () =>
          orpc.learn.getExerciseWorkspace({
            academyId,
            materialId: neighbor.materialId,
          }),
        staleTime: WORKSPACE_STALE_MS,
      });
    }
  }, [academyId, queryClient, workspace.neighbors]);

  React.useEffect(() => {
    // `pushState` above means back/forward no longer re-render the page, so the
    // popped URL has to be reconciled by hand.
    const onPopState = () => {
      const popped = window.location.pathname.split('/').pop();
      if (!popped || popped === workspace.exercise.materialId) return;
      void queryClient
        .fetchQuery({
          queryKey: workspaceKey(academyId, popped),
          queryFn: () =>
            orpc.learn.getExerciseWorkspace({
              academyId,
              materialId: popped,
            }),
          staleTime: WORKSPACE_STALE_MS,
        })
        .then(setWorkspace)
        .catch(() => router.refresh());
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [academyId, queryClient, router, workspace.exercise.materialId]);

  const runControls = (
    <RunControls
      activeSample={activeSample}
      onRun={handleRun}
      onRunSample={(index) => void handleRunSample(index)}
      onStop={runner.stop}
      ready={runner.ready}
      running={runner.running}
      sampleTestCases={exercise.sampleTestCases}
    />
  );

  return (
    <div className="flex h-dvh flex-col bg-canvas">
      <WorkspaceHeader
        academyId={academyId}
        navigating={navigating}
        onNavigate={(id) => void handleNavigate(id)}
        saveState={draft.saveState}
        workspace={workspace}
      />

      {/* Below `md` the panes stack behind tabs: a split pane on a phone gives
          neither side enough room to be usable. */}
      <div className="flex shrink-0 gap-1 border-b border-border bg-white px-3 py-1.5 md:hidden">
        {(['problem', 'code'] as const).map((tab) => (
          <button
            className={`rounded-md px-3 py-1 text-[12.5px] font-semibold transition-colors ${
              mobileTab === tab
                ? 'bg-brand-soft text-brand'
                : 'text-sub hover:text-ink'
            }`}
            key={tab}
            onClick={() => setMobileTab(tab)}
            type="button"
          >
            {t(`workspace.tab_${tab}`)}
          </button>
        ))}
      </div>

      <div
        className="flex min-h-0 flex-1"
        ref={paneContainerRef}
        // Scoped to this container rather than an inline width, so the drag
        // size applies only from `md:` up and the mobile tab layout is free to
        // ignore it.
        style={{ '--statement-width': `${statementWidth}%` } as React.CSSProperties}
      >
        <section
          className={`min-w-0 overflow-y-auto bg-white md:block md:w-[var(--statement-width)] md:flex-none ${
            mobileTab === 'problem' ? 'flex-1' : 'hidden'
          }`}
        >
          <ProblemStatement exercise={exercise} />
        </section>

        <div
          aria-hidden
          className={`hidden w-1 shrink-0 cursor-col-resize bg-border transition-colors hover:bg-brand/40 md:block ${
            draggingStatement ? 'bg-brand/60' : ''
          }`}
          {...statementDividerProps}
        />

        <section
          className={`min-w-0 flex-1 flex-col ${
            mobileTab === 'code' ? 'flex' : 'hidden'
          } md:flex`}
          // The terminal's height is measured from this pane's bottom edge, so
          // the drag needs its box. Without the ref the divider silently does
          // nothing.
          ref={editorPaneRef}
        >
          <CodeEditor code={draft.code} onChange={draft.setCode} />

          <div
            aria-label={t('workspace.resize_terminal')}
            className={`h-1.5 shrink-0 cursor-row-resize bg-border transition-colors hover:bg-brand/40 ${
              draggingTerminal ? 'bg-brand/60' : ''
            }`}
            role="separator"
            {...terminalDividerProps}
          />

          <div className="shrink-0" style={{ height: terminalHeight }}>
            <TerminalPanel
              actions={runControls}
              awaitingInput={runner.awaitingInput}
              lines={runner.lines}
              onSubmitInput={runner.submitInput}
              supported={runner.supported}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
