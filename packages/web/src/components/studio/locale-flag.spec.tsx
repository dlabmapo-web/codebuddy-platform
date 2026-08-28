import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { LocaleFlag } from './locale-flag';

describe('LocaleFlag', () => {
  it('draws the Korean flag for ko and the Stars and Stripes for en', () => {
    const ko = renderToStaticMarkup(<LocaleFlag locale="ko" />);
    const en = renderToStaticMarkup(<LocaleFlag locale="en" />);

    // The taegeuk's two halves against Old Glory's red and blue.
    expect(ko).toContain('#CD2E3A');
    expect(ko).toContain('#0047A0');
    expect(en).toContain('#B31942');
    expect(en).toContain('#0A3161');
    expect(en).not.toContain('#CD2E3A');
  });

  it('gives the American flag thirteen stripes and a canton of stars', () => {
    const html = renderToStaticMarkup(<LocaleFlag locale="en" />);

    // White field, seven red stripes, one canton. The six white stripes are
    // the field showing through rather than six more rects.
    expect(html.match(/<rect/g)).toHaveLength(1 + 7 + 1);
    // Five rows alternating five and four, which is the rhythm the eye reads
    // as a star field. Fifty dots in a 9.6-unit canton would touch.
    expect(html.match(/<circle/g)).toHaveLength(23);
  });

  it('draws no emoji, which is the whole reason these are SVG', () => {
    // Windows ships no glyphs for regional-indicator pairs, so a flag emoji
    // renders there as the bare letters "KR" — beside a label already reading
    // KOR. If anyone ever swaps these back, this fails.
    for (const locale of ['ko', 'en'] as const) {
      const html = renderToStaticMarkup(<LocaleFlag locale={locale} />);
      expect(html).toContain('<svg');
      expect(html).not.toMatch(/[\u{1F1E6}-\u{1F1FF}]/u);
    }
  });

  it('gives the Korean flag four trigram groups', () => {
    const html = renderToStaticMarkup(<LocaleFlag locale="ko" />);

    expect(html.match(/rotate\(/g)).toHaveLength(4);
    // Three bars each: the corner texture that makes the flag readable small.
    expect(html.match(/<rect/g)).toHaveLength(1 + 12);
  });

  it('hides the flag from assistive technology', () => {
    // The code beside it in the trigger, and the language name beside it in
    // the menu, already say which language this is. A described flag would
    // say it a second time.
    expect(renderToStaticMarkup(<LocaleFlag locale="en" />)).toContain(
      'aria-hidden',
    );
  });

  it('takes an extra class without losing its own box', () => {
    const html = renderToStaticMarkup(
      <LocaleFlag className="h-4" locale="en" />,
    );

    expect(html).toContain('h-4');
    expect(html).toContain('shrink-0');
  });
});
