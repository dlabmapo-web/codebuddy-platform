import { describe, expect, it } from 'vitest';

import { consoleBackTarget } from './back-target';

const fallback = { href: '/admin/academies/mapo/courses', label: 'D.Lab Mapo' };

describe('consoleBackTarget', () => {
  it('returns to the content browser the operator came from', () => {
    expect(
      consoleBackTarget('/admin/content/courses?academy=abc', 'Content', fallback),
    ).toEqual({ href: '/admin/content/courses?academy=abc', label: 'Content' });
  });

  it('falls back to the academy when no origin was carried', () => {
    expect(consoleBackTarget(undefined, 'Content', fallback)).toEqual(fallback);
  });

  it('refuses anything that is not the content browser', () => {
    // `from` is text arriving in a URL. Each of these is a way to turn a Back
    // link into a redirect somewhere the operator did not come from.
    const hostile = [
      'https://evil.example',
      '//evil.example',
      '/admin/content/courses/../../../etc',
      '/admin/access/new?academy=abc',
      'javascript:alert(1)',
      '/admin/content/unknown',
    ];
    for (const from of hostile) {
      expect(consoleBackTarget(from, 'Content', fallback), from).toEqual(
        fallback,
      );
    }
  });

  it('takes the first value when a param repeats', () => {
    expect(
      consoleBackTarget(
        ['/admin/content/problems', 'https://evil.example'],
        'Content',
        fallback,
      ).href,
    ).toBe('/admin/content/problems');
  });
});
