import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';

import {
  issueRecoveryCapability,
  recoveryKey,
  verifyRecoveryCapability,
} from './recovery-capability';

const secret = 'a-development-shared-secret-of-at-least-32-bytes';
const subject = '30000000-0000-4000-8000-000000000001';
const otherSubject = '30000000-0000-4000-8000-000000000002';

/** Mints a capability with one claim deliberately wrong. */
async function forge(claims: {
  issuer?: string;
  audience?: string;
  subject?: string;
  expiresIn?: string;
  version?: unknown;
  signingSecret?: string;
}): Promise<string> {
  return new SignJWT({ v: claims.version ?? 1 })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(claims.issuer ?? 'cove:auth')
    .setAudience(claims.audience ?? 'cove:password-recovery')
    .setSubject(claims.subject ?? subject)
    .setIssuedAt()
    .setExpirationTime(claims.expiresIn ?? '15m')
    .sign(recoveryKey(claims.signingSecret ?? secret));
}

describe('recovery capability', () => {
  it('authorizes the user it was issued for', async () => {
    const token = await issueRecoveryCapability(subject, secret);

    expect(await verifyRecoveryCapability(token, subject, secret)).toBe(true);
  });

  it('gives every capability its own identifier', async () => {
    const first = await issueRecoveryCapability(subject, secret);
    const second = await issueRecoveryCapability(subject, secret);

    expect(first).not.toBe(second);
  });

  it('refuses a capability for a different user', async () => {
    const token = await issueRecoveryCapability(subject, secret);

    expect(await verifyRecoveryCapability(token, otherSubject, secret))
      .toBe(false);
  });

  it('refuses an expired capability', async () => {
    const token = await forge({ expiresIn: '-1s' });

    expect(await verifyRecoveryCapability(token, subject, secret)).toBe(false);
  });

  it('refuses a capability signed with another secret', async () => {
    const token = await forge({ signingSecret: 'a-different-secret-entirely' });

    expect(await verifyRecoveryCapability(token, subject, secret)).toBe(false);
  });

  it('refuses a tampered signature', async () => {
    const token = await issueRecoveryCapability(subject, secret);
    const [header, payload, signature] = token.split('.');
    // Mutate the first character, not the last. A 32-byte HMAC is 43 base64url
    // characters, and 43 * 6 bits carries 2 bits more than the signature holds:
    // the final character's low bits are padding that decodes to nothing. So
    // `A` -> `B` there leaves the bytes identical and the signature valid,
    // which made this test fail whenever a signature happened to end in A-D.
    const flipped = `${signature.startsWith('A') ? 'B' : 'A'}${signature.slice(1)}`;

    expect(
      await verifyRecoveryCapability(
        `${header}.${payload}.${flipped}`,
        subject,
        secret,
      ),
    ).toBe(false);
  });

  it('refuses another Cove token that was never a capability', async () => {
    const wrongIssuer = await forge({ issuer: 'someone:else' });
    const wrongAudience = await forge({ audience: 'cove:session' });

    expect(await verifyRecoveryCapability(wrongIssuer, subject, secret))
      .toBe(false);
    expect(await verifyRecoveryCapability(wrongAudience, subject, secret))
      .toBe(false);
  });

  it('refuses a capability from a future claim version', async () => {
    const token = await forge({ version: 2 });

    expect(await verifyRecoveryCapability(token, subject, secret)).toBe(false);
  });

  it('refuses a malformed subject on either side', async () => {
    const malformed = await forge({ subject: 'not-a-user-id' });

    expect(await verifyRecoveryCapability(malformed, subject, secret))
      .toBe(false);
    expect(
      await verifyRecoveryCapability(
        await issueRecoveryCapability(subject, secret),
        'not-a-user-id',
        secret,
      ),
    ).toBe(false);
  });

  it('refuses a missing capability', async () => {
    expect(await verifyRecoveryCapability(undefined, subject, secret))
      .toBe(false);
    expect(await verifyRecoveryCapability('', subject, secret)).toBe(false);
  });
});
