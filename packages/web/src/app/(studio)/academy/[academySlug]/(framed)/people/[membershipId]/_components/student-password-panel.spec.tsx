// @vitest-environment happy-dom
import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ pathname: '/people/one', reveal: vi.fn(), issue: vi.fn(), cache: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/i18n/client/use-error-text', () => ({ useErrorText: () => () => 'Failed' }));
vi.mock('@/lib/orpc', () => ({ orpc: { academyStudentCredentials: { reveal: mocks.reveal, issue: mocks.issue } } }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ isPending: false, data: { credential: { visiblePrefix: 'abc', length: 10, revealable: true, issuedAt: '2026-09-01', revealCount: 1 } } }),
  useQueryClient: () => ({ setQueryData: mocks.cache }),
}));
import { StudentPasswordPanel } from './student-password-panel';
let root: Root;
let host: HTMLDivElement;
const result = { state: { credential: null }, password: 'test-secret-123' };
async function render() {
  await act(async () => root.render(<StrictMode><StudentPasswordPanel academyId="academy" membershipId="student" /></StrictMode>));
}
async function reveal() {
  await act(async () => Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes('credentials.reveal'))!.click());
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.pathname = '/people/one';
  mocks.reveal.mockReset().mockResolvedValue(result);
  mocks.cache.mockClear();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals();
});
describe('issued student password visibility', () => {
  it('automatically remasks at 30 seconds and never caches plaintext', async () => {
    await render(); await reveal();
    expect(host.textContent).toContain(result.password);
    expect(mocks.cache).toHaveBeenCalledWith(['student-credential', 'academy', 'student'], result.state);
    expect(JSON.stringify(mocks.cache.mock.calls)).not.toContain(result.password);
    await act(async () => vi.advanceTimersByTime(30_000));
    expect(host.textContent).not.toContain(result.password);
  });
  it('remasks when the window loses focus', async () => {
    await render(); await reveal();
    await act(async () => window.dispatchEvent(new Event('blur')));
    expect(host.textContent).not.toContain(result.password);
  });
  it('remasks on navigation and does not restore the secret on return', async () => {
    await render(); await reveal();
    mocks.pathname = '/people/two'; await render();
    expect(host.textContent).not.toContain(result.password);
    mocks.pathname = '/people/one'; await render();
    expect(host.textContent).not.toContain(result.password);
  });
  it('discards a delayed reveal response after losing focus', async () => {
    let finish!: (value: typeof result) => void;
    mocks.reveal.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    await render(); await reveal();
    await act(async () => window.dispatchEvent(new Event('blur')));
    await act(async () => finish(result));
    expect(host.textContent).not.toContain(result.password);
  });
  it('allows explicit hiding and reports reveal failures accessibly', async () => {
    await render(); await reveal();
    await act(async () => Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes('credentials.hide'))!.click());
    expect(host.textContent).not.toContain(result.password);
    mocks.reveal.mockRejectedValueOnce(new Error('unavailable')); await reveal();
    expect(host.querySelector('[aria-live="polite"]')?.textContent).toBe('Failed');
  });
});
