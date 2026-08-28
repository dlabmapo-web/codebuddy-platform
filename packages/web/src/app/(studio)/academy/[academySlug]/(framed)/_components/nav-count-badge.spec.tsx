import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { NavCountBadge, NavCountDot } from './nav-count-badge';

const label = '3 waiting for approval';

describe('NavCountBadge', () => {
  it('draws nothing when nobody is waiting', () => {
    // The empty state of this control is its absence. A badge showing zero is
    // a badge that is always there, and one that is always there stops being
    // read — which costs the badge the only thing it is for.
    expect(renderToStaticMarkup(<NavCountBadge count={0} label={label} />)).toBe(
      '',
    );
  });

  it('draws nothing for a count that came back negative', () => {
    // Not reachable through the API, which counts rows. It is reachable
    // through arithmetic on a stale cache, and a nav row reading "-1" is worse
    // than a nav row reading nothing.
    expect(renderToStaticMarkup(<NavCountBadge count={-2} label={label} />)).toBe(
      '',
    );
  });

  it('prints the count beside a sentence a screen reader can use', () => {
    const html = renderToStaticMarkup(<NavCountBadge count={3} label={label} />);

    expect(html).toContain('>3<');
    // Without this the row is announced as "Applications 3" — a number
    // attached to nothing.
    expect(html).toContain(label);
    expect(html).toContain('sr-only');
  });

  it('caps the digits at 99+ without capping the spoken label', () => {
    const many = '140 waiting for approval';
    const html = renderToStaticMarkup(<NavCountBadge count={140} label={many} />);

    // Three digits and a plus would push the label into a truncation for a
    // number nobody reads precisely.
    expect(html).toContain('99+');
    expect(html).not.toContain('>140<');
    expect(html).toContain(many);
  });

  it('keeps 99 itself as a number', () => {
    expect(
      renderToStaticMarkup(<NavCountBadge count={99} label={label} />),
    ).toContain('>99<');
  });
});

describe('NavCountDot', () => {
  it('draws nothing when nobody is waiting', () => {
    expect(renderToStaticMarkup(<NavCountDot count={0} label={label} />)).toBe(
      '',
    );
  });

  it('carries the number in its label, since the dot cannot show it', () => {
    const html = renderToStaticMarkup(<NavCountDot count={7} label={label} />);

    expect(html).toContain(`aria-label="${label}"`);
    // It sits over the icon, so it must never take the click meant for the
    // link underneath.
    expect(html).toContain('pointer-events-none');
  });
});
