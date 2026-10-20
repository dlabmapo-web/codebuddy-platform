// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { MultipleChoiceDefinition } from '@cove/shared';
import { ContentBasePathProvider } from '@/components/studio/content-base-path-provider';
import { ManualAuthorDialog } from './manual-author-dialog';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
const api = vi.hoisted(() => ({ capabilities: vi.fn(async () => ({ multipleChoice: true })), save: vi.fn(async () => undefined) }));
vi.mock('@/lib/manual-api', () => ({ manualApi: api }));
vi.mock('@/lib/config', () => ({ publicConfig: { guiEnabled: false } }));
vi.mock('./use-manual-translation', () => ({ useManualTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/components/editor/RichEditor', () => ({ RichEditor: () => <div /> }));
vi.mock('./choice-fields', () => ({ ChoiceFields: ({ value, onChange, additionalSettings }: { value: MultipleChoiceDefinition; onChange: (value: MultipleChoiceDefinition) => void; additionalSettings: React.ReactNode }) => <div><button onClick={() => onChange({ ...value, question: 'What is 1 + 1?', options: value.options.map((option, index) => ({ ...option, content: index ? '3' : '2' })), correctOptionIds: [value.options[0]!.id] })}>complete essentials</button>{additionalSettings}</div> }));
const roots: Array<ReturnType<typeof createRoot>> = [];
afterEach(async () => { for (const root of roots.splice(0)) await act(() => root.unmount()); document.body.innerHTML = ''; vi.clearAllMocks(); });
it.each([undefined, 'Custom material name'])('saves a quiz using only its essentials (custom name: %s)', async (customName) => {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host); roots.push(root);
  const onClose = vi.fn();
  await act(() => root.render(<ContentBasePathProvider academySlug="academy" surface="console"><ManualAuthorDialog target={{ academyId: '10000000-0000-4000-8000-000000000001', courseId: '10000000-0000-4000-8000-000000000002', lectureId: '10000000-0000-4000-8000-000000000003' }} type="MULTIPLE_CHOICE" onClose={onClose} onSaved={async () => undefined} /></ContentBasePathProvider>));
  await act(() => [...document.querySelectorAll<HTMLButtonElement>('button')].find(node => node.textContent === 'complete essentials')!.click());
  if (customName) {
    const input = document.querySelector<HTMLInputElement>('input[maxlength="128"]')!;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    await act(() => { setter.call(input, customName); input.dispatchEvent(new Event('input', { bubbles: true })); });
  }
  const save = [...document.querySelectorAll<HTMLButtonElement>('button')].find(node => node.textContent === 'save_activity')!;
  expect(save.disabled).toBe(false);
  await act(async () => save.click());
  expect(api.save).toHaveBeenCalledWith(expect.objectContaining({ title: customName ?? 'What is 1 + 1?', type: 'MULTIPLE_CHOICE', multipleChoice: expect.objectContaining({ question: 'What is 1 + 1?' }) }));
  expect(onClose).toHaveBeenCalledOnce();
});
