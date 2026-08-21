import { createHash, timingSafeEqual } from 'node:crypto';

import { SignJWT, jwtVerify } from 'jose';

/**
 * The second half of the password-reset authorization.
 *
 * A Supabase recovery session alone is not enough to reach
 * `updateUser({ password })` on the reset page: an ordinary signed-in student
 * has one of those too, and without this capability they could change their
 * password without ever proving they know the current one. Only the recovery
 * confirmation issues a capability, it lasts fifteen minutes, and it names the
 * user it was issued for — so a capability captured from one account cannot
 * authorize another account's session.
 */
export const recoveryCookieName = 'cove_password_recovery';

/** Long enough to choose a password, short enough that a shared computer forgets. */
export const recoveryCapabilityTtlSeconds = 15 * 60;

const issuer = 'cove:auth';
const audience = 'cove:password-recovery';
const version = 1;

/** Bound to `/auth` so the capability is not attached to studio requests. */
export const recoveryCookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/auth',
  maxAge: recoveryCapabilityTtlSeconds,
  secure: process.env.NODE_ENV === 'production',
} as const;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Domain separation, so this key can only ever verify recovery capabilities.
 *
 * `BFF_SHARED_SECRET` also authenticates Cove's server-to-server calls. Signing
 * both with the same bytes would mean a token minted for one purpose is
 * structurally valid for the other; the digested prefix makes the two key
 * spaces unrelated.
 */
export function recoveryKey(sharedSecret: string): Uint8Array {
  return new Uint8Array(
    createHash('sha256')
      .update(`cove:password-recovery:v1\0${sharedSecret}`)
      .digest(),
  );
}

/**
 * The signing secret, or null when this deployment has none.
 *
 * Null is a refusal, not a fallback. A hard-coded development secret would be
 * a published one, and a capability anybody can mint is not a capability.
 */
export function recoverySecret(): string | null {
  return process.env.BFF_SHARED_SECRET || null;
}

export async function issueRecoveryCapability(
  subject: string,
  sharedSecret: string,
): Promise<string> {
  return new SignJWT({ v: version })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject(subject)
    .setIssuedAt()
    .setJti(crypto.randomUUID())
    .setExpirationTime(`${recoveryCapabilityTtlSeconds}s`)
    .sign(recoveryKey(sharedSecret));
}

/**
 * Whether this capability authorizes a password update for `expectedSubject`.
 *
 * Every check is a refusal to trust one part of the request: the algorithm is
 * pinned so `alg: none` is not a token, the issuer and audience are pinned so
 * another Cove token is not this one, the subject must be a well-formed user
 * id, and it is compared to the Supabase claims in constant time so the
 * comparison cannot be walked character by character.
 */
export async function verifyRecoveryCapability(
  token: string | undefined,
  expectedSubject: string,
  sharedSecret: string,
): Promise<boolean> {
  if (!token || !uuidPattern.test(expectedSubject)) return false;

  try {
    const { payload } = await jwtVerify(token, recoveryKey(sharedSecret), {
      algorithms: ['HS256'],
      issuer,
      audience,
    });
    if (payload.v !== version) return false;
    if (typeof payload.sub !== 'string' || !uuidPattern.test(payload.sub)) {
      return false;
    }
    return sameSubject(payload.sub, expectedSubject);
  } catch {
    // Expired, tampered, or minted elsewhere. All three mean the same thing
    // here, and telling them apart would only tell an attacker which one.
    return false;
  }
}

function sameSubject(left: string, right: string): boolean {
  const a = Buffer.from(left.toLowerCase());
  const b = Buffer.from(right.toLowerCase());
  return a.length === b.length && timingSafeEqual(a, b);
}
