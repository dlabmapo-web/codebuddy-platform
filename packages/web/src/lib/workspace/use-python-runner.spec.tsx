// @vitest-environment happy-dom
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { RunnerEvent } from '@/lib/pyodide/interactiveRunner';
import { usePythonRunner, type PythonRunnerState } from './use-python-runner';

/** The Python worker, reduced to what the hook asks of it and what it hears back. */
const worker = vi.hoisted(() => {
  class FakeRunner {
    static current: FakeRunner;
    readonly listeners = new Set<(event: unknown) => void>();
    /** What the program received on stdin, `<EOF>` for end of input. */
    readonly stdin: string[] = [];
    running = false;
    constructor() { FakeRunner.current = this; }
    on(listener: (event: unknown) => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
    emit(event: unknown) {
      if ((event as { type: string }).type === 'done') this.running = false;
      for (const listener of [...this.listeners]) listener(event);
    }
    get isReady() { return true; }
    get isRunning() { return this.running; }
    get isFailed() { return false; }
    whenReady() { return Promise.resolve(); }
    async run() { this.running = true; }
    provideInput(line: string) { this.stdin.push(line); }
    sendEOF() { this.stdin.push('<EOF>'); }
    stop() { this.running = false; }
    dispose() {}
  }
  return { FakeRunner };
});
vi.mock('@/lib/pyodide/interactiveRunner', () => ({ InteractiveRunner: worker.FakeRunner, isInteractiveSupported: () => true }));
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

let runner: PythonRunnerState;
const roots: Array<ReturnType<typeof createRoot>> = [];
function Probe({ onRender }: { onRender: (state: PythonRunnerState) => void }) {
  const state = usePythonRunner();
  useEffect(() => { onRender(state); });
  return null;
}

beforeEach(async () => {
  const root = createRoot(document.createElement('div')); roots.push(root);
  await act(() => root.render(<Probe onRender={(state) => { runner = state; }} />));
});
afterEach(async () => { for (const root of roots.splice(0)) await act(() => root.unmount()); });

const program = () => worker.FakeRunner.current;
/** The program calls `input()` once. */
const read = () => act(() => { program().emit({ type: 'stdin' } satisfies RunnerEvent); });
const echoed = () => runner.lines.filter((line) => line.kind === 'in').map((line) => line.text).join('');
async function start() {
  await act(async () => { void runner.run('n = int(input())'); });
  await read();
  expect(runner.awaitingInput).toBe(true);
}

it('feeds a pasted example to successive input() calls without asking again', async () => {
  await start();
  act(() => { for (const line of ['4 6', '101111', '101010']) runner.submitInput(line); });
  expect(program().stdin).toEqual(['4 6']);
  expect(runner.awaitingInput).toBe(false);

  await read();
  await read();
  expect(program().stdin).toEqual(['4 6', '101111', '101010']);
  expect(runner.awaitingInput).toBe(false);

  await read();
  expect(runner.awaitingInput).toBe(true);
  // Echoed once each, when pasted, as a terminal echoes what is typed.
  expect(echoed()).toBe('4 6\n101111\n101010\n');
});

it('ends input after the pasted lines when the person presses End input', async () => {
  await start();
  act(() => { runner.submitInput('1'); runner.submitInput('2'); runner.endInput(); });
  await read();
  await read();
  expect(program().stdin).toEqual(['1', '2', '<EOF>']);
});

it('drops lines a finished program never read before the next run', async () => {
  await start();
  act(() => { runner.submitInput('1'); runner.submitInput('unread'); });
  await act(() => { program().emit({ type: 'done' } satisfies RunnerEvent); });
  await start();
  expect(program().stdin).toEqual(['1']);
});

it('still answers a test run from its sample alone', async () => {
  await act(async () => { void runner.run('print(input())', { stdin: '5\n' }); });
  await read();
  await read();
  expect(program().stdin).toEqual(['5', '<EOF>']);
  expect(runner.awaitingInput).toBe(false);
});
