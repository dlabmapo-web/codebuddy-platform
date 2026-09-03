import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  config: {
    siteUrl: 'http://localhost:3000',
    turnstileSiteKey: 'test-site-key' as string | null,
  },
  resolveSignInEmail: vi.fn(),
  checkUsernameAvailable: vi.fn(),
  beginStudentSession: vi.fn(),
  redirect: vi.fn(),
  signInWithPassword: vi.fn(),
  signInWithOAuth: vi.fn(),
  signUp: vi.fn(),
  signUpStudent: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({
    delete: vi.fn(),
    has: () => false,
    set: vi.fn(),
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
  RedirectType: { replace: 'replace' },
}));

vi.mock('@/lib/config', () => ({ publicConfig: mocks.config }));

vi.mock('@/lib/orpc-server', () => ({
  createServerORPCClient: () => ({
    auth: {
      checkUsernameAvailable: mocks.checkUsernameAvailable,
      resolveSignInEmail: mocks.resolveSignInEmail,
      signUpStudent: mocks.signUpStudent,
    },
    studentSession: { begin: mocks.beginStudentSession },
  }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve({
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      signInWithOAuth: mocks.signInWithOAuth,
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

import { ORPCError } from '@orpc/client';

import {
  loginAction,
  signupAction,
  startSocialAuthAction,
} from './actions';

function formData(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

const loginFields = {
  identifier: 'minsu01',
  password: 'a-valid-password',
};

/**
 * A staff signup, which is the path these tests exercise: it is the one that
 * carries an email and goes through the browser's own Supabase client. The
 * student path creates its identity through the API instead and is covered
 * separately below.
 */
const signupFields = {
  academyId: '10000000-0000-4000-8000-000000000001',
  kind: 'STAFF',
  displayName: 'Min Su',
  email: 'minsu@example.com',
  password: 'a-valid-password',
  passwordConfirm: 'a-valid-password',
  username: 'minsu01',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.config.turnstileSiteKey = 'test-site-key';
  mocks.resolveSignInEmail.mockResolvedValue({ email: 'minsu@example.com' });
  mocks.checkUsernameAvailable.mockResolvedValue({ available: true });
  mocks.beginStudentSession.mockResolvedValue({});
  mocks.signInWithPassword.mockResolvedValue({
    data: { session: null },
    error: { code: 'captcha_failed' },
  });
  mocks.signUp.mockResolvedValue({
    data: { session: null },
    error: { code: 'captcha_failed' },
  });
  mocks.signInWithOAuth.mockResolvedValue({ data: { url: null }, error: null });
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

  it('replaces the login history entry after successful authentication', async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { session: { access_token: 'access-token' } },
      error: null,
    });

    await loginAction(
      {},
      formData({ ...loginFields, captchaToken: 'turnstile-token' }),
    );

    expect(mocks.redirect).toHaveBeenCalledWith('/welcome', 'replace');
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

  it('replaces the signup history entry when signup creates a session', async () => {
    mocks.signUp.mockResolvedValue({
      data: { session: { access_token: 'access-token' } },
      error: null,
    });

    await signupAction(
      {},
      formData({ ...signupFields, captchaToken: 'turnstile-token' }),
    );

    expect(mocks.redirect).toHaveBeenCalledWith('/welcome', 'replace');
  });
});

describe('loginAction failure reporting', () => {
  const withCaptcha = { ...loginFields, captchaToken: 'turnstile-token' };

  // The trap this replaced: being told the password is wrong is an invitation
  // to type it again, which is the one action that extends a rate limit.
  it('names a rate limit instead of blaming the password', async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { code: 'over_request_rate_limit' },
    });

    await expect(loginAction({}, formData(withCaptcha))).resolves.toEqual({
      message: 'error.too_many_attempts',
    });
  });

  it('names a suspended account instead of sending it to a password reset', async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { code: 'user_banned' },
    });

    await expect(loginAction({}, formData(withCaptcha))).resolves.toEqual({
      message: 'error.account_suspended',
    });
  });

  it('names an unconfirmed address', async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { code: 'email_not_confirmed' },
    });

    await expect(loginAction({}, formData(withCaptcha))).resolves.toEqual({
      message: 'error.email_not_confirmed',
    });
  });

  // The uniform answer stays uniform. A wrong name and a wrong password must
  // remain indistinguishable, or the form becomes a way to enumerate accounts.
  it('keeps one answer for anything that would reveal whether an account exists', async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { code: 'invalid_credentials' },
    });

    await expect(loginAction({}, formData(withCaptcha))).resolves.toEqual({
      message: 'error.credentials_rejected',
    });
  });

  // The resolver runs before Supabase, and its own limit used to arrive as
  // "Sign in could not be completed. Try again." — advice that extends it.
  it('names a rate-limited username resolver instead of inviting a retry', async () => {
    mocks.resolveSignInEmail.mockRejectedValue(
      new ORPCError('TOO_MANY_REQUESTS', {
        status: 429,
        data: { code: 'RATE_LIMITED' },
      }),
    );

    await expect(loginAction({}, formData(withCaptcha))).resolves.toEqual({
      message: 'error.too_many_attempts',
    });
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it('still reports an unreachable resolver as an outage', async () => {
    mocks.resolveSignInEmail.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(loginAction({}, formData(withCaptcha))).resolves.toEqual({
      message: 'error.sign_in_failed',
    });
  });

  // The account exists and the password was right; a Redis outage must not
  // turn that into a sign-in nobody can complete.
  it('signs in even when the student session lease fails', async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { session: { access_token: 'access-token' } },
      error: null,
    });
    mocks.beginStudentSession.mockRejectedValue(new Error('redis down'));

    await loginAction({}, formData(withCaptcha));

    expect(mocks.redirect).toHaveBeenCalledWith('/welcome', 'replace');
  });
});

describe('signupAction failure reporting', () => {
  const withCaptcha = { ...signupFields, captchaToken: 'turnstile-token' };

  it('names an address that already has an account', async () => {
    mocks.signUp.mockResolvedValue({
      data: { session: null, user: null },
      error: { code: 'user_already_exists' },
    });

    await expect(signupAction({}, formData(withCaptcha))).resolves.toEqual({
      message: 'error.email_taken',
    });
  });

  // The enumeration-protected answer: no error, no session, and a user with no
  // identities. Read as success it produced "check your email" for a message
  // Supabase never sends.
  it('names an address behind the decoy user Supabase returns', async () => {
    mocks.signUp.mockResolvedValue({
      data: { session: null, user: { identities: [] } },
      error: null,
    });

    await expect(signupAction({}, formData(withCaptcha))).resolves.toEqual({
      message: 'error.email_taken',
    });
  });

  it('still asks for verification when the account is genuinely new', async () => {
    mocks.signUp.mockResolvedValue({
      data: { session: null, user: { identities: [{ id: 'identity' }] } },
      error: null,
    });

    await expect(signupAction({}, formData(withCaptcha))).resolves.toEqual({
      success: true,
      message: 'error.signup_verify_email',
    });
  });

  it('separates a rejected password from an unexplained failure', async () => {
    mocks.signUp.mockResolvedValue({
      data: { session: null, user: null },
      error: { code: 'weak_password' },
    });

    await expect(signupAction({}, formData(withCaptcha))).resolves.toEqual({
      message: 'error.password_weak',
    });
  });

  it('reports a rate-limited username check as rate limiting', async () => {
    mocks.checkUsernameAvailable.mockRejectedValue(
      new ORPCError('TOO_MANY_REQUESTS', {
        status: 429,
        data: { code: 'RATE_LIMITED' },
      }),
    );

    await expect(signupAction({}, formData(withCaptcha))).resolves.toEqual({
      message: 'error.too_many_attempts',
    });
  });

  it('reports an unreachable username check as an outage, not a bad form', async () => {
    mocks.checkUsernameAvailable.mockRejectedValue(new Error('connect ECONNREFUSED'));

    await expect(signupAction({}, formData(withCaptcha))).resolves.toEqual({
      message: 'error.signup_unavailable',
    });
  });

  // The account exists in Supabase by the time the lease is attempted, so a
  // Redis outage must not report "unable to create the account" and sign the
  // person out of one that was just created.
  it('completes signup even when the student session lease fails', async () => {
    mocks.signUp.mockResolvedValue({
      data: { session: { access_token: 'access-token' }, user: { identities: [{}] } },
      error: null,
    });
    mocks.beginStudentSession.mockRejectedValue(new Error('redis down'));

    await signupAction({}, formData(withCaptcha));

    expect(mocks.redirect).toHaveBeenCalledWith('/welcome', 'replace');
  });
});

describe('social authentication history', () => {
  it('replaces the login or signup entry when leaving for the provider', async () => {
    mocks.signInWithOAuth.mockResolvedValue({
      data: { url: 'https://accounts.example.test/authorize' },
      error: null,
    });

    await startSocialAuthAction({ provider: 'google' });

    expect(mocks.redirect).toHaveBeenCalledWith(
      'https://accounts.example.test/authorize',
      'replace',
    );
  });
});

/**
 * The student half of signup: no email anywhere, and an identity the API
 * creates rather than the browser.
 */
describe('signupAction for a student', () => {
  const studentFields = {
    academyId: '10000000-0000-4000-8000-000000000001',
    kind: 'STUDENT',
    displayName: 'Min Su',
    password: 'a-valid-password',
    passwordConfirm: 'a-valid-password',
    username: 'minsu01',
    captchaToken: 'turnstile-token',
  };

  it('never asks Supabase directly and never sends an email field', async () => {
    mocks.signUpStudent.mockResolvedValue({ email: 's-abc@no-email.cove.invalid' });
    mocks.signInWithPassword.mockResolvedValue({
      data: { session: { access_token: 'token' } },
      error: null,
    });

    await signupAction({}, formData(studentFields));

    // The browser's own client would demand an address; the whole point of
    // the student path is that there is none to give it.
    expect(mocks.signUp).not.toHaveBeenCalled();
    expect(mocks.signUpStudent).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'minsu01',
        displayName: 'Min Su',
        academyId: studentFields.academyId,
        captchaToken: 'turnstile-token',
      }),
    );
    expect(mocks.signUpStudent.mock.calls[0]![0]).not.toHaveProperty('email');
  });

  it('signs the student in with the address the API generated', async () => {
    mocks.signUpStudent.mockResolvedValue({ email: 's-abc@no-email.cove.invalid' });
    mocks.signInWithPassword.mockResolvedValue({
      data: { session: { access_token: 'token' } },
      error: null,
    });

    await signupAction({}, formData(studentFields));

    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: 's-abc@no-email.cove.invalid',
      password: 'a-valid-password',
    });
    expect(mocks.redirect).toHaveBeenCalledWith('/welcome', 'replace');
  });

  it('reports a taken username without creating anything', async () => {
    mocks.signUpStudent.mockRejectedValue(
      new ORPCError('CONFLICT', { data: { code: 'USERNAME_TAKEN' } }),
    );

    await expect(signupAction({}, formData(studentFields))).resolves.toEqual({
      message: 'error.username_taken',
    });
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it('treats a failed sign-in as success, because the account exists', async () => {
    // Reporting a failure here would send somebody to try again and be told
    // the name is taken — by their own account.
    mocks.signUpStudent.mockResolvedValue({ email: 's-abc@no-email.cove.invalid' });
    mocks.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    await expect(signupAction({}, formData(studentFields))).resolves.toEqual({
      success: true,
      message: 'error.signup_student_sign_in',
    });
  });
});

describe('signupAction password confirmation', () => {
  it('refuses a mismatch on the server, whatever the browser did', async () => {
    // A student cannot recover a password by email, so a mistyped one is an
    // account lost until a manager issues a new one.
    await expect(
      signupAction(
        {},
        formData({
          ...signupFields,
          passwordConfirm: 'a-different-password',
          captchaToken: 'turnstile-token',
        }),
      ),
    ).resolves.toEqual({ message: 'validation:password_mismatch' });
    expect(mocks.signUp).not.toHaveBeenCalled();
    expect(mocks.signUpStudent).not.toHaveBeenCalled();
  });
});
