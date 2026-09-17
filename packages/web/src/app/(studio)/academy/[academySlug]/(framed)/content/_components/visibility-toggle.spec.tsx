import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { VisibilityToggle } from './visibility-toggle';

const labels = {
  action: 'Show “Loops” to students',
  visible: 'Visible',
  hidden: 'Hidden',
  hiddenByParent: 'Parent hidden',
};

const render = (props: {
  isVisible: boolean;
  effectivelyVisible?: boolean;
  busy?: boolean;
  variant?: 'icon' | 'label';
}) =>
  renderToStaticMarkup(
    <VisibilityToggle labels={labels} onChange={() => undefined} variant="label" {...props} />,
  );

describe('VisibilityToggle', () => {
  it('is a switch named for the row, on when visible', () => {
    const html = render({ isVisible: true });

    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('aria-label="Show “Loops” to students"');
    expect(html).toContain('>Visible<');
  });

  it('is off and says hidden when the row itself is hidden', () => {
    const html = render({ isVisible: false, effectivelyVisible: false });

    expect(html).toContain('aria-checked="false"');
    expect(html).toContain('>Hidden<');
  });

  it('stays on but says a parent hides it, instead of claiming visible', () => {
    const html = render({ isVisible: true, effectivelyVisible: false });

    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('>Parent hidden<');
    expect(html).not.toContain('>Visible<');
  });

  it('cannot be flipped again while its request is in flight', () => {
    expect(render({ isVisible: true, busy: true })).toMatch(/aria-busy="true"[^>]*disabled=""/);
  });

  it('is an icon only on outline rows, with the state in its tooltip and colour', () => {
    const html = render({ isVisible: true, effectivelyVisible: false, variant: 'icon' });

    expect(html).not.toContain('>Parent hidden<');
    expect(html).toContain('title="Parent hidden"');
    expect(html).toContain('data-state="inherited"');
    expect(html).toContain('aria-label="Show “Loops” to students"');
  });
});
