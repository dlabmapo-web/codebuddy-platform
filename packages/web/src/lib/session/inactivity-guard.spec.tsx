// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ORPCError } from '@orpc/client';

const mocks = vi.hoisted(() => ({
  extend: vi.fn(), current: vi.fn(), logout: vi.fn(),
  pathname: '/academy/test/learn/courses',
}));
vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/app/(auth)/actions', () => ({ logoutAction: mocks.logout }));
vi.mock('@/lib/orpc', () => ({ orpc: { studentSession: mocks } }));
vi.mock('./draft-flush', () => ({ flushDrafts: async () => true }));

import { InactivityGuard } from './inactivity-guard';
import { INACTIVITY_RETURN_KEY, INACTIVITY_STORAGE_KEY } from './inactivity';

const minute = 60_000;
let root: Root;
let host: HTMLDivElement;
let submit: ReturnType<typeof vi.spyOn>;
class TestChannel {
  static instances: TestChannel[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  postMessage = vi.fn();
  close = vi.fn();
  constructor() { TestChannel.instances.push(this); }
}
async function advance(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}
async function mount() {
  await act(async () => root.render(<InactivityGuard />));
}
const banner = () => host.querySelector('div.fixed.inset-x-0');
const dialog = () => host.querySelector('[role="alertdialog"]');
function button(label: string, within: Element = host): HTMLButtonElement {
  return [...within.querySelectorAll('button')].find((item) => item.textContent === label)!;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-28T00:00:00Z'));
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('BroadcastChannel', TestChannel);
  TestChannel.instances = [];
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.history.replaceState(null, '', mocks.pathname);
  mocks.extend.mockReset().mockImplementation(async () => ({ deadline: new Date(Date.now() + 30 * minute).toISOString() }));
  mocks.current.mockReset().mockImplementation(async () => ({ deadline: new Date(Date.now() + 30 * minute).toISOString() }));
  submit = vi.spyOn(HTMLFormElement.prototype, 'requestSubmit').mockImplementation(() => {});
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('student inactivity UI', () => {
  it('shows the 15/5/2-minute stages, then requests logout once and saves the return path', async () => {
    await mount();
    await advance(15 * minute - 1000);
    expect(banner()).toBeNull();
    await advance(1000);
    expect(banner()?.textContent).toContain('15:00');
    expect(banner()?.className).toContain('text-warning');
    await advance(10 * minute);
    expect(banner()?.textContent).toContain('05:00');
    expect(banner()?.className).toContain('text-danger');
    await advance(3 * minute);
    expect(dialog()?.textContent).toContain('02:00');
    expect(button('inactivity.continue', dialog()!)).toBeTruthy();
    expect(button('inactivity.sign_out_now', dialog()!)).toBeTruthy();
    await advance(2 * minute);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem(INACTIVITY_RETURN_KEY)).toBe(mocks.pathname);
    await advance(5000);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('continues from the dialog without signing out', async () => {
    await mount();
    await advance(28 * minute);
    await act(async () => button('inactivity.continue', dialog()!).click());
    expect(dialog()).toBeNull();
    expect(banner()).toBeNull();
    expect(submit).not.toHaveBeenCalled();
    await advance(15 * minute);
    expect(banner()?.textContent).toContain('15:00');
  });

  it('does not let captured pointer activity remove the sign-out button before click', async () => {
    await mount();
    await advance(28 * minute);
    const signOut = button('inactivity.sign_out_now', dialog()!);
    const calls = mocks.extend.mock.calls.length;
    await act(async () => signOut.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    await advance(1000);
    expect(dialog()).not.toBeNull();
    expect(mocks.extend).toHaveBeenCalledTimes(calls);
    await act(async () => signOut.click());
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it.each(['broadcast', 'storage'])('adopts another tab activity through %s', async (transport) => {
    await mount();
    await advance(20 * minute);
    const deadline = Date.now() + 30 * minute;
    await act(async () => {
      if (transport === 'broadcast') TestChannel.instances[0].onmessage?.({ data: deadline });
      else window.dispatchEvent(new StorageEvent('storage', { key: INACTIVITY_STORAGE_KEY, newValue: String(deadline) }));
    });
    await advance(1000);
    expect(banner()).toBeNull();
    expect(submit).not.toHaveBeenCalled();
  });

  it('publishes local activity and requests a server extension', async () => {
    await mount();
    await advance(20 * minute);
    await act(async () => window.dispatchEvent(new Event('keydown')));
    expect(TestChannel.instances[0].postMessage).toHaveBeenLastCalledWith(Date.now() + 30 * minute);
    expect(window.localStorage.getItem(INACTIVITY_STORAGE_KEY)).toBe(String(Date.now() + 30 * minute));
    expect(banner()).toBeNull();
  });

  it('does not revive an expired tab when input arrives before the next timer tick', async () => {
    await mount();
    vi.setSystemTime(Date.now() + 31 * minute);
    await act(async () => window.dispatchEvent(new Event('keydown')));
    expect(mocks.extend).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('keeps the original countdown through a temporary service outage', async () => {
    await mount();
    mocks.current.mockRejectedValue(new ORPCError('STUDENT_SESSION_UNAVAILABLE', { status: 503 }));
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(submit).not.toHaveBeenCalled();
    await advance(30 * minute);
    expect(submit).toHaveBeenCalledTimes(1);
  });
});
