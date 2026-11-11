// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

import { TerminalPanel } from './terminal-panel';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
vi.mock('@/i18n', () => ({ useLayoutTranslation: () => ({ t: (key: string) => key }) }));

const roots: Array<ReturnType<typeof createRoot>> = [];
afterEach(async () => { for (const root of roots.splice(0)) await act(() => root.unmount()); document.body.innerHTML = ''; });

async function render(props: Partial<Parameters<typeof TerminalPanel>[0]> = {}) {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host); roots.push(root);
  const onSubmitInput = vi.fn();
  const draw = (next: Partial<Parameters<typeof TerminalPanel>[0]> = {}) => act(() => root.render(
    <TerminalPanel awaitingInput lines={[]} onEndInput={vi.fn()} onSubmitInput={onSubmitInput} supported {...props} {...next} />,
  ));
  await draw();
  return { host, onSubmitInput, draw, field: () => host.querySelector<HTMLInputElement>('input') };
}

/** A paste as the browser delivers it, with the copied text on the clipboard. */
async function paste(field: HTMLInputElement, text: string) {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } });
  await act(async () => { field.dispatchEvent(event); });
  return event;
}

it('sends a copied example line by line and leaves the last line for Enter', async () => {
  const { field, onSubmitInput } = await render();
  const event = await paste(field()!, '4 6\n101111\n101010\n101011\n111011');
  expect(event.defaultPrevented).toBe(true);
  expect(onSubmitInput.mock.calls.map(([line]) => line)).toEqual(['4 6', '101111', '101010', '101011']);
  expect(field()!.value).toBe('111011');
});

it('keeps the unsent line while the program is busy and shows it when it asks again', async () => {
  const { field, draw } = await render();
  await paste(field()!, '1\n2');
  await draw({ awaitingInput: false });
  expect(field()).toBeNull();
  await draw({ awaitingInput: true });
  expect(field()!.value).toBe('2');
});

it('leaves a paste without a line break to the browser', async () => {
  const { field, onSubmitInput } = await render();
  const event = await paste(field()!, '1 2 3');
  expect(event.defaultPrevented).toBe(false);
  expect(onSubmitInput).not.toHaveBeenCalled();
});

it('refuses a paste too large for the terminal and says why', async () => {
  const { host, field, onSubmitInput } = await render();
  const event = await paste(field()!, `${'7 '.repeat(140_000)}\n`);
  expect(event.defaultPrevented).toBe(true);
  expect(onSubmitInput).not.toHaveBeenCalled();
  expect(host.querySelector('[role="status"]')?.textContent).toBe('workspace.paste_too_large');
  await paste(field()!, '5\n6');
  expect(host.querySelector('[role="status"]')).toBeNull();
  expect(onSubmitInput).toHaveBeenCalledWith('5');
});

it('offers no field to paste into on a mirrored terminal', async () => {
  const { field } = await render({ mode: 'mirror', onSubmitInput: undefined, onEndInput: undefined });
  expect(field()).toBeNull();
});

it('waits for Enter after pasting an example copied with its final line break', async () => {
  const { field, onSubmitInput } = await render();
  await paste(field()!, '5 6\n1 1 0 0 0 1\n1 1 0 1 1 1\n');
  expect(onSubmitInput.mock.calls.map(([line]) => line)).toEqual(['5 6', '1 1 0 0 0 1']);
  expect(field()!.value).toBe('1 1 0 1 1 1');
  await act(async () => { field()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  expect(onSubmitInput).toHaveBeenLastCalledWith('1 1 0 1 1 1');
  expect(field()!.value).toBe('');
});

it('has no End input button: Ctrl+D ends the input', async () => {
  const onEndInput = vi.fn();
  const { host, field } = await render({ onEndInput });
  expect(host.querySelector('button')).toBeNull();
  await act(async () => {
    field()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', ctrlKey: true, bubbles: true, cancelable: true }));
  });
  expect(onEndInput).toHaveBeenCalledTimes(1);
});
