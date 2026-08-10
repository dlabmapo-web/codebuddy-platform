'use client';

import type { LearnExerciseBootstrap } from '@cove/shared';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useLayoutTranslation } from '@/i18n';
import { RemotePointer } from '@/components/monitoring/remote-pointer';
import { WorkspaceCurriculumNavigator } from '@/components/workspace/curriculum-navigator';
import { CurriculumTrigger } from '@/components/workspace/curriculum-trigger';
import { ProblemStatement } from '@/components/workspace/problem-statement';
import { surfaceProps } from '@/lib/monitoring/awareness/surfaces';
import { useStudentFeedback } from '@/lib/monitoring/use-student-feedback';
import { useStudentMonitoring } from '@/lib/monitoring/use-student-monitoring';
import { navigatorRow } from '@/lib/workspace/navigator-geometry';
import { useNavigatorPanel } from '@/lib/workspace/use-navigator-panel';
import { usePythonRunner } from '@/lib/workspace/use-python-runner';
import { useSampleRunner } from '@/lib/workspace/use-sample-runner';
import { useSplitPane } from '@/lib/workspace/use-split-pane';

import { useDraftAutosave } from '../_hooks/use-draft-autosave';
import {
  useExerciseNavigation,
  type ExerciseTransitionLifecycle,
} from '../_hooks/use-exercise-navigation';
import { useSubmission } from '../_hooks/use-submission';
import { EditorPane, type OutputTab } from './editor-pane';
import { FeedbackPanel } from './feedback-panel';
import { MonitoringIndicator } from './monitoring-indicator';
import { WorkspaceHeader } from './workspace-header';

export function Workspace({
  academyId,
  bootstrap,
}: {
  academyId: string;
  bootstrap: LearnExerciseBootstrap;
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
  const [hintsExpanded, setHintsExpanded] = React.useState(true);
  const beforeTransitionRef =
    React.useRef<ExerciseTransitionLifecycle | null>(null);

  const runner = usePythonRunner();
  const runSample = useSampleRunner(runner);
  const navigation = useExerciseNavigation({
    academyId,
    bootstrap,
    beforeTransitionRef,
  });
  const { workspace, navigating } = navigation;
  // Destructured rather than kept as an object: reading `.open` off a hook
  // result that also carries a ref is a ref access as far as the React
  // compiler is concerned, and it is right to flag it.
  const {
    close: closePanel,
    open: panelOpen,
    panelId,
    toggle: togglePanel,
    triggerRef,
  } = useNavigatorPanel('workspace-curriculum');

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

  // The written half of monitoring, on the same connection: a second socket
  // would rejoin the student's rooms and double every event this page sees.
  const feedback = useStudentFeedback({
    academyId,
    materialId: exercise.materialId,
    socket: monitoring.socket,
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
  const { refreshProgress } = navigation;
  React.useEffect(() => {
    if (!resultId) return;
    monitoring.publishResult(resultId);
    // The badge in the curriculum panel answers to the verdict that just
    // arrived, not to the next full page load.
    refreshProgress();
  }, [monitoring, refreshProgress, resultId]);

  /**
   * When the workspace is not the reader's to move.
   *
   * A run in progress owns the worker and a submission owns the verdict panel;
   * both would be discarded by a transition, so the rows are disabled rather
   * than allowed to silently throw the work away. Stopping a local run is
   * still available — that control belongs to the terminal.
   */
  const busy =
    navigating ||
    submission.submitting ||
    runner.running ||
    activeSample !== null;

  React.useEffect(() => {
    beforeTransitionRef.current = {
      canStart: () => !busy,
      beforeCommit: () => {
        draft.flushNow();
        runner.stop();
        runner.clear();
        submission.reset();
        setActiveSample(null);
        setRevealedHints(0);
        setHintsExpanded(true);
        setOutputTab('terminal');
        setLastReadSubmissionId(null);
      },
    };
    return () => {
      beforeTransitionRef.current = null;
    };
  }, [busy, draft, runner, submission]);

  const handleNavigate = navigation.navigate;

  // One activation, one hint, never past the end of what this exercise
  // authored.
  const hintCount = exercise.hints.length;
  const handleRevealHint = React.useCallback(() => {
    setRevealedHints((current) => Math.min(hintCount, current + 1));
  }, [hintCount]);

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
          feedback={
            <FeedbackPanel
              isHighlighted={feedback.isHighlighted}
              messages={feedback.messages}
              onOpenChange={feedback.setOpen}
              open={feedback.open}
              unreadCount={feedback.unreadCount}
            />
          }
          indicator={<MonitoringIndicator state={monitoring.indicator} />}
          navigationDisabled={busy}
          curriculum={
            <CurriculumTrigger
              onToggle={togglePanel}
              open={panelOpen}
              panelId={panelId}
              path={navigation.path}
              ref={triggerRef}
            />
          }
          onNavigate={handleNavigate}
          onReset={() => {
            if (draft.code === exercise.starterCode) return;
            if (!window.confirm(t('workspace.reset_confirm'))) return;
            draft.resetTo(exercise.starterCode);
          }}
          onSubmit={handleSubmit}
          saveState={draft.saveState}
          submitting={submission.submitting}
          workspace={workspace}
        />
      </div>

      {/* A destination that would not open. Said here, above work that is
          still entirely intact, rather than by routing away to an error page
          and taking the draft and the running worker with it. */}
      {navigation.failedDestination ? (
        <p
          className="flex shrink-0 items-center gap-3 border-b border-danger/25 bg-danger/5 px-4 py-2 text-[13px] font-semibold text-danger"
          role="alert"
        >
          {t('navigator.transition_failed')}
          <button
            className="rounded-md border border-danger/30 px-2 py-0.5 text-[12.5px] font-bold transition-colors hover:bg-danger/10"
            onClick={navigation.retry}
            type="button"
          >
            {t('navigator.transition_retry')}
          </button>
        </p>
      ) : null}

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

      {/* The panel and the panes share one row, so opening the course takes
          width from the workspace rather than covering it. */}
      <div className={navigatorRow}>
        <WorkspaceCurriculumNavigator
          busyMaterialId={navigation.navigatingTo}
          context={navigation.navigator}
          disabled={busy}
          displayedMaterialId={exercise.materialId}
          error={navigation.navigatorFailed}
          footer={{
            href: `/studio/academies/${academyId}/learn/courses/${workspace.breadcrumb.course.id}`,
            label: t('navigator.footer_student'),
          }}
          onClose={closePanel}
          onRetry={navigation.loadCourse}
          onSelect={handleNavigate}
          open={panelOpen}
          panelId={panelId}
        />

        <div
          className="flex min-h-0 min-w-0 flex-1 overflow-hidden"
          ref={paneContainerRef}
        >
          <section
            className={`@container min-w-0 overflow-x-hidden overflow-y-auto bg-white md:block md:flex-none ${
              mobileTab === 'problem' ? 'flex-1' : 'hidden'
            }`}
            // Inline deliberately: older Safari releases can discard the
            // Tailwind arbitrary-value selector that carried this custom
            // property, leaving `flex: none` with an auto basis and crushing
            // the statement against Monaco's intrinsic width.
            style={{ flexBasis: `${statementWidth}%` }}
            {...surfaceProps('statement')}
          >
            <ProblemStatement
              exercise={exercise}
              hintsExpanded={hintsExpanded}
              onHintsExpandedChange={setHintsExpanded}
              onRevealHint={handleRevealHint}
              revealedHints={revealedHints}
            />
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
    </div>
  );
}
