import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The recovery Server Actions, with the request-scoped Next and Supabase
 * surfaces stubbed.
 *
 * Worth the stubbing: these three functions hold the whole security argument
 * of the feature — that a GET never spends the token, that the redirect after
 * confirmation carries no secret, that both authorizations are required, and
 * that a completed reset is never presented as a failure.
 */

const secret = 'a-development-shared-secret-of-at-least-32-bytes';
const subject = '30000000-0000-4000-8000-000000000001';
const otherSubject = '30000000-0000-4000-8000-000000000002';

class RedirectSignal extends Error {
  constructor(readonly destination: string) {
    super(`redirect:${destination}`);
  }
}

const cookieStore = {
  jar: new Map<string, string>(),
  get: (name: string) => {
    const value = cookieStore.jar.get(name);
    return value === undefined ? undefined : { name, value };
  },
  set: vi.fn((name: string, value: string) => {
    cookieStore.jar.set(name, value);
  }),
  delete: vi.fn((target: string | { name: string }) => {
    cookieStore.jar.delete(typeof target === 'string' ? target : target.name);
  }),
  has: (name: string) => cookieStore.jar.has(name),
};

const supabaseAuth = {
  verifyOtp: vi.fn(),
  getClaims: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
};

const requestPasswordRecovery = vi.fn().mockResolvedValue({ accepted: true });

vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve(cookieStore),
  headers: () => Promise.resolve(new Headers()),
}));

vi.mock('next/navigation', () => ({
  redirect: (destination: string) => {
    throw new RedirectSignal(destination);
  },
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve({ auth: supabaseAuth }),
}));

vi.mock('@/lib/orpc-server', () => ({
  createServerORPCClient: () => ({ auth: { requestPasswordRecovery } }),
}));

vi.mock('@/i18n/server/get-server-translation', () => ({
  // The copy itself is checked by `@cove/i18n`'s locale suites; what matters
  // here is which key each outcome reaches for.
  getServerTranslation: () => Promise.resolve({ t: (key: string) => key }),
}));

import { issueRecoveryCapability } from '../_lib/recovery-capability';
import {
  confirmPasswordRecoveryAction,
  requestPasswordRecoveryAction,
  resetPasswordAction,
} from './actions';

/** Runs an action that is expected to redirect, and reports where to. */
async function destinationOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error instanceof RedirectSignal) return error.destination;
    throw error;
  }
  throw new Error('expected a redirect');
}

function formData(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

/** A browser holding both halves of the reset authorization. */
async function recovering(as = subject): Promise<void> {
  supabaseAuth.getClaims.mockResolvedValue({
    data: { claims: { sub: as } },
    error: null,
  });
  cookieStore.jar.set(
    'cove_password_recovery',
    await issueRecoveryCapability(as, secret),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  cookieStore.jar.clear();
  process.env.BFF_SHARED_SECRET = secret;
  supabaseAuth.verifyOtp.mockResolvedValue({
    data: { user: { id: subject } },
    error: null,
  });
  supabaseAuth.getClaims.mockResolvedValue({ data: null, error: null });
  supabaseAuth.updateUser.mockResolvedValue({ error: null });
  supabaseAuth.signOut.mockResolvedValue({ error: null });
});

describe('requestPasswordRecoveryAction', () => {
  it('accepts a valid username and forwards its normalized form', async () => {
    const state = await requestPasswordRecoveryAction(
      { status: 'idle' },
      formData({ username: '  MinSu01  ' }),
    );

    expect(state).toEqual({ status: 'accepted' });
    expect(requestPasswordRecovery).toHaveBeenCalledWith({ username: 'minsu01' });
  });

  it('forwards a solved CAPTCHA token to Supabase through the BFF', async () => {
    const state = await requestPasswordRecoveryAction(
      { status: 'idle' },
      formData({ username: 'minsu01', captchaToken: ' turnstile-token ' }),
    );

    expect(state).toEqual({ status: 'accepted' });
    expect(requestPasswordRecovery).toHaveBeenCalledWith({
      username: 'minsu01',
      captchaToken: 'turnstile-token',
    });
  });

  it('rejects a malformed username without any lookup', async () => {
    const state = await requestPasswordRecoveryAction(
      { status: 'idle' },
      formData({ username: 'min' }),
    );

    expect(state).toEqual({
      status: 'invalid',
      message: 'validation:username_invalid',
    });
    expect(requestPasswordRecovery).not.toHaveBeenCalled();
  });

  it('accepts even when the API is unreachable', async () => {
    requestPasswordRecovery.mockRejectedValueOnce(new Error('offline'));

    expect(
      await requestPasswordRecoveryAction(
        { status: 'idle' },
        formData({ username: 'minsu01' }),
      ),
    ).toEqual({ status: 'accepted' });
  });
});

describe('confirmPasswordRecoveryAction', () => {
  it('verifies the hash once and redirects without it', async () => {
    const destination = await destinationOf(() =>
      confirmPasswordRecoveryAction(
        formData({ token_hash: 'hash-abc', type: 'recovery' }),
      ),
    );

    expect(supabaseAuth.verifyOtp).toHaveBeenCalledTimes(1);
    expect(supabaseAuth.verifyOtp).toHaveBeenCalledWith({
      token_hash: 'hash-abc',
      type: 'recovery',
    });
    expect(destination).toBe('/auth/reset-password');
    expect(destination).not.toContain('hash-abc');
  });

  it('issues a capability bound to the recovered user', async () => {
    await destinationOf(() =>
      confirmPasswordRecoveryAction(
        formData({ token_hash: 'hash-abc', type: 'recovery' }),
      ),
    );

    expect(cookieStore.set).toHaveBeenCalledWith(
      'cove_password_recovery',
      expect.any(String),
      expect.objectContaining({
        httpOnly: true,
        path: '/auth',
        sameSite: 'lax',
        maxAge: 900,
      }),
    );
  });

  it.each([
    ['a missing hash', { type: 'recovery' }],
    ['an empty hash', { token_hash: '', type: 'recovery' }],
    ['a signup hash', { token_hash: 'hash-abc', type: 'signup' }],
    ['no type at all', { token_hash: 'hash-abc' }],
  ])('refuses %s without spending a token', async (_case, fields) => {
    const destination = await destinationOf(() =>
      confirmPasswordRecoveryAction(formData(fields)),
    );

    expect(destination).toBe('/auth/forgot?error=invalid-link');
    expect(supabaseAuth.verifyOtp).not.toHaveBeenCalled();
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it('refuses a rejected hash and issues no capability', async () => {
    supabaseAuth.verifyOtp.mockResolvedValue({
      data: { user: null },
      error: { code: 'otp_expired' },
    });

    const destination = await destinationOf(() =>
      confirmPasswordRecoveryAction(
        formData({ token_hash: 'stale', type: 'recovery' }),
      ),
    );

    expect(destination).toBe('/auth/forgot?error=invalid-link');
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it('refuses before spending the token when no signing secret exists', async () => {
    delete process.env.BFF_SHARED_SECRET;

    const destination = await destinationOf(() =>
      confirmPasswordRecoveryAction(
        formData({ token_hash: 'hash-abc', type: 'recovery' }),
      ),
    );

    expect(destination).toBe('/auth/forgot?error=invalid-link');
    expect(supabaseAuth.verifyOtp).not.toHaveBeenCalled();
  });
});

describe('resetPasswordAction', () => {
  const valid = {
    newPassword: 'a-good-password',
    confirmation: 'a-good-password',
  };

  it('sets the password, clears the capability, and revokes globally', async () => {
    await recovering();

    const destination = await destinationOf(() =>
      resetPasswordAction({ status: 'idle' }, formData(valid)),
    );

    expect(supabaseAuth.updateUser).toHaveBeenCalledWith({
      password: valid.newPassword,
    });
    expect(supabaseAuth.signOut).toHaveBeenCalledWith({ scope: 'global' });
    expect(cookieStore.jar.has('cove_password_recovery')).toBe(false);
    expect(destination).toBe('/auth/login?reset=success');
  });

  it('completes the journey even when global revocation fails', async () => {
    await recovering();
    supabaseAuth.signOut.mockImplementation((options: { scope: string }) =>
      Promise.resolve(
        options.scope === 'global'
          ? { error: { code: 'unexpected' } }
          : { error: null },
      ),
    );

    const destination = await destinationOf(() =>
      resetPasswordAction({ status: 'idle' }, formData(valid)),
    );

    expect(destination).toBe('/auth/login?reset=success');
    expect(supabaseAuth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(cookieStore.jar.has('cove_password_recovery')).toBe(false);
  });

  it('refuses an ordinary session that holds no capability', async () => {
    supabaseAuth.getClaims.mockResolvedValue({
      data: { claims: { sub: subject } },
      error: null,
    });

    const state = await resetPasswordAction({ status: 'idle' }, formData(valid));

    expect(state).toEqual({
      status: 'unauthorized',
      message: 'reset.error_unauthorized',
    });
    expect(supabaseAuth.updateUser).not.toHaveBeenCalled();
  });

  it('refuses a capability issued for a different user', async () => {
    supabaseAuth.getClaims.mockResolvedValue({
      data: { claims: { sub: subject } },
      error: null,
    });
    cookieStore.jar.set(
      'cove_password_recovery',
      await issueRecoveryCapability(otherSubject, secret),
    );

    const state = await resetPasswordAction({ status: 'idle' }, formData(valid));

    expect(state).toMatchObject({ status: 'unauthorized' });
    expect(supabaseAuth.updateUser).not.toHaveBeenCalled();
    expect(cookieStore.delete).toHaveBeenCalled();
  });

  it('refuses a capability with no Supabase session behind it', async () => {
    cookieStore.jar.set(
      'cove_password_recovery',
      await issueRecoveryCapability(subject, secret),
    );

    const state = await resetPasswordAction({ status: 'idle' }, formData(valid));

    expect(state).toMatchObject({ status: 'unauthorized' });
    expect(supabaseAuth.updateUser).not.toHaveBeenCalled();
  });

  it('keeps the capability after a correctable mistake', async () => {
    await recovering();

    const state = await resetPasswordAction(
      { status: 'idle' },
      formData({
        newPassword: 'a-good-password',
        confirmation: 'a-different-one',
      }),
    );

    expect(state).toEqual({
      status: 'error',
      message: 'reset.error_mismatch',
      field: 'confirmation',
    });
    expect(supabaseAuth.updateUser).not.toHaveBeenCalled();
    expect(cookieStore.jar.has('cove_password_recovery')).toBe(true);
  });

  it('reports a weak password against the field that can fix it', async () => {
    await recovering();
    supabaseAuth.updateUser.mockResolvedValue({
      error: { code: 'weak_password' },
    });

    const state = await resetPasswordAction({ status: 'idle' }, formData(valid));

    expect(state).toEqual({
      status: 'error',
      message: 'reset.error_weak',
      field: 'newPassword',
    });
    expect(cookieStore.jar.has('cove_password_recovery')).toBe(true);
  });
});
