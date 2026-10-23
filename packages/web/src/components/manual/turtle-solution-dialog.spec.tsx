// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ManualConfig } from '@cove/shared';

const mocks = vi.hoisted(() => ({ copy: vi.fn(), t: (key: string) => key }));
vi.mock('./use-manual-translation', () => ({ useManualTranslation: () => ({ t: mocks.t }) }));
vi.mock('@/lib/manual-api', () => ({ manualApi: { read: vi.fn() } }));
vi.mock('@/components/editor/code-editor', () => ({ CodeEditor: ({ code, readOnly }: { code: string; readOnly: boolean }) => <textarea aria-label="Solution code" value={code} readOnly={readOnly} /> }));
import { solutionFileNames, TurtleSolutionFiles } from './turtle-solution-dialog';

let host: HTMLDivElement;
let root: Root;
const config = { entryPoint: 'main.py', solutionFiles: { 'palette.py': 'COLOR = "blue"', 'main.py': 'import turtle as t\nfrom palette import COLOR\nt.color(COLOR)\nt.forward(120)' } } as unknown as ManualConfig;
beforeEach(() => {
  vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('navigator', { clipboard: { writeText: mocks.copy } });
  mocks.copy.mockResolvedValue(undefined);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

it('opens the configured entry point before helper files and uses a deterministic fallback', () => {
  expect(solutionFileNames({ 'palette.py': '', 'main.py': '', 'run.py': '' }, 'run.py')).toEqual(['run.py', 'main.py', 'palette.py']);
  expect(solutionFileNames({ 'palette.py': '', 'main.py': '' }, 'missing.py')).toEqual(['main.py', 'palette.py']);
  expect(solutionFileNames({ 'z.py': '', 'a.py': '' }, 'missing.py')).toEqual(['a.py', 'z.py']);
});

it('shows one read-only file at a time and copies the selected file without modifying the source set', async () => {
  const before = JSON.stringify(config);
  await act(() => root.render(<TurtleSolutionFiles config={config} />));
  expect(host.querySelector('[aria-selected=true]')?.textContent).toBe('main.py');
  expect(host.querySelector('textarea')?.readOnly).toBe(true);
  expect(host.querySelector('textarea')?.value).toBe(config.solutionFiles!['main.py']);
  const tabs = [...host.querySelectorAll<HTMLButtonElement>('[role=tab]')];
  await act(() => tabs.find(tab => tab.textContent === 'palette.py')!.click());
  expect(host.querySelectorAll('textarea')).toHaveLength(1);
  expect(host.querySelector('textarea')?.value).toBe(config.solutionFiles!['palette.py']);
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label=copy_solution_file]')!.click());
  expect(mocks.copy).toHaveBeenCalledWith(config.solutionFiles!['palette.py']);
  expect(host.querySelector('[role=status]')?.textContent).toBe('copied');
  expect(JSON.stringify(config)).toBe(before);
});

it('supports keyboard file navigation and reports clipboard failure', async () => {
  await act(() => root.render(<TurtleSolutionFiles config={config} />));
  const tab = host.querySelector<HTMLButtonElement>('[aria-selected=true]')!;
  tab.focus();
  await act(() => tab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
  expect(document.activeElement?.textContent).toBe('palette.py');
  mocks.copy.mockRejectedValueOnce(new Error('Clipboard blocked'));
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label=copy_solution_file]')!.click());
  expect(host.querySelector('[role=alert]')?.textContent).toBe('copy_solution_failed');
});

it('renders an empty-reference state instead of an empty code editor', async () => {
  await act(() => root.render(<TurtleSolutionFiles config={{ ...config, solutionFiles: {} }} />));
  expect(host.textContent).toContain('ui.no_reference'); expect(host.querySelector('textarea')).toBeNull();
});
