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

it('shows document details only in PDF view and retains the statement while switching', async () => {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host); roots.push(root);
  await act(() => root.render(<ExerciseReferencePane academyId="academy" teacher exercise={{ materialId: 'exercise', hasReferencePdf: true,
    referencePdf: { materialId: 'pdf', title: 'Lesson reference', revision: 1, originalFilename: 'lesson.pdf', pageCount: 3, byteSize: 123 } }}>
    <input aria-label="Statement state" defaultValue="kept" />
  </ExerciseReferencePane>));
  const tabs = host.querySelectorAll<HTMLButtonElement>('[role=tab]');
  const statement = host.querySelector<HTMLDivElement>('#exercise-statement-panel')!;
  const input = host.querySelector<HTMLInputElement>('input')!;
  expect(host.querySelector('[data-testid=reference-pdf-details]')?.textContent).toContain('Lesson reference');
  await act(() => tabs[1]!.click());
  expect(host.querySelector('[data-testid=reference-pdf-details]')).toBeNull();
  expect(statement.hidden).toBe(false);
  statement.scrollTop = 120;
  input.value = 'preserved state';
  await act(() => tabs[0]!.click());
  expect(statement.hidden).toBe(true);
  await act(() => tabs[1]!.click());
  expect(host.querySelector('#exercise-statement-panel')).toBe(statement);
  expect(statement.scrollTop).toBe(120);
  expect(input.value).toBe('preserved state');
});

it('supports arrow, Home and End keys with one tab stop and matching focus', async () => {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host); roots.push(root);
  await act(() => root.render(<ExerciseReferencePane academyId="academy" exercise={{ materialId: 'exercise', hasReferencePdf: true, referencePdf: null }}><p>Problem</p></ExerciseReferencePane>));
  const tabs = host.querySelectorAll<HTMLButtonElement>('[role=tab]');
  for (const [key, from, target] of [['ArrowRight', 0, 1], ['Home', 1, 0], ['End', 0, 1], ['ArrowRight', 1, 0]] as const) {
    await act(() => tabs[from]!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
    expect(document.activeElement).toBe(tabs[target]);
    expect(tabs[target]!.getAttribute('aria-selected')).toBe('true');
    expect(tabs[target]!.tabIndex).toBe(0);
    expect(tabs[1 - target]!.tabIndex).toBe(-1);
  }
});

it.each(['', 'Written instructions'])('guides PDF-only practice back to the reader while retaining authored instructions (%s)', async (description) => {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host); roots.push(root);
  await act(() => root.render(<ExerciseReferencePane academyId="academy" exercise={{ materialId: 'exercise', hasReferencePdf: true, description,
    referencePdf: { materialId: 'pdf', title: 'Lesson', revision: 1, originalFilename: 'lesson.pdf', pageCount: 3, byteSize: 123 } }}><p>{description}</p></ExerciseReferencePane>));
  const tabs = host.querySelectorAll<HTMLButtonElement>('[role=tab]');
  await act(() => host.querySelector<HTMLButtonElement>('[data-testid="mock-pdf-page"]')!.click());
  await act(() => tabs[1]!.click());
  const action = [...host.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'pdf-practice:open_pdf');
  if (description) {
    expect(action).toBeUndefined();
    expect(host.querySelector('#exercise-statement-panel')?.textContent).toContain(description);
  } else {
    expect(host.querySelector('#exercise-statement-panel')?.textContent).toContain('pdf-practice:statement_in_pdf');
    await act(() => action!.click());
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tabs[0]);
    expect(host.querySelector('[data-testid="mock-pdf-page"]')?.textContent).toBe('2');
  }
});
