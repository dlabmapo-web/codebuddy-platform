import { ORPCError } from '@orpc/client';
import { describe, expect, it } from 'vitest';

import { isSessionEnded } from './expired-session';

const orpcError = (code: string, status: number) =>
  new ORPCError(code, { status, data: {} });

describe('isSessionEnded', () => {
  it('recognises a lapsed student session', () => {
    expect(isSessionEnded(orpcError('STUDENT_SESSION_EXPIRED', 401))).toBe(true);
  });

  it('recognises a missing or invalid token', () => {
    expect(isSessionEnded(orpcError('AUTHENTICATION_REQUIRED', 401))).toBe(true);
    expect(isSessionEnded(orpcError('TOKEN_INVALID', 401))).toBe(true);
  });

  it('does not sign anybody out because Redis is down', () => {
    // The lease store being unreachable is an outage, not an expiry. Signing
    // a whole academy out over it turns a degraded feature into a total one.
    expect(isSessionEnded(orpcError('STUDENT_SESSION_UNAVAILABLE', 503))).toBe(
      false,
    );
  });

  it('leaves accounts that have their own explanation alone', () => {
    // Both have a screen that says what to do next; a login form does not.
    expect(isSessionEnded(orpcError('PROFILE_INCOMPLETE', 403))).toBe(false);
    expect(isSessionEnded(orpcError('USER_SUSPENDED', 403))).toBe(false);
  });

  it('ignores permission refusals, which are not about the session', () => {
    expect(isSessionEnded(orpcError('PERMISSION_DENIED', 403))).toBe(false);
  });

  it('ignores ordinary failures', () => {
    expect(isSessionEnded(new Error('network'))).toBe(false);
    expect(isSessionEnded(orpcError('COURSE_NOT_FOUND', 404))).toBe(false);
  });
});
