import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ locale: 'en', editorOptions: null as null | { extensions: Array<{ name: string; options: { placeholder?: string } }> } }));
vi.mock('@/i18n', () => ({ useLocale: () => state.locale }));
vi.mock('@tiptap/react', async (original) => ({
  ...await original<typeof import('@tiptap/react')>(),
  useEditor: (options: typeof state.editorOptions) => {
    state.editorOptions = options;
    return { isActive: () => false, getAttributes: () => ({}) };
  },
  EditorContent: () => <div />,
}));
import { RichEditor } from './RichEditor';
it.each(['en', 'ko'])('translates editor controls and its default placeholder in %s', (locale) => {
  state.locale = locale;
  const html = renderToStaticMarkup(<RichEditor value="" onChange={() => {}} />);
  expect(html).toContain(locale === 'en' ? 'Undo (Ctrl+Z)' : '실행 취소 (Ctrl+Z)');
  expect(html).toContain(locale === 'en' ? 'Insert link' : '링크 삽입');
  // Without an uploader there is no picture button: v2 has no generic upload route.
  expect(html).not.toContain(locale === 'en' ? 'Attach image' : '이미지 첨부');
  expect(renderToStaticMarkup(<RichEditor value="" onChange={() => {}} onImageUpload={async () => 'cove-asset:x'} />))
    .toContain(locale === 'en' ? 'Attach image; drag the right handle to resize' : '이미지 첨부');
  expect(state.editorOptions!.extensions.find((extension) => extension.name === 'placeholder')!.options.placeholder).toBe(locale === 'en' ? 'Write the content here…' : '내용을 입력하세요…');
  renderToStaticMarkup(<RichEditor value="" placeholder="Custom prompt" onChange={() => {}} />);
  expect(state.editorOptions!.extensions.find((extension) => extension.name === 'placeholder')!.options.placeholder).toBe('Custom prompt');
});
