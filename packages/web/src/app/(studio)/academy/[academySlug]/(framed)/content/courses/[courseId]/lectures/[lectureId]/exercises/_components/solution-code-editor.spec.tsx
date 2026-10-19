// @vitest-environment happy-dom
import type { ExerciseSolutionEntry } from '@cove/shared';
import { act, useLayoutEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { SolutionCodeEditor } from './solution-code-editor';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
const { callbacks } = vi.hoisted(() => ({ callbacks: new Map<string, (code: string) => void>() }));
vi.mock('next/dynamic', () => ({ default: () => function Editor(props: { value: string; onChange: (code: string) => void }) {
  callbacks.set(props.value, props.onChange);
  return <pre>{props.value}</pre>;
} }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/monaco/theme', () => ({ EDITOR_FONT_FAMILY: 'monospace', registerPaircodeTheme: () => {} }));
vi.mock('./authoring-fields', () => ({ SectionCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

it('retains new names and applies late Monaco callbacks to the same solution after reorder', async () => {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  let update!: (value: ExerciseSolutionEntry[]) => void;
  let latest: ExerciseSolutionEntry[] = [];
  function Harness() {
    const [value, setValue] = useState<ExerciseSolutionEntry[]>([{ title: null, code: 'one' }, { title: 'Second', code: 'two' }]);
    useLayoutEffect(() => { update = setValue; latest = value; }, [value]);
    return <SolutionCodeEditor value={value} onChange={setValue} error={null} />;
  }
  try {
    await act(() => root.render(<Harness />));
    const lateChange = callbacks.get('one')!;
    await act(() => update([{ title: 'New name', code: 'one' }, { title: 'Second', code: 'two' }]));
    await act(() => lateChange('one edited'));
    expect(latest[0]).toEqual({ title: 'New name', code: 'one edited' });
    const moveUp = [...host.querySelectorAll<HTMLButtonElement>('button')].filter(button => button.textContent === 'up')[1];
    await act(() => moveUp.click());
    await act(() => lateChange('one after reorder'));
    expect(latest).toEqual([{ title: 'Second', code: 'two' }, { title: 'New name', code: 'one after reorder' }]);
    Object.defineProperty(window, 'confirm', { configurable: true, value: vi.fn(() => true) });
    const remove = [...host.querySelectorAll<HTMLButtonElement>('button')].filter(button => button.textContent === 'remove')[1];
    await act(() => remove.click());
    await act(() => lateChange('late deleted code'));
    expect(latest).toEqual([{ title: 'Second', code: 'two' }]);

  } finally { await act(() => root.unmount()); host.remove(); }
});
