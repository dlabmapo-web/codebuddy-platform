'use client';

import * as React from 'react';

import {
  InteractiveRunner,
  isInteractiveSupported,
} from '@/lib/pyodide/interactiveRunner';
import type { PythonExecutionError } from '@/lib/pyodide/pythonError';

import { createSampleInputQueue } from './sample-run';
import {
  appendToTranscript,
  emptyTranscript,
  settleTranscript,
  startTranscript,
  type TerminalKind,
  type TerminalLifecycle,
  type TerminalLine,
  type TerminalTranscript,
} from './terminal-transcript';

export type { TerminalKind, TerminalLine };

export type RunOutcome = {
  stdout: string;
  stopped: boolean;
  failed: boolean;
  error: PythonExecutionError | null;
};

/**
 * What happened to the terminal, for anybody who needs to know.
 *
 * The runner publishes the very events that redraw its own panel, so a
 * subscriber cannot see a different terminal from the one on screen. It is
 * deliberately ignorant of who subscribes: there is no socket, teacher,
 * academy, or monitoring concept anywhere in this module, and the mirroring
 * adapter is the thing that knows about all four.
 */
export type TerminalEvent =
  /** A new execution: the previous transcript is replaced by this banner. */
  | {
      type: 'reset';
      clientRunId: string;
      lines: TerminalLine[];
      sampleCount: number;
      awaitingInput: boolean;
    }
  /** Output, submitted input, errors, and narration, in the order shown. */
  | { type: 'append'; lines: TerminalLine[] }
  | { type: 'waiting'; awaitingInput: boolean }
  | {
      type: 'finish';
      lifecycle: Exclude<TerminalLifecycle, 'STARTED'>;
      passedCount: number;
      sampleCount: number;
    }
  /** The transcript no longer describes anything on screen. */
  | { type: 'clear' };

/** Batches worker chunks into one render per frame rather than one per write. */
const FLUSH_INTERVAL_MS = 40;

export function usePythonRunner() {
  const [transcript, setTranscript] =
    React.useState<TerminalTranscript>(emptyTranscript);
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
  const bufferRef = React.useRef<TerminalLine[]>([]);
  const flushTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // The transcript as the last commit left it. Socket handlers and worker
  // callbacks both need to read it outside a render, and reading state there
  // would give them whichever value their closure was created with.
  const transcriptRef = React.useRef<TerminalTranscript>(emptyTranscript);
  const listenersRef = React.useRef(new Set<(event: TerminalEvent) => void>());
  const runRef = React.useRef<{
    clientRunId: string;
    sampleCount: number;
    lifecycle: Exclude<TerminalLifecycle, 'STARTED'> | null;
  } | null>(null);
  // Filling the output budget has to end the run, and the flush that discovers
  // it is defined before the callback that ends one.
  const stopRef = React.useRef<() => void>(() => undefined);

  const supported = React.useMemo(
    () => (typeof window === 'undefined' ? true : isInteractiveSupported()),
    [],
  );

  const publish = React.useCallback((event: TerminalEvent) => {
    for (const listener of listenersRef.current) listener(event);
  }, []);

  const commit = React.useCallback((next: TerminalTranscript) => {
    transcriptRef.current = next;
    setTranscript(next);
  }, []);

  const flush = React.useCallback(() => {
    flushTimerRef.current = null;
    if (bufferRef.current.length === 0) return;
    const pending = bufferRef.current;
    bufferRef.current = [];

    const previous = transcriptRef.current;
    const next = appendToTranscript(previous, pending);
    commit(next);
    // The raw lines, not the reduced ones: the subscriber folds them through
    // the same reducer and therefore reaches the same transcript, truncation
    // boundary included.
    publish({ type: 'append', lines: pending });

    // A runaway `while True: print(x)` has now filled the budget. Ending the
    // run here is what keeps the tab responsive; the boundary line the reducer
    // wrote is already on both screens, and the cancelled lifecycle follows it
    // rather than leaving both terminals running forever.
    if (next.truncated && !previous.truncated) stopRef.current();
  }, [commit, publish]);

  const append = React.useCallback(
    (text: string, kind: TerminalKind) => {
      if (text === '') return;
      bufferRef.current.push({ text, kind });
      if (flushTimerRef.current === null) {
        flushTimerRef.current = setTimeout(flush, FLUSH_INTERVAL_MS);
      }
    },
    [flush],
  );

  /** Waiting is a state change, so pending output is on screen before it. */
  const setWaiting = React.useCallback(
    (value: boolean) => {
      flush();
      setAwaitingInput(value);
      commit({ ...transcriptRef.current, awaitingInput: value });
      publish({ type: 'waiting', awaitingInput: value });
    },
    [commit, flush, publish],
  );

  const finishRun = React.useCallback(
    (lifecycle: Exclude<TerminalLifecycle, 'STARTED'>) => {
      const run = runRef.current;
      if (!run) return;
      run.lifecycle = lifecycle;
      flush();
      commit({ ...transcriptRef.current, lifecycle, awaitingInput: false });
      publish({
        type: 'finish',
        lifecycle,
        passedCount: 0,
        sampleCount: run.sampleCount,
      });
    },
    [commit, flush, publish],
  );

  const ensureRunner = React.useCallback(() => {
    if (runnerRef.current && !runnerRef.current.isFailed) {
      return runnerRef.current;
    }
    runnerRef.current?.dispose();
    setReady(false);
    const runner = new InteractiveRunner();
    runnerRef.current = runner;

    runner.on((event) => {
      switch (event.type) {
        case 'ready':
          setReady(true);
          break;
        case 'stdout':
        case 'stderr': {
          if (transcriptRef.current.truncated) break;
          if (event.type === 'stdout') stdoutRef.current += event.text;
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
            setWaiting(true);
          }
          break;
        }
        case 'fatal':
          failedRef.current = true;
          append(event.text, 'err');
          // A failed preload must not leave the only action disabled behind a
          // permanent "Preparing" label. Enabling it gives the student an
          // explicit retry; `ensureRunner` replaces the failed worker.
          setReady(true);
          break;
        case 'done':
          break;
      }

      if (event.type === 'done' || event.type === 'fatal') {
        flush();
        setAwaitingInput(false);
        setRunning(false);
        finishRun(failedRef.current ? 'FAILED' : 'COMPLETED');
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
  }, [append, finishRun, flush, setWaiting]);

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
    (
      code: string,
      options?: {
        stdin?: string;
        banner?: TerminalLine[];
        /** Generated by the caller when it also reports the run elsewhere. */
        clientRunId?: string;
        /** How many public samples this run belongs to, zero for a plain run. */
        sampleCount?: number;
      },
    ) => {
      if (runnerRef.current?.isRunning) return Promise.resolve(null);

      stdoutRef.current = '';
      failedRef.current = false;
      errorRef.current = null;
      bufferRef.current = [];
      queueRef.current = options?.stdin
        ? createSampleInputQueue(options.stdin)
        : [];
      const clientRunId = options?.clientRunId ?? crypto.randomUUID();
      const sampleCount = options?.sampleCount ?? 0;
      const banner = options?.banner ?? [];
      runRef.current = { clientRunId, sampleCount, lifecycle: null };
      commit(
        startTranscript(transcriptRef.current, {
          clientRunId,
          lines: banner,
          sampleCount,
          awaitingInput: false,
        }),
      );
      publish({
        type: 'reset',
        clientRunId,
        lines: banner,
        sampleCount,
        awaitingInput: false,
      });
      setLastError(null);
      setAwaitingInput(false);
      setRunning(true);

      const runner = ensureRunner();
      return new Promise<RunOutcome>((resolve) => {
        finishRef.current = resolve;
        void runner.run(code);
      });
    },
    [commit, ensureRunner, publish],
  );

  const stop = React.useCallback(() => {
    const runner = runnerRef.current;
    if (!runner) return;
    runner.stop();
    flush();
    setRunning(false);
    setAwaitingInput(false);
    finishRun('CANCELLED');
    // `stop()` terminates the worker, so no `done` event arrives — the pending
    // promise has to be settled here or the caller waits forever.
    finishRef.current?.({
      stdout: stdoutRef.current,
      stopped: true,
      failed: failedRef.current,
      error: errorRef.current,
    });
    finishRef.current = null;
  }, [finishRun, flush]);

  React.useEffect(() => {
    stopRef.current = stop;
  }, [stop]);

  const submitInput = React.useCallback(
    (value: string) => {
      setAwaitingInput(false);
      // Only after the student presses Enter. A draft in the field is theirs
      // alone, and there is no event that could carry one.
      append(`${value}\n`, 'in');
      commit({ ...transcriptRef.current, awaitingInput: false });
      publish({ type: 'waiting', awaitingInput: false });
      runnerRef.current?.provideInput(value);
    },
    [append, commit, publish],
  );

  const appendLine = React.useCallback(
    (text: string, kind: TerminalKind) => {
      append(text, kind);
      flush();
    },
    [append, flush],
  );

  /**
   * The verdict, once the comparison has been made.
   *
   * A sample run's pass count exists only after its output has been compared,
   * which happens after the narration is on screen — so the lifecycle line is
   * refined here rather than guessed at when the worker stopped.
   */
  const settleRun = React.useCallback(
    (settlement: {
      passedCount: number;
      lifecycle?: Exclude<TerminalLifecycle, 'STARTED'>;
    }) => {
      const run = runRef.current;
      if (!run?.lifecycle) return;
      flush();
      const lifecycle = settlement.lifecycle ?? run.lifecycle;
      run.lifecycle = lifecycle;
      commit(
        settleTranscript(transcriptRef.current, {
          lifecycle,
          passedCount: settlement.passedCount,
          sampleCount: run.sampleCount,
        }),
      );
      publish({
        type: 'finish',
        lifecycle,
        passedCount: settlement.passedCount,
        sampleCount: run.sampleCount,
      });
    },
    [commit, flush, publish],
  );

  const clear = React.useCallback(() => {
    bufferRef.current = [];
    runRef.current = null;
    commit(emptyTranscript);
    publish({ type: 'clear' });
  }, [commit, publish]);

  /**
   * A terminal subscription, for anything that needs the same events the panel
   * draws. Returns its own removal, so a subscriber cannot outlive its effect.
   */
  const subscribeTerminal = React.useCallback(
    (listener: (event: TerminalEvent) => void) => {
      listenersRef.current.add(listener);
      return () => {
        listenersRef.current.delete(listener);
      };
    },
    [],
  );

  /** The current transcript, read outside React for a snapshot response. */
  const readTranscript = React.useCallback(() => transcriptRef.current, []);

  return {
    lines: transcript.lines,
    transcript,
    running,
    awaitingInput,
    ready,
    supported,
    lastError,
    run,
    stop,
    submitInput,
    appendLine,
    settleRun,
    subscribeTerminal,
    readTranscript,
    clear,
  };
}

export type PythonRunnerState = ReturnType<typeof usePythonRunner>;
