// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { NewMaterialDialog } from './new-material-dialog';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const roots: Array<ReturnType<typeof createRoot>> = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await act(() => root.unmount());
  document.body.innerHTML = '';
});
async function renderPicker() {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host); roots.push(root);
  const onChoose = vi.fn();
  await act(() => root.render(<NewMaterialDialog kinds={['python', 'pdf']} lectureTitle="Lesson" onChoose={onChoose} />));
  const trigger = host.querySelector<HTMLButtonElement>('button')!;
  await act(() => trigger.click());
  return { onChoose, trigger };
}
function button(key: string) {
  return [...document.querySelectorAll<HTMLButtonElement>('button')].find(node => node.textContent === key)!;
}
it('requires a choice and hands the selected kind to the existing authoring flow once', async () => {
  const { onChoose } = await renderPicker();
  expect(button('next').disabled).toBe(true);
  expect(document.querySelectorAll('input[type=radio]')).toHaveLength(2);
  await act(() => document.querySelector<HTMLInputElement>('input[value=pdf]')!.click());
  expect(button('next').disabled).toBe(false);
  expect(onChoose).not.toHaveBeenCalled();
  await act(() => button('next').click());
  await vi.waitFor(() => expect(onChoose).toHaveBeenCalledExactlyOnceWith('pdf'));
  expect(document.querySelector('[role=dialog]')).toBeNull();
});
it('cancels without opening an editor and resets the choice on reopening', async () => {
  const { onChoose, trigger } = await renderPicker();
  await act(() => document.querySelector<HTMLInputElement>('input[value=python]')!.click());
  await act(() => button('cancel').click());
  expect(onChoose).not.toHaveBeenCalled();
  await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
  await act(() => trigger.click());
  expect(button('next').disabled).toBe(true);
  expect(document.querySelector('input:checked')).toBeNull();
});
it('shows an unavailable kind greyed with its reason and never hands it on', async () => {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host); roots.push(root);
  const onChoose = vi.fn();
  await act(() => root.render(<NewMaterialDialog kinds={['python', 'pdf']} lectureTitle="Lesson" onChoose={onChoose} unavailable={['python']} unavailableReason="Not in web courses" />));
  await act(() => host.querySelector<HTMLButtonElement>('button')!.click());
  const coding = document.querySelector<HTMLInputElement>('input[value=python]')!;
  expect(coding.disabled).toBe(true);
  expect(coding.closest('label')!.textContent).toContain('Not in web courses');
  expect(document.querySelector<HTMLInputElement>('input[value=pdf]')!.closest('label')!.textContent).not.toContain('Not in web courses');
  await act(() => coding.click());
  expect(coding.checked).toBe(false);
  expect(button('next').disabled).toBe(true);
  await act(() => document.querySelector<HTMLInputElement>('input[value=pdf]')!.click());
  await act(() => button('next').click());
  await vi.waitFor(() => expect(onChoose).toHaveBeenCalledExactlyOnceWith('pdf'));
});
