import { describe, expect, it } from 'vitest';

import { consoleBackTarget } from './back-target';

const fallback = { href: '/admin/academies/mapo/courses', label: 'D.Lab Mapo' };
const labels = {
  courses: 'Courses',
  classes: 'Classes',
  ranking: 'Class ranking',
};

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

  it('returns to the class ranking, which opens the student ledger', () => {
    // Without this the operator presses Back from a child's ledger and lands on
    // the academy index with their period, sort and academy filter gone.
    expect(
      consoleBackTarget('/admin/ranking?sort=points&period=week', labels, fallback),
    ).toEqual({
      href: '/admin/ranking?sort=points&period=week',
      label: 'Class ranking',
    });
    expect(consoleBackTarget('/admin/ranking', labels, fallback)).toEqual({
      href: '/admin/ranking',
      label: 'Class ranking',
    });
  });

  it('falls back when the caller did not name that page', () => {
    // The curriculum editors cannot be opened from the ranking, so they do not
    // carry its label — and a `from` claiming otherwise gets the fallback
    // rather than an undefined label rendered as a Back link.
    expect(
      consoleBackTarget(
        '/admin/ranking',
        { courses: 'Courses', classes: 'Classes' },
        fallback,
      ),
    ).toEqual(fallback);
  });

  it('refuses anything that is not a console browser page', () => {
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
      // The ranking is on the list; these are not it.
      'https://evil.example/admin/ranking',
      '/admin/ranking/../../etc',
      '/admin/rankings',
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
