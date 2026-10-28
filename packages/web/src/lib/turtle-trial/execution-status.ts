import type { TurtleSession } from '@cove/shared';
import type en from '@cove/i18n/locales/en/turtle-trial.json';
import type { BrowserState } from './browser-execution';

export type TurtleExecutionStatus = {
  tone: 'neutral' | 'active' | 'success' | 'warning' | 'danger';
  icon: 'play' | 'spinner' | 'check' | 'input' | 'stop' | 'alert';
  label: keyof typeof en;
};

const nativeStates: Record<string, TurtleExecutionStatus> = {
  QUEUED: { tone: 'active', icon: 'spinner', label: 'waiting_for_a_drawing_space' },
  STARTING: { tone: 'active', icon: 'spinner', label: 'preparing_your_turtle_loading' },
  RUNNING: { tone: 'active', icon: 'spinner', label: 'running_your_code' },
  DISPLAYING: { tone: 'success', icon: 'check', label: 'your_drawing_is_ready' },
  WAITING_INPUT: { tone: 'warning', icon: 'input', label: 'waiting_for_your_input' },
  STOPPED: { tone: 'neutral', icon: 'stop', label: 'stopped' },
  TIMED_OUT: { tone: 'warning', icon: 'alert', label: 'time_is_up_you_can_run_again' },
  ERROR: { tone: 'danger', icon: 'alert', label: 'check_your_code' },
  OUTPUT_LIMIT: { tone: 'warning', icon: 'alert', label: 'stopped_because_output_was_too_large' },
  QUEUE_EXPIRED: { tone: 'warning', icon: 'alert', label: 'the_queue_expired_please_run_again' },
  DISCONNECTED: { tone: 'warning', icon: 'alert', label: 'disconnected_please_run_again' },
};

export function turtleExecutionStatus({ browserMode, browser, browserUnavailable, busy, error, session }: {
  browserMode: boolean;
  browser: BrowserState;
  browserUnavailable: boolean;
  busy: boolean;
  error: boolean;
  session: Pick<TurtleSession, 'state'> | null;
}): TurtleExecutionStatus {
  if (error) return { tone: 'danger', icon: 'alert', label: 'needs_attention' };
  if (busy) return { tone: 'active', icon: 'spinner', label: 'please_wait' };
  if (!browserMode) return session
    ? nativeStates[session.state] ?? { tone: 'warning', icon: 'alert', label: 'needs_attention' }
    : { tone: 'neutral', icon: 'play', label: 'ready_to_run' };
  if (browserUnavailable) return { tone: 'warning', icon: 'alert', label: 'browser_unavailable' };
  // A spare preparing after completion must not replace the completed result.
  if (browser.state === 'DISPLAYING') return nativeStates.DISPLAYING!;
  if (browser.state === 'STOPPED') return nativeStates.STOPPED!;
  if (browser.state === 'EXPIRED') return nativeStates.TIMED_OUT!;
  if (browser.state === 'ERROR') return nativeStates.ERROR!;
  if (browser.state === 'UNSUPPORTED' || browser.fullPython)
    return { tone: 'warning', icon: 'alert', label: 'browser_unavailable' };
  if (browser.pending || browser.state === 'ADMITTING')
    return { tone: 'active', icon: 'spinner', label: 'connecting_loading' };
  if (browser.running || browser.state === 'COMPUTING' || browser.state === 'RENDERING') return nativeStates.RUNNING!;
  if (!browser.ready || browser.state === 'STARTING') return nativeStates.STARTING!;
  return { tone: 'neutral', icon: 'play', label: 'ready_to_run' };
}
