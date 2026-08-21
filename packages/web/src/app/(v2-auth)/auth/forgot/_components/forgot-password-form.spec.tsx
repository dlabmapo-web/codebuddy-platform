import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../recovery/actions', () => ({
  requestPasswordRecoveryAction: vi.fn(),
}));

vi.mock('@/lib/config', () => ({
  publicConfig: { turnstileSiteKey: null },
}));

import { publicConfig } from '@/lib/config';
import { ForgotPasswordForm } from './forgot-password-form';

const config = publicConfig as { turnstileSiteKey: string | null };

beforeEach(() => {
  config.turnstileSiteKey = null;
});

describe('ForgotPasswordForm', () => {
  it('asks for a username and nothing else', () => {
    const html = renderToStaticMarkup(<ForgotPasswordForm />);

    expect(html).toContain('name="username"');
    expect(html.toLowerCase()).toContain('autocomplete="username"');
    expect(html).not.toContain('type="email"');
    expect(html).not.toContain('type="password"');
  });

  it('opens on the first stop of the recovery route', () => {
    const html = renderToStaticMarkup(<ForgotPasswordForm />);

    expect(html).toContain('recovery.step_current');
    expect(html).not.toContain('recovery.step_done');
  });

  it('explains a dead link without naming an account', () => {
    const html = renderToStaticMarkup(<ForgotPasswordForm linkExpired />);

    expect(html).toContain('recovery.link_invalid');
    expect(html).toContain('role="alert"');
  });

  it('says nothing about a link when there was none', () => {
    expect(renderToStaticMarkup(<ForgotPasswordForm />))
      .not.toContain('recovery.link_invalid');
  });

  it('requires a Turnstile response when a site key is configured', () => {
    config.turnstileSiteKey = 'test-site-key';

    const html = renderToStaticMarkup(<ForgotPasswordForm />);

    expect(html).toContain('name="captchaToken"');
    expect(html).toContain('aria-label="captcha.label"');
    expect(html).toContain('disabled=""');
  });
});
