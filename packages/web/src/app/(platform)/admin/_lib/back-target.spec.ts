import { describe, expect, it } from 'vitest';

import { consoleBackTarget } from './back-target';

const fallback = { href: '/admin/academies/mapo/courses', label: 'D.Lab Mapo' };
const labels = { courses: 'Courses', classes: 'Classes' };

describe('consoleBackTarget', () => {
  it('returns to the page the operator came from, under its own name', () => {
    expect(
      consoleBackTarget('/admin/content/courses?academy=abc', labels, fallback),
    ).toEqual({ href: '/admin/content/courses?academy=abc', label: 'Courses' });
    expect(consoleBackTarget('/admin/content/classes', labels, fallback)).toEqual(
      { href: '/admin/content/classes', label: 'Classes' },
    );
  });

  it('falls back to the academy when no origin was carried', () => {
    expect(consoleBackTarget(undefined, labels, fallback)).toEqual(fallback);
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
      // The retired problems page. Its address only redirects now, so a Back
      // link aimed at it would land on Courses under a label promising
      // problems.
      '/admin/content/problems',
    ];
    for (const from of hostile) {
      expect(consoleBackTarget(from, labels, fallback), from).toEqual(fallback);
    }
  });

  it('takes the first value when a param repeats', () => {
    expect(
      consoleBackTarget(
        ['/admin/content/classes', 'https://evil.example'],
        labels,
        fallback,
      ).href,
    ).toBe('/admin/content/classes');
  });
});
