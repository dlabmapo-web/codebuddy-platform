import { cookies } from 'next/headers';

import { createClient } from '@/lib/supabase/server';

import {
  recoveryCookieName,
  recoverySecret,
  verifyRecoveryCapability,
} from './recovery-capability';

/**
 * The user id that both the Supabase session and the Cove capability agree on,
 * or null when either is missing, expired, or names somebody else.
 *
 * Read by the reset page as well as by the action behind it. A page that
 * collects a password it cannot submit wastes somebody's only valid recovery
 * link, and a form that renders for an ordinary signed-in session would look
 * like a way to change a password without knowing the current one.
 */
export async function recoverySubject(): Promise<string | null> {
  const secret = recoverySecret();
  if (!secret) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const subject = data?.claims?.sub;
  if (error || typeof subject !== 'string') return null;

  const capability = (await cookies()).get(recoveryCookieName)?.value;
  return (await verifyRecoveryCapability(capability, subject, secret))
    ? subject
    : null;
}
