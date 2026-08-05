'use client';

import * as React from 'react';

import {
  InteractiveRunner,
  isInteractiveSupported,
} from '@/lib/pyodide/interactiveRunner';
import type { PythonExecutionError } from '@/lib/pyodide/pythonError';

import { createSampleInputQueue } from './sample-run';

export type TerminalKind = 'out' | 'err' | 'in' | 'meta' | 'info';
export type TerminalLine = { text: string; kind: TerminalKind };

export type RunOutcome = {
  stdout: string;
  stopped: boolean;
  failed: boolean;
  error: PythonExecutionError | null;
};

/** Stops a runaway `while True: print(x)` from filling the tab's memory. */
const MAX_OUTPUT_BYTES = 512 * 1024;
/** Batches worker chunks into one render per frame rather than one per write. */
const FLUSH_INTERVAL_MS = 40;

export function usePythonRunner() {
  const [lines, setLines] = React.useState<TerminalLine[]>([]);
  const [running, setRunning] = React.useState(false);
  const [awaitingInput, setAwaitingInput] = React.useState(false);
  const [ready, setReady] = React.useState(false);
  const [lastError, setLastError] = React.useState<PythonExecutionError | null>(
    null,
  );

  const runnerRef = React.useRef<InteractiveRunner | null>(null);
  const finishRef = React.useRef<((outcome: RunOutcome) => void) | null>(null);
  const stdoutRef = React.useRef('');
  const failedRef = React.useRef(false);
  const errorRef = React.useRef<PythonExecutionError | null>(null);
  const queueRef = React.useRef<string[]>([]);
  const truncatedRef = React.useRef(false);
  const bufferRef = React.useRef<TerminalLine[]>([]);
  const flushTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const supported = React.useMemo(
    () => (typeof window === 'undefined' ? true : isInteractiveSupported()),
    [],
  );

  const flush = React.useCallback(() => {
    flushTimerRef.current = null;
    if (bufferRef.current.length === 0) return;
    const pending = bufferRef.current;
    bufferRef.current = [];
    setLines((current) => [...current, ...pending]);
  }, []);

  const append = React.useCallback(
    (text: string, kind: TerminalKind) => {
      bufferRef.current.push({ text, kind });
      if (flushTimerRef.current === null) {
        flushTimerRef.current = setTimeout(flush, FLUSH_INTERVAL_MS);
      }
    },
    [flush],
  );

  const ensureRunner = React.useCallback(() => {
    if (runnerRef.current && !runnerRef.current.isFailed) {
      return runnerRef.current;
    }
    const runner = new InteractiveRunner();
    runnerRef.current = runner;

    runner.on((event) => {
      switch (event.type) {
        case 'ready':
          setReady(true);
          break;
        case 'stdout':
        case 'stderr': {
          if (truncatedRef.current) break;
          if (event.type === 'stdout') stdoutRef.current += event.text;
          if (stdoutRef.current.length > MAX_OUTPUT_BYTES) {
            truncatedRef.current = true;
            append('\n[output truncated]\n', 'info');
            runner.stop();
            break;
          }
          append(event.text, event.type === 'stdout' ? 'out' : 'err');
          break;
        }
        case 'pythonError':
          failedRef.current = true;
          errorRef.current = event.error;
          setLastError(event.error);
          append(event.error.display, 'err');
          break;
        case 'stdin': {
          // A queued sample answers automatically; otherwise the student is
          // prompted, exactly as a terminal would.
          const next = queueRef.current.shift();
          if (next !== undefined) {
            append(`${next}\n`, 'in');
            runner.provideInput(next);
          } else {
            setAwaitingInput(true);
          }
          break;
        }
        case 'fatal':
          failedRef.current = true;
          append(event.text, 'err');
          break;
        case 'done':
          break;
      }

      if (event.type === 'done' || event.type === 'fatal') {
        flush();
        setAwaitingInput(false);
        setRunning(false);
        finishRef.current?.({
          stdout: stdoutRef.current,
          stopped: false,
          failed: failedRef.current,
          error: errorRef.current,
        });
        finishRef.current = null;
      }
    });

    return runner;
  }, [append, flush]);

  /**
   * Pyodide is ~13 MB. v1 began loading it on the first Run click, leaving the
   * student watching a spinner; starting on mount uses the time they spend
   * reading the problem instead.
   */
  React.useEffect(() => {
    if (!supported) return;
    const runner = ensureRunner();
    void runner.whenReady().then(() => setReady(!runner.isFailed));
    return () => {
      runner.dispose();
      runnerRef.current = null;
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    };
  }, [ensureRunner, supported]);

  const run = React.useCallback(
    (code: string, options?: { stdin?: string; banner?: TerminalLine[] }) => {
      if (runnerRef.current?.isRunning) return Promise.resolve(null);

      stdoutRef.current = '';
      failedRef.current = false;
      errorRef.current = null;
      truncatedRef.current = false;
      bufferRef.current = [];
      queueRef.current = options?.stdin
        ? createSampleInputQueue(options.stdin)
        : [];
      setLines(options?.banner ?? []);
      setLastError(null);
      setAwaitingInput(false);
      setRunning(true);

      const runner = ensureRunner();
      return new Promise<RunOutcome>((resolve) => {
        finishRef.current = resolve;
        void runner.run(code);
      });
    },
    [ensureRunner],
  );

  const stop = React.useCallback(() => {
    const runner = runnerRef.current;
    if (!runner) return;
    runner.stop();
    flush();
    setRunning(false);
    setAwaitingInput(false);
    // `stop()` terminates the worker, so no `done` event arrives — the pending
    // promise has to be settled here or the caller waits forever.
    finishRef.current?.({
      stdout: stdoutRef.current,
      stopped: true,
      failed: failedRef.current,
      error: errorRef.current,
    });
    finishRef.current = null;
  }, [flush]);

  const submitInput = React.useCallback((value: string) => {
    setAwaitingInput(false);
    append(`${value}\n`, 'in');
    runnerRef.current?.provideInput(value);
  }, [append]);

  const appendLine = React.useCallback(
    (text: string, kind: TerminalKind) => {
      append(text, kind);
      flush();
    },
    [append, flush],
  );

  return {
    lines,
    running,
    awaitingInput,
    ready,
    supported,
    lastError,
    run,
    stop,
    submitInput,
    appendLine,
    clear: () => setLines([]),
  };
}

export type PythonRunnerState = ReturnType<typeof usePythonRunner>;
