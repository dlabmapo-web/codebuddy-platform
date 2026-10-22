import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const trialHash = (value: string) => createHash('sha256').update(value).digest('hex');
export const trialDigest = (pin: string, pepper: string) => createHmac('sha256', pepper).update(pin).digest('hex');
export function trialEqual(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export const trialPrefix = 'cove:turtle:v1:';
