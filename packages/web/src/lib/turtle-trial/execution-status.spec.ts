import { describe, expect, it } from 'vitest';
import type { BrowserState } from './browser-execution';
import { turtleExecutionStatus } from './execution-status';

const browser: BrowserState = { ready: true, pending: false, running: false, state: 'IDLE', output: '', fullPython: false };
const defaults = { browserMode: false, browser, browserUnavailable: false, busy: false, error: false, session: null };

describe('Turtle execution feedback', () => {
  it.each([
    ['QUEUED', 'active', 'waiting_for_a_drawing_space'],
    ['STARTING', 'active', 'preparing_your_turtle_loading'],
    ['RUNNING', 'active', 'running_your_code'],
    ['DISPLAYING', 'success', 'your_drawing_is_ready'],
    ['WAITING_INPUT', 'warning', 'waiting_for_your_input'],
    ['STOPPED', 'neutral', 'stopped'],
    ['ERROR', 'danger', 'check_your_code'],
    ['TIMED_OUT', 'warning', 'time_is_up_you_can_run_again'],
    ['DISCONNECTED', 'warning', 'disconnected_please_run_again'],
  ])('explains native %s without implying a grading result', (state, tone, label) => {
    expect(turtleExecutionStatus({ ...defaults, session: { state } })).toMatchObject({ tone, label });
  });

  it('keeps browser completion visible while the unused spare prepares', () => {
    expect(turtleExecutionStatus({ ...defaults, browserMode: true, browser: { ...browser, state: 'DISPLAYING', ready: false } }))
      .toMatchObject({ tone: 'success', label: 'your_drawing_is_ready' });
  });

  it('does not present an unavailable browser grant as ready to run', () => {
    expect(turtleExecutionStatus({ ...defaults, browserMode: true, browserUnavailable: true }))
      .toMatchObject({ tone: 'warning', label: 'browser_unavailable' });
  });

  it('distinguishes preparation, admission, rendering and unsupported execution', () => {
    for (const [state, patch, label] of [
      ['IDLE', { ready: false }, 'preparing_your_turtle_loading'],
      ['ADMITTING', { pending: true }, 'connecting_loading'],
      ['RENDERING', { running: true }, 'running_your_code'],
      ['UNSUPPORTED', { fullPython: true }, 'browser_unavailable'],
    ] as const) {
      expect(turtleExecutionStatus({ ...defaults, browserMode: true, browser: { ...browser, ...patch, state } }).label).toBe(label);
    }
  });

  it('does not leave a success chip beside a failed request or unknown state', () => {
    expect(turtleExecutionStatus({ ...defaults, error: true, session: { state: 'DISPLAYING' } }).tone).toBe('danger');
    expect(turtleExecutionStatus({ ...defaults, session: { state: 'UNRECOGNIZED' } }).tone).toBe('warning');
  });
});
