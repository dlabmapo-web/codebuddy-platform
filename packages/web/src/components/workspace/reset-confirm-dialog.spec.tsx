// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

import { ResetConfirmDialog } from './reset-confirm-dialog';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
const roots: Array<ReturnType<typeof createRoot>> = [];
afterEach(async () => { for (const root of roots.splice(0)) await act(() => root.unmount()); document.body.innerHTML = ''; });

const copy = { title: 'Reset', body: 'Replace your code with the starting code?', cancel: 'Cancel', confirm: 'Reset' };
async function render(open: boolean) {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host); roots.push(root);
  const onCancel = vi.fn(), onConfirm = vi.fn();
  await act(() => root.render(<ResetConfirmDialog copy={copy} onCancel={onCancel} onConfirm={onConfirm} open={open} />));
  return { onCancel, onConfirm };
}
const button = (name: string) => [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === name);

it('asks in its own dialog, not the browser\'s', async () => {
  const confirm = vi.fn(() => true);
  vi.stubGlobal('confirm', confirm);
  const { onConfirm, onCancel } = await render(true);
  expect(document.body.textContent).toContain('Replace your code with the starting code?');
  await act(async () => { button('Reset')!.click(); });
  expect(onConfirm).toHaveBeenCalledTimes(1);
  await act(async () => { button('Cancel')!.click(); });
  expect(onCancel).toHaveBeenCalled();
  expect(confirm).not.toHaveBeenCalled();
});

it('shows nothing while closed', async () => {
  await render(false);
  expect(button('Reset')).toBeUndefined();
});
