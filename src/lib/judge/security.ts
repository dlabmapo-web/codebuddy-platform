import 'server-only';

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function createCallbackToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashCallbackToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function safeTokenEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}
