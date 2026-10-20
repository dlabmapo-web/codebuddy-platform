// @vitest-environment happy-dom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { MultipleChoiceDefinition } from '@cove/shared';
import { ChoiceFields } from './choice-fields';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
vi.mock('./use-manual-translation', () => ({ useManualTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/components/editor/RichEditor', () => ({ RichEditor: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => <textarea data-rich-editor value={value} onChange={e => onChange(e.target.value)} /> }));
vi.mock('@/lib/manual-api', () => ({ manualApi: {} }));
const roots: Array<ReturnType<typeof createRoot>> = [];
afterEach(async () => { for (const root of roots.splice(0)) await act(() => root.unmount()); document.body.innerHTML = ''; });
const initial: MultipleChoiceDefinition = { version: 1, question: 'Question', problemDescription: '', selectionMode: 'SINGLE', options: [{ id: 'a', content: '<p>One</p>' }, { id: 'b', content: 'Two' }], correctOptionIds: [], shuffleOptions: false, explanationEnabled: false, explanation: '' };
async function render(locked = false) {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host); roots.push(root);
  let latest = initial;
  function Harness() { const [value, setValue] = useState(initial); latest = value; return <ChoiceFields academyId="academy" value={value} onChange={setValue} locked={locked} uploadImage={async () => 'asset'} additionalSettings={<p>score settings</p>} />; }
  await act(() => root.render(<Harness />));
  return { host, latest: () => latest };
}
it('starts with compact plain answers and keeps optional settings collapsed', async () => {
  const { host, latest } = await render();
  expect(host.querySelector<HTMLDetailsElement>('details')!.open).toBe(false);
  expect(host.querySelector<HTMLTextAreaElement>('textarea[aria-label="option 1"]')!.value).toBe('One');
  expect(host.querySelector('section [data-rich-editor]')).toBeNull();
  await act(() => host.querySelector<HTMLInputElement>('input[aria-label="correct_option 2"]')!.click());
  expect(latest().correctOptionIds).toEqual(['b']);
});
it('removes an option and its answer key together', async () => {
  const { host, latest } = await render();
  const button = (name: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find(node => node.textContent === name)!;
  await act(() => button('add_option').click());
  expect(latest().options).toHaveLength(3);
  await act(() => host.querySelector<HTMLInputElement>('input[aria-label="correct_option 1"]')!.click());
  await act(() => host.querySelector<HTMLButtonElement>('section button:has(svg)')!.click());
  expect(latest().options).toHaveLength(2);
  expect(latest().correctOptionIds).toEqual([]);
});
it('preserves structural locks and offers rich editing only on request for plain options', async () => {
  const { host } = await render(true);
  expect(host.querySelector<HTMLInputElement>('input[aria-label="correct_option 1"]')!.disabled).toBe(true);
  const format = [...host.querySelectorAll<HTMLButtonElement>('button')].find(node => node.textContent === 'quiz_simple.format_option')!;
  await act(() => format.click());
  expect(host.querySelector('section [data-rich-editor]')).not.toBeNull();
});
