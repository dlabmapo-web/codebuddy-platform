import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Kakao's availability gate.
 *
 * The implementation stays whole while the provider is dormant, so these
 * check the two things a deployment flag has to guarantee: that a disabled
 * provider leaves no trace in the row — not a logo, a label, a disabled
 * button, or a reserved empty column — and that its typed path is still there
 * the moment the flag is turned on.
 */

// `vi.mock` is hoisted above the file's own bindings, so the mutable flag the
// tests flip has to be created inside the factory and read back afterwards.
vi.mock('@/lib/config', () => ({ publicConfig: { kakaoAuthEnabled: false } }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const values = Object.values(options ?? {});
      return values.length > 0 ? `${key}:${values.join(':')}` : key;
    },
  }),
}));

vi.mock('../actions', () => ({ startSocialAuthAction: vi.fn() }));

import { publicConfig } from '@/lib/config';

import { SocialLoginButtons } from './social-login-buttons';
import {
  availableSocialProviders,
  isSocialProviderAvailable,
  socialProviders,
} from './social-providers';

const config = publicConfig as { kakaoAuthEnabled: boolean };

beforeEach(() => {
  config.kakaoAuthEnabled = false;
});

describe('social provider availability', () => {
  it('keeps Kakao in the registry whatever the flag says', () => {
    expect(socialProviders.map(({ id }) => id)).toEqual([
      'google',
      'kakao',
      'custom:naver',
    ]);
  });

  it('offers Google and Naver while Kakao is dormant', () => {
    expect(availableSocialProviders().map(({ id }) => id)).toEqual([
      'google',
      'custom:naver',
    ]);
    expect(isSocialProviderAvailable('kakao')).toBe(false);
    expect(isSocialProviderAvailable('google')).toBe(true);
  });

  it('offers Kakao once the flag is on', () => {
    config.kakaoAuthEnabled = true;

    expect(availableSocialProviders().map(({ id }) => id)).toEqual([
      'google',
      'kakao',
      'custom:naver',
    ]);
    expect(isSocialProviderAvailable('kakao')).toBe(true);
  });
});

describe('SocialLoginButtons', () => {
  it('renders no Kakao button, label, logo, or empty column', () => {
    const html = renderToStaticMarkup(<SocialLoginButtons />);

    expect(html).not.toContain('Kakao');
    // The Kakao mark's only fill, which is what a leftover logo would show.
    expect(html).not.toContain('#181600');
    expect(html).toContain('Google');
    expect(html).toContain('Naver');
    expect(html).toContain('grid-cols-2');
    expect(html).not.toContain('grid-cols-3');
  });

  it('widens the row back to three when Kakao returns', () => {
    config.kakaoAuthEnabled = true;

    const html = renderToStaticMarkup(<SocialLoginButtons />);

    expect(html).toContain('Kakao');
    expect(html).toContain('grid-cols-3');
  });
});
