'use client';

import * as React from 'react';

import {
  InteractiveRunner,
  isInteractiveSupported,
} from '@/lib/pyodide/interactiveRunner';
import type { PythonExecutionError } from '@/lib/pyodide/pythonError';

import {
  answerStdinRequest,
  createRunId,
  createSampleInputQueue,
} from './sample-run';
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

/**
 * How a raised exception is written into the transcript.
 *
 * A callback rather than something this hook does itself: the terminal shows
 * the explanation in the reader's language, and the copy for that lives in a
 * page-scoped i18n namespace the route mounts. Passing it in keeps this module
 * free of translation and leaves the teacher's private runner — which mounts a
 * different namespace — on the raw traceback.
 */
export type PythonErrorFormatter = (
  error: PythonExecutionError,
  /** The source that was run, so the failing line can be quoted. */
  code: string,
) => TerminalLine[];

export function usePythonRunner(options?: {
  formatError?: PythonErrorFormatter;
}) {
  const [transcript, setTranscript] =
    React.useState<TerminalTranscript>(emptyTranscript);
  const [running, setRunning] = React.useState(false);
  const [awaitingInput, setAwaitingInput] = React.useState(false);
  const [ready, setReady] = React.useState(false);
  /** The error the coach is explaining, until the next run replaces it. */
  const [lastError, setLastError] = React.useState<PythonExecutionError | null>(
    null,
  );

  const runnerRef = React.useRef<InteractiveRunner | null>(null);
  // Read at error time rather than closed over: `ensureRunner` subscribes once
  // and must not be rebuilt every time a new `t` arrives.
  const formatErrorRef = React.useRef(options?.formatError);
  /** The source of the run in flight, for the formatter to quote. */
  const ranCodeRef = React.useRef('');
  const finishRef = React.useRef<((outcome: RunOutcome) => void) | null>(null);
  const stdoutRef = React.useRef('');
  const failedRef = React.useRef(false);
  const errorRef = React.useRef<PythonExecutionError | null>(null);
  /** The run's own stdin, or `null` when the student is to be prompted. */
  const queueRef = React.useRef<string[] | null>(null);
  /**
   * End of input the student asked for while the program was not yet waiting —
   * Ctrl+D right after a partial line. Delivered on the next read: an EOF
   * written before the worker asks is overwritten by the ask itself.
   */
  const eofPendingRef = React.useRef(false);
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
    const runner = new InteractiveRunner({ interactive: supported });
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
        case 'pythonError': {
          failedRef.current = true;
          errorRef.current = event.error;
          setLastError(event.error);
          const written = formatErrorRef.current?.(
            event.error,
            ranCodeRef.current,
          );
          if (written) {
            for (const line of written) append(line.text, line.kind);
          } else {
            append(event.error.display, 'err');
          }
          break;
        }
        case 'stdin': {
          // A queued sample answers automatically and ends in EOF, as the
          // judge's stdin does; a plain run prompts the student, exactly as a
          // terminal would.
          if (eofPendingRef.current) {
            eofPendingRef.current = false;
            runner.sendEOF();
            break;
          }
          const answer = answerStdinRequest(queueRef.current);
          if (answer.kind === 'line') {
            append(`${answer.line}\n`, 'in');
            runner.provideInput(answer.line);
          } else if (answer.kind === 'eof') {
            runner.sendEOF();
          } else {
            setWaiting(true);
          }
          break;
        }
        case 'stdinServed':
          append(`${event.text}\n`, 'in');
          break;
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
  }, [append, finishRun, flush, setWaiting, supported]);

  /**
   * Pyodide is ~13 MB. v1 began loading it on the first Run click, leaving the
   * student watching a spinner; starting on mount uses the time they spend
   * reading the problem instead.
   *
   * Preloaded whether or not the page is cross-origin isolated: without it the
   * runner works in buffered mode, and a Run button left on "Preparing…"
   * forever would be worse than the one capability that mode lacks.
   */
  React.useEffect(() => {
    const runner = ensureRunner();
    void runner.whenReady().then(() => setReady(!runner.isFailed));
    return () => {
      runner.dispose();
      runnerRef.current = null;
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    };
  }, [ensureRunner]);

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
      // Supplied stdin — an empty sample input included — is all the program
      // gets; only a run without any is interactive.
      eofPendingRef.current = false;
      queueRef.current =
        options?.stdin === undefined
          ? null
          : createSampleInputQueue(options.stdin);
      ranCodeRef.current = code;
      setLastError(null);
      const clientRunId = options?.clientRunId ?? createRunId();
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
      setAwaitingInput(false);
      setRunning(true);

      const runner = ensureRunner();
      return new Promise<RunOutcome>((resolve) => {
        finishRef.current = resolve;
        void runner.run(code, options?.stdin);
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

  React.useEffect(() => {
    formatErrorRef.current = options?.formatError;
  }, [options?.formatError]);

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

  /**
   * Ctrl+D: the student has nothing more to type.
   *
   * Without it a program reading to EOF — `sys.stdin.read()`,
   * `for line in sys.stdin` — could never finish a plain run.
   */
  const endInput = React.useCallback(() => {
    const waiting = transcriptRef.current.awaitingInput;
    append('^D\n', 'in');
    if (!waiting) {
      eofPendingRef.current = true;
      return;
    }
    setAwaitingInput(false);
    commit({ ...transcriptRef.current, awaitingInput: false });
    publish({ type: 'waiting', awaitingInput: false });
    runnerRef.current?.sendEOF();
  }, [append, commit, publish]);

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
    // The error goes with the transcript it belongs to. Navigating to another
    // exercise clears the terminal, and an explanation left behind would offer
    // to explain code that is no longer on screen.
    // The error goes with the transcript it belongs to: navigating to another
    // exercise must not leave the coach explaining code that is gone.
    failedRef.current = false;
    errorRef.current = null;
    setLastError(null);
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
    endInput,
    appendLine,
    settleRun,
    subscribeTerminal,
    readTranscript,
    clear,
  };
}

export type PythonRunnerState = ReturnType<typeof usePythonRunner>;
