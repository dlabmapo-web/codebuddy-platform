import { describe, expect, it } from 'vitest';

import { withAnonymousImageCors } from './rich-text-html';

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
