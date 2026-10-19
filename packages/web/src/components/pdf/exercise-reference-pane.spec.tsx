// @vitest-environment happy-dom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { ExerciseReferencePane } from './exercise-reference-pane';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('./pdf-reader', () => ({ PdfReader: function Reader() {
  const [page, setPage] = useState(1);
  return <button data-testid="mock-pdf-page" onClick={() => setPage(page + 1)}>{page}</button>;
} }));
const roots: Array<ReturnType<typeof createRoot>> = [];
afterEach(async () => { for (const root of roots.splice(0)) await act(() => root.unmount()); document.body.innerHTML = ''; });

it('keeps reader page state across statement tabs and exposes pointer geometry only over text', async () => {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host); roots.push(root);
  await act(() => root.render(<ExerciseReferencePane academyId="academy" exercise={{ materialId: 'exercise', hasReferencePdf: true,
    referencePdf: { materialId: 'pdf', title: 'Theory', revision: 1, originalFilename: 'a.pdf', pageCount: 3, byteSize: 123 } }}>
    <p>Statement</p>
  </ExerciseReferencePane>));
  expect(host.querySelector('[data-collab-surface="statement"]')).toBeNull();
  const reader = host.querySelector<HTMLButtonElement>('[data-testid="mock-pdf-page"]')!;
  await act(() => reader.click()); expect(reader.textContent).toBe('2');
  const tabs = host.querySelectorAll<HTMLButtonElement>('[role=tab]');
  await act(() => tabs[1]!.click());
  expect(host.querySelector('[data-collab-surface="statement"]')?.textContent).toContain('Statement');
  await act(() => tabs[0]!.click());
  expect(host.querySelector('[data-collab-surface="statement"]')).toBeNull();
  expect(host.querySelector('[data-testid="mock-pdf-page"]')).toBe(reader);
  expect(reader.textContent).toBe('2');
});

it('keeps the statement available when a previously linked PDF becomes unavailable', async () => {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host); roots.push(root);
  await act(() => root.render(<ExerciseReferencePane academyId="academy" exercise={{ materialId: 'exercise', hasReferencePdf: true, referencePdf: null }}><p>Fallback statement</p></ExerciseReferencePane>));
  expect(host.querySelector('[role=status]')?.textContent).toBe('pdf-practice:unavailable');
  await act(() => host.querySelectorAll<HTMLButtonElement>('[role=tab]')[1]!.click());
  expect(host.textContent).toContain('Fallback statement');
});
