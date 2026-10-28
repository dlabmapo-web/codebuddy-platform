'use client';

import { CircleAlert, CircleCheck, Eraser, Keyboard, LoaderCircle, Moon, Play, Square, Sun } from 'lucide-react';
import type { ReactNode } from 'react';
import type { BrowserState } from '@/lib/turtle-trial/browser-execution';
import type { TurtleExecutionStatus } from '@/lib/turtle-trial/execution-status';
import { useTurtleTranslation } from './use-turtle-translation';
import styles from './turtle-trial.module.css';

type EditorTheme = 'light' | 'paircode-dark';
const statusIcons = { play: Play, spinner: LoaderCircle, check: CircleCheck, input: Keyboard, stop: Square, alert: CircleAlert };

export function TurtleToolbar({ runDisabled, runPending, stopDisabled, clearDisabled, theme, status, browser, onRun, onStop, onClear, onThemeChange, children }: {
  runDisabled: boolean;
  runPending: boolean;
  stopDisabled: boolean;
  clearDisabled: boolean;
  theme: EditorTheme;
  status: TurtleExecutionStatus;
  browser?: BrowserState;
  onRun: () => void;
  onStop: () => void;
  onClear: () => void;
  onThemeChange: (theme: EditorTheme) => void;
  children?: ReactNode;
}) {
  const { t } = useTurtleTranslation();
  const StatusIcon = statusIcons[status.icon];
  return <nav className={styles.toolbar} aria-label={t('execution_controls')}>
    <div className={styles.executionActions}>
      <button type="button" className={styles.run} disabled={runDisabled} onClick={onRun}>
        {runPending ? <LoaderCircle className={styles.spinner} aria-hidden="true" /> : <Play fill="currentColor" aria-hidden="true" />}
        {runPending ? t('please_wait') : t('run')}
      </button>
      <button type="button" className={styles.stop} disabled={stopDisabled} onClick={onStop}>
        <Square fill="currentColor" aria-hidden="true" />{t('stop')}
      </button>
      <button type="button" className={styles.clear} disabled={clearDisabled} onClick={onClear} title={t('clear_drawing_and_output')}>
        <Eraser aria-hidden="true" />{t('clear')}
      </button>
    </div>
    {children && <div className={styles.runtimeActions}>{children}</div>}
    <div className={styles.toolbarFeedback}>
      <span className={styles.runStatus} role="status" aria-live="polite" aria-atomic="true" data-tone={status.tone}
        data-runtime-phase={browser?.state} data-first-stroke-ms={browser?.firstStrokeMs}
        data-admission-ms={browser?.admissionMs} data-dispatch-to-stroke-ms={browser?.dispatchToStrokeMs}>
        <StatusIcon className={status.icon === 'spinner' ? styles.spinner : undefined} aria-hidden="true" />
        <span>{t(status.label)}</span>
      </span>
      <div className={styles.editorTheme} role="group" aria-label={t('editor_theme')}>
        <button type="button" aria-pressed={theme === 'light'} onClick={() => onThemeChange('light')}><Sun aria-hidden="true" />{t('light')}</button>
        <button type="button" aria-pressed={theme === 'paircode-dark'} onClick={() => onThemeChange('paircode-dark')}><Moon aria-hidden="true" />{t('dark')}</button>
      </div>
    </div>
  </nav>;
}
