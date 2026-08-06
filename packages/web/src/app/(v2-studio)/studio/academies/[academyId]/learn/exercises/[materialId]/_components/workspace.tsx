'use client';

import type { LearnExerciseWorkspace } from '@cove/shared';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useLayoutTranslation } from '@/i18n';
import { RemotePointer } from '@/components/monitoring/remote-pointer';
import { ProblemStatement } from '@/components/workspace/problem-statement';
import { surfaceProps } from '@/lib/monitoring/awareness/surfaces';
import { useStudentMonitoring } from '@/lib/monitoring/use-student-monitoring';
import { usePythonRunner } from '@/lib/workspace/use-python-runner';
import { useSampleRunner } from '@/lib/workspace/use-sample-runner';
import { useSplitPane } from '@/lib/workspace/use-split-pane';

import { useDraftAutosave } from '../_hooks/use-draft-autosave';
import { useExerciseNavigation } from '../_hooks/use-exercise-navigation';
import { useSubmission } from '../_hooks/use-submission';
import { EditorPane, type OutputTab } from './editor-pane';
import { MonitoringIndicator } from './monitoring-indicator';
import { WorkspaceHeader } from './workspace-header';

export function Workspace({
  academyId,
  workspace: initialWorkspace,
}: {
  academyId: string;
  workspace: LearnExerciseWorkspace;
}) {
  const { t } = useLayoutTranslation('learn');
  // The monitoring copy is mounted by this page for the indicator; the peer
  // labels come from the same namespace.
  const { t: tm } = useTranslation('monitoring');
  const [activeSample, setActiveSample] = React.useState<number | null>(null);
  const [mobileTab, setMobileTab] = React.useState<'problem' | 'code'>('problem');
  const [outputTab, setOutputTab] = React.useState<OutputTab>('terminal');
  const [lastReadSubmissionId, setLastReadSubmissionId] = React.useState<
    string | null
  >(null);
  const [revealedHints, setRevealedHints] = React.useState(0);

  const runner = usePythonRunner();
  const runSample = useSampleRunner(runner);
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

  // The student's own half of monitoring: signals out, a generic indicator
  // back. It publishes nothing the student cannot already see, and learns
  // nothing about who is watching.
  const monitoring = useStudentMonitoring({
    academyId,
    courseId: workspace.breadcrumb.course.id,
    materialId: exercise.materialId,
    onBeforeCollaborate: draft.flushNow,
    // Never a name: the student is told a teacher is here, not which one.
    teacherLabel: tm('peer.teacher'),
    // The terminal the student is looking at, as its own events. The mirror is
    // fed from here rather than from a run's final `stdout`, which is why the
    // teacher sees banners, submitted input, tracebacks, and sample verdicts
    // instead of only what `print` happened to produce.
    terminal: {
      readTranscript: runner.readTranscript,
      subscribeTerminal: runner.subscribeTerminal,
    },
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
      const clientRunId = crypto.randomUUID();
      monitoring.publishRun({
        clientRunId,
        lifecycle: 'STARTED',
        sampleCount: exercise.sampleTestCases.length,
        passedCount: 0,
        output: '',
      });

      // One id for both halves of the report: the presence summary and the
      // mirrored terminal describe the same execution, so a teacher cannot see
      // a transcript from one run beside a verdict from another.
      const { outcome, verdict } = await runSample(draft.code, sample, index, {
        clientRunId,
        sampleCount: exercise.sampleTestCases.length,
      });
      setActiveSample(null);
      if (!outcome || !verdict) {
        monitoring.publishRun({
          clientRunId,
          lifecycle: 'CANCELLED',
          sampleCount: exercise.sampleTestCases.length,
          passedCount: 0,
          output: '',
        });
        return;
      }

      // Counts and the output the student is already looking at. There is no
      // field here a hidden case could travel in.
      monitoring.publishRun({
        clientRunId,
        lifecycle: verdict.kind === 'match' ? 'COMPLETED' : 'FAILED',
        sampleCount: exercise.sampleTestCases.length,
        passedCount: verdict.kind === 'match' ? 1 : 0,
        output: outcome.stdout,
      });
    },
    [draft.code, exercise.sampleTestCases, monitoring, runSample],
  );

  /**
   * A plain run, reported to whoever is watching.
   *
   * The teacher's copy of this workspace shows the student's terminal, so a
   * run that published nothing would leave them looking at an empty pane while
   * the student stares at a traceback. The output sent is the text already on
   * the student's screen — stdout, and the error if the program raised one.
   */
  const handleRun = React.useCallback(async () => {
    setOutputTab('terminal');
    const clientRunId = crypto.randomUUID();
    monitoring.publishRun({
      clientRunId,
      lifecycle: 'STARTED',
      sampleCount: 0,
      passedCount: 0,
      output: '',
    });

    const outcome = await runner.run(draft.code, {
      banner: [{ text: '$ python solution.py\n', kind: 'meta' }],
      clientRunId,
    });
    // A dropped request still has to be closed out, or the teacher's mirror
    // sits on "Running" for a run that never happened.
    if (!outcome) {
      monitoring.publishRun({
        clientRunId,
        lifecycle: 'CANCELLED',
        sampleCount: 0,
        passedCount: 0,
        output: '',
      });
      return;
    }

    monitoring.publishRun({
      clientRunId,
      lifecycle: outcome.stopped
        ? 'CANCELLED'
        : outcome.failed
          ? 'FAILED'
          : 'COMPLETED',
      sampleCount: 0,
      passedCount: 0,
      output: outcome.error
        ? `${outcome.stdout}${outcome.error.display}`
        : outcome.stdout,
    });
  }, [draft.code, monitoring, runner]);

  const handleSubmit = React.useCallback(() => {
    // The submitted code is the draft, so it is persisted before grading
    // starts rather than relying on the idle timer having fired.
    draft.flushNow();
    setOutputTab('result');
    setLastReadSubmissionId(null);
    void submission.submit(draft.code);
  }, [draft, submission]);

  const resultId = submission.result?.submissionId ?? null;
  React.useEffect(() => {
    if (resultId) monitoring.publishResult(resultId);
  }, [monitoring, resultId]);

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
      {/* The teacher's mouse while one is helping, drawn over whichever pane
          they are pointing at. */}
      <RemotePointer
        name={tm('peer.teacher')}
        pointer={monitoring.remote.pointer}
      />

      <div className="shrink-0" {...surfaceProps('header')}>
        <WorkspaceHeader
          academyId={academyId}
          indicator={<MonitoringIndicator state={monitoring.indicator} />}
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
      </div>

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
          {...surfaceProps('statement')}
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
            onCodeChange={(value) => {
              monitoring.markActive();
              draft.setCode(value);
            }}
            onEditorMount={monitoring.registerEditor}
            onRun={() => void handleRun()}
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
