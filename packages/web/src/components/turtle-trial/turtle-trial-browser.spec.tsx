// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import en from '@cove/i18n/locales/en/turtle-trial.json';
import { turtleHelperVersion, turtleStarters } from '@cove/shared';
const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/lib/turtle-trial/client', async importOriginal => ({ ...await importOriginal<object>(), turtleRequest: mocks.request }));
vi.mock('./use-turtle-translation', () => ({ useTurtleTranslation: () => ({ t: (key: string) => en[key as keyof typeof en] ?? key }) }));
vi.mock('next/image', () => ({ default: () => <span aria-label="Cove" /> }));
vi.mock('@/components/editor/code-editor', () => ({ CodeEditor: ({ theme }: { theme: string }) => <textarea aria-label="Fixture code" data-editor-theme={theme} /> }));
vi.mock('@/components/manual/gui-viewer', () => ({ GuiViewer: () => <div /> }));
vi.mock('@/components/manual/novnc-loader', () => ({ loadRfb: async () => undefined }));
vi.mock('@/components/studio/language-control', () => ({ LanguageControl: () => <span /> }));
vi.mock('./turtle-options', () => ({ TurtleOptions: () => <span /> }));
import { TurtleTrial } from './turtle-trial';
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  sessionStorage.clear();
  mocks.request.mockImplementation(async (path: string) => path === 'bootstrap' ? {
    expiresAt: Date.now() + 10000, helperVersion: turtleHelperVersion, starters: turtleStarters,
    session: null, preferredEngine: 'browser',
  } : { id: 'native-fixture', state: 'STOPPED', output: '', token: '', displayUrl: '', expiresAt: Date.now() + 10000 });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(() => root.unmount()); host.remove(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
it('does not silently upload browser-draft source after refresh with browser flags disabled', async () => {
  await act(async () => root.render(<TurtleTrial enabled />));
  const buttons = () => [...host.querySelectorAll<HTMLButtonElement>('button')];
  const run = buttons().find(b => b.textContent === en.run)!;
  expect(run.disabled).toBe(true);
  expect(host.querySelector('iframe')).toBeNull();
  expect(mocks.request.mock.calls.some(([path]) => path === 'runs')).toBe(false);
  const fallback = buttons().find(b => b.textContent === en.run_with_full_python)!;
  expect(fallback).toBeTruthy();
  await act(async () => fallback.click());
  expect(mocks.request).toHaveBeenCalledWith('runs', 'POST', expect.objectContaining({ source: turtleStarters.drawing }));
});

it('selects the editor theme explicitly without starting or clearing execution', async () => {
  mocks.request.mockResolvedValue({ expiresAt: Date.now() + 10000, helperVersion: turtleHelperVersion, starters: turtleStarters, session: null });
  await act(async () => root.render(<TurtleTrial enabled />));
  const group = host.querySelector(`[role="group"][aria-label="${en.editor_theme}"]`)!;
  const light = [...group.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === en.light)!;
  const dark = [...group.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === en.dark)!;
  expect(dark.getAttribute('aria-pressed')).toBe('true');
  expect(host.querySelector('textarea')?.getAttribute('data-editor-theme')).toBe('paircode-dark');
  await act(async () => light.click());
  expect(light.getAttribute('aria-pressed')).toBe('true');
  expect(dark.getAttribute('aria-pressed')).toBe('false');
  expect(host.querySelector('textarea')?.getAttribute('data-editor-theme')).toBe('light');
  await act(async () => light.click());
  expect(host.querySelector('textarea')?.getAttribute('data-editor-theme')).toBe('light');
  await act(async () => dark.click());
  expect(host.querySelector('textarea')?.getAttribute('data-editor-theme')).toBe('paircode-dark');
  expect(mocks.request.mock.calls.some(([path]) => path !== 'bootstrap')).toBe(false);
  const stop = [...host.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === en.stop)!;
  expect(stop.disabled).toBe(true);
});
