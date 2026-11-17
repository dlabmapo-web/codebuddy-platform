import { describe, expect, it } from 'vitest';
import { markTurtleBootReady, turtleBootLimits, turtleBootReadyAttribute, turtleBootRecoveryScript, turtleBootRetriesKey } from './boot-recovery';

/** A window with a controllable clock, running the exact shipped script text. */
function boot({ readyState = 'loading', stored, storageBlocked = false }: { readyState?: string; stored?: string; storageBlocked?: boolean } = {}) {
  let now = 0, reloads = 0, reloadAt = -1;
  const timers: { at: number; run: () => void }[] = [];
  const listeners: Record<string, () => void> = {};
  const attributes = new Set<string>();
  const store = new Map<string, string>(stored === undefined ? [] : [[turtleBootRetriesKey, stored]]);
  const storage = {
    getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k),
  } as unknown as Storage;
  const documentElement = {
    hasAttribute: (n: string) => attributes.has(n), setAttribute: (n: string) => void attributes.add(n), removeAttribute: (n: string) => void attributes.delete(n),
  };
  const doc = { readyState, documentElement } as unknown as Document;
  const win = {
    document: doc,
    get sessionStorage() { if (storageBlocked) throw new Error('SecurityError'); return storage; },
    location: { reload: () => { reloads++; reloadAt = now; } },
    addEventListener: (type: string, run: () => void) => { listeners[type] = run; },
    setTimeout: (run: () => void, ms: number) => { timers.push({ at: now + ms, run }); },
  };
  new Function('window', turtleBootRecoveryScript)(win);
  const advance = (ms: number) => {
    const until = now + ms;
    for (;;) {
      const next = timers.filter(t => t.at <= until).sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      timers.splice(timers.indexOf(next), 1); now = next.at; next.run();
    }
    now = until;
  };
  return {
    advance, load: () => listeners.load?.(), store,
    ready: () => markTurtleBootReady(doc, () => storage),
    get reloads() { return reloads; }, get reloadAt() { return reloadAt; },
  };
}

describe('public Turtle boot recovery', () => {
  it('reloads a page whose scripts never arrived, after a jittered delay', () => {
    const page = boot();
    page.advance(5000); page.load(); page.advance(turtleBootLimits.settleMs - 1);
    expect(page.reloads).toBe(0);
    page.advance(turtleBootLimits.jitterMs[1] + 1);
    expect(page.reloads).toBe(1);
    const delay = page.reloadAt - (5000 + turtleBootLimits.settleMs);
    expect(delay).toBeGreaterThanOrEqual(turtleBootLimits.jitterMs[0]);
    expect(delay).toBeLessThan(turtleBootLimits.jitterMs[1]);
    expect(page.store.get(turtleBootRetriesKey)).toBe('1');
  });

  it('leaves a live page alone and gives the next visit a fresh budget', () => {
    const page = boot({ stored: '1' });
    page.load(); page.ready();
    page.advance(turtleBootLimits.backstopMs * 2);
    expect(page.reloads).toBe(0);
    expect(page.store.has(turtleBootRetriesKey)).toBe(false);
  });

  it('gives up after two reloads so a broken page cannot loop', () => {
    const page = boot({ stored: String(turtleBootLimits.maxReloads) });
    page.load(); page.advance(turtleBootLimits.backstopMs * 2);
    expect(page.reloads).toBe(0);
  });

  it('never reloads when session storage is unavailable', () => {
    const page = boot({ storageBlocked: true });
    page.load(); page.advance(turtleBootLimits.backstopMs * 2);
    expect(page.reloads).toBe(0);
  });

  it('still recovers when the load event never fires', () => {
    const page = boot();
    page.advance(turtleBootLimits.backstopMs + turtleBootLimits.jitterMs[1]);
    expect(page.reloads).toBe(1);
  });

  it('checks once even when both the load timer and the backstop fire', () => {
    const page = boot({ readyState: 'complete' });
    page.advance(turtleBootLimits.backstopMs * 2);
    expect(page.reloads).toBe(1);
    expect(page.store.get(turtleBootRetriesKey)).toBe('1');
  });

  it('marks the page live on <html> and undoes it on unmount', () => {
    const page = boot();
    const attributes = new Set<string>();
    const doc = { documentElement: { setAttribute: (n: string) => attributes.add(n), removeAttribute: (n: string) => attributes.delete(n) } } as unknown as Document;
    const undo = markTurtleBootReady(doc, () => { throw new Error('blocked'); });
    expect(attributes.has(turtleBootReadyAttribute)).toBe(true);
    undo();
    expect(attributes.has(turtleBootReadyAttribute)).toBe(false);
    expect(page.reloads).toBe(0);
  });
});
