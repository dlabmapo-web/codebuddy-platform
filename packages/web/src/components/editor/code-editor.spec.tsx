// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const model = vi.hoisted(() => ({ value: '', mounted: false }));
vi.mock('next/dynamic', () => ({
  default: () => function Monaco({ defaultValue, value }: { defaultValue: string; value?: string }) {
    // A defined value replaces Monaco text; undefined leaves ownership with
    // the external document binding. Initialization happens only once.
    if (!model.mounted) { model.value = defaultValue; model.mounted = true; }
    if (value !== undefined) model.value = value;
    return null;
  },
}));
vi.mock('@/i18n', () => ({ useLayoutTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/monaco/line-endings', () => ({ pinLfOnMount: (mount: unknown) => mount }));
vi.mock('@/lib/monaco/theme', () => ({ EDITOR_FONT_FAMILY: 'monospace', registerPaircodeTheme: vi.fn() }));
import { CodeEditor } from './code-editor';

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('React', React);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  model.value = ''; model.mounted = false;
  host = document.createElement('div'); document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount()); host.remove(); vi.unstubAllGlobals();
});
const render = async (code: string, documentManaged = false) => {
  await act(() => root.render(<CodeEditor code={code} documentManaged={documentManaged} fontSize={14} onChange={() => {}} />));
};

it('does not replay lagging React snapshots over shared-document edits', async () => {
  await render('# starter');
  await render('# starter', true);
  model.value = '# newer remote edit';
  await render('# n', true);
  expect(model.value).toBe('# newer remote edit');
  await render('# newer', true);
  expect(model.value).toBe('# newer remote edit');
  // Leaving collaboration restores ordinary navigation/reset control.
  await render('# next problem');
  expect(model.value).toBe('# next problem');
  await render('# reset');
  expect(model.value).toBe('# reset');
});

it('initializes a newly mounted shared editor without a controlled value', async () => {
  await render('# saved work', true);
  expect(model.value).toBe('# saved work');
});
