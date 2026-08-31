import { describe, expect, it } from 'vitest';

import { loginSubmitBlock, signupSubmitBlock } from './submit-block';

const ready = {
  succeeded: false,
  academyId: '10000000-0000-4000-8000-000000000001',
  captchaRequired: true,
  captchaToken: 'turnstile-token',
};

describe('signupSubmitBlock', () => {
  it('lets a complete form through', () => {
    expect(signupSubmitBlock(ready)).toBeNull();
  });

  it('waits for the security check', () => {
    expect(signupSubmitBlock({ ...ready, captchaToken: null })).toBe(
      'captcha_pending',
    );
  });

  // A deployment with no site key renders no widget, so a missing token there
  // is the normal state rather than something to wait for.
  it('does not wait for a check this deployment never asks for', () => {
    expect(
      signupSubmitBlock({ ...ready, captchaRequired: false, captchaToken: null }),
    ).toBeNull();
  });

  it('asks for the academy before the security check', () => {
    expect(
      signupSubmitBlock({ ...ready, academyId: '', captchaToken: null }),
    ).toBe('academy_missing');
  });

  // The one that would send somebody to redo finished work.
  it('reports a spent form as spent, whatever else is unmet', () => {
    expect(
      signupSubmitBlock({
        ...ready,
        succeeded: true,
        academyId: '',
        captchaToken: null,
      }),
    ).toBe('already_submitted');
  });
});

describe('loginSubmitBlock', () => {
  it('waits for the security check and nothing else', () => {
    expect(loginSubmitBlock({ captchaRequired: true, captchaToken: null }))
      .toBe('captcha_pending');
    expect(loginSubmitBlock({ captchaRequired: true, captchaToken: 'token' }))
      .toBeNull();
    expect(loginSubmitBlock({ captchaRequired: false, captchaToken: null }))
      .toBeNull();
  });
});
