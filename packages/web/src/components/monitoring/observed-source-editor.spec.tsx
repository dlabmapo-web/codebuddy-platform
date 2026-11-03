// @vitest-environment happy-dom
import React, { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { ObservationAwarenessEvent } from '@cove/shared';
import { materialCodeKey } from '@/lib/monitoring/awareness/material-code';
import { ObservedSourceEditor } from './observed-source-editor';
const fake = vi.hoisted(() => {
  const collection = { set: vi.fn(), clear: vi.fn() };
  const instance = { createDecorationsCollection: () => collection, getModel: () => ({ getLineCount: () => 3, getLineMaxColumn: () => 80 }),
    getScrolledVisiblePosition: () => ({ top: 40, left: 90 }), getLayoutInfo: () => ({ height: 300, width: 800, contentLeft: 48 }),
    onDidScrollChange: () => ({ dispose: vi.fn() }), onDidLayoutChange: () => ({ dispose: vi.fn() }) };
  return { collection, instance };
});
vi.mock('@/components/editor/code-editor', () => ({ CodeEditor: function Editor({ onMount }: { onMount: (instance: unknown) => void }) {
  useEffect(() => onMount(fake.instance), [onMount]); return <div>Editor</div>;
} }));
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });
it('places snapshot cursors only against the same file and exact code snapshot', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const code = 'import turtle\nturtle.done()';
  const awareness = { editor: { file: 'main.py', fingerprint: materialCodeKey(code), cursor: {
    line: 2, column: 4, selectionEndLine: 2, selectionEndColumn: 4 }, mouse: { line: 2, column: 5 } } } as ObservationAwarenessEvent;
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const render = (value: string, file: string) => act(() => root.render(<ObservedSourceEditor code={value} file={file} awareness={awareness} />));
  try {
    await render(code, 'main.py');
    expect(host.querySelector('[data-testid="observation-editor-pointer"]')).not.toBeNull();
    expect(fake.collection.set).toHaveBeenCalled();
    fake.collection.set.mockClear();
    await render(code + '\n# newer snapshot', 'main.py');
    expect(host.querySelector('[data-testid="observation-editor-pointer"]')).toBeNull();
    expect(fake.collection.set).not.toHaveBeenCalled();
    await render(code, 'other.py');
    expect(host.querySelector('[data-testid="observation-editor-pointer"]')).toBeNull();
  } finally { await act(() => root.unmount()); host.remove(); }
});
