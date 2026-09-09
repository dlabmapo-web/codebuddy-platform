import type { PlatformAcademyDetail } from '@cove/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { SettingsPanel } from './settings-panel';

const academy = {
  id: '10000000-0000-4000-8000-000000000001',
  name: 'Mapo DLab',
  slug: 'mapo-dlab',
  status: 'ACTIVE',
} as PlatformAcademyDetail;

const render = (pointsEnabled: boolean | null, status = academy.status) =>
  renderToStaticMarkup(
    <SettingsPanel
      academy={{ ...academy, status }}
      pointsEnabled={pointsEnabled}
    />,
  );

describe('academy settings, from the console', () => {
  /*
   * Both rows lead to console pages. The whole point of this panel is that an
   * operator no longer borrows a Manager's role to change a setting, so an
   * `/academy/...` address here would be the regression.
   */
  it('links into the console, never into the academy', () => {
    const html = render(true);

    expect(html).toContain('/admin/academies/mapo-dlab/settings');
    expect(html).toContain('/admin/academies/mapo-dlab/settings/points');
    expect(html).not.toContain('/academy/mapo-dlab');
  });

  it('sends the points row to the policy where the academy runs points', () => {
    expect(render(true)).toContain(
      '/admin/academies/mapo-dlab/settings/points',
    );
    expect(render(true)).toContain('settings.point_policy_hint');
  });

  /*
   * The row survives points being off — only where it goes changes. A manager's
   * rail hides it, which answers "what does my academy have on"; the operator
   * is asking why this one has none, and an absent row answers nothing.
   */
  it('keeps the points row when points are off, and routes it to the switch', () => {
    const html = render(false);

    expect(html).toContain('settings.point_policy');
    expect(html).toContain('settings.points_off');
    expect(html).not.toContain(
      '/admin/academies/mapo-dlab/settings/points',
    );
  });

  it('says the features read failed rather than asserting points are off', () => {
    const html = render(null);

    expect(html).toContain('settings.points_unknown');
    expect(html).not.toContain('settings.points_off"');
  });

  /*
   * Archived academies are read-only across the console, and a settings panel
   * is the easiest place for that rule to be forgotten.
   */
  it('offers nothing for an archived academy', () => {
    expect(render(true, 'ARCHIVED')).toBe('');
  });
});
