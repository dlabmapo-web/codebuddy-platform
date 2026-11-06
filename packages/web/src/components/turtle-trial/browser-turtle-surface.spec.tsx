// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { turtleBrowserProfileId, turtleHelperVersion, type TurtleBrowserProfile, type TurtleBrowserRun } from '@cove/shared';
import { BrowserTurtleExecution } from '@/lib/turtle-trial/browser-execution';
import type { turtleRequest } from '@/lib/turtle-trial/client';
import { BrowserTurtleSurface, runtimeRestartDelaysMs } from './browser-turtle-surface';

const profile: TurtleBrowserProfile = { engine: 'browser', profile: turtleBrowserProfileId, protocol: 1, origin: 'https://runtime.example', runtimeId: 'brython-3.15.0-aaaaaaaaaaaaaaaaaaaa', helperVersion: turtleHelperVersion };
const admitted = (requestKey: string): TurtleBrowserRun => ({ engine: 'browser', requestKey, id: crypto.randomUUID(), state: 'ACTIVE', expiresAt: Date.now() + 120000, leaseUntil: Date.now() + 30000, leaseMs: 30000, profile });

/** Stands in for the isolated runtime frame: records every port and message it receives. */
type FakeFrame = { ports: MessagePort[]; received: Array<Record<string, unknown>>; reply(kind: string): void };
let frames: Map<HTMLIFrameElement, FakeFrame>;
let host: HTMLDivElement, root: Root, execution: BrowserTurtleExecution;
const frameOf = (element: HTMLIFrameElement): FakeFrame => {
  let frame = frames.get(element);
  if (!frame) {
    const created: FakeFrame = { ports: [], received: [], reply: kind => created.ports.at(-1)?.postMessage({ version: 1, kind }) };
    frames.set(element, frame = created);
  }
  return frame;
};
const iframe = () => host.querySelector('iframe');
/** Lets MessageChannel deliveries and React updates land; timers stay fake. */
const settle = () => act(async () => { for (let i = 0; i < 3; i++) { await new Promise(resolve => setImmediate(resolve)); await vi.advanceTimersByTimeAsync(0); } });
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const sentKinds = () => [...frames.values()].flatMap(frame => frame.received.map(message => message.kind));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  // The frame is simulated below; never fetch its page from the network.
  (window as unknown as { happyDOM: { settings: { disableIframePageLoading: boolean } } }).happyDOM.settings.disableIframePageLoading = true;
  frames = new Map();
  vi.spyOn(HTMLIFrameElement.prototype, 'contentWindow', 'get').mockImplementation(function (this: HTMLIFrameElement) {
    const frame = frameOf(this);
    return { postMessage: (message: { kind: string }, _origin: string, transfer: MessagePort[]) => {
      if (message.kind !== 'connect') return;
      const port = transfer[0]!;
      port.onmessage = event => frame.received.push(event.data);
      frame.ports.push(port);
    } } as unknown as Window;
  });
  const request = vi.fn(async (_path: string, method?: string, data?: unknown) => method === 'POST' ? admitted((data as { requestKey: string }).requestKey) : {});
  execution = new BrowserTurtleExecution(vi.fn(), vi.fn(), request as unknown as typeof turtleRequest);
  execution.configure(profile);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount()); host.remove(); execution.dispose();
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});

const mount = () => act(async () => root.render(<BrowserTurtleSurface profile={profile} execution={execution} visible title="Drawing" />));

it('keeps the frame when a stop is requested before it connects, as a fast bootstrap does', async () => {
  await mount();
  // Bootstrap answered before the frame was listening, then the handshake
  // replaced the port it would have used.
  await act(async () => { await execution.stop(); });
  await advance(300);
  await settle();
  expect(iframe()).not.toBeNull();
  expect(frameOf(iframe()!).ports.length).toBeGreaterThan(1);

  frameOf(iframe()!).reply('connected');
  frameOf(iframe()!).reply('ready');
  await settle();
  await advance(1_000);

  expect(iframe()).not.toBeNull();
  expect(sentKinds()).not.toContain('stop');
  expect(sentKinds()).not.toContain('dispose');
  expect(execution.state).toMatchObject({ ready: true, state: 'IDLE', runtimeFailed: false });
});

it('replaces a frame whose running program does not confirm stop, then runs again without a reload', async () => {
  await mount();
  const first = iframe()!;
  frameOf(first).reply('connected'); frameOf(first).reply('ready');
  await settle();
  await act(async () => { await execution.run('while True: pass', 'free'); });
  await settle();
  expect(frameOf(first).received).toContainEqual(expect.objectContaining({ kind: 'run' }));

  await act(async () => { void execution.stop(); });
  await settle();
  await advance(100);
  await settle();
  expect(iframe()).toBeNull();

  await advance(runtimeRestartDelaysMs[0]!);
  await settle();
  const second = iframe()!;
  expect(second).not.toBe(first);
  frameOf(second).reply('connected'); frameOf(second).reply('ready');
  await settle();
  expect(execution.state).toMatchObject({ ready: true, running: false, runtimeFailed: false });
});

it('reports the runtime unavailable only after its automatic replacements also fail', async () => {
  await mount();
  for (const delay of runtimeRestartDelaysMs) {
    frameOf(iframe()!).reply('prepare-failed');
    await settle();
    expect(iframe()).toBeNull();
    expect(execution.state.runtimeFailed).toBe(false);
    await advance(delay);
    await settle();
  }
  frameOf(iframe()!).reply('prepare-failed');
  await settle();
  await advance(10_000);

  expect(iframe()).toBeNull();
  expect(execution.state).toMatchObject({ ready: false, runtimeFailed: true });
});

it('replaces a frame that never connects', async () => {
  await mount();
  const first = iframe()!;
  await advance(12_000);
  await settle();
  expect(iframe()).toBeNull();
  await advance(runtimeRestartDelaysMs[0]!);
  await settle();
  expect(iframe()).not.toBe(first);
  expect(iframe()).not.toBeNull();
});
