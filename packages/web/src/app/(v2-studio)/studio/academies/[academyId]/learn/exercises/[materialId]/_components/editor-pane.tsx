'use client';

import type { LearnSampleTestCase } from '@cove/shared';
import { CircleHelp, ClipboardCheck, SquareTerminal } from 'lucide-react';
import * as React from 'react';

import { useLayoutTranslation } from '@/i18n';
import { FontSizeControls } from '@/components/workspace/font-size-controls';
import { RunControls } from '@/components/workspace/run-controls';
import { TerminalPanel } from '@/components/workspace/terminal-panel';
import { surfaceProps } from '@/lib/monitoring/awareness/surfaces';
import { useEditorPreferences } from '@/lib/workspace/use-editor-preferences';
import type { PythonRunnerState } from '@/lib/workspace/use-python-runner';
import { useSplitPane } from '@/lib/workspace/use-split-pane';

import type { SubmissionState } from '../_hooks/use-submission';
import type { OnMount } from '@monaco-editor/react';

import { CodeEditor } from './code-editor';
import { ErrorCoachPanel } from './error-coach-panel';
import { ResultPanel } from './result-panel';

export type OutputTab = 'terminal' | 'result' | 'coach';

const tabIcon: Record<OutputTab, typeof SquareTerminal> = {
  terminal: SquareTerminal,
  result: ClipboardCheck,
  coach: CircleHelp,
};

/**
 * Editor above, output below, with Terminal and Result as tabs in the same
 * pane.
 *
 * They were stacked panes, which left a dead white gap above the verdict
 * whenever the terminal was empty. One region with two tabs removes that by
 * construction rather than by tuning heights.
 */
export function EditorPane({
  code,
  onCodeChange,
  runner,
  submission,
  sampleTestCases,
  activeSample,
  onRun,
  onRunSample,
  tab,
  onTabChange,
  onEditorMount,
  onFocusLine,
  unreadResult,
}: {
  code: string;
  onCodeChange: (value: string) => void;
  /** Lets live collaboration bind to the very model the student is typing in. */
  onEditorMount?: (editor: Parameters<OnMount>[0]) => void;
  runner: PythonRunnerState;
  submission: SubmissionState;
  sampleTestCases: LearnSampleTestCase[];
  activeSample: number | null;
  /** Owned by the workspace, which reports the run to a watching teacher. */
  onRun: () => void;
  onRunSample: (index: number) => void;
  tab: OutputTab;
  onTabChange: (tab: OutputTab) => void;
  unreadResult: boolean;
  /** Puts the editor caret on the line the coach is pointing at. */
  onFocusLine?: (line: number, column: number) => void;
}) {
  const { t } = useLayoutTranslation('learn');
  const preferences = useEditorPreferences();
  const {
    size: outputHeight,
    dragging,
    containerRef,
    dividerProps,
  } = useSplitPane({ axis: 'vertical', initial: 260, min: 80, max: 1_200 });

  /**
   * The coach exists only while an error is the latest thing that happened.
   * Explaining the previous failure while new output streams in would describe
   * the wrong program, so a run takes it away again.
   */
  const coached = runner.running ? null : runner.lastError;
  const tabs: OutputTab[] = coached
    ? ['terminal', 'result', 'coach']
    : ['terminal', 'result'];

  /**
   * A failed run opens the coach rather than announcing itself and waiting.
   * The student has just met a wall of red; making them notice a new tab and
   * decide it is for them is three steps before any help arrives.
   */
  const coachedRef = React.useRef(coached);
  React.useEffect(() => {
    const previous = coachedRef.current;
    coachedRef.current = coached;
    if (coached && coached !== previous) onTabChange('coach');
  }, [coached, onTabChange]);

  /**
   * A tab that can vanish must not take the selection — or the keyboard — with
   * it. Runs already return to the terminal; this covers the rest, including
   * navigating to another exercise.
   */
  React.useEffect(() => {
    if (coached || tab !== 'coach') return;
    const stranded = document.activeElement?.id === 'workspace-coach-tab';
    onTabChange('terminal');
    if (stranded) document.getElementById('workspace-terminal-tab')?.focus();
  }, [coached, onTabChange, tab]);

  const selectRelativeTab = (current: OutputTab, direction: -1 | 1) => {
    const index = tabs.indexOf(current);
    const next = tabs[(index + direction + tabs.length) % tabs.length]!;
    onTabChange(next);
    document.getElementById(`workspace-${next}-tab`)?.focus();
  };

  return (
    <section
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      ref={containerRef}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-[#2d2d2d] px-3 py-1.5">
        <span className="font-mono text-[11.5px] text-[#a5a5a5]">
          {t('workspace.language_python')}
        </span>
        <div className="ml-auto">
          <FontSizeControls {...preferences} />
        </div>
      </header>

      {/* Named so a watching teacher's pointer can be drawn over the same
          pane on their screen, whatever size they have dragged it to. */}
      <div className="flex min-h-0 flex-1 flex-col" {...surfaceProps('editor')}>
        <CodeEditor
          code={code}
          fontSize={preferences.fontSize}
          onChange={onCodeChange}
          onMount={onEditorMount}
        />
      </div>

      <div
        aria-label={t('workspace.resize_terminal')}
        className={`relative h-3 shrink-0 touch-none select-none cursor-row-resize bg-transparent before:absolute before:inset-x-0 before:top-1/2 before:h-px before:-translate-y-1/2 before:bg-border before:transition-all hover:before:h-0.5 hover:before:bg-brand/60 ${
          dragging ? 'before:h-0.5 before:bg-brand' : ''
        }`}
        role="separator"
        {...dividerProps}
      />

      <div
        className="flex shrink-0 flex-col overflow-hidden bg-editor-bg"
        style={{ height: outputHeight }}
        {...surfaceProps('terminal')}
      >
        <div className="flex shrink-0 items-center gap-1 border-b border-white/10 bg-[#2d2d2d] px-2">
          <div className="flex" role="tablist">
            {tabs.map((name) => {
              const Icon = tabIcon[name];
              return (
              <button
                aria-controls={`workspace-${name}-panel`}
                aria-selected={tab === name}
                className={`relative flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                  tab === name
                    ? 'text-white'
                    : 'text-[#a5a5a5] hover:text-white'
                }`}
                key={name}
                id={`workspace-${name}-tab`}
                onClick={() => onTabChange(name)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowLeft') {
                    event.preventDefault();
                    selectRelativeTab(name, -1);
                  } else if (event.key === 'ArrowRight') {
                    event.preventDefault();
                    selectRelativeTab(name, 1);
                  }
                }}
                role="tab"
                tabIndex={tab === name ? 0 : -1}
                type="button"
              >
                <Icon aria-hidden className="size-3.5" />
                {t(`workspace.tab_${name}`)}
                {name === 'result' &&
                (submission.submitting || unreadResult) &&
                tab !== 'result' ? (
                  <span className="absolute right-0.5 top-1 size-1.5 rounded-full bg-brand" />
                ) : null}
                {tab === name ? (
                  <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand" />
                ) : null}
              </button>
              );
            })}
          </div>

          <div className="ml-auto flex items-center gap-1.5 py-1">
            <RunControls
              activeSample={activeSample}
              onRun={onRun}
              onRunSample={onRunSample}
              onStop={runner.stop}
              ready={runner.ready}
              running={runner.running}
              sampleTestCases={sampleTestCases}
            />
          </div>
        </div>

        <div
          aria-labelledby={`workspace-${tab}-tab`}
          className="min-h-0 flex-1 overflow-y-auto"
          id={`workspace-${tab}-panel`}
          role="tabpanel"
        >
          {tab === 'terminal' ? (
            <TerminalPanel
              awaitingInput={runner.awaitingInput}
              lines={runner.lines}
              onSubmitInput={runner.submitInput}
              supported={runner.supported}
            />
          ) : tab === 'coach' && coached ? (
            <ErrorCoachPanel
              code={code}
              error={coached}
              onFocusLine={onFocusLine}
            />
          ) : (
            <ResultPanel submission={submission} />
          )}
        </div>
      </div>
    </section>
  );
}
