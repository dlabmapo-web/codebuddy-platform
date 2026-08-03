'use client';

import type { LearnExerciseWorkspace } from '@cove/shared';
import * as React from 'react';

import { useLayoutTranslation } from '@/i18n';

import { useDraftAutosave } from '../_hooks/use-draft-autosave';
import { useExerciseNavigation } from '../_hooks/use-exercise-navigation';
import { usePythonRunner } from '../_hooks/use-python-runner';
import { useSubmission } from '../_hooks/use-submission';
import { useSplitPane } from '../_hooks/use-split-pane';
import { resolveSampleVerdict } from '../_lib/sample-run';
import { EditorPane, type OutputTab } from './editor-pane';
import { ProblemStatement } from './problem-statement';
import { WorkspaceHeader } from './workspace-header';

export function Workspace({
  academyId,
  workspace: initialWorkspace,
}: {
  academyId: string;
  workspace: LearnExerciseWorkspace;
}) {
  const { t } = useLayoutTranslation('learn');
  const [activeSample, setActiveSample] = React.useState<number | null>(null);
  const [mobileTab, setMobileTab] = React.useState<'problem' | 'code'>('problem');
  const [outputTab, setOutputTab] = React.useState<OutputTab>('terminal');
  const [lastReadSubmissionId, setLastReadSubmissionId] = React.useState<
    string | null
  >(null);
  const [revealedHints, setRevealedHints] = React.useState(0);

  const runner = usePythonRunner();
  const { workspace, navigating, navigate } = useExerciseNavigation({
    academyId,
    initialWorkspace,
  });

  const { exercise } = workspace;
  const submission = useSubmission({
    academyId,
    materialId: exercise.materialId,
  });
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
  const handleRunSample = React.useCallback(
    async (index: number) => {
      const sample = exercise.sampleTestCases[index];
      if (!sample) return;
      setOutputTab('terminal');
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

  const handleSubmit = React.useCallback(() => {
    // The submitted code is the draft, so it is persisted before grading
    // starts rather than relying on the idle timer having fired.
    draft.flushNow();
    setOutputTab('result');
    setLastReadSubmissionId(null);
    void submission.submit(draft.code);
  }, [draft, submission]);

  const handleOutputTabChange = React.useCallback((tab: OutputTab) => {
    if (outputTab === 'result' && submission.result) {
      setLastReadSubmissionId(submission.result.submissionId);
    }
    setOutputTab(tab);
    if (tab === 'result' && submission.result) {
      setLastReadSubmissionId(submission.result.submissionId);
    }
  }, [outputTab, submission.result]);

  return (
    <div className="flex h-dvh flex-col bg-canvas">
      <WorkspaceHeader
        academyId={academyId}
        navigating={navigating}
        hintsRemaining={Math.max(0, exercise.hints.length - revealedHints)}
        onNavigate={(materialId) => {
          // Pending work is settled here rather than inside the hook: the draft
          // is derived from the workspace the hook owns, so passing a teardown
          // callback into it would be circular.
          draft.flushNow();
          runner.stop();
          runner.clear();
          submission.reset();
          setRevealedHints(0);
          setOutputTab('terminal');
          setLastReadSubmissionId(null);
          void navigate(materialId);
        }}
        onReset={() => {
          if (draft.code === exercise.starterCode) return;
          if (!window.confirm(t('workspace.reset_confirm'))) return;
          draft.resetTo(exercise.starterCode);
        }}
        onRevealHint={() =>
          setRevealedHints((current) =>
            Math.min(exercise.hints.length, current + 1),
          )
        }
        onSubmit={handleSubmit}
        saveState={draft.saveState}
        submitting={submission.submitting}
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
          <ProblemStatement exercise={exercise} revealedHints={revealedHints} />
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
        >
          <EditorPane
            activeSample={activeSample}
            code={draft.code}
            onCodeChange={draft.setCode}
            onRunSample={(index) => void handleRunSample(index)}
            onTabChange={handleOutputTabChange}
            runner={runner}
            sampleTestCases={exercise.sampleTestCases}
            submission={submission}
            tab={outputTab}
            unreadResult={
              outputTab !== 'result' &&
              submission.result !== null &&
              submission.result.submissionId !== lastReadSubmissionId
            }
          />
        </section>
      </div>
    </div>
  );
}
