import { describe, expect, it } from 'vitest';

import { previewDocument } from './rich-text-frame';
import { withAnonymousImageCors } from './rich-text-html';

describe('previewDocument', () => {
  it('declares the matching colour scheme in each theme', () => {
    // Without this the browser paints the frame's canvas white before any of
    // our rules apply, which is how a white slab ended up behind every problem
    // statement in dark mode.
    expect(previewDocument('<p>A</p>', 16, 'dark')).toContain(
      'color-scheme:dark',
    );
    expect(previewDocument('<p>A</p>', 16, 'light')).toContain(
      'color-scheme:light',
    );
  });

  it('keeps the frame transparent so the page shows through', () => {
    expect(previewDocument('<p>A</p>', 16, 'dark')).toContain(
      'html,body{margin:0;background:transparent}',
    );
  });

  it('draws body text light on dark and dark on light', () => {
    expect(previewDocument('<p>A</p>', 16, 'dark')).toContain('color:#e6e9ef');
    expect(previewDocument('<p>A</p>', 16, 'light')).toContain('color:#16181d');
  });

  it('defaults to light for callers that do not pass a theme', () => {
    expect(previewDocument('<p>A</p>')).toContain('color-scheme:light');
  });

  it('still carries the authored content through', () => {
    expect(previewDocument('<p>Echo the input</p>', 16, 'dark')).toContain(
      '<body><p>Echo the input</p></body>',
    );
  });
});

describe('withAnonymousImageCors', () => {
  it('opts stored external images into CORS', () => {
    expect(withAnonymousImageCors('<p>Diagram</p><img src="https://assets.test/a.png">'))
      .toContain('<img crossorigin="anonymous" src="https://assets.test/a.png">');
  });

  it('does not duplicate an existing crossorigin attribute', () => {
    const html = '<img CROSSORIGIN="use-credentials" src="https://assets.test/a.png">';
    expect(withAnonymousImageCors(html)).toBe(html);
  });

  it('upgrades every image while leaving other markup unchanged', () => {
    expect(withAnonymousImageCors('<p>A</p><img src="a"><hr><img src="b" />'))
      .toBe(
        '<p>A</p><img crossorigin="anonymous" src="a"><hr><img crossorigin="anonymous" src="b" />',
      );
  });
});
