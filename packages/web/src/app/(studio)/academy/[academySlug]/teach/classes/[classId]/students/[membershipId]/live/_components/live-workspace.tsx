'use client';

import { routes } from '@/lib/routes';

import { useAcademySlug } from '@/components/studio/academy-route-provider';

import {
  navigatorPathFromBreadcrumb,
  type MonitoringStudentContext,
} from '@cove/shared';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { RemotePointer } from '@/components/monitoring/remote-pointer';
import { WorkspaceCurriculumNavigator } from '@/components/workspace/curriculum-navigator';
import { CurriculumTrigger } from '@/components/workspace/curriculum-trigger';
import { FontSizeControls } from '@/components/workspace/font-size-controls';
import { ProblemStatement } from '@/components/workspace/problem-statement';
import { useLayoutTranslation } from '@/i18n';
import { orpc } from '@/lib/orpc';
import { surfaceProps } from '@/lib/monitoring/awareness/surfaces';
import { useLiveWorkspace } from '@/lib/monitoring/use-live-workspace';
import { navigatorRow } from '@/lib/workspace/navigator-geometry';
import { useNavigatorPanel } from '@/lib/workspace/use-navigator-panel';
import { useEditorPreferences } from '@/lib/workspace/use-editor-preferences';
import { usePythonRunner } from '@/lib/workspace/use-python-runner';
import { useSampleRunner } from '@/lib/workspace/use-sample-runner';
import {
  STATEMENT_CANVAS_MIN_WIDTH,
  STATEMENT_PANE,
} from '@/lib/workspace/statement-canvas';
import { useSplitPane } from '@/lib/workspace/use-split-pane';

import { useTeacherDisplay } from '../_hooks/use-teacher-display';
import { LiveEditor } from './live-editor';
import { FeedbackDock } from './live-feedback';
import { LiveHeader } from './live-header';
import { LiveOutput, type LiveOutputTab } from './live-output';
import { PreviewBanner } from './preview-banner';
import { PreviewEditor } from './preview-editor';

/**
 * One student's exercise, opened beside them.
 *
 * The shape is the student's own workspace — problem on the left, editor and
 * terminal on the right — so a teacher reads the same screen the student is
 * describing to them. What differs is ownership: the code is shared, the
 * terminal on the "you" tab is the teacher's alone, and submitting is not
 * offered here at all.
 *
 * The page owns layout and nothing else: the watch, the document, awareness,
 * and feedback all live in `useLiveWorkspace`, and the durable exercise text
 * comes from an ordinary query.
 */
export function LiveWorkspace({
  academyId,
  classId,
  membershipId,
  context,
  teacherMembershipRef,
}: {
  academyId: string;
  classId: string;
  membershipId: string;
  context: MonitoringStudentContext;
  teacherMembershipRef: string | null;
}) {
  const academySlug = useAcademySlug();
  const { t } = useTranslation('monitoring');
  const { t: tl } = useLayoutTranslation('learn');
  const live = useLiveWorkspace({
    academyId,
    classId,
    studentMembershipId: membershipId,
  });
  const runner = usePythonRunner();
  const runSample = useSampleRunner(runner);
  const preferences = useEditorPreferences();

  const [outputTab, setOutputTab] = React.useState<LiveOutputTab>('you');
  const [activeSample, setActiveSample] = React.useState<number | null>(null);
  const [readRunId, setReadRunId] = React.useState<string | null>(null);

  /**
   * A new student run brings the mirror forward; nothing else does.
   *
   * The tab follows the *start* of an execution and not its output, so a
   * teacher who deliberately switched back to their own terminal keeps it for
   * the rest of that run. Their next run selects the mirror again, because a
   * run beginning is the moment the interesting thing is happening elsewhere.
   */
  const mirroredRunId = live.terminal.clientRunId;
  const shownRunIdRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!mirroredRunId || shownRunIdRef.current === mirroredRunId) return;
    shownRunIdRef.current = mirroredRunId;
    setOutputTab('student');
  }, [mirroredRunId]);

  // The exercise is fetched once the watch says which one the student has
  // open. A remembered material id in the URL would let a teacher name an
  // exercise the student is not on; the server chooses it instead.
  const materialId = live.session?.materialId;
  const exerciseQuery = useQuery({
    queryKey: ['academy', academyId, 'live-exercise', membershipId, materialId],
    queryFn: () =>
      orpc.monitoring.getStudentContext({
        academyId,
        classId,
        membershipId,
        materialId,
      }),
    enabled: Boolean(materialId),
    retry: false,
  });
  const liveExercise = exerciseQuery.data?.exercise ?? null;

  /**
   * Where the student is, derived once per exercise rather than per render.
   *
   * The controller below reacts to this identity, so rebuilding the object on
   * every render would make it react to every render — which is exactly the
   * loop this memo exists to prevent.
   */
  const livePath = React.useMemo(
    () =>
      liveExercise
        ? navigatorPathFromBreadcrumb({
            breadcrumb: liveExercise.breadcrumb,
            exercise: liveExercise.exercise,
          })
        : null,
    [liveExercise],
  );

  /**
   * The teacher's two independent facts: what is on screen, and where the
   * student is. `useLiveWorkspace` owns the watch and the document; this owns
   * which of those the reader is currently being shown.
   */
  const display = useTeacherDisplay({
    academyId,
    classId,
    membershipId,
    liveMaterialId: materialId ?? null,
    livePath,
    liveVisitId: live.session?.visitId ?? null,
    follow: live.follow,
    socket: live.socket,
    watchDenied: live.denied !== null,
    watchEnded: live.ended !== null,
  });
  // Destructured rather than kept as an object: reading `.open` off a hook
  // result that also carries a ref is a ref access as far as the React
  // compiler is concerned, and it is right to flag it.
  const {
    close: closePanel,
    open: panelOpen,
    panelId,
    toggle: togglePanel,
    triggerRef,
  } = useNavigatorPanel('live-curriculum');

  const previewed =
    display.display?.mode === 'preview' ? display.display.snapshot : null;
  // What the statement pane renders. Preview and live share the presentation
  // exactly; what differs is where the payload came from and what may be done
  // with it.
  const shown = previewed ?? liveExercise;
  const sampleTestCases = React.useMemo(
    () => (previewed ? [] : (liveExercise?.exercise.sampleTestCases ?? [])),
    [liveExercise, previewed],
  );

  const feedbackQuery = useQuery({
    queryKey: ['academy', academyId, 'live-feedback', membershipId, materialId],
    queryFn: () =>
      orpc.monitoring.listFeedback({
        academyId,
        classId,
        membershipId,
        materialId,
        limit: 50,
      }),
    enabled: Boolean(materialId),
    retry: false,
  });

  // Stored history first, live arrivals after: both are server-owned rows, so
  // they merge on id without a client-authored placeholder among them.
  const feedback = React.useMemo(() => {
    const stored = [...(feedbackQuery.data?.feedback ?? [])].reverse();
    const seen = new Set(stored.map((item) => item.id));
    return [...stored, ...live.feedback.filter((item) => !seen.has(item.id))];
  }, [feedbackQuery.data, live.feedback]);

  // Destructured rather than kept as objects: reading `.containerRef` off a
  // hook result during render is a ref access as far as the React compiler is
  // concerned, and it is right to flag it.
  const {
    size: statementWidth,
    dragging: draggingStatement,
    containerRef: paneContainerRef,
    dividerProps: statementDividerProps,
  } = useSplitPane({
    axis: 'horizontal',
    initial: STATEMENT_PANE.initialPercent,
    min: STATEMENT_PANE.minPercent,
    // Matches the student's floor: the canvas is only a shared coordinate
    // space if both panes can actually render it.
    minPx: live.collaborating ? STATEMENT_CANVAS_MIN_WIDTH : undefined,
    max: STATEMENT_PANE.maxPercent,
  });
  const {
    size: outputHeight,
    dragging: draggingOutput,
    containerRef: editorContainerRef,
    dividerProps: outputDividerProps,
  } = useSplitPane({ axis: 'vertical', initial: 240, min: 96, max: 1_200 });

  /** The shared document as text, read at the moment a run starts. */
  const getCode = React.useCallback(() => live.text.toString(), [live.text]);

  /**
   * The teacher runs the document they are looking at, in their own browser.
   *
   * Nothing about it is published: a run the student did not start must never
   * appear on the student's screen, and a submission is theirs alone to make.
   */
  const handleRun = React.useCallback(() => {
    // Guarded as well as hidden: the shared document holds the student's live
    // exercise, and running it while reading a different one would report the
    // wrong program's output under the wrong problem.
    if (previewed) return;
    setOutputTab('you');
    void runner.run(getCode(), {
      banner: [{ text: '$ python solution.py\n', kind: 'meta' }],
    });
  }, [getCode, previewed, runner]);

  const handleRunSample = React.useCallback(
    async (index: number) => {
      const sample = sampleTestCases[index];
      if (!sample) return;
      setOutputTab('you');
      setActiveSample(index);
      await runSample(getCode(), sample, index);
      setActiveSample(null);
    },
    [getCode, runSample, sampleTestCases],
  );

  // A run the teacher has not looked at is worth a dot; one they are watching
  // is not. Marking on the switch itself rather than in an effect: whichever
  // way the tab moves, the run on screen at that moment has been seen.
  const handleTabChange = React.useCallback(
    (next: LiveOutputTab) => {
      if (live.run) setReadRunId(live.run.clientRunId);
      setOutputTab(next);
    },
    [live.run],
  );

  const student =
    context.student.displayName ?? context.student.email ?? membershipId;

  return (
    <div className="flex h-dvh flex-col bg-canvas">
      {/* The student's mouse, drawn wherever this teacher's layout puts the
          pane it is over. */}
      <RemotePointer name={student} pointer={live.remote.pointer} />

      <div className="shrink-0" {...surfaceProps('header')}>
        <LiveHeader
          academyId={academyId}
          classId={classId}
          connection={live.state}
          context={context}
          curriculum={
            <CurriculumTrigger
              onToggle={togglePanel}
              open={panelOpen}
              panelId={panelId}
              path={display.path}
              ref={triggerRef}
            />
          }
          exercise={shown}
          liveStatus={
            display.live.available
              ? t('live.on_exercise', {
                  title: display.live.path?.exercise.title ?? '',
                })
              : t('live.not_solving')
          }
          unsaved={live.unsaved}
        />
      </div>

      {live.ended ? (
        <p className="shrink-0 border-b border-danger/25 bg-danger/5 px-4 py-2 text-[13px] font-semibold text-danger">
          {t('workspace.ended_title')} · {t(`end_reason.${live.ended}`)}
        </p>
      ) : null}
      {live.denied === 'MONITORING_STUDENT_UNAVAILABLE' ? (
        <p className="shrink-0 border-b border-border bg-card px-4 py-2 text-[13px] text-sub">
          {t('workspace.not_solving_body')}
        </p>
      ) : null}

      {/* Reading ahead, said out loud for as long as it lasts. */}
      {previewed ? (
        <PreviewBanner
          liveTitle={
            display.live.available
              ? (display.live.path?.exercise.title ?? null)
              : null
          }
          onReturn={display.returnToLive}
          previewTitle={previewed.exercise.title}
          returning={display.following}
        />
      ) : null}

      {display.previewFailed ? (
        <p
          className="flex shrink-0 items-center gap-3 border-b border-danger/25 bg-danger/5 px-4 py-2 text-[13px] font-semibold text-danger"
          role="alert"
        >
          {t('preview.failed')}
          <button
            className="rounded-md border border-danger/30 px-2 py-0.5 text-[12.5px] font-bold transition-colors hover:bg-danger/10"
            onClick={display.retryPreview}
            type="button"
          >
            {t('preview.retry')}
          </button>
        </p>
      ) : null}

      {/* Below the supported editor viewport the roster still works, but two
          people cannot usefully share one column of code — say so instead of
          rendering an unusable editor. */}
      <p className="border-b border-border bg-card px-4 py-3 text-[13.5px] text-sub lg:hidden">
        <span className="font-bold">{t('workspace.narrow_title')}</span>{' '}
        {t('workspace.narrow_body')}
      </p>

      {/* The panel and the panes share one row, so opening the course takes
          width from the workspace rather than covering it. */}
      <div className={navigatorRow}>
        <WorkspaceCurriculumNavigator
          busyMaterialId={display.pendingMaterialId}
          context={display.navigator}
          // A follow in progress owns the display; a second selection during
          // it would race the watch the teacher already asked for.
          disabled={display.following}
          dockAt="lg"
          displayedMaterialId={display.displayedMaterialId ?? ''}
          error={display.navigatorFailed}
          footer={{
            href: `${routes.academy(academySlug)}/teach/classes/${classId}`,
            label: t('navigator.footer_teacher'),
          }}
          // The student's own exercise, marked even while the teacher reads
          // somewhere else.
          liveMaterialId={
            display.live.available ? display.live.materialId : null
          }
          onClose={closePanel}
          onRetry={display.loadCurriculum}
          onSelect={display.select}
          open={panelOpen}
          panelId={panelId}
        />

        <div
          className="hidden min-h-0 min-w-0 flex-1 overflow-hidden lg:flex"
          ref={paneContainerRef}
        >
          <div
            className="@container min-w-0 shrink-0 overflow-x-hidden overflow-y-auto bg-card"
            style={{ flexBasis: `${statementWidth}%` }}
            {...surfaceProps('statement')}
          >
            {shown ? (
              // Every hint is already revealed here: the teacher is the one
              // deciding which of them this student needs to hear. A preview
              // renders through exactly the same presentation, because a public
              // statement is a public statement whichever mode fetched it.
              <ProblemStatement
                collaborating={live.collaborating}
                exercise={shown.exercise}
                revealedHints={shown.exercise.hints.length}
              />
            ) : (
              <div className="px-5 py-6">
                <h2 className="text-[15px] font-bold">
                  {t('workspace.not_solving_title')}
                </h2>
                <p className="mt-1 text-[13.5px] text-sub">
                  {t('workspace.not_solving_body')}
                </p>
              </div>
            )}
          </div>

          <div
            aria-hidden
            className={`w-1 shrink-0 cursor-col-resize bg-border transition-colors hover:bg-brand/40 ${
              draggingStatement ? 'bg-brand/60' : ''
            }`}
            {...statementDividerProps}
          />

          <section className="flex min-w-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 flex-col" ref={editorContainerRef}>
              {/* theme-lint-ignore — editor chrome, dark in both themes */}
              <header className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-[#2d2d2d] px-3 py-1.5">
                {/* theme-lint-ignore */}
                <span className="font-mono text-[11.5px] text-[#a5a5a5]">
                  {tl('workspace.language_python')}
                </span>
                <div className="ml-auto">
                  <FontSizeControls {...preferences} />
                </div>
              </header>

              <div
                className="flex min-h-0 flex-1 flex-col"
                {...surfaceProps('editor')}
              >
                {previewed ? (
                  // The live document is never handed to a preview. Incoming
                  // updates keep arriving and keep being applied to it; what
                  // this pane shows is a string that no socket can reach.
                  <PreviewEditor
                    code={previewed.exercise.starterCode}
                    fontSize={preferences.fontSize}
                  />
                ) : (
                  <LiveEditor
                    fontSize={preferences.fontSize}
                    onCursor={live.publishCursor}
                    peerName={student}
                    readOnly={!live.canEdit || !display.isLive}
                    remoteCursor={live.remote.cursor}
                    text={live.text}
                  />
                )}
              </div>

              <div
                aria-label={tl('workspace.resize_terminal')}
                className={`relative h-3 shrink-0 cursor-row-resize touch-none select-none bg-editor-bg before:absolute before:inset-x-0 before:top-1/2 before:h-px before:-translate-y-1/2 before:bg-white/15 before:transition-all hover:before:h-0.5 hover:before:bg-brand/60 ${
                  draggingOutput ? 'before:h-0.5 before:bg-brand' : ''
                }`}
                role="separator"
                {...outputDividerProps}
              />

              <div
                className="flex shrink-0 flex-col overflow-hidden"
                style={{ height: outputHeight }}
                {...surfaceProps('terminal')}
              >
                <LiveOutput
                  activeSample={activeSample}
                  canRun={display.isLive}
                  onRun={handleRun}
                  onRunSample={(index) => void handleRunSample(index)}
                  onTabChange={handleTabChange}
                  result={live.result}
                  run={live.run}
                  runner={runner}
                  sampleTestCases={sampleTestCases}
                  studentName={student}
                  tab={outputTab}
                  terminal={live.terminal}
                  unreadStudentRun={
                    live.run !== null && live.run.clientRunId !== readRunId
                  }
                />
              </div>
            </div>

            {!previewed ? (
              <div className="shrink-0" {...surfaceProps('feedback')}>
                <FeedbackDock
                  canSend={live.canEdit && display.isLive}
                  draft={display.feedbackDraft}
                  feedback={feedback}
                  materialId={materialId ?? null}
                  onDraftChange={display.setFeedbackDraft}
                  onSend={live.sendFeedback}
                  teacherMembershipRef={teacherMembershipRef}
                />
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
