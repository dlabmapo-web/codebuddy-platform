import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { RecoverySteps, type RecoveryStep } from './recovery-steps';

function render(current: RecoveryStep): string {
  return renderToStaticMarkup(<RecoverySteps current={current} />);
}

describe('RecoverySteps', () => {
  it('names all three stops on every screen', () => {
    for (const step of ['username', 'email', 'password'] as const) {
      const html = render(step);
      expect(html).toContain('recovery.step_username');
      expect(html).toContain('recovery.step_email');
      expect(html).toContain('recovery.step_password');
    }
  });

  it('marks exactly one stop as current', () => {
    const html = render('email');

    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
  });

  it('states each stop in text as well as colour', () => {
    const html = render('email');

    expect(html.match(/recovery.step_done/g)).toHaveLength(1);
    expect(html.match(/recovery.step_current/g)).toHaveLength(1);
    expect(html.match(/recovery.step_upcoming/g)).toHaveLength(1);
  });

  it('opens with nothing behind it and closes with nothing ahead', () => {
    expect(render('username')).not.toContain('recovery.step_done');
    expect(render('password')).not.toContain('recovery.step_upcoming');
  });
});
