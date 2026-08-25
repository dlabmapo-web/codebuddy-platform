import { headers } from 'next/headers';

/**
 * The address the API's rate limiter should count against.
 *
 * Server Actions run behind the BFF, so without this every caller looks like
 * one machine and a per-address limit protects nobody.
 */
export async function clientAddress(): Promise<string | undefined> {
  const requestHeaders = await headers();
  return (
    requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    requestHeaders.get('x-real-ip') ||
    undefined
  );
}
