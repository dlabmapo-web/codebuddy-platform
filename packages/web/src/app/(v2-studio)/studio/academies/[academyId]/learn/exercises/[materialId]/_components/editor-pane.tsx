'use client';

import type { LearnSampleTestCase } from '@cove/shared';
import { Minus, Plus } from 'lucide-react';
import * as React from 'react';

import { useLayoutTranslation } from '@/i18n';

import type { PythonRunnerState } from '../_hooks/use-python-runner';
import type { SubmissionState } from '../_hooks/use-submission';
import { useEditorPreferences } from '../_hooks/use-editor-preferences';
import { useSplitPane } from '../_hooks/use-split-pane';
import { CodeEditor } from './code-editor';
import { ResultPanel } from './result-panel';
import { RunControls } from './run-controls';
import { TerminalPanel } from './terminal-panel';

export type OutputTab = 'terminal' | 'result';

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
  onRunSample,
  tab,
  onTabChange,
  unreadResult,
}: {
  code: string;
  onCodeChange: (value: string) => void;
  runner: PythonRunnerState;
  submission: SubmissionState;
  sampleTestCases: LearnSampleTestCase[];
  activeSample: number | null;
  onRunSample: (index: number) => void;
  tab: OutputTab;
  onTabChange: (tab: OutputTab) => void;
  unreadResult: boolean;
}) {
  const { t } = useLayoutTranslation('learn');
  const { fontSize, increase, decrease, canIncrease, canDecrease } =
    useEditorPreferences();
  const {
    size: outputHeight,
    dragging,
    containerRef,
    dividerProps,
  } = useSplitPane({ axis: 'vertical', initial: 260, min: 80, max: 1_200 });

  const tabs: OutputTab[] = ['terminal', 'result'];
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
        <div className="ml-auto flex items-center gap-0.5">
          <FontButton
            disabled={!canDecrease}
            label={t('workspace.font_smaller')}
            onClick={decrease}
          >
            <Minus className="size-3" />
          </FontButton>
          <span
            aria-live="polite"
            className="w-6 text-center font-mono text-[11.5px] text-[#a5a5a5]"
          >
            {fontSize}
          </span>
          <FontButton
            disabled={!canIncrease}
            label={t('workspace.font_larger')}
            onClick={increase}
          >
            <Plus className="size-3" />
          </FontButton>
        </div>
      </header>

      <CodeEditor code={code} fontSize={fontSize} onChange={onCodeChange} />

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
      >
        <div className="flex shrink-0 items-center gap-1 border-b border-white/10 bg-[#2d2d2d] px-2">
          <div className="flex" role="tablist">
            {tabs.map((name) => (
              <button
                aria-controls={`workspace-${name}-panel`}
                aria-selected={tab === name}
                className={`relative px-3 py-1.5 text-[12px] font-semibold transition-colors ${
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
            ))}
          </div>

          <div className="ml-auto flex items-center gap-1.5 py-1">
            <RunControls
              activeSample={activeSample}
              onRun={() => {
                onTabChange('terminal');
                void runner.run(code, {
                  banner: [{ text: '$ python solution.py\n', kind: 'meta' }],
                });
              }}
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
          ) : (
            <ResultPanel submission={submission} />
          )}
        </div>
      </div>
    </section>
  );
}

function FontButton({
  children,
  disabled,
  label,
  onClick,
}: {
  children: React.ReactNode;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="grid size-6 place-items-center rounded text-[#a5a5a5] transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30"
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}
