'use client';

import type { LearnSampleTestCase } from '@cove/shared';
import { RotateCcw, Send } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useLayoutTranslation } from '@/i18n';
import { FontSizeControls } from '@/components/workspace/font-size-controls';
import { RunControls } from '@/components/workspace/run-controls';
import { TerminalPanel } from '@/components/workspace/terminal-panel';
import { surfaceProps } from '@/lib/monitoring/awareness/surfaces';
import { useEditorPreferences } from '@/lib/workspace/use-editor-preferences';
import type { SampleRun } from '@/lib/workspace/use-sample-runner';
import type { PythonRunnerState } from '@/lib/workspace/use-python-runner';
import { useSplitPane } from '@/lib/workspace/use-split-pane';

import type { SubmissionState } from '../_hooks/use-submission';
import type { OnMount } from '@monaco-editor/react';

import { CodeEditor } from './code-editor';
import { ErrorCoachPanel } from './error-coach-panel';
import { ResultPanel } from './result-panel';

export type OutputTab = 'terminal' | 'result';

export function EditorPane({
  onRunAll,
  onStop,
  sampleResults,
  testingSamples,
  sampleRunFailed,
  onReset,
  onSubmit,
  code,
  onCodeChange,
  runner,
  submission,
  sampleTestCases,
  activeSample,
  onRun,
  onRunSample,
  tab,
  onEditorMount,
  onFocusLine,
  serverCheck,
}: {
  onRunAll: () => void;
  onStop: () => void;
  sampleResults: SampleRun[];
  testingSamples: boolean;
  sampleRunFailed: boolean;
  onReset: () => void;
  onSubmit: () => void;
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
  /** Puts the editor caret on the line the coach is pointing at. */
  onFocusLine?: (line: number, column: number) => void;
  /** A sample check judged on the server, which Stop must reach too. */
  serverCheck?: { active: boolean; stopping: boolean; stop: () => void };
}) {
  const { t } = useLayoutTranslation('learn');
  const { t: tc } = useTranslation('sample-check');
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
        <div className="@container flex shrink-0 items-center gap-2 overflow-x-auto py-1 border-b border-white/10 bg-[#2d2d2d] px-2">
          <button type="button" disabled={testingSamples || runner.running || submission.submitting} onClick={onReset} className="inline-flex shrink-0 items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-[12px] text-white disabled:opacity-50"><RotateCcw className="size-3" />{t('workspace.reset')}</button>
          <RunControls
            activeSample={activeSample}
            onRun={onRun}
            onRunSample={onRunSample}
            onRunAll={onRunAll}
            onStop={onStop}
            ready={runner.ready && !submission.submitting}
            running={runner.running || testingSamples || Boolean(serverCheck?.active)}
            stopping={Boolean(serverCheck?.stopping)}
            sampleTestCases={sampleTestCases}
          />
          <button type="button" disabled={testingSamples || runner.running || submission.submitting} onClick={onSubmit} className="inline-flex shrink-0 items-center gap-1 rounded-md border border-white/20 px-2 py-1 text-[12px] text-white disabled:opacity-50"><Send className="size-3" />{t('workspace.submit')}</button>
        </div>

        <div
          aria-label={t('workspace.tab_result')}
          className="min-h-0 flex-1 overflow-y-auto"
          id={`workspace-${tab}-panel`}
          role="region"
        >
          {tab !== 'result' && (testingSamples || sampleResults.length > 0) ? (
            <div className="space-y-4 p-3 font-mono text-[12px] text-[#d4d4d4]" aria-live="polite">
              {sampleResults.map((result, index) => {
                const comparator = sampleTestCases[index]?.comparator;
                return (
                <section key={index} className="space-y-2 border-b border-white/10 pb-3">
                  <h3 className="font-bold">{t('workspace.sample_n', { number: index + 1 })}</h3>
                  <dl className="space-y-2">
                    <dt>{t('workspace.stdin')}</dt><dd><pre className="whitespace-pre-wrap">{sampleTestCases[index]?.input}</pre></dd>
                    <dt>{comparator && comparator !== 'STDOUT' ? t(`workspace.sample_rule.${comparator}`) : t('workspace.expected')}</dt><dd><pre className="whitespace-pre-wrap">{sampleTestCases[index]?.expectedOutput}</pre></dd>
                    <dt>{t('workspace.actual')}</dt><dd><pre className="whitespace-pre-wrap">{result.outcome?.stdout}</pre></dd>
                  </dl>
                  {result.serverDetails ? result.serverDetails.map((line, lineIndex) => (
                    'message' in line ? (
                      <p key={lineIndex} className={line.kind === 'err' ? 'text-red-400' : line.kind === 'meta' ? 'text-green-400' : 'text-amber-300'}>
                        {line.mark ? `${line.mark} ` : ''}{tc(line.message, { number: index + 1 })}
                      </p>
                    ) : 'text' in line && line.kind === 'err' ? (
                      <pre key={lineIndex} className="whitespace-pre-wrap text-red-400">{line.text}</pre>
                    ) : null
                  )) : <p className={result.verdict?.kind === 'match' ? 'text-green-400' : result.verdict?.kind === 'unchecked' || result.verdict?.kind === 'warning' ? 'text-amber-300' : 'text-red-400'}>
                    {result.verdict?.kind === 'unchecked' ? tc('workspace.sample_checked_on_submit', { number: index + 1 }) : result.verdict?.kind === 'warning' ? tc('workspace.sample_check_warning', { number: index + 1 }) : t(result.verdict?.kind === 'match' ? 'workspace.sample_match' : result.verdict?.kind === 'mismatch' ? 'workspace.sample_mismatch' : 'workspace.sample_skipped', { number: index + 1 })}
                  </p>}
                  {result.outcome?.error ? (
                    <ErrorCoachPanel code={code} error={result.outcome.error} onFocusLine={onFocusLine} />
                  ) : null}
                </section>
                );
              })}
              {testingSamples || sampleRunFailed ? (
                <TerminalPanel awaitingInput={false} lines={runner.lines} onEndInput={runner.endInput} onSubmitInput={runner.submitInput} supported={runner.supported} />
              ) : null}
            </div>
          ) : tab !== 'result' ? (<>
            <TerminalPanel
              awaitingInput={runner.awaitingInput}
              lines={runner.lines}
              onEndInput={runner.endInput}
              onSubmitInput={runner.submitInput}
              supported={runner.supported}
            />
            {coached ? (
            <ErrorCoachPanel
              code={code}
              error={coached}
              onFocusLine={onFocusLine}
            />
            ) : null}
          </>) : (
            <ResultPanel submission={submission} />
          )}
        </div>
      </div>
    </section>
  );
}
