import { afterEach, describe, expect, it, vi } from 'vitest';
import { turtleBrowserProfileId, turtleHelperVersion, turtleStarters, type TurtleBrowserRun, type TurtleBrowserProfile } from '@cove/shared';
import { BrowserTurtleExecution } from './browser-execution';
import { TurtleRequestError, type turtleRequest } from './client';
import { turtleBrowserConfig, turtleBrowserAccess } from './browser-config';
import { turtleProject } from './project';
import { strFromU8, unzipSync } from 'fflate';

const profile: TurtleBrowserProfile = { engine: 'browser', profile: turtleBrowserProfileId, protocol: 1, origin: 'https://runtime.example', runtimeId: 'brython-3.15.0-aaaaaaaaaaaaaaaaaaaa', helperVersion: turtleHelperVersion };
const run = (key: string): TurtleBrowserRun => ({ engine: 'browser', requestKey: key, id: crypto.randomUUID(), state: 'ACTIVE', expiresAt: Date.now() + 120000, leaseUntil: Date.now() + 30000, leaseMs: 30000, profile });
const deferred = <T>() => { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const alive: BrowserTurtleExecution[] = [];
function setup(request = vi.fn(async (_path: string, method?: string, data?: unknown): Promise<unknown> => method === 'POST' ? run((data as { requestKey: string }).requestKey) : {})) {
  const changed = vi.fn(), error = vi.fn(), bridge = { ready: true, send: vi.fn() };
  const execution = new BrowserTurtleExecution(changed, error, request as typeof turtleRequest);
  execution.configure(profile); execution.attach(bridge); alive.push(execution);
  return { execution, changed, error, bridge, request };
}
afterEach(() => { for (const e of alive.splice(0)) e.dispose(); vi.useRealTimers(); });
describe('browser execution authority and lifecycle', () => {
  it('sends only frozen metadata to admission and source only to the isolated surface', async () => {
    const { execution, bridge, request } = setup();
    await execution.run('print("private")', 'drawing');
    expect(request.mock.calls[0][2]).toMatchObject({ profile: turtleBrowserProfileId, sourceHash: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(JSON.stringify(request.mock.calls)).not.toContain('private');
    expect(bridge.send).toHaveBeenCalledWith(expect.objectContaining({ kind: 'run', source: 'print("private")' }));
    expect(execution.state.running).toBe(true);
  });
  it('terminates immediately during pending admission and retires a late success without executing', async () => {
    const admitted = deferred<unknown>(), started = deferred<void>(); let key = '';
    const request = vi.fn(async (_p: string, method?: string, data?: unknown) => { if (method === 'POST') { key = (data as { requestKey: string }).requestKey; started.resolve(); return admitted.promise; } return {}; });
    const { execution, bridge } = setup(request);
    const start = execution.run('while True: pass', 'free'); await started.promise;
    const stopped = execution.stop();
    expect(bridge.send).toHaveBeenCalledWith(expect.objectContaining({ kind: 'stop' }));
    admitted.resolve(run(key)); await start; expect(await stopped).toBe(true);
    expect(bridge.send.mock.calls.filter(([e]) => e.kind === 'run')).toHaveLength(0);
    expect(request.mock.calls.filter(([,method]) => method === 'DELETE')).toHaveLength(1);
  });
  it('retries a lost reply with the same UUID and hash and dispatches only once', async () => {
    let tries = 0;
    const request = vi.fn(async (_p: string, method?: string, data?: unknown) => {
      if (method !== 'POST') return {};
      if (++tries === 1) throw new TurtleRequestError('TRIAL_UNAVAILABLE', 503);
      return run((data as { requestKey: string }).requestKey);
    });
    const { execution, bridge } = setup(request);
    await execution.run('print(1)', 'free'); await execution.run('print(1)', 'free');
    expect(request.mock.calls[0][2]).toEqual(request.mock.calls[1][2]);
    expect(bridge.send.mock.calls.filter(([e]) => e.kind === 'run')).toHaveLength(1);
    expect(bridge.send).toHaveBeenCalledWith(expect.objectContaining({ kind: 'run', source: 'print(1)' }));
  });
  it('reconciles an uncertain old editor version before executing newly edited code', async () => {
    let tries = 0;
    const request = vi.fn(async (_p: string, method?: string, data?: unknown) => {
      if (method !== 'POST') return {};
      if (++tries === 1) throw new TurtleRequestError('TRIAL_UNAVAILABLE', 503);
      return run((data as { requestKey: string }).requestKey);
    });
    const { execution, bridge } = setup(request);
    await execution.run('print(1)', 'free'); await execution.run('print(2)', 'free');
    const posts = request.mock.calls.filter(([,m]) => m === 'POST');
    expect(posts[0][2]).toEqual(posts[1][2]); expect(posts[2][2]).not.toEqual(posts[1][2]);
    expect(bridge.send.mock.calls.filter(([e]) => e.kind === 'run')).toHaveLength(1);
    expect(bridge.send).toHaveBeenCalledWith(expect.objectContaining({ kind: 'run', source: 'print(2)' }));
  });
  it('reload recovery settles metadata without running source; stale messages cannot change the next run', async () => {
    const { execution, bridge } = setup();
    await execution.recover(run(crypto.randomUUID()));
    expect(bridge.send.mock.calls.filter(([e]) => e.kind === 'run')).toHaveLength(0);
    await execution.run('print(1)', 'free');
    execution.event({ kind: 'output', generation: 'old-generation', text: 'stale' });
    execution.event({ kind: 'displaying', generation: 'old-generation' });
    expect(execution.state.output).toBe(''); expect(execution.state.running).toBe(true);
  });
  it('records a painted frame that arrives after metadata settlement', async () => {
    const { execution, bridge } = setup(); await execution.run('print(1)', 'free');
    const event = bridge.send.mock.calls.find(([m]) => m.kind === 'run')![0];
    execution.event({ kind: 'displaying', generation: event.generation as string }); await tick();
    execution.event({ kind: 'painted', generation: event.generation as string });
    expect(execution.state.firstStrokeMs).toBeGreaterThanOrEqual(0);
  });
  it('offers full Python without starting a server run automatically', async () => {
    const { execution, bridge, request } = setup(); await execution.run('input()', 'free');
    const event = bridge.send.mock.calls.find(([m]) => m.kind === 'run')![0];
    execution.event({ kind: 'unsupported', generation: event.generation as string, message: 'input() requires full Python' });
    await tick(); expect(execution.state.fullPython).toBe(true);
    expect(request.mock.calls.some(([path]) => path === 'runs')).toBe(false);
  });
  it('stops locally on a denied lease and does not revive from a late renewal', async () => {
    vi.useFakeTimers();
    const renewal = deferred<unknown>();
    const request = vi.fn(async (p: string, method?: string, data?: unknown) => p.endsWith('/renew') ? renewal.promise : method === 'POST' ? run((data as { requestKey: string }).requestKey) : {});
    const { execution, bridge } = setup(request); await execution.run('while True: pass', 'free');
    await vi.advanceTimersByTimeAsync(15000); const stopped = execution.stop(); await stopped;
    renewal.resolve(run(crypto.randomUUID())); await vi.advanceTimersByTimeAsync(1);
    expect(execution.state.running).toBe(false);
    expect(bridge.send.mock.calls.filter(([e]) => e.kind === 'renew')).toHaveLength(0);
  });
  it('does not retry settlement forever after an expired grant', async () => {
    const request = vi.fn(async (_p: string, method?: string, data?: unknown) => { if (method === 'DELETE') throw new TurtleRequestError('ACCESS_EXPIRED', 401); return run((data as { requestKey: string }).requestKey); });
    const { execution } = setup(request); await execution.run('print(1)', 'free');
    expect(await execution.stop()).toBe(false); expect(await execution.stop()).toBe(true);
    expect(request.mock.calls.filter(([,m]) => m === 'DELETE')).toHaveLength(1);
  });
  it('recovers an uncertain admission for Stop without reserving again while disabled', async () => {
    const request = vi.fn(async (_p: string, method?: string) => {
      if (method === 'POST') throw new TurtleRequestError('BROWSER_RUNTIME_UNAVAILABLE', 503);
      return { ...run(crypto.randomUUID()), state: 'EXPIRED' };
    });
    const { execution, bridge } = setup(request); await execution.run('private', 'free');
    expect(execution.state.fullPython).toBe(true); expect(await execution.stop()).toBe(true);
    expect(request.mock.calls.filter(([,method]) => method === 'POST')).toHaveLength(1);
    expect(bridge.send.mock.calls.some(([m]) => m.kind === 'run')).toBe(false);
  });
});
describe('browser configuration and local project export', () => {
  it('requires an explicit full-Python choice after a browser grant is disabled or the web flags disagree', () => {
    const bootstrap = { expiresAt: Date.now() + 10000, helperVersion: turtleHelperVersion, starters: turtleStarters, session: null, preferredEngine: 'browser' as const };
    expect(turtleBrowserAccess(bootstrap, false)).toEqual({ profile: undefined, unavailable: true });
    expect(turtleBrowserAccess({ ...bootstrap, browser: profile }, false).unavailable).toBe(true);
    expect(turtleBrowserAccess({ ...bootstrap, browser: profile }, true)).toEqual({ profile, unavailable: false });
    expect(turtleBrowserAccess({ ...bootstrap, preferredEngine: undefined }, false).unavailable).toBe(false);
  });
  it('defaults off and rejects app-origin / insecure / malformed asset configurations', () => {
    const env = { NODE_ENV: 'production', TURTLE_TRIAL_BROWSER_ENABLED: 'true', TURTLE_TRIAL_BROWSER_ADMISSION_ENABLED: 'true', TURTLE_TRIAL_BROWSER_RUNTIME_ORIGIN: profile.origin, TURTLE_TRIAL_BROWSER_RUNTIME_ID: profile.runtimeId };
    expect(turtleBrowserConfig({})).toBeUndefined(); expect(turtleBrowserConfig(env)).toEqual(profile);
    for (const origin of ['https://cs.coveedu.com', 'http://runtime.example', 'https://runtime.example/path', 'https://user@runtime.example']) expect(turtleBrowserConfig({ ...env, TURTLE_TRIAL_BROWSER_RUNTIME_ORIGIN: origin })).toBeUndefined();
  });
  it('exports UTF-8 source and native helper files without fetching', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch'); const files = unzipSync(new Uint8Array(await turtleProject('print("안녕")')));
    expect(strFromU8(files['main.py']!)).toBe('print("안녕")'); expect(Object.keys(files).sort()).toEqual(['README.txt','custom.py','main.py','shape.py']);
    expect(strFromU8(files['custom.py']!)).toContain('import turtle'); expect(fetch).not.toHaveBeenCalled(); fetch.mockRestore();
  });
});
