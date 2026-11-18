// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { LibraryUpdates, Version, changedLines } from './library-updates';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { LibrarySyncConflict, LibrarySyncConflictDetail } from '@cove/shared';
const api = vi.hoisted(() => ({ updates: vi.fn(), conflict: vi.fn(), resolve: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: api.refresh }) }));
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/lib/orpc', () => ({ orpc: { academyLibrarySync: api } }));
vi.mock('@/i18n', () => ({ useLocale: () => 'en' }));
vi.mock('@/i18n/client/use-error-text', () => ({ useErrorText: () => String }));
vi.mock('@/components/studio/rich-text-frame', () => ({
  RichTextFrame: ({ content }: { content: string }) => (
    <div data-rich-text>{content}</div>
  ),
}));
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await act(() => root.unmount());
  document.body.innerHTML = '';
});
async function show(
  unitKey: string,
  value: Parameters<typeof Version>[0]['value'],
) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(() =>
    root.render(<Version label="Academy" unitKey={unitKey} value={value} />),
  );
  return host;
}
it('shows the solution title separately from editable code', async () => {
  const host = await show('exercise.solution:key', {
    kind: 'code',
    caption: 'Main solution',
    value: 'print(42)',
  });
  expect(host.querySelector('pre')?.textContent).toBe('print(42)');
  expect(host.textContent).toContain('Main solution');
});
it('shows test-case input and output without hiding fields inside a serialized object', async () => {
  const host = await show('exercise.testCase:key', {
    kind: 'json',
    value: { input: '1', expectedOutput: '2', visibility: 'HIDDEN' },
  });
  expect(
    [...host.querySelectorAll('tbody th')].map((n) => n.textContent),
  ).toEqual([
    'compare.case.input',
    'compare.case.expectedOutput',
    'compare.case.visibility',
  ]);
  expect(host.textContent).toContain('HIDDEN');
});
it('shows structural sibling order as a numbered list', async () => {
  const host = await show('@order', {
    kind: 'json',
    value: ['Module › Lecture › A', 'Module › Lecture › B'],
  });
  expect([...host.querySelectorAll('li')].map((n) => n.textContent)).toEqual([
    'Module › Lecture › A',
    'Module › Lecture › B',
  ]);
});
it('distinguishes a missing item from an unknown historical base', async () => {
  expect(
    (await show('manual.file:x', { kind: 'absent', value: null })).textContent,
  ).toContain('compare.absent');
  expect(
    (await show('manual.file:x', { kind: 'unknown', value: null })).textContent,
  ).toContain('compare.unknown');
});
it('uses the rich-text frame for explanations and choice text', async () => {
  const host = await show('explanation.body', {
    kind: 'html',
    value: '<p>Changed lesson</p>',
  });
  expect(host.querySelector('[data-rich-text]')?.textContent).toBe(
    '<p>Changed lesson</p>',
  );
});

it('marks correct choice options and shows their wording', async () => {
  const host = await show('mc.structure', {
    kind: 'json',
    value: {
      options: [
        { key: 'a', content: 'Choice A', correct: false },
        { key: 'b', content: 'Choice B', correct: true },
      ],
    },
  });
  expect(host.querySelectorAll('[data-rich-text]')).toHaveLength(2);
  expect(host.textContent).toContain('Choice B');
  expect(host.textContent?.match(/compare.correct/g)).toHaveLength(1);
});
it('shows safe media metadata as an asset card', async () => {
  const host = await show('pdf.file', {
    kind: 'json',
    value: { assetId: 'asset', filename: 'notes.pdf', pages: 7, bytes: '1200' },
  });
  expect(host.querySelector('article')?.textContent).toContain('notes.pdf');
  expect(host.textContent).toContain('7');
});
it('renders video instructions as lesson text without exposing the image manifest', async () => {
  const host = await show('video.instructions', {kind:'json',value:{description:'<p>Watch the worked example.</p>',assets:[{assetId:'internal-asset-id'}]}});
  expect(host.querySelector('[data-rich-text]')?.textContent).toBe('<p>Watch the worked example.</p>');
  expect(host.textContent).not.toContain('internal-asset-id');
});
it('computes a changed code region without repeating unchanged context', () => {
  expect(changedLines('a\nb\nc', 'a\nx\nc')).toEqual({
    removed: 'b',
    added: 'x',
    truncated: false,
  });
  expect(changedLines('a\nc', 'a\nb\nc')).toEqual({
    removed: '',
    added: 'b',
    truncated: false,
  });
  expect(changedLines('x'.repeat(131073), 'a').truncated).toBe(true);
});

it('reviews one material with two explicit choices, without history or internal field keys', async () => {
  const conflict: LibrarySyncConflict = {
    id:'a',groupId:'a',nodeKey:'material-a',unitKey:'explanation.body',kind:'CONCURRENT_EDIT',
    path:['Module','Lecture','Explanation A'],materialType:'EXPLANATION',releaseNumber:2,
    message:null,reason:null,createdAt:'2026-11-18T00:00:00Z',actions:['ACCEPT_LIBRARY','KEEP_ACADEMY','MANUAL'],
  };
  const detail: LibrarySyncConflictDetail = {
    ...conflict,base:{kind:'html',value:'Original'},ours:{kind:'html',value:'Academy text'},
    theirs:{kind:'html',value:'Admin text'},expectedOursHash:'ours',expectedTheirsHash:'theirs',members:[],dependents:[],
  };
  api.conflict.mockResolvedValue(detail);
  api.resolve.mockResolvedValue({sync:null});
  api.updates.mockResolvedValue({sync:null,conflicts:[],runs:[]});
  const host=document.createElement('div');document.body.append(host);
  const root=createRoot(host);roots.push(root);
  await act(async()=>root.render(<QueryClientProvider client={new QueryClient()}><LibraryUpdates
    academyId="academy" courseId="course" canResolve nodeKey="material-a"
    initial={{sync:null,conflicts:[conflict,{...conflict,id:'b',groupId:'b',nodeKey:'material-b',path:['Other material']}],runs:[]}}
  /></QueryClientProvider>));
  // React Query batches observer notifications onto the next task.
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,10));});
  expect(host.textContent).toContain('Academy text');expect(host.textContent).toContain('Admin text');
  expect(host.textContent).not.toContain('Other material');
  expect(host.textContent).not.toContain('explanation.body');
  expect(host.querySelector('[role="tablist"]')).toBeNull();
  const buttons=[...host.querySelectorAll('button')];
  expect(buttons.some(button=>button.textContent==='actions.MANUAL')).toBe(false);
  await act(async()=>buttons.find(button=>button.textContent==='actions.KEEP_ACADEMY')!.click());
  expect(api.resolve).toHaveBeenCalledWith(expect.objectContaining({action:'KEEP_ACADEMY',expectedOursHash:'ours',expectedTheirsHash:'theirs'}));
  expect(host.textContent).toContain('actions.kept_academy');
  expect(host.textContent).toContain('empty.decisions');
});
