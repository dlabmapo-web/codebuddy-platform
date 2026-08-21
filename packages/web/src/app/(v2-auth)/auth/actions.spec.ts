import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  config: {
    siteUrl: 'http://localhost:3000',
    turnstileSiteKey: 'test-site-key' as string | null,
  },
  resolveSignInEmail: vi.fn(),
  checkUsernameAvailable: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ has: () => false }),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

vi.mock('@/lib/config', () => ({ publicConfig: mocks.config }));

vi.mock('@/lib/orpc-server', () => ({
  createServerORPCClient: () => ({
    auth: {
      checkUsernameAvailable: mocks.checkUsernameAvailable,
      resolveSignInEmail: mocks.resolveSignInEmail,
    },
  }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve({
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      signUp: mocks.signUp,
    },
  }),
}));

vi.mock('@/i18n/server/get-server-translation', () => ({
  getServerTranslation: () => Promise.resolve({ t: (key: string) => key }),
}));

vi.mock('./_lib/client-address', () => ({
  clientAddress: () => Promise.resolve(undefined),
}));

import { loginAction, signupAction } from './actions';

function formData(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

const loginFields = {
  identifier: 'minsu01',
  password: 'a-valid-password',
};

const signupFields = {
  academyId: '10000000-0000-4000-8000-000000000001',
  displayName: 'Min Su',
  email: 'minsu@example.com',
  password: 'a-valid-password',
  username: 'minsu01',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.config.turnstileSiteKey = 'test-site-key';
  mocks.resolveSignInEmail.mockResolvedValue({ email: 'minsu@example.com' });
  mocks.checkUsernameAvailable.mockResolvedValue({ available: true });
  mocks.signInWithPassword.mockResolvedValue({
    data: { session: null },
    error: { code: 'captcha_failed' },
  });
  mocks.signUp.mockResolvedValue({
    data: { session: null },
    error: { code: 'captcha_failed' },
  });
});

describe('loginAction CAPTCHA', () => {
  it('rejects a missing token before resolving the username', async () => {
    await expect(loginAction({}, formData(loginFields))).resolves.toEqual({
      message: 'error.captcha_failed',
    });
    expect(mocks.resolveSignInEmail).not.toHaveBeenCalled();
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it('forwards a trimmed token and maps a verifier rejection accurately', async () => {
    const result = await loginAction(
      {},
      formData({ ...loginFields, captchaToken: ' turnstile-token ' }),
    );

    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: 'minsu@example.com',
      password: loginFields.password,
      options: { captchaToken: 'turnstile-token' },
    });
    expect(result).toEqual({ message: 'error.captcha_failed' });
  });
});

describe('signupAction CAPTCHA', () => {
  it('rejects a missing token before checking username availability', async () => {
    await expect(signupAction({}, formData(signupFields))).resolves.toEqual({
      message: 'error.captcha_failed',
    });
    expect(mocks.checkUsernameAvailable).not.toHaveBeenCalled();
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it('forwards a trimmed token and maps a verifier rejection accurately', async () => {
    const result = await signupAction(
      {},
      formData({ ...signupFields, captchaToken: ' turnstile-token ' }),
    );

    expect(mocks.signUp).toHaveBeenCalledWith({
      email: signupFields.email,
      password: signupFields.password,
      options: {
        captchaToken: 'turnstile-token',
        data: {
          full_name: signupFields.displayName,
          requested_academy_id: signupFields.academyId,
          username: signupFields.username,
        },
        emailRedirectTo: 'http://localhost:3000/auth/callback',
      },
    });
    expect(result).toEqual({ message: 'error.captcha_failed' });
  });

  it('keeps CAPTCHA optional when the deployment has no site key', async () => {
    mocks.config.turnstileSiteKey = null;

    await signupAction({}, formData(signupFields));

    expect(mocks.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.not.objectContaining({ captchaToken: expect.anything() }),
      }),
    );
  });
});
