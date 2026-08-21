import { describe, expect, it } from 'vitest';

import { readRecoveryLink } from './recovery-link';

describe('readRecoveryLink', () => {
  it('accepts a recovery hash', () => {
    expect(readRecoveryLink({ token_hash: 'abc123', type: 'recovery' }))
      .toEqual({ tokenHash: 'abc123' });
  });

  it('rejects a link with no hash', () => {
    expect(readRecoveryLink({ type: 'recovery' })).toBeNull();
    expect(readRecoveryLink({ token_hash: '  ', type: 'recovery' })).toBeNull();
  });

  it.each(['signup', 'email_change', 'magiclink', 'invite', undefined])(
    'rejects type %s',
    (type) => {
      expect(readRecoveryLink({ token_hash: 'abc123', type })).toBeNull();
    },
  );

  it('ignores every destination parameter an email could carry', () => {
    const link = readRecoveryLink({
      token_hash: 'abc123',
      type: 'recovery',
      next: 'https://evil.test',
      redirect_to: 'https://evil.test',
      returnTo: '/studio',
    });

    expect(link).toEqual({ tokenHash: 'abc123' });
  });

  it('reads only the first value of a repeated parameter', () => {
    expect(
      readRecoveryLink({ token_hash: ['abc123', 'def'], type: ['recovery'] }),
    ).toEqual({ tokenHash: 'abc123' });
    expect(
      readRecoveryLink({ token_hash: 'abc123', type: ['signup', 'recovery'] }),
    ).toBeNull();
  });
});
