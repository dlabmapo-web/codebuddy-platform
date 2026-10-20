// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { PdfAuthorDialog } from './pdf-author-dialog';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
const api = vi.hoisted(() => ({ upload: vi.fn(), save: vi.fn() }));
vi.mock('@/lib/pdf-api', () => ({ pdfApi: api }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('./pdf-reader', () => ({ PdfReader: () => <div /> }));
const roots: Array<ReturnType<typeof createRoot>> = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await act(() => root.unmount());
  document.body.innerHTML = '';
  vi.clearAllMocks();
});
async function render(options: Partial<React.ComponentProps<typeof PdfAuthorDialog>> = {}) {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host); roots.push(root);
  const onSaved = vi.fn(async () => undefined);
  const onClose = vi.fn();
  await act(() => root.render(<PdfAuthorDialog target={{ academyId: 'a', courseId: 'c', lectureId: 'l' }} editable onSaved={onSaved} onClose={onClose} {...options} />));
  return { onSaved, onClose };
}
async function choose(files: File[]) {
  const input = document.querySelector<HTMLInputElement>('input[type=file]')!;
  Object.defineProperty(input, 'files', { configurable: true, value: files });
  await act(() => input.dispatchEvent(new Event('change', { bubbles: true })));
}
it('connects the browse label to its input, shows a chosen file and saves its selected placement', async () => {
  const { onSaved, onClose } = await render({ initialPlacement: 'SUPPLEMENTARY' });
  const file = new File(['pdf'], 'Lesson notes.pdf', { type: 'application/pdf' });
  await choose([file]);
  const input = document.querySelector<HTMLInputElement>('input[type=file]')!;
  expect(document.querySelector(`label[for="${input.id}"]`)).not.toBeNull();
  expect(document.querySelector<HTMLInputElement>('input[required]')!.value).toBe('Lesson notes');
  expect(document.body.textContent).toContain('Lesson notes.pdf');
  api.upload.mockResolvedValue({ assetId: 'asset' });
  api.save.mockResolvedValue({ materialId: 'new-pdf' });
  await act(async () => document.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(api.save).toHaveBeenCalledWith(expect.objectContaining({ placement: 'SUPPLEMENTARY', title: 'Lesson notes', assetId: 'asset' }));
  expect(onSaved).toHaveBeenCalledWith({ materialId: 'new-pdf' });
  expect(onClose).toHaveBeenCalledOnce();
});
it('rejects invalid and multiple files and lets the user clear their selection', async () => {
  await render();
  await choose([new File(['bad'], 'notes.txt')]);
  expect(document.querySelector('[role=alert]')?.textContent).toBe('pdf.errors.PDF_INVALID');
  await choose([new File(['a'], 'a.pdf'), new File(['b'], 'b.pdf')]);
  expect(document.querySelector('[role=alert]')?.textContent).toBe('pdf.errors.PDF_INVALID');
  await choose([new File(['ok'], 'a.pdf')]);
  expect(document.querySelector('[role=alert]')).toBeNull();
  await act(() => document.querySelector<HTMLButtonElement>('button[aria-label="pdf.remove_selection"]')!.click());
  expect(document.body.textContent).not.toContain('a.pdf');
  expect(document.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled).toBe(true);
});
it('uses the shared dropdown and keeps Main disabled for a PDF used by coding exercises', async () => {
  await render({ initialPlacement: 'BOTH', referringExercises: [{ title: 'Coding exercise' }] });
  expect(document.querySelector('select')).toBeNull();
  await act(() => document.querySelector<HTMLButtonElement>('button[aria-label="pdf.placement"]')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse', ctrlKey: false })));
  const main = [...document.querySelectorAll('[role=menuitemradio]')].find(node => node.textContent?.includes('pdf.placements.MAIN'))!;
  expect(main.getAttribute('aria-disabled')).toBe('true');
  const resources = [...document.querySelectorAll<HTMLElement>('[role=menuitemradio]')].find(node => node.textContent?.includes('pdf.placements.SUPPLEMENTARY'))!;
  await act(() => resources.click());
  expect(document.querySelector('button[aria-label="pdf.placement"]')!.textContent).toContain('pdf.placements.SUPPLEMENTARY');
});
it('disables file and placement changes in read-only mode', async () => {
  await render({ editable: false });
  expect(document.querySelector<HTMLInputElement>('input[type=file]')!.disabled).toBe(true);
  expect(document.querySelector<HTMLButtonElement>('button[aria-label="pdf.placement"]')!.disabled).toBe(true);
  expect(document.querySelector('button[type=submit]')).toBeNull();
});
