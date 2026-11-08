// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { PrivateImageContext } from '@/components/editor/private-image-context';

vi.mock('@/lib/theme/theme-provider', () => ({ useTheme: () => ({ theme: 'light' }) }));
import { RichTextFrame } from './rich-text-frame';

const id = '11111111-1111-4111-8111-111111111111';
const content = `<p>Find the shelter</p><img src="cove-asset:${id}" alt="map.png">`;
let host: HTMLDivElement, root: Root;
const srcdoc = () => host.querySelector('iframe')?.getAttribute('srcdoc') ?? '';

beforeEach(() => {
  vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  (window as unknown as { happyDOM: { settings: { disableIframePageLoading: boolean } } }).happyDOM.settings.disableIframePageLoading = true;
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

it('shows a private picture once the page resolver returns it', async () => {
  const resolve = vi.fn(async () => 'data:image/png;base64,AAAA');
  await act(async () => root.render(<PrivateImageContext.Provider value={resolve}><RichTextFrame content={content} title="Problem" /></PrivateImageContext.Provider>));
  expect(resolve).toHaveBeenCalledWith(`cove-asset:${id}`);
  expect(srcdoc()).toContain('src="data:image/png;base64,AAAA"');
  expect(srcdoc()).not.toContain('cove-asset:');
});

it('leaves the alt text, not a broken image, when the picture cannot be read', async () => {
  const resolve = vi.fn(async () => { throw new Error('not allowed'); });
  await act(async () => root.render(<PrivateImageContext.Provider value={resolve}><RichTextFrame content={content} title="Problem" /></PrivateImageContext.Provider>));
  expect(srcdoc()).toContain('<span class="cove-image-missing">map.png</span>');
});

it('needs no resolver for statements without private pictures, and shows alt text where none is given', async () => {
  await act(async () => root.render(<RichTextFrame content="<p>Plain</p>" title="Problem" />));
  expect(srcdoc()).toContain('<p>Plain</p>');
  await act(async () => root.render(<RichTextFrame content={content} title="Problem" />));
  expect(srcdoc()).toContain('<span class="cove-image-missing">map.png</span>');
});
