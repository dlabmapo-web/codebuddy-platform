import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('Google sign-in deployment configuration', () => {
  it.each([
    [undefined, true],
    ['', true],
    ['true', true],
    ['false', false],
  ] as const)('with flag %s, Google availability is %s', async (flag, enabled) => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'test-key');
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_AUTH_ENABLED', flag);
    vi.stubEnv('NEXT_PUBLIC_NAVER_AUTH_ENABLED', undefined);
    vi.stubEnv('NEXT_PUBLIC_KAKAO_AUTH_ENABLED', undefined);

    const { publicConfig } = await import('./config');
    expect(publicConfig.googleAuthEnabled).toBe(enabled);
    expect(publicConfig.naverAuthEnabled).toBe(false);
    expect(publicConfig.kakaoAuthEnabled).toBe(false);

    const { availableSocialProviders, isSocialProviderAvailable } = await import(
      '../app/(auth)/_components/social-providers'
    );
    expect(isSocialProviderAvailable('google')).toBe(enabled);
    expect(availableSocialProviders().map(({ id }) => id)).toEqual(
      enabled ? ['google'] : [],
    );
  });
});
