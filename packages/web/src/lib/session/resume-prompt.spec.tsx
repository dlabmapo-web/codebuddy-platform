// @vitest-environment happy-dom
import { act, StrictMode, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const route = vi.hoisted(() => ({ pathname: '/academy/test' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));
vi.mock('next/link', () => ({ default: (props: ComponentProps<'a'>) => <a {...props} /> }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
import { ResumePrompt } from './resume-prompt';
import { INACTIVITY_RETURN_KEY } from './inactivity';

let root: Root;
let host: HTMLDivElement;
const target = '/academy/test/learn/courses';
async function render() {
  await act(async () => root.render(<StrictMode><ResumePrompt /></StrictMode>));
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  route.pathname = '/academy/test';
  window.sessionStorage.clear();
  window.sessionStorage.setItem(INACTIVITY_RETURN_KEY, target);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
describe('post-login return prompt', () => {
  it('offers the saved page once, including under Strict Mode', async () => {
    await render();
    expect(host.querySelector('a')?.getAttribute('href')).toBe(target);
    expect(window.sessionStorage.getItem(INACTIVITY_RETURN_KEY)).toBeNull();
    await act(async () => root.unmount());
    root = createRoot(host);
    await render();
    expect(host.querySelector('a')).toBeNull();
  });
  it('dismisses permanently after navigating away and back', async () => {
    await render();
    route.pathname = '/academy/test/learn/classes';
    await render();
    expect(host.querySelector('a')).toBeNull();
    route.pathname = '/academy/test';
    await render();
    expect(host.querySelector('a')).toBeNull();
  });
  it('can be dismissed without navigating', async () => {
    await render();
    await act(async () => host.querySelector('button')!.click());
    expect(host.querySelector('a')).toBeNull();
  });
  it('does not offer a page the student is already on', async () => {
    route.pathname = target;
    await render();
    expect(host.querySelector('a')).toBeNull();
  });
  it('rejects an external return path', async () => {
    window.sessionStorage.setItem(INACTIVITY_RETURN_KEY, '/\\example.com');
    await render();
    expect(host.querySelector('a')).toBeNull();
  });
});
