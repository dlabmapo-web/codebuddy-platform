import type { PlatformAcademyDetail } from '@cove/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('../../../_lib/enter-academy', () => ({
  enterAcademyAs: vi.fn(),
}));

import { EnterAcademyPanel } from './enter-academy';

const academy = {
  id: '10000000-0000-4000-8000-000000000001',
  name: 'Mapo DLab',
  slug: 'mapo-dlab',
  status: 'ACTIVE',
} as PlatformAcademyDetail;

describe('academy role diagnostic', () => {
  it('offers Manager, Team Lead, and Teacher with Manager selected by default', () => {
    const html = renderToStaticMarkup(<EnterAcademyPanel academy={academy} />);

    expect(html).toContain('role_view.MANAGER');
    expect(html).toContain('role_view.TEAM_LEAD');
    expect(html).toContain('role_view.TEACHER');
    expect(html.match(/type="radio"/g)).toHaveLength(3);
    expect(html.match(/checked=""/g)).toHaveLength(1);
  });

  it('does not offer role entry for an archived academy', () => {
    const html = renderToStaticMarkup(
      <EnterAcademyPanel academy={{ ...academy, status: 'ARCHIVED' }} />,
    );
    expect(html).toBe('');
  });
});
