// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { ReferencePdfPicker } from './reference-pdf-picker';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }) }));
vi.mock('@/lib/orpc', () => ({ orpc: {} }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: { course: { isVisible: true }, modules: [{ title: 'Module one', isVisible: true, lectures: [
  { id: 'lecture', title: 'Original lecture', isVisible: true, materials: [{ id: 'pdf', title: 'Loops lesson', isVisible: true, pdfDocument: { placement: 'SUPPLEMENTARY', originalFilename: 'loops.pdf', pageCount: 2, byteSize: 880 } }] },
  { id: 'destination', title: 'Destination', isVisible: true, materials: [] },
] }] }, isPending: false, isError: false }) }));
const mocks = vi.hoisted(() => ({ choice: vi.fn(), author: vi.fn() }));
vi.mock('@/components/studio/choice-selector', () => ({ ChoiceSelector: (props: unknown) => { mocks.choice(props); return null; } }));
vi.mock('./pdf-author-dialog', () => ({ PdfAuthorDialog: (props: unknown) => { mocks.author(props); return null; } }));
const roots: Array<ReturnType<typeof createRoot>> = [];
afterEach(async () => { for (const root of roots.splice(0)) await act(() => root.unmount()); document.body.innerHTML = ''; vi.clearAllMocks(); });

it('resolves the selected PDF title even when it was selected before the form refreshed', async () => {
  const onTitleAvailable = vi.fn();
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host); roots.push(root);
  await act(() => root.render(<ReferencePdfPicker target={{ academyId: 'academy', courseId: 'course', lectureId: 'lecture' }} value="pdf" disabled={false} onChange={vi.fn()} onTitleAvailable={onTitleAvailable} />));
  expect(onTitleAvailable).toHaveBeenCalledWith('Loops lesson');
});

it('does not suggest a title without a selected PDF', async () => {
  const onTitleAvailable = vi.fn();
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host); roots.push(root);
  await act(() => root.render(<ReferencePdfPicker target={{ academyId: 'academy', courseId: 'course', lectureId: 'lecture' }} disabled={false} onChange={vi.fn()} onTitleAvailable={onTitleAvailable} />));
  expect(onTitleAvailable).not.toHaveBeenCalled();
});

it('keeps a moved exercise linked to a PDF in another lecture and identifies its origin', async () => {
  const onChange = vi.fn();
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host); roots.push(root);
  await act(() => root.render(<ReferencePdfPicker target={{ academyId: 'academy', courseId: 'course', lectureId: 'destination' }} value="pdf" disabled={false} onChange={onChange} />));
  const props = mocks.choice.mock.calls.at(-1)![0];
  expect(props.selectedId).toBe('pdf');
  expect(props.list.find((item: { id: string }) => item.id === 'pdf')).toMatchObject({ name: 'Loops lesson', disabled: false, description: expect.stringContaining('Original lecture') });
  expect(document.body.textContent).toContain('pdf-practice:same_course');
  expect(onChange).not.toHaveBeenCalled();
});

it('shows the attached PDF after moving even in read-only authoring', async () => {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host); roots.push(root);
  await act(() => root.render(<ReferencePdfPicker target={{ academyId: 'academy', courseId: 'course', lectureId: 'destination' }} value="pdf" disabled onChange={vi.fn()} />));
  expect(document.body.textContent).toContain('Loops lesson');
  expect(document.body.textContent).toContain('loops.pdf');
  expect(document.body.textContent).not.toContain('pdf-practice:unavailable');
});

it('uploads a new PDF into the current lecture after a move', async () => {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host); roots.push(root);
  await act(() => root.render(<ReferencePdfPicker target={{ academyId: 'academy', courseId: 'course', lectureId: 'destination' }} value="pdf" disabled={false} onChange={vi.fn()} />));
  await act(() => [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'pdf-practice:add')!.click());
  expect(mocks.author.mock.calls.at(-1)![0].target.lectureId).toBe('destination');
});
