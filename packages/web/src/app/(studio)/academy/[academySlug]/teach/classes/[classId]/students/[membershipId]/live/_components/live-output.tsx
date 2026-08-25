'use client';

import type {
  LearnSampleTestCase,
  ResultChangedEvent,
  RunActivityPayload,
} from '@cove/shared';
import { useTranslation } from 'react-i18next';

import { RunControls } from '@/components/workspace/run-controls';
import { TerminalPanel } from '@/components/workspace/terminal-panel';
import type { TerminalTranscript } from '@/lib/workspace/terminal-transcript';
import type { PythonRunnerState } from '@/lib/workspace/use-python-runner';

import { StudentRunPanel } from './student-run-panel';

export type LiveOutputTab = 'you' | 'student';

const tabs: LiveOutputTab[] = ['you', 'student'];

/**
 * Two terminals, side by side in time.
 *
 * A teacher's run and a student's run answer different questions — "what does
 * this code do" and "what did they just see" — and mixing them into one stream
 * would make the answers unreadable. Each tab is coloured by whose it is:
 * brand for the teacher, the peer violet for the student, matching the caret
 * in the editor above.
 */
export function LiveOutput({
  activeSample,
  canRun,
  onRun,
  onRunSample,
  onTabChange,
  result,
  run,
  runner,
  sampleTestCases,
  studentName,
  tab,
  terminal,
  unreadStudentRun,
}: {
  activeSample: number | null;
  /**
   * False while the teacher is reading another exercise.
   *
   * The document the run controls would execute belongs to the exercise the
   * student is on, not the one on screen — so rather than run the wrong code,
   * the controls are absent until the teacher is beside them again.
   */
  canRun: boolean;
  onRun: () => void;
  onRunSample: (index: number) => void;
  onTabChange: (tab: LiveOutputTab) => void;
  result: ResultChangedEvent | null;
  run: RunActivityPayload | null;
  runner: PythonRunnerState;
  sampleTestCases: LearnSampleTestCase[];
  studentName: string;
  tab: LiveOutputTab;
  /** The student's own terminal, mirrored. Read-only by construction. */
  terminal: TerminalTranscript;
  unreadStudentRun: boolean;
}) {
  const { t } = useTranslation('monitoring');

  const label = (name: LiveOutputTab) =>
    name === 'you' ? t('workspace.tab_you') : t('workspace.tab_student', { name: studentName });

  const selectRelativeTab = (current: LiveOutputTab, direction: -1 | 1) => {
    const index = tabs.indexOf(current);
    const next = tabs[(index + direction + tabs.length) % tabs.length]!;
    onTabChange(next);
    document.getElementById(`live-${next}-tab`)?.focus();
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-editor-bg">
      <div className="flex shrink-0 items-center gap-1 border-b border-white/10 bg-[#2d2d2d] px-2">
        <div className="flex min-w-0" role="tablist">
          {tabs.map((name) => (
            <button
              aria-controls={`live-${name}-panel`}
              aria-selected={tab === name}
              className={`relative max-w-[13rem] truncate px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                tab === name ? 'text-white' : 'text-[#a5a5a5] hover:text-white'
              }`}
              id={`live-${name}-tab`}
              key={name}
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
              {label(name)}
              {name === 'student' && unreadStudentRun && tab !== 'student' ? (
                <span className="absolute right-0.5 top-1 size-1.5 rounded-full bg-peer" />
              ) : null}
              {tab === name ? (
                <span
                  className={`absolute inset-x-2 bottom-0 h-0.5 rounded-full ${
                    name === 'you' ? 'bg-brand' : 'bg-peer'
                  }`}
                />
              ) : null}
            </button>
          ))}
        </div>

        {/* Running belongs to the teacher's tab: the control and its output sit
            in the same region, and neither one reaches the student. */}
        <div className="ml-auto flex shrink-0 items-center gap-1.5 py-1">
          {canRun ? (
            <RunControls
              activeSample={activeSample}
              onRun={onRun}
              onRunSample={onRunSample}
              onStop={runner.stop}
              ready={runner.ready}
              running={runner.running}
              sampleTestCases={sampleTestCases}
            />
          ) : null}
        </div>
      </div>

      <div
        aria-labelledby={`live-${tab}-tab`}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
        id={`live-${tab}-panel`}
        role="tabpanel"
      >
        {tab === 'you' ? (
          <>
            <p className="shrink-0 border-b border-white/10 px-3 py-1.5 font-mono text-[11.5px] text-[#8C8C8C]">
              {t('workspace.run_private')}
            </p>
            <div className="min-h-0 flex-1">
              <TerminalPanel
                awaitingInput={runner.awaitingInput}
                lines={runner.lines}
                onSubmitInput={runner.submitInput}
                supported={runner.supported}
              />
            </div>
          </>
        ) : (
          // The transcript is the content. The lifecycle line above it is
          // compact metadata — when it ran, how it ended, the latest verdict —
          // and deliberately does not restate the output underneath it.
          <>
            <div className="shrink-0">
              <StudentRunPanel result={result} run={run} />
            </div>
            <div className="min-h-0 flex-1">
              <TerminalPanel
                awaitingInput={terminal.awaitingInput}
                emptyHint={t('workspace.no_run')}
                lines={terminal.lines}
                mode="mirror"
                supported
                synchronizing={terminal.synchronizing}
                synchronizingLabel={t('workspace.mirror_catching_up')}
                waitingLabel={t('workspace.mirror_waiting')}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
