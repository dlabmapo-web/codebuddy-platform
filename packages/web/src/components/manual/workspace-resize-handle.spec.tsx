// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('./use-manual-translation', () => ({ useManualTranslation: () => ({ t: (key: string) => key }) }));
import { WorkspaceResizeHandle } from './workspace-resize-handle';
let host: HTMLDivElement, root: Root;
const onChange = vi.fn();
beforeEach(() => { vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
it('supports arrow and boundary keys with a bounded accessible size', async () => {
  await act(() => root.render(<WorkspaceResizeHandle value={40} onChange={onChange} />));
  const handle = host.querySelector<HTMLElement>('[role=separator]')!;
  expect(handle.getAttribute('aria-valuenow')).toBe('40');
  for (const [key, expected] of [['ArrowUp', 38], ['ArrowDown', 42], ['Home', 20], ['End', 65]] as const) {
    await act(() => handle.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
    expect(onChange).toHaveBeenLastCalledWith(expected);
  }
  await act(() => root.render(<WorkspaceResizeHandle value={65} onChange={onChange} />));
  await act(() => handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, shiftKey: true })));
  expect(onChange).toHaveBeenLastCalledWith(65);
});
