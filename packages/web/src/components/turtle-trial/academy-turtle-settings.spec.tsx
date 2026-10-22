// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '@cove/i18n/locales/en/turtle-trial.json';
const mocks = vi.hoisted(() => ({ state: vi.fn(), reveal: vi.fn(), generate: vi.fn(), copy: vi.fn() }));
vi.mock('@/lib/orpc', () => ({ orpc: { academyTurtle: mocks } }));
const t = (key: string) => en[key as keyof typeof en] ?? key;
vi.mock('./use-turtle-translation', () => ({ useTurtleTranslation: () => ({ t }) }));
import { AcademyTurtleSettings } from './academy-turtle-settings';

const first = { version: '20000000-0000-4000-8000-000000000001', updatedAt: '2026-10-22T00:00:00Z' };
const second = { ...first, version: '20000000-0000-4000-8000-000000000002' };
let root: Root; let host: HTMLDivElement;
function button(label: string, parent: ParentNode = document): HTMLButtonElement {
  const found = Array.from(parent.querySelectorAll('button')).find(b => b.textContent === label);
  if (!found) throw new Error('Missing button: ' + label);
  return found as HTMLButtonElement;
}
async function click(label: string, parent?: ParentNode) { await act(async () => { button(label, parent).click(); }); }
async function render() { await act(async () => root.render(<AcademyTurtleSettings academyId="academy-a" />)); }
beforeEach(() => {
  vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.state.mockResolvedValue({ available: true, current: null });
  mocks.generate.mockResolvedValue({ pin: '001234', current: first });
  mocks.reveal.mockResolvedValue({ pin: '001234', current: first });
  mocks.copy.mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: mocks.copy } });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(() => root.unmount()); host.remove(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('academy Turtle manager controls', () => {
  it('generates and copies a leading-zero code without storing it in browser storage', async () => {
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    await render();
    await click(en.manager_generate);
    expect(mocks.generate).toHaveBeenCalledWith({ academyId: 'academy-a', expectedVersion: null });
    expect(document.querySelector('output')?.textContent).toBe('001234');
    await click(en.manager_copy);
    expect(mocks.copy).toHaveBeenCalledWith('001234');
    expect(storage).not.toHaveBeenCalled(); storage.mockRestore();
    await click(en.manager_hide);
    expect(document.querySelector('output')?.textContent).toBe('••••••');
    expect(button(en.manager_copy).disabled).toBe(true);
    await click(en.manager_show);
    expect(mocks.reveal).toHaveBeenCalledWith({ academyId: 'academy-a', expectedVersion: first.version });
  });
  it('requires confirmation before replacing and cancellation leaves the code unchanged', async () => {
    mocks.state.mockResolvedValue({ available: true, current: first });
    await render();
    await click(en.manager_replace);
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain(en.manager_replace_description);
    expect(mocks.generate).not.toHaveBeenCalled();
    await click(en.manager_cancel, dialog);
    expect(mocks.generate).not.toHaveBeenCalled();
    await click(en.manager_replace);
    await click(en.manager_replace, document.querySelector('[role="dialog"]')!);
    expect(mocks.generate).toHaveBeenCalledWith({ academyId: 'academy-a', expectedVersion: first.version });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it('explains stale-manager conflicts and refreshes without retaining plaintext', async () => {
    mocks.state.mockResolvedValue({ available: true, current: first });
    mocks.generate.mockRejectedValueOnce({ code: 'CONFLICT' });
    await render();
    await click(en.manager_replace);
    await click(en.manager_replace, document.querySelector('[role="dialog"]')!);
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(en.manager_conflict);
    await click(en.manager_cancel, document.querySelector('[role="dialog"]')!);
    mocks.state.mockResolvedValue({ available: true, current: second });
    await click(en.manager_refresh);
    await click(en.manager_show);
    expect(mocks.reveal).toHaveBeenCalledWith({ academyId: 'academy-a', expectedVersion: second.version });
  });
  it('disables code creation while public Turtle is off', async () => {
    mocks.state.mockResolvedValue({ available: false, current: null });
    await render();
    expect(host.textContent).toContain(en.manager_unavailable);
    expect(Array.from(host.querySelectorAll('button')).some(b => b.textContent === en.manager_generate)).toBe(false);
  });
});
