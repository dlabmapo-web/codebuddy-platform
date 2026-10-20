// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { ReferencePdfPicker } from './reference-pdf-picker';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }) }));
vi.mock('@/lib/orpc', () => ({ orpc: {} }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: { modules: [{ lectures: [{ id: 'lecture', materials: [{ id: 'pdf', title: 'Loops lesson', isVisible: true, pdfDocument: { placement: 'SUPPLEMENTARY', originalFilename: 'loops.pdf', pageCount: 2, byteSize: 880 } }] }] }] }, isPending: false, isError: false }) }));
vi.mock('@/components/studio/choice-selector', () => ({ ChoiceSelector: () => null }));
vi.mock('./pdf-author-dialog', () => ({ PdfAuthorDialog: () => null }));
const roots: Array<ReturnType<typeof createRoot>> = [];
afterEach(async () => { for (const root of roots.splice(0)) await act(() => root.unmount()); document.body.innerHTML = ''; });

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
